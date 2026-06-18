export type KoreanLevel = "상" | "중" | "하" | "기초";

export const LEVELS: KoreanLevel[] = ["상", "중", "하", "기초"];

/** A registered person — either a student or a Korean-class teacher. */
export interface Person {
  id: string;
  name: string; // raw input as typed
  nameKey: string; // normalized key (spaces/case/diacritics ignored)
  phoneLast4: string;
  level: KoreanLevel;
  isTeacher: boolean;
  /** Admin-controlled: teacher dedicated to the 기초반 (basic class). */
  isBasicTeacher: boolean;
  createdAt: string;
}

/** A single check-in for a given semester/week. */
export interface AttendanceRecord {
  id: string;
  personId: string;
  semester: string;
  weekId: string;
  date: string; // YYYY-MM-DD (local)
  checkedInAt: string; // ISO timestamp
}

export interface Week {
  id: string;
  label: string; // e.g. "9월 1주차"
  /** Class date for this week, "YYYY-MM-DD" (local). Used for auto week selection. */
  date?: string;
}

export interface Settings {
  semester: string;
  currentWeekId: string;
  /** When true, the current week is derived from today's date instead of currentWeekId. */
  autoWeek: boolean;
  weeks: Week[];
  /** "HH:mm" — first random grouping happens at this time. */
  signupDeadline: string;
  /** "HH:mm" — class start time, for display only. */
  classTime: string;
}

export interface Group {
  id: string;
  name: string; // "1조", "기초반"
  isBasic: boolean;
  /** Level bucket this group represents (undefined for a teacher-only holding group). */
  level?: KoreanLevel;
  teacherIds: string[];
  studentIds: string[];
}

/** A classification result for one semester+week. */
export interface GroupSession {
  id: string; // `${semester}::${weekId}`
  semester: string;
  weekId: string;
  groups: Group[];
  generatedAt: string;
  /** ids already placed (used by late-arrival assignment). */
  assignedPersonIds: string[];
}

export interface DB {
  settings: Settings;
  people: Person[];
  attendance: AttendanceRecord[];
  sessions: GroupSession[];
}
