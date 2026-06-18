import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/db";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDB();
  return NextResponse.json(db.settings);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const settings = await updateDB((db) => {
    if (typeof body.semester === "string") db.settings.semester = body.semester;
    if (typeof body.currentWeekId === "string")
      db.settings.currentWeekId = body.currentWeekId;
    if (typeof body.signupDeadline === "string")
      db.settings.signupDeadline = body.signupDeadline;
    if (typeof body.classTime === "string")
      db.settings.classTime = body.classTime;
    if (Array.isArray(body.weeks)) db.settings.weeks = body.weeks;
    return db.settings;
  });
  return NextResponse.json(settings);
}
