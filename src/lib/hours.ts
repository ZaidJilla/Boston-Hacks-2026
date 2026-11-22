// Turns an OSM opening_hours string into short readable lines.
// "Mo-Th 07:00-16:00; Fr,Sa 10:00-03:00" -> ["Mon–Thu 7 AM–4 PM", "Fri, Sat 10 AM–3 AM"]
// Anything we don't recognise is kept as written, so nothing is lost.

const DAYS: Record<string, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "Holidays",
};

function time(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 24;
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

export function formatOsmHours(raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (raw.trim() === "24/7") return ["Open 24 hours"];
  return raw
    .split(/\s*;\s*|,\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?/g, (_, a, b) => `${time(a)}–${time(b)}`)
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
        .replace(/([A-Za-z]{3})-([A-Za-z]{3})/g, "$1–$2")
        .replace(/,(?=\S)/g, ", ")
        .replace(/\boff\b/gi, "closed"),
    );
}
