import type { Group, GroupSession, KoreanLevel, Person } from "./types";

const REGULAR_LEVELS: KoreanLevel[] = ["상", "중", "하"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Group with the fewest total members (teachers + students). */
function smallestGroup(groups: Group[]): Group {
  let best = groups[0];
  for (const g of groups) {
    if (
      g.teacherIds.length + g.studentIds.length <
      best.teacherIds.length + best.studentIds.length
    ) {
      best = g;
    }
  }
  return best;
}

export interface GenerateResult {
  groups: Group[];
  assignedPersonIds: string[];
}

/**
 * Random grouping into a chosen number of groups.
 *
 * Rules:
 *  - 기초 students + 기초반 teachers always go into a separate 기초반.
 *  - The remaining people are split into `numGroups` (1–10) regular groups.
 *  - Every regular group gets at least one teacher and one student when the
 *    numbers allow it (the group count is capped to keep that guarantee).
 *  - Teachers may repeat across groups; sizes are kept as even as possible.
 */
export function generateGroups(
  attendees: Person[],
  numGroups = 4
): GenerateResult {
  const teachers = attendees.filter((p) => p.isTeacher);
  const students = attendees.filter((p) => !p.isTeacher);

  const basicTeachers = teachers.filter((t) => t.isBasicTeacher);
  const regularTeachers = teachers.filter((t) => !t.isBasicTeacher);
  const basicStudents = students.filter((s) => s.level === "기초");
  const regularStudents = students.filter((s) => s.level !== "기초");

  const groups: Group[] = [];

  // 기초반 — always separated.
  if (basicStudents.length || basicTeachers.length) {
    groups.push({
      id: "g-basic",
      name: "기초반",
      isBasic: true,
      level: "기초",
      teacherIds: shuffle(basicTeachers).map((t) => t.id),
      studentIds: shuffle(basicStudents).map((s) => s.id),
    });
  }

  // How many regular groups can we actually make?
  const desired = Math.max(1, Math.min(10, Math.floor(numGroups) || 1));
  const n =
    regularTeachers.length > 0 && regularStudents.length > 0
      ? Math.min(desired, regularTeachers.length, regularStudents.length)
      : 1;

  const regularGroups: Group[] = Array.from({ length: n }, (_, i) => ({
    id: `g-${i + 1}`,
    name: `${i + 1}조`,
    isBasic: false,
    level: undefined,
    teacherIds: [],
    studentIds: [],
  }));

  // Spread teachers round-robin so each group gets at least one when possible.
  shuffle(regularTeachers).forEach((t, i) => {
    regularGroups[i % n].teacherIds.push(t.id);
  });

  // Deal students level-by-level into the smallest group so counts stay even
  // while levels are spread across the groups.
  const ordered = REGULAR_LEVELS.flatMap((lv) =>
    shuffle(regularStudents.filter((s) => s.level === lv))
  );
  const covered = new Set(ordered.map((s) => s.id));
  const leftovers = shuffle(regularStudents.filter((s) => !covered.has(s.id)));
  for (const s of [...ordered, ...leftovers]) {
    smallestGroup(regularGroups).studentIds.push(s.id);
  }

  groups.push(...regularGroups);

  return { groups, assignedPersonIds: attendees.map((p) => p.id) };
}

/**
 * Slot people who arrived after grouping into the existing groups without
 * reshuffling. Newcomers join the smallest matching group.
 */
export function assignLate(
  session: GroupSession,
  attendees: Person[]
): string[] {
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
      if (rg.length) {
        rg.sort((a, b) => a.studentIds.length - b.studentIds.length);
        rg[0].studentIds.push(p.id);
      } else {
        session.groups.push({
          id: `g-${session.groups.length + 1}`,
          name: `${regularGroups().length + 1}조`,
          isBasic: false,
          level: undefined,
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
