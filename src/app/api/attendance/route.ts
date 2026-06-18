import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { normalizeName, normalizePhoneLast4 } from "@/lib/normalize";
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
  level: KoreanLevel;
  isTeacher?: boolean;
}

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
  if (!LEVELS.includes(body.level)) {
    return NextResponse.json(
      { error: "한국어 수준을 선택해 주세요." },
      { status: 400 }
    );
  }

  const result = await updateDB((db) => {
    const { semester, currentWeekId } = db.settings;

    let person = db.people.find(
      (p) => p.nameKey === nameKey && p.phoneLast4 === phoneLast4
    );
    if (!person) {
      person = {
        id: crypto.randomUUID(),
        name,
        nameKey,
        phoneLast4,
        level: body.level,
        isTeacher,
        isBasicTeacher: false,
        createdAt: new Date().toISOString(),
      };
      db.people.push(person);
    } else {
      // keep latest level / teacher flag / display name
      person.name = name;
      person.level = body.level;
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
