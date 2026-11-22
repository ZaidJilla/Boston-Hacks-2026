import type { ReactNode } from "react";
import LineStripe from "./LineStripe";

/** Black signage bar: optional amber eyebrow, big white title, then the line stripe. */
export default function PageHeader({
  title,
  eyebrow,
  subtitle,
  leading,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** e.g. an icon disc left of the title */
  leading?: ReactNode;
  /** extra content inside the black bar, below the title (tabs, podium) */
  children?: ReactNode;
}) {
  return (
    <header className="surface-dark bg-ink text-white">
      <div className="px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          {leading}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow text-signal">{eyebrow}</p>}
            <h1 className="text-[28px] font-black leading-[1.1] tracking-[-1px]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[15px] text-white/80">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
      <LineStripe />
    </header>
  );
}
