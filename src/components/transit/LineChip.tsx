import { LINE_COLORS } from "@/lib/config";
import type { LineId } from "@/lib/types";

const NAMES: Record<LineId, string> = { red: "Red", orange: "Orange", green: "Green", blue: "Blue", silver: "Silver" };

export default function LineChip({ line, children }: { line: LineId; children?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      style={{ backgroundColor: LINE_COLORS[line] }}
    >
      {children ?? NAMES[line]}
    </span>
  );
}
