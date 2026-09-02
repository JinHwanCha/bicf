import { NextResponse } from "next/server";
import { storeDiagnostics } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diagnostics only — never returns secret values, only variable NAMES,
// candidate hosts, and a redis reachability check.
export async function GET() {
  const diag = await storeDiagnostics();
  return NextResponse.json(diag);
}
