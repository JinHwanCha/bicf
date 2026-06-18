import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { assignLate, generateGroups } from "@/lib/classify";
import { resolveCurrentWeekId } from "@/lib/week";
import type { DB, GroupSession, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

function sessionId(semester: string, weekId: string): string {
  return `${semester}::${weekId}`;
}

/** People who have checked in for the given semester+week. */
function attendeesFor(db: DB, semester: string, weekId: string): Person[] {
  const ids = new Set(
    db.attendance
      .filter((a) => a.semester === semester && a.weekId === weekId)
      .map((a) => a.personId)
  );
  return db.people.filter((p) => ids.has(p.id));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const db = await readDB();
  const weekId = searchParams.get("weekId") || resolveCurrentWeekId(db.settings);
  const id = sessionId(db.settings.semester, weekId);
  const session = db.sessions.find((s) => s.id === id) ?? null;
  return NextResponse.json(session);
}

interface PostBody {
  action: "generate" | "assignLate";
  weekId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as PostBody;

  const result = await updateDB((db) => {
    const semester = db.settings.semester;
    const weekId = body.weekId || resolveCurrentWeekId(db.settings);
    const id = sessionId(semester, weekId);
    const attendees = attendeesFor(db, semester, weekId);

    if (body.action === "generate") {
      const { groups, assignedPersonIds } = generateGroups(attendees);
      const session: GroupSession = {
        id,
        semester,
        weekId,
        groups,
        generatedAt: new Date().toISOString(),
        assignedPersonIds,
      };
      const idx = db.sessions.findIndex((s) => s.id === id);
      if (idx >= 0) db.sessions[idx] = session;
      else db.sessions.push(session);
      return session;
    }

    // assignLate
    let session = db.sessions.find((s) => s.id === id);
    if (!session) {
      // nothing to assign into yet — do a first-round generation instead
      const { groups, assignedPersonIds } = generateGroups(attendees);
      session = {
        id,
        semester,
        weekId,
        groups,
        generatedAt: new Date().toISOString(),
        assignedPersonIds,
      };
      db.sessions.push(session);
    } else {
      assignLate(session, attendees);
    }
    return session;
  });

  return NextResponse.json(result);
}
