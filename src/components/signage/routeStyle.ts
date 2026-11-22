// Shared by RouteStrip and RouteSteps: how a trip step looks.
import { LINE_COLORS } from "@/lib/config";
import type { RouteStep } from "@/lib/types";
import { LINE_NAME, lineTextColor } from "./LineBullet";

/** Black or white text, whichever reads on this background. */
function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // pick the one with the higher contrast ratio
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? "#000000" : "#FFFFFF";
}

export const isWalk = (s: RouteStep) => s.mode === "walk" || (!s.line && !s.color);

export function rideStyle(s: RouteStep): { bg: string; fg: string; text: string } {
  if (s.line) return { bg: LINE_COLORS[s.line], fg: lineTextColor(s.line), text: `${LINE_NAME[s.line]} · ${s.minutes} min` };
  const bg = s.color ? (s.color.startsWith("#") ? s.color : `#${s.color}`) : "#000000";
  const name = s.mode === "bus" ? `Bus ${s.routeShort ?? ""}`.trim() : s.routeShort ?? "Transit";
  return { bg, fg: textOn(bg), text: `${name} · ${s.minutes} min` };
}
