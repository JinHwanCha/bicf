import { NextResponse } from "next/server";
import { readDB } from "@/lib/db";
import { resolveCurrentWeekId } from "@/lib/week";

export const dynamic = "force-dynamic";

/**
 * Read-only list of people who checked in for the current (or given) week.
 * Used by the on-screen grouping page. No phone numbers are exposed.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const db = await readDB();
  const semester = db.settings.semester;
  const weekId = searchParams.get("weekId") || resolveCurrentWeekId(db.settings);
  const week = db.settings.weeks.find((w) => w.id === weekId);

  const byId = new Map(db.people.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const attendees = db.attendance
    .filter((a) => a.semester === semester && a.weekId === weekId)
    .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))
    .flatMap((a) => {
      const p = byId.get(a.personId);
      if (!p || seen.has(p.id)) return [];
      seen.add(p.id);
      return [
        {
          id: p.id,
          name: p.name,
          isTeacher: p.isTeacher,
          isBasic: !p.isTeacher && p.level === "기초",
        },
      ];
    });

  return NextResponse.json({
    semester,
    weekId,
    weekLabel: week?.label ?? weekId,
    attendees,
  });
}
