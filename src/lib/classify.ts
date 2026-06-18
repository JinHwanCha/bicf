import type { Group, GroupSession, KoreanLevel, Person } from "./types";

const REGULAR_LEVELS: KoreanLevel[] = ["상", "중", "하"];
const MAX_STUDENTS_PER_GROUP = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split `n` items into evenly sized groups, each between 3 and `max` when
 * possible. e.g. 7 -> [4,3], 10 -> [4,3,3], 4 -> [4].
 */
function chunkSizes(n: number, max = MAX_STUDENTS_PER_GROUP): number[] {
  if (n <= 0) return [];
  const groups = Math.max(1, Math.ceil(n / max));
  const base = Math.floor(n / groups);
  const rem = n % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < rem ? 1 : 0));
}

function chunk<T>(arr: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let idx = 0;
  for (const s of sizes) {
    out.push(arr.slice(idx, idx + s));
    idx += s;
  }
  return out;
}

export interface GenerateResult {
  groups: Group[];
  assignedPersonIds: string[];
}

/**
 * First-round random grouping (run at the signup deadline).
 *
 * Rules:
 *  - 기초 students + 기초반 teachers are always split into a separate 기초반.
 *  - Remaining students are grouped by Korean level (상/중/하), 3-4 per group.
 *  - Regular teachers are spread across the regular groups (~1-2 each).
 */
export function generateGroups(attendees: Person[]): GenerateResult {
  const teachers = attendees.filter((p) => p.isTeacher);
  const students = attendees.filter((p) => !p.isTeacher);

  const regularTeachers = teachers.filter((t) => !t.isBasicTeacher);
  const basicTeachers = teachers.filter((t) => t.isBasicTeacher);
  const basicStudents = students.filter((s) => s.level === "기초");
  const regularStudents = students.filter((s) => s.level !== "기초");

  const groups: Group[] = [];

  // 기초반 (always separated)
  if (basicStudents.length || basicTeachers.length) {
    groups.push({
      id: "g-basic",
      name: "기초반",
      isBasic: true,
      level: "기초",
      teacherIds: basicTeachers.map((t) => t.id),
      studentIds: shuffle(basicStudents).map((s) => s.id),
    });
  }

  // Regular groups, grouped by level so similar levels stay together.
  const regularGroups: Group[] = [];
  let counter = 1;
  for (const level of REGULAR_LEVELS) {
    const bucket = shuffle(regularStudents.filter((s) => s.level === level));
    for (const part of chunk(bucket, chunkSizes(bucket.length))) {
      regularGroups.push({
        id: `g-${counter}`,
        name: `${counter}조`,
        isBasic: false,
        level,
        teacherIds: [],
        studentIds: part.map((s) => s.id),
      });
      counter++;
    }
  }

  // Spread regular teachers across the regular groups (round-robin => ~1-2 each).
  const shuffledTeachers = shuffle(regularTeachers);
  if (regularGroups.length) {
    shuffledTeachers.forEach((t, i) => {
      regularGroups[i % regularGroups.length].teacherIds.push(t.id);
    });
  } else if (shuffledTeachers.length) {
    regularGroups.push({
      id: "g-1",
      name: "1조",
      isBasic: false,
      teacherIds: shuffledTeachers.map((t) => t.id),
      studentIds: [],
    });
  }

  groups.push(...regularGroups);

  return { groups, assignedPersonIds: attendees.map((p) => p.id) };
}

/**
 * Second-round assignment for people who arrived after the deadline.
 * Existing groups are kept intact; newcomers are slotted in.
 */
export function assignLate(session: GroupSession, attendees: Person[]): string[] {
  const assigned = new Set(session.assignedPersonIds);
  const newcomers = attendees.filter((p) => !assigned.has(p.id));
  const added: string[] = [];

  const ensureBasicGroup = (): Group => {
    let g = session.groups.find((x) => x.isBasic);
    if (!g) {
      g = {
        id: "g-basic",
        name: "기초반",
        isBasic: true,
        level: "기초",
        teacherIds: [],
        studentIds: [],
      };
      session.groups.push(g);
    }
    return g;
  };

  const regularGroups = () => session.groups.filter((g) => !g.isBasic);

  for (const p of newcomers) {
    if (p.isTeacher) {
      if (p.isBasicTeacher) {
        ensureBasicGroup().teacherIds.push(p.id);
      } else {
        const rg = regularGroups();
        if (rg.length) {
          rg.sort((a, b) => a.teacherIds.length - b.teacherIds.length);
          rg[0].teacherIds.push(p.id);
        } else {
          ensureBasicGroup().teacherIds.push(p.id);
        }
      }
    } else if (p.level === "기초") {
      ensureBasicGroup().studentIds.push(p.id);
    } else {
      const rg = regularGroups();
      const sameLevel = rg.filter((g) => g.level === p.level);
      const candidates = sameLevel.length ? sameLevel : rg;

      if (candidates.length) {
        const open = candidates.filter(
          (g) => g.studentIds.length < MAX_STUDENTS_PER_GROUP
        );
        const pool = open.length ? open : candidates;
        pool.sort((a, b) => a.studentIds.length - b.studentIds.length);
        pool[0].studentIds.push(p.id);
      } else {
        const nextNum = regularGroups().length + 1;
        session.groups.push({
          id: `g-${session.groups.length + 1}`,
          name: `${nextNum}조`,
          isBasic: false,
          level: p.level,
          teacherIds: [],
          studentIds: [p.id],
        });
      }
    }
    assigned.add(p.id);
    added.push(p.id);
  }

  session.assignedPersonIds = Array.from(assigned);
  return added;
}
