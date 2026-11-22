import { LINE_COLORS } from "@/lib/config";

/**
 * The four T line colors as one bar, under every black header.
 * `greenAs` swaps the green segment for another color (white on the green unlock screen).
 */
export default function LineStripe({ height = 6, greenAs }: { height?: 6 | 8; greenAs?: string }) {
  const colors = [LINE_COLORS.red, LINE_COLORS.orange, greenAs ?? LINE_COLORS.green, LINE_COLORS.blue];
  return (
    <div className="flex w-full shrink-0" style={{ height }} aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}
