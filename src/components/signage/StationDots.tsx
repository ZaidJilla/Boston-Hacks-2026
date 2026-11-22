import { LINE_COLORS } from "@/lib/config";

/**
 * A row of station dots joined by track, for progress: neighborhood (n of 3), line quest (n of 5).
 * Done dots are filled green; track between two done stops takes `color`.
 */
export default function StationDots({
  total,
  done,
  color = LINE_COLORS.green,
  variant = "default",
  label,
}: {
  total: number;
  done: number;
  /** track color between done stops */
  color?: string;
  /** "light" = white dots and white track, for the green unlock screen */
  variant?: "default" | "light";
  /** read out instead of the dots, e.g. "1 of 3 eaten" */
  label?: string;
}) {
  const n = Math.max(1, total);
  const d = Math.min(Math.max(0, done), n);
  const light = variant === "light";
  return (
    <div
      className="flex w-full items-center"
      role="img"
      aria-label={label ?? `${d} of ${n}`}
    >
      {Array.from({ length: n }, (_, i) => {
        const isDone = i < d;
        const segDone = i < d - 1; // segment after dot i joins two done stops
        return (
          <div key={i} className={`flex items-center ${i < n - 1 ? "flex-1" : ""}`}>
            <span
              className="box-border h-4 w-4 shrink-0 rounded-full border-[3px]"
              style={
                light
                  ? { borderColor: "#000000", background: "#FFFFFF" }
                  : {
                      borderColor: isDone ? "#000000" : "#9AA0A6",
                      background: isDone ? LINE_COLORS.green : "#FFFFFF",
                    }
              }
            />
            {i < n - 1 && (
              <span
                className="h-[5px] flex-1"
                style={{ background: light ? "#FFFFFF" : segDone ? color : "#B9BEC3" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
