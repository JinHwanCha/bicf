import { promises as fs } from "fs";
import path from "path";
import type { DB } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const REDIS_KEY = "bicf:db";
const REDIS_VERSION_KEY = "bicf:db:v";

const DEFAULT_DB: DB = {
  settings: {
    semester: "2026-2학기",
    currentWeekId: "w1",
    autoWeek: true,
    weeks: [
      { id: "w1", label: "9월 1주차" },
      { id: "w2", label: "9월 2주차" },
      { id: "w3", label: "9월 3주차" },
      { id: "w4", label: "9월 4주차" },
    ],
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

/**
 * Use Upstash Redis when its credentials are present (e.g. on Vercel),
 * otherwise fall back to a local JSON file for development.
 */
const useRedis = !!(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

/* --------------------------------------------------------------------- */
/*  File backend (local development)                                     */
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
    await fileWrite(db);
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
  eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown>;
};

let redisClient: RedisClient | null = null;

async function getRedis(): Promise<RedisClient> {
  if (redisClient) return redisClient;
  const { Redis } = await import("@upstash/redis");
  redisClient = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  }) as unknown as RedisClient;
  return redisClient;
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
/*  Public API (unchanged signatures)                                    */
/* --------------------------------------------------------------------- */

export async function readDB(): Promise<DB> {
  return useRedis ? redisRead() : fileRead();
}

/** Run an atomic read-modify-write against the active store. */
export function updateDB<T>(mutator: (db: DB) => T | Promise<T>): Promise<T> {
  return useRedis ? redisUpdate(mutator) : fileUpdate(mutator);
}
