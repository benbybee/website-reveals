/**
 * Parse a 12-hour clock string ("8:00 AM", "5:30 PM") to 24h "HH:MM".
 * Returns null for "Closed" or anything unparseable.
 */
export function parse12h(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = Number(m[2]);
  const pm = m[3].toLowerCase() === "pm";
  if (hour < 1 || hour > 12 || min > 59) return null;
  if (hour === 12) hour = 0;
  if (pm) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
