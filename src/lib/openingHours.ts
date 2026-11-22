// A small reader for OpenStreetMap opening_hours, enough for "Mo-Sa 11:00-21:00; Su 12:00-20:00".
// Anything it doesn't understand (holidays, months, sunrise) comes back as "unknown", never a guess.
import { bostonParts, fmtClock, minutesOfDay } from "./clock";
import type { OpenState } from "./tripTypes";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Intervals = [number, number][]; // minutes from the start of that day; end may pass 1440
type Week = Intervals[]; // index = day of week, 0 = Sunday

const cache = new Map<string, Week | null>();

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(Su|Mo|Tu|We|Th|Fr|Sa)(?:-(Su|Mo|Tu|We|Th|Fr|Sa))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): Intervals | null {
  const out: Intervals = [];
  for (const part of spec.split(",")) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) end += 1440; // closes after midnight
    out.push([start, end]);
  }
  return out;
}

function parse(oh: string): Week | null {
  if (cache.has(oh)) return cache.get(oh)!;
  let week: Week | null = null;
  const text = oh.trim();
  if (text === "24/7") week = Array.from({ length: 7 }, () => [[0, 1440]] as Intervals);
  else {
    week = Array.from({ length: 7 }, () => [] as Intervals);
    for (const raw of text.split(";")) {
      const rule = raw.trim();
      if (!rule) continue;
      const m = /^((?:(?:Su|Mo|Tu|We|Th|Fr|Sa)(?:-(?:Su|Mo|Tu|We|Th|Fr|Sa))?,?)+)?\s*(.*)$/.exec(rule);
      if (!m) { week = null; break; }
      const daysSpec = m[1]?.trim().replace(/,$/, "");
      const rest = m[2].trim();
      if (/^PH\b/.test(rule)) continue; // public-holiday rules: ignored, we can't know the date's status
      const days = daysSpec ? parseDays(daysSpec) : [0, 1, 2, 3, 4, 5, 6];
      if (!days) { week = null; break; }
      if (/^(off|closed)$/i.test(rest)) { for (const d of days) week[d] = []; continue; }
      const times = parseTimes(rest);
      if (!times) { week = null; break; } // sunrise, months, weeks, comments: don't guess
      for (const d of days) week[d] = times; // a later rule replaces an earlier one for those days
    }
  }
  cache.set(oh, week);
  return week;
}

export interface OpenInfo {
  state: OpenState;
  note?: string;
}

function clockFromMinutes(base: Date, minutesOfDayValue: number): string {
  const startOfDay = new Date(base.getTime() - minutesOfDay(base) * 60_000);
  return fmtClock(new Date(startOfDay.getTime() + (minutesOfDayValue % 1440) * 60_000));
}

/** Is a place open when you arrive, and still open when you plan to leave? */
export function openStatus(oh: string | null | undefined, arrive: Date, leave: Date): OpenInfo {
  if (!oh) return { state: "unknown" };
  const week = parse(oh);
  if (!week) return { state: "unknown" };

  const a = bostonParts(arrive);
  const arriveMin = a.hour * 60 + a.minute;
  const stay = Math.max(0, Math.round((leave.getTime() - arrive.getTime()) / 60_000));
  const today = week[a.dow];
  const yesterday = week[(a.dow + 6) % 7];

  // Today's intervals, plus anything from yesterday that runs past midnight.
  const spans: [number, number][] = [...today, ...yesterday.filter(([, e]) => e > 1440).map(([, e]): [number, number] => [-1440, e - 1440])];
  const hit = spans.find(([s, e]) => arriveMin >= s && arriveMin < e);
  if (hit) {
    return arriveMin + stay <= hit[1]
      ? { state: "open", note: `Open until ${clockFromMinutes(arrive, hit[1])}` }
      : { state: "closing", note: `Closes at ${clockFromMinutes(arrive, hit[1])}, before you'd leave` };
  }
  const later = today.filter(([s]) => s > arriveMin).sort((x, y) => x[0] - y[0])[0];
  if (later) return { state: "closed", note: `Opens at ${clockFromMinutes(arrive, later[0])}` };
  return { state: "closed", note: today.length || yesterday.length ? "Closed by then" : "Closed that day" };
}
