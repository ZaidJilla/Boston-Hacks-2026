import { LINE_COLORS } from "@/lib/config";
import type { LineId } from "@/lib/types";

/** Display order of the lines (same as lib/geo, kept here so client code needn't load geo data). */
export const LINE_ORDER: LineId[] = ["red", "orange", "green", "blue", "silver"];

export const LINE_LETTER: Record<LineId, string> = { red: "R", orange: "O", green: "G", blue: "B", silver: "SL" };
export const LINE_NAME: Record<LineId, string> = {
  red: "Red Line",
  orange: "Orange Line",
  green: "Green Line",
  blue: "Blue Line",
  silver: "Silver Line",
};

/** White fails contrast on orange and silver, so those get black text. */
export const lineTextColor = (line: LineId) => (line === "orange" || line === "silver" ? "#000000" : "#FFFFFF");

/** Round line bullet with the line letter, like station signage. */
export default function LineBullet({
  line,
  size = 28,
  inverted = false,
  label = true,
}: {
  line: LineId;
  /** 20 to 36 px */
  size?: number;
  /** white disc with a colored letter, for use on a line-colored strip */
  inverted?: boolean;
  /** false when the line name is already written next to it */
  label?: boolean;
}) {
  const color = LINE_COLORS[line];
  const letter = LINE_LETTER[line];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-black leading-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (letter.length > 1 ? 0.38 : 0.46)),
        background: inverted ? "#FFFFFF" : color,
        color: inverted ? (line === "orange" || line === "silver" ? "#000000" : color) : lineTextColor(line),
      }}
      role={label ? "img" : undefined}
      aria-label={label ? LINE_NAME[line] : undefined}
      aria-hidden={label ? undefined : true}
    >
      {letter}
    </span>
  );
}
