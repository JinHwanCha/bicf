import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { normalizeName, normalizePhoneLast4 } from "@/lib/normalize";
import { LEVELS, type KoreanLevel, type Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDB();
  return NextResponse.json(db.people);
}

interface PatchBody {
  id: string;
  isBasicTeacher?: boolean;
  isTeacher?: boolean;
  level?: KoreanLevel;
  name?: string;
  phoneLast4?: string;
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as PatchBody;
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await updateDB((db) => {
    const person = db.people.find((p) => p.id === body.id);
    if (!person) return null;
    if (typeof body.isBasicTeacher === "boolean")
      person.isBasicTeacher = body.isBasicTeacher;
    if (typeof body.isTeacher === "boolean") person.isTeacher = body.isTeacher;
    if (body.level && LEVELS.includes(body.level)) person.level = body.level;
    if (typeof body.name === "string" && body.name.trim()) {
      person.name = body.name.trim();
      person.nameKey = normalizeName(body.name);
    }
    if (typeof body.phoneLast4 === "string")
      person.phoneLast4 = normalizePhoneLast4(body.phoneLast4);
    return person as Person;
  });

  if (!result) {
    return NextResponse.json({ error: "person not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await updateDB((db) => {
    db.people = db.people.filter((p) => p.id !== id);
    db.attendance = db.attendance.filter((a) => a.personId !== id);
    for (const s of db.sessions) {
      for (const g of s.groups) {
        g.teacherIds = g.teacherIds.filter((t) => t !== id);
        g.studentIds = g.studentIds.filter((t) => t !== id);
      }
      s.assignedPersonIds = s.assignedPersonIds.filter((p) => p !== id);
    }
  });
  return NextResponse.json({ ok: true });
}
