import { promises as fs } from "fs";
import path from "path";
import type { DB, Week } from "./types";

// Point DATA_DIR at a mounted persistent disk in production (e.g. DATA_DIR=/data).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

/** 9월 1주차 ~ 12월 3주차: 16 weekly sessions with class dates. */
const DEFAULT_WEEKS: Week[] = [
  { id: "w1", label: "9월 1주차", date: "2026-09-01" },
  { id: "w2", label: "9월 2주차", date: "2026-09-08" },
  { id: "w3", label: "9월 3주차", date: "2026-09-15" },
  { id: "w4", label: "9월 4주차", date: "2026-09-22" },
  { id: "w5", label: "9월 5주차", date: "2026-09-29" },
  { id: "w6", label: "10월 1주차", date: "2026-10-06" },
  { id: "w7", label: "10월 2주차", date: "2026-10-13" },
  { id: "w8", label: "10월 3주차", date: "2026-10-20" },
  { id: "w9", label: "10월 4주차", date: "2026-10-27" },
  { id: "w10", label: "11월 1주차", date: "2026-11-03" },
  { id: "w11", label: "11월 2주차", date: "2026-11-10" },
  { id: "w12", label: "11월 3주차", date: "2026-11-17" },
  { id: "w13", label: "11월 4주차", date: "2026-11-24" },
  { id: "w14", label: "12월 1주차", date: "2026-12-01" },
  { id: "w15", label: "12월 2주차", date: "2026-12-08" },
  { id: "w16", label: "12월 3주차", date: "2026-12-15" },
];

const DEFAULT_DB: DB = {
  settings: {
    semester: "2026-2학기",
    currentWeekId: "w1",
    autoWeek: true,
    weeks: DEFAULT_WEEKS,
    signupDeadline: "19:30",
    classTime: "20:00",
  },
  people: [],
  attendance: [],
  sessions: [],
};

/** Merge a (possibly partial / older) stored object with defaults. */
function normalize(parsed: Partial<DB> | null | undefined): DB {
  return {
    settings: { ...DEFAULT_DB.settings, ...parsed?.settings },
    people: parsed?.people ?? [],
    attendance: parsed?.attendance ?? [],
    sessions: parsed?.sessions ?? [],
  };
}

/* --------------------------------------------------------------------- */
/*  Backend selection                                                    */
/* --------------------------------------------------------------------- */

// Strip accidental surrounding quotes / whitespace from dashboard-pasted vars.
function cleanEnv(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim().replace(/^['"]+|['"]+$/g, "").trim();
  return t || undefined;
}

// Derive REST url + token from a `rediss://default:<token>@host:port` string.
function fromConnString(
  v: string | undefined
): { url: string; token: string } | undefined {
  const s = cleanEnv(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    const token = decodeURIComponent(u.password || "");
    if (!token || !u.hostname) return undefined;
    return { url: `https://${u.hostname}`, token };
  } catch {
    return undefined;
  }
}

// Collect every distinct {url, token} pair Vercel/Upstash may have injected —
// under any prefix, from REST vars or `rediss://` connection strings. Multiple
// (even stale) sets can coexist, so we probe each and use the first that works.
function collectCredentials(): { url: string; token: string }[] {
  const out: { url: string; token: string }[] = [];
  const seen = new Set<string>();
  const add = (url?: string, token?: string) => {
    if (!url || !token) return;
    const key = `${url}|${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, token });
  };

  const restUrls: Record<string, string> = {};
  const restTokens: Record<string, string> = {};

  for (const [k, raw] of Object.entries(process.env)) {
    const val = cleanEnv(raw);
    if (!val) continue;
    const lk = k.toLowerCase();
    // Connection strings carry host + token together (correctly paired).
    if (lk.endsWith("kv_url") || lk.endsWith("redis_url")) {
      const c = fromConnString(val);
      if (c) add(c.url, c.token);
    }
    // REST url/token, grouped by their shared prefix so pairs stay matched.
    for (const suf of ["kv_rest_api_url", "upstash_redis_rest_url"]) {
      if (lk.endsWith(suf)) restUrls[k.slice(0, k.length - suf.length)] = val;
    }
    for (const suf of ["kv_rest_api_token", "upstash_redis_rest_token"]) {
      if (lk.endsWith(suf)) restTokens[k.slice(0, k.length - suf.length)] = val;
    }
  }

  for (const prefix of Object.keys(restUrls)) {
    add(restUrls[prefix], restTokens[prefix]);
  }
  return out;
}

const REDIS_CREDENTIALS = collectCredentials();
const useRedis = REDIS_CREDENTIALS.length > 0;

/* --------------------------------------------------------------------- */
/*  JSON file backend (local development / persistent-disk hosts)        */
/* --------------------------------------------------------------------- */

// Serialize writes within a single process so concurrent requests can't
// clobber the JSON file.
let queue: Promise<unknown> = Promise.resolve();

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
  }
}

async function fileRead(): Promise<DB> {
  await ensureFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return normalize(JSON.parse(raw) as Partial<DB>);
}

async function fileWrite(db: DB): Promise<void> {
  await ensureFile();
  const tmp = `${DB_FILE}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

function fileUpdate<T>(mutator: (db: DB) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const db = await fileRead();
    const result = await mutator(db);
    try {
      await fileWrite(db);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "EROFS" || code === "EACCES") {
        throw new Error(
          "저장 실패: 이 배포 환경은 파일 쓰기가 불가능합니다(예: Vercel). " +
            "Vercel KV 또는 Upstash Redis를 연결해 KV_REST_API_URL / KV_REST_API_TOKEN 환경변수를 설정하세요."
        );
      }
      throw err;
    }
    return result;
  });
  // Keep the chain alive even if this mutation throws.
  queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/* --------------------------------------------------------------------- */
/*  Redis backend (Vercel / production)                                  */
/* --------------------------------------------------------------------- */

type RedisClient = {
  get<T = unknown>(key: string): Promise<T | null>;
  ping(): Promise<string>;
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
};

const REDIS_KEY = "bicf:db";
const REDIS_VERSION_KEY = "bicf:db:v";

let redisClient: RedisClient | null = null;

// Probe each candidate credential set and cache the first one that responds,
// so leftover/stale env vars pointing at a deleted DB are skipped automatically.
async function getRedis(): Promise<RedisClient> {
  if (redisClient) return redisClient;
  const { Redis } = await import("@upstash/redis");
  const errors: string[] = [];
  for (const cred of REDIS_CREDENTIALS) {
    const client = new Redis({
      url: cred.url,
      token: cred.token,
    }) as unknown as RedisClient;
    try {
      await client.ping();
      redisClient = client;
      return client;
    } catch (e) {
      const host = (() => {
        try {
          return new URL(cred.url).host;
        } catch {
          return cred.url;
        }
      })();
      errors.push(`${host}: ${(e as Error).message}`);
    }
  }
  throw new Error(
    `연결 가능한 Redis 저장소가 없습니다 (후보 ${REDIS_CREDENTIALS.length}개). ` +
      errors.join(" | ")
  );
}

async function redisRead(): Promise<DB> {
  const redis = await getRedis();
  // @upstash/redis auto-deserializes JSON values.
  const stored = await redis.get<Partial<DB>>(REDIS_KEY);
  return normalize(stored);
}

// Atomic compare-and-set: only writes if the version is unchanged, then
// bumps it. Returns 1 on success, 0 if another writer won the race.
const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2])
if (v == ARGV[1]) or (v == false and ARGV[1] == '0') then
  redis.call('SET', KEYS[1], ARGV[2])
  redis.call('INCR', KEYS[2])
  return 1
end
return 0
`;

async function redisUpdate<T>(mutator: (db: DB) => T | Promise<T>): Promise<T> {
  const redis = await getRedis();

  for (let attempt = 0; attempt < 25; attempt++) {
    const version = (await redis.get<number>(REDIS_VERSION_KEY)) ?? 0;
    const stored = await redis.get<Partial<DB>>(REDIS_KEY);
    const db = normalize(stored);

    const result = await mutator(db);

    const ok = (await redis.eval(
      CAS_SCRIPT,
      [REDIS_KEY, REDIS_VERSION_KEY],
      [String(version), JSON.stringify(db)]
    )) as number;

    if (ok === 1) return result;
    // Lost the race — back off briefly and retry with fresh data.
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
  }

  throw new Error("redisUpdate: too many write conflicts, please retry");
}

/* --------------------------------------------------------------------- */
/*  Public API                                                           */
/* --------------------------------------------------------------------- */

export async function readDB(): Promise<DB> {
  if (!useRedis) return fileRead();
  try {
    return await redisRead();
  } catch (err) {
    // Don't blank out the whole UI if the store is unreachable — serve
    // the committed defaults so pages still render, and log the reason.
    console.error("[db] Redis read failed, falling back to file:", err);
    return fileRead();
  }
}

/** Run an atomic read-modify-write against the active store. */
export async function updateDB<T>(
  mutator: (db: DB) => T | Promise<T>
): Promise<T> {
  if (!useRedis) return fileUpdate(mutator);
  try {
    return await redisUpdate(mutator);
  } catch (err) {
    console.error("[db] Redis write failed:", err);
    throw new Error(
      "저장소(Redis)에 연결할 수 없습니다. Vercel 환경변수 KV_REST_API_URL / " +
        "KV_REST_API_TOKEN 값이 실제로 존재하는 Upstash 데이터베이스를 가리키는지 " +
        "확인하고 재배포하세요."
    );
  }
}

/** Safe connectivity report (no secret values) for the /api/health endpoint. */
export async function storeDiagnostics() {
  const relatedEnvKeys = Object.keys(process.env).filter((k) =>
    /(KV_REST_API_URL|KV_REST_API_TOKEN|KV_URL|REDIS_URL|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)$/i.test(
      k
    )
  );

  const candidates: { host: string; ok: boolean; error: string | null }[] = [];
  if (useRedis) {
    const { Redis } = await import("@upstash/redis");
    for (const cred of REDIS_CREDENTIALS) {
      let host = cred.url;
      try {
        host = new URL(cred.url).host;
      } catch {
        /* keep raw */
      }
      try {
        const c = new Redis({ url: cred.url, token: cred.token });
        await c.ping();
        candidates.push({ host, ok: true, error: null });
      } catch (e) {
        candidates.push({ host, ok: false, error: (e as Error).message });
      }
    }
  }

  return {
    backend: useRedis ? "redis" : "file",
    candidateCount: REDIS_CREDENTIALS.length,
    anyReachable: candidates.some((c) => c.ok),
    candidates,
    relatedEnvKeys,
  };
}
