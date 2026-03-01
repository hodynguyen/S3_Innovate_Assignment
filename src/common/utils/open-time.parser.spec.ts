import { parseOpenTime, isWithinOpenTime } from './open-time.parser';

/**
 * Helper: build a Date with a specific UTC day-of-week and UTC hour/minute.
 *
 * Uses a known reference Monday (2026-03-02 00:00 UTC) and offsets from it
 * so that day arithmetic is expressed cleanly and timezone-independently.
 * The parser uses getUTC* methods, so constructing dates in UTC here ensures
 * tests behave identically on any server regardless of its local timezone.
 *
 * JS getUTCDay() mapping:
 *   0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
function makeLocalDate(dayOfWeek: number, hour: number, minute = 0): Date {
  // 2026-03-02 is a Monday (getUTCDay() === 1).
  // We offset by (dayOfWeek - 1) days so the resulting UTC date has the target day.
  const BASE_UTC_MS = Date.UTC(2026, 2, 2, 0, 0, 0, 0); // Mon 2026-03-02 00:00 UTC
  const offsetDays = (dayOfWeek - 1 + 7) % 7;
  const offsetHours = offsetDays * 24 + hour;
  return new Date(BASE_UTC_MS + (offsetHours * 60 + minute) * 60 * 1000);
}

// Convenience constants for day-of-week values
const SUN = 0;
const MON = 1;
// const TUE = 2;
const WED = 3;
// const THU = 4;
const FRI = 5;
const SAT = 6;

// ---------------------------------------------------------------------------
// parseOpenTime()
// ---------------------------------------------------------------------------

describe('parseOpenTime()', () => {
  describe('when openTime is "Always open"', () => {
    it('should return null', () => {
      expect(parseOpenTime('Always open')).toBeNull();
    });

    it('should return null regardless of casing', () => {
      expect(parseOpenTime('always open')).toBeNull();
      expect(parseOpenTime('ALWAYS OPEN')).toBeNull();
    });

    it('should return null when surrounded by whitespace', () => {
      expect(parseOpenTime('  Always open  ')).toBeNull();
    });
  });

  describe('when openTime is "Mon to Fri (9AM to 6PM)"', () => {
    it('should return parsed object with correct day and hour values', () => {
      const result = parseOpenTime('Mon to Fri (9AM to 6PM)');
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        startDay: 1, // Mon
        endDay: 5, // Fri
        startHour: 9,
        endHour: 18, // 6PM → 18
      });
    });
  });

  describe('when openTime is "Mon to Sat (9AM to 6PM)"', () => {
    it('should return parsed object with endDay 6 (Saturday)', () => {
      const result = parseOpenTime('Mon to Sat (9AM to 6PM)');
      expect(result).not.toBeNull();
      expect(result!.endDay).toBe(6);
    });
  });

  describe('when openTime is "Mon to Sun (9AM to 6PM)"', () => {
    it('should return parsed object with endDay 0 (Sunday)', () => {
      const result = parseOpenTime('Mon to Sun (9AM to 6PM)');
      expect(result).not.toBeNull();
      expect(result!.endDay).toBe(0);
    });
  });

  describe('when openTime has an unrecognized format', () => {
    it('should throw an Error for a completely unknown string', () => {
      expect(() => parseOpenTime('Weekdays only')).toThrow(Error);
      expect(() => parseOpenTime('Weekdays only')).toThrow(
        /Unrecognized openTime format/i,
      );
    });

    it('should throw an Error for an empty string', () => {
      expect(() => parseOpenTime('')).toThrow(Error);
    });

    it('should throw an Error for a partial/malformed pattern', () => {
      expect(() => parseOpenTime('Mon to Fri 9AM to 6PM')).toThrow(Error);
      expect(() => parseOpenTime('Mon to Fri (9AM-6PM)')).toThrow(Error);
    });

    it('should throw an Error for an unknown day abbreviation', () => {
      expect(() => parseOpenTime('Xyz to Fri (9AM to 6PM)')).toThrow(Error);
    });
  });
});

// ---------------------------------------------------------------------------
// isWithinOpenTime()
// ---------------------------------------------------------------------------

describe('isWithinOpenTime()', () => {
  // -------------------------------------------------------------------------
  // "Always open"
  // -------------------------------------------------------------------------
  describe('"Always open"', () => {
    it('should return true on a Monday at 9AM', () => {
      expect(isWithinOpenTime('Always open', makeLocalDate(MON, 9))).toBe(true);
    });

    it('should return true on a Sunday at midnight', () => {
      expect(isWithinOpenTime('Always open', makeLocalDate(SUN, 0))).toBe(true);
    });

    it('should return true on a Saturday at 11:59 PM', () => {
      expect(isWithinOpenTime('Always open', makeLocalDate(SAT, 23, 59))).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------
  // "Mon to Fri (9AM to 6PM)"
  // -------------------------------------------------------------------------
  describe('"Mon to Fri (9AM to 6PM)"', () => {
    const openTime = 'Mon to Fri (9AM to 6PM)';

    it('should return true on Monday at exactly 9AM (boundary: valid)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 9, 0))).toBe(true);
    });

    it('should return true on Monday at 10AM (mid-window)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 10))).toBe(true);
    });

    it('should return true on Friday at 5:59PM (one minute before close)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(FRI, 17, 59))).toBe(true);
    });

    it('should return true on Monday at exactly 6PM (inclusive end: booking may end at closing time)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 18, 0))).toBe(true);
    });

    it('should return false on Monday at 6:01PM (one minute after close)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 18, 1))).toBe(false);
    });

    it('should return false on Monday at 8:59AM (before open)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 8, 59))).toBe(false);
    });

    it('should return false on Monday at 7PM (after close)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 19))).toBe(false);
    });

    it('should return true on Wednesday at 10AM (mid-week)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(WED, 10))).toBe(true);
    });

    it('should return true on Wednesday at exactly 9AM (boundary)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(WED, 9, 0))).toBe(true);
    });

    it('should return true on Wednesday at exactly 6PM (inclusive end)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(WED, 18, 0))).toBe(true);
    });

    it('should return false on Saturday (not in Mon–Fri range)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SAT, 10))).toBe(false);
    });

    it('should return false on Sunday (not in Mon–Fri range)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SUN, 10))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // "Mon to Sat (9AM to 6PM)"
  // -------------------------------------------------------------------------
  describe('"Mon to Sat (9AM to 6PM)"', () => {
    const openTime = 'Mon to Sat (9AM to 6PM)';

    it('should return true on Saturday at 10AM', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SAT, 10))).toBe(true);
    });

    it('should return true on Monday at 10AM', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(MON, 10))).toBe(true);
    });

    it('should return false on Sunday (not in Mon–Sat range)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SUN, 10))).toBe(false);
    });

    it('should return true on Saturday at exactly 6PM (inclusive end)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SAT, 18, 0))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // "Mon to Sun (9AM to 6PM)"
  // -------------------------------------------------------------------------
  describe('"Mon to Sun (9AM to 6PM)"', () => {
    const openTime = 'Mon to Sun (9AM to 6PM)';

    it('should return true on Sunday at 10AM', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SUN, 10))).toBe(true);
    });

    it('should return true on Saturday at 10AM', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SAT, 10))).toBe(true);
    });

    it('should return true on Sunday at exactly 6PM (inclusive end)', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SUN, 18, 0))).toBe(true);
    });

    it('should return false on any day before 9AM', () => {
      expect(isWithinOpenTime(openTime, makeLocalDate(SUN, 8, 59))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge-case boundary checks shared across day-range patterns
  // -------------------------------------------------------------------------
  describe('boundary edge cases', () => {
    it('should treat exactly 9AM as valid (inclusive start)', () => {
      expect(
        isWithinOpenTime('Mon to Fri (9AM to 6PM)', makeLocalDate(MON, 9, 0)),
      ).toBe(true);
    });

    it('should treat exactly 6PM (18:00) as valid (inclusive end)', () => {
      expect(
        isWithinOpenTime('Mon to Fri (9AM to 6PM)', makeLocalDate(FRI, 18, 0)),
      ).toBe(true);
    });

    it('should treat 8:59 as invalid (just before start)', () => {
      expect(
        isWithinOpenTime('Mon to Fri (9AM to 6PM)', makeLocalDate(MON, 8, 59)),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid format propagation
  // -------------------------------------------------------------------------
  describe('invalid openTime format', () => {
    it('should throw an Error when openTime is unrecognized', () => {
      expect(() =>
        isWithinOpenTime('Garbage string', makeLocalDate(MON, 10)),
      ).toThrow(Error);
    });
  });
});
