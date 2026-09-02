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
/*  JSON file backend (single source of truth: data/db.json)             */
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

/* --------------------------------------------------------------------- */
/*  Public API                                                           */
/* --------------------------------------------------------------------- */

export async function readDB(): Promise<DB> {
  return fileRead();
}

/** Run an atomic read-modify-write against data/db.json. */
export function updateDB<T>(mutator: (db: DB) => T | Promise<T>): Promise<T> {
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
