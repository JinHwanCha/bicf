import type { Settings } from "./types";

/** Today's local date as "YYYY-MM-DD". */
export function localToday(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Decide which week is "current".
 *
 * When `autoWeek` is on and weeks have dates, pick the latest week whose
 * class date is on or before today (so the week stays active from its class
 * day until the next week's class day). Before the first dated week, the
 * first dated week is used. Falls back to the manually stored `currentWeekId`
 * when auto mode is off or no week has a date.
 */
export function resolveCurrentWeekId(
  settings: Settings,
  now: Date = new Date()
): string {
  const fallback = settings.currentWeekId || settings.weeks[0]?.id || "";

  if (!settings.autoWeek) return fallback;

  const dated = settings.weeks
    .filter((w) => !!w.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

  if (dated.length === 0) return fallback;

  const today = localToday(now);

  let chosen = dated[0]; // before the first class -> first week
  for (const w of dated) {
    if (w.date! <= today) chosen = w;
    else break;
  }
  return chosen.id;
}
