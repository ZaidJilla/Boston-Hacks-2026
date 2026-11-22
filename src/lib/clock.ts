// Boston wall-clock helpers. The MBTA runs on local time, and so do opening hours.
const TZ = "America/New_York";

export interface BostonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  dow: number;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function bostonParts(d: Date): BostonParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")) % 24, minute: Number(get("minute")), dow: DOW.indexOf(get("weekday")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * MBTA service days run until about 3 AM. For a time after midnight we ask for the previous
 * date with a minTime past 24:00, which is how the schedule API expresses late trips.
 */
export function serviceQuery(d: Date): { date: string; minTime: string } {
  const p = bostonParts(d);
  if (p.hour < 3) {
    const prev = bostonParts(new Date(d.getTime() - 24 * 3600_000));
    return { date: `${prev.year}-${pad(prev.month)}-${pad(prev.day)}`, minTime: `${pad(p.hour + 24)}:${pad(p.minute)}` };
  }
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, minTime: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** "5:14 PM" */
export function fmtClock(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(x);
}

export const minutesOfDay = (d: Date) => {
  const p = bostonParts(d);
  return p.hour * 60 + p.minute;
};

export const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
