import type { Weekday } from './config';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Calendar date (YYYY-MM-DD) of `now` in the given time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function localWeekday(now: Date, timeZone: string): (typeof WEEKDAYS)[number] {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now).toLowerCase();
  return name as (typeof WEEKDAYS)[number];
}

/** "Wednesday" and "October 15" style strings for the spoken opening. */
export function spokenDate(now: Date, timeZone: string): { weekday: string; date: string } {
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now),
    date: new Intl.DateTimeFormat('en-US', { timeZone, month: 'long', day: 'numeric' }).format(now),
  };
}

/** Weekday to produce for: the override if given, otherwise today. Weekends fall back to Monday's format. */
export function showWeekday(now: Date, timeZone: string, override?: string, extraDays: Record<string, Weekday> = {}): Weekday {
  if ((!override || override === 'auto') && extraDays[localDate(now, timeZone)]) return extraDays[localDate(now, timeZone)]!;
  const day = override && override !== 'auto' ? override.toLowerCase() : localWeekday(now, timeZone);
  if (day === 'saturday' || day === 'sunday') return 'monday';
  if (!WEEKDAYS.includes(day as never)) throw new Error(`Unknown weekday override "${override}"`);
  return day as Weekday;
}

/**
 * News window start: the last published episode, but never more than `capDays` back.
 * With no previous episode, `firstRunHours` back.
 */
export function windowStart(now: Date, lastPublished: Date | undefined, capDays: number, firstRunHours: number): Date {
  const cap = new Date(now.getTime() - capDays * 86_400_000);
  if (!lastPublished) return new Date(now.getTime() - firstRunHours * 3_600_000);
  return lastPublished < cap ? cap : lastPublished;
}
