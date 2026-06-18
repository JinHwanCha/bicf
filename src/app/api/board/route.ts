import { NextResponse } from "next/server";
import { readDB } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public, read-only view of the current group assignment.
 * Only exposes display names + level (no phone numbers).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const db = await readDB();
  const weekId = searchParams.get("weekId") || db.settings.currentWeekId;
  const semester = db.settings.semester;
  const id = `${semester}::${weekId}`;
  const session = db.sessions.find((s) => s.id === id) ?? null;
  const week = db.settings.weeks.find((w) => w.id === weekId);

  const byId = new Map(db.people.map((p) => [p.id, p]));
  const name = (pid: string) => byId.get(pid)?.name ?? "(알 수 없음)";
  const level = (pid: string) => byId.get(pid)?.level ?? null;

  const groups =
    session?.groups.map((g) => ({
      id: g.id,
      name: g.name,
      isBasic: g.isBasic,
      level: g.level ?? null,
      teachers: g.teacherIds.map((tid) => ({ id: tid, name: name(tid) })),
      students: g.studentIds.map((sid) => ({
        id: sid,
        name: name(sid),
        level: level(sid),
      })),
    })) ?? [];

  return NextResponse.json({
    semester,
    weekLabel: week?.label ?? weekId,
    generatedAt: session?.generatedAt ?? null,
    hasSession: !!session,
    groups,
  });
}
