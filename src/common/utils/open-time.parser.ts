/**
 * Parses a location's openTime string and checks whether a given datetime
 * falls within the allowed window.
 *
 * Supported formats:
 *   "Always open"
 *   "Mon to Fri (9AM to 6PM)"
 *   "Mon to Sat (9AM to 6PM)"
 *   "Mon to Sun (9AM to 6PM)"
 *
 * Timezone convention:
 *   All datetime comparisons use UTC (getUTC* methods). Clients must submit
 *   booking times as UTC ISO 8601 strings where the UTC value represents the
 *   wall-clock time at the building location (i.e. no timezone conversion is
 *   applied server-side). This guarantees deterministic behaviour regardless
 *   of the server's local timezone.
 */

const DAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ParsedOpenTime {
  startDay: number;
  endDay: number;
  startHour: number;
  endHour: number;
}

function parseHour(raw: string): number {
  // e.g. "9AM" → 9, "6PM" → 18, "12PM" → 12, "12AM" → 0
  const match = raw.trim().match(/^(\d+)(AM|PM)$/i);
  if (!match) throw new Error(`Invalid hour format: '${raw}'`);
  let hour = parseInt(match[1], 10);
  const period = match[2].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour;
}

export function parseOpenTime(openTime: string): ParsedOpenTime | null {
  const normalized = openTime.trim();

  if (normalized.toLowerCase() === 'always open') {
    return null; // null signals "always open"
  }

  // Pattern: "Mon to Fri (9AM to 6PM)"
  const pattern =
    /^(\w{3})\s+to\s+(\w{3})\s+\((\d+(?:AM|PM))\s+to\s+(\d+(?:AM|PM))\)$/i;
  const match = normalized.match(pattern);
  if (!match) {
    throw new Error(`Unrecognized openTime format: '${openTime}'`);
  }

  const [, startDayStr, endDayStr, startHourStr, endHourStr] = match;

  const startDay = DAY_MAP[startDayStr];
  const endDay = DAY_MAP[endDayStr];
  if (startDay === undefined || endDay === undefined) {
    throw new Error(`Unknown day abbreviation in openTime: '${openTime}'`);
  }

  return {
    startDay,
    endDay,
    startHour: parseHour(startHourStr),
    endHour: parseHour(endHourStr),
  };
}

/**
 * Returns true if the given date is within the openTime window.
 * @param openTime  The openTime string from the Location entity
 * @param date      The datetime to check — evaluated in UTC (see module-level
 *                  timezone convention above)
 */
export function isWithinOpenTime(openTime: string, date: Date): boolean {
  const parsed = parseOpenTime(openTime);

  // "Always open" → always valid
  if (parsed === null) return true;

  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  const hour = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  // Build inclusive day range (handles Mon→Fri, Mon→Sat, Mon→Sun)
  const allowedDays = new Set<number>();
  let d = parsed.startDay;
  while (true) {
    allowedDays.add(d);
    if (d === parsed.endDay) break;
    d = (d + 1) % 7;
    // Safety: if we've looped all 7 days, break
    if (allowedDays.size >= 7) break;
  }

  if (!allowedDays.has(day)) return false;

  // Check hour window: startHour inclusive, endHour inclusive.
  // "9AM to 6PM" means >= 09:00 and <= 18:00.
  // A booking ending exactly at closing time is valid (the room is released).
  const totalMinutes = hour * 60 + minutes;
  const startMinutes = parsed.startHour * 60;
  const endMinutes = parsed.endHour * 60;

  return totalMinutes >= startMinutes && totalMinutes <= endMinutes;
}
