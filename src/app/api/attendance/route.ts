import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { normalizeName, normalizePhoneLast4 } from "@/lib/normalize";
import { resolveCurrentWeekId } from "@/lib/week";
import { LEVELS, type KoreanLevel, type Person } from "@/lib/types";

export const dynamic = "force-dynamic";

function localDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const weekId = searchParams.get("weekId");
  const db = await readDB();
  const records = weekId
    ? db.attendance.filter(
        (a) => a.weekId === weekId && a.semester === db.settings.semester
      )
    : db.attendance;
  return NextResponse.json(records);
}

interface CheckInBody {
  name: string;
  phoneLast4: string;
  /** New flow: only "기초반 or not" is asked at check-in. */
  isBasic?: boolean;
  /** Legacy: explicit level (still accepted). */
  level?: KoreanLevel;
  isTeacher?: boolean;
}

const DEFAULT_LEVEL: KoreanLevel = "중";

export async function POST(req: Request) {
  const body = (await req.json()) as CheckInBody;
  const name = (body.name || "").trim();
  const nameKey = normalizeName(name);
  const phoneLast4 = normalizePhoneLast4(body.phoneLast4 || "");
  const isTeacher = !!body.isTeacher;

  if (!nameKey) {
    return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  }
  if (phoneLast4.length !== 4) {
    return NextResponse.json(
      { error: "전화번호 뒷자리 4개를 입력해 주세요." },
      { status: 400 }
    );
  }
  const explicitLevel =
    body.level && LEVELS.includes(body.level) ? body.level : null;
  const isBasic = !isTeacher && (!!body.isBasic || explicitLevel === "기초");

  // Keep an existing non-basic level untouched; only toggle to/from "기초".
  const resolveLevel = (prev?: KoreanLevel): KoreanLevel => {
    if (explicitLevel) return explicitLevel;
    if (isBasic) return "기초";
    if (prev && prev !== "기초") return prev;
    return DEFAULT_LEVEL;
  };

  const result = await updateDB((db) => {
    const semester = db.settings.semester;
    const currentWeekId = resolveCurrentWeekId(db.settings);

    let person = db.people.find(
      (p) => p.nameKey === nameKey && p.phoneLast4 === phoneLast4
    );
    if (!person) {
      person = {
        id: crypto.randomUUID(),
        name,
        nameKey,
        phoneLast4,
        level: resolveLevel(),
        isTeacher,
        isBasicTeacher: false,
        createdAt: new Date().toISOString(),
      };
      db.people.push(person);
    } else {
      // keep latest level / teacher flag / display name
      person.name = name;
      person.level = resolveLevel(person.level);
      person.isTeacher = isTeacher;
    }

    const already = db.attendance.find(
      (a) =>
        a.personId === person!.id &&
        a.weekId === currentWeekId &&
        a.semester === semester
    );

    let alreadyChecked = true;
    if (!already) {
      alreadyChecked = false;
      db.attendance.push({
        id: crypto.randomUUID(),
        personId: person.id,
        semester,
        weekId: currentWeekId,
        date: localDate(),
        checkedInAt: new Date().toISOString(),
      });
    }

    const week = db.settings.weeks.find((w) => w.id === currentWeekId);
    return {
      person: person as Person,
      alreadyChecked,
      semester,
      weekLabel: week?.label ?? currentWeekId,
    };
  });

  return NextResponse.json(result);
}
