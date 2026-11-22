// A badge as a round medallion: colored ring and emoji when earned, grey and dimmed when locked.
export default function BadgeMedallion({
  emoji,
  color,
  earned = true,
  size = 56,
}: {
  emoji: string;
  color: string;
  earned?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: earned ? "#fff" : "#EEF0F1",
        border: `${Math.max(3, size / 14)}px solid ${earned ? color : "#C9CFD2"}`,
        boxShadow: earned ? `0 0 0 2px #fff, 0 2px 8px ${color}55` : "none",
        fontSize: size * 0.46,
        filter: earned ? "none" : "grayscale(1)",
        opacity: earned ? 1 : 0.55,
      }}
    >
      {earned ? emoji : "🔒"}
    </span>
  );
}
