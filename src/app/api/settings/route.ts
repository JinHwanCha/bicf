import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import { resolveCurrentWeekId } from "@/lib/week";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDB();
  const effectiveWeekId = resolveCurrentWeekId(db.settings);
  // Expose the date-resolved week alongside the stored settings so the
  // attendance/admin views always reflect "today" without manual updates.
  return NextResponse.json({ ...db.settings, effectiveWeekId });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const settings = await updateDB((db) => {
    if (typeof body.semester === "string") db.settings.semester = body.semester;
    if (typeof body.currentWeekId === "string")
      db.settings.currentWeekId = body.currentWeekId;
    if (typeof body.autoWeek === "boolean")
      db.settings.autoWeek = body.autoWeek;
    if (typeof body.signupDeadline === "string")
      db.settings.signupDeadline = body.signupDeadline;
    if (typeof body.classTime === "string")
      db.settings.classTime = body.classTime;
    if (Array.isArray(body.weeks)) db.settings.weeks = body.weeks;
    return db.settings;
  });
  const effectiveWeekId = resolveCurrentWeekId(settings);
  return NextResponse.json({ ...settings, effectiveWeekId });
}
