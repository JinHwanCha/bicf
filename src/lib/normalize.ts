/**
 * Normalize a person's name so that foreign names match regardless of
 * spacing, letter case, and latin diacritics (accents).
 *
 * Examples:
 *   "José  Álvarez" -> "josealvarez"
 *   "Anna  Nguyen"  -> "annanguyen"
 *   "김 민수"        -> "김민수"
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD") // split base letters from combining accents
    .replace(/[\u0300-\u036f]/g, "") // drop the accent marks
    .replace(/\s+/g, "") // ignore spacing
    .toLowerCase()
    .trim();
}

/** Keep only the last 4 digits of whatever the user typed. */
export function normalizePhoneLast4(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  return digits.slice(-4);
}
