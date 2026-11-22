"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Map" },
  { href: "/plan", label: "Plan" },
  { href: "/concierge", label: "Concierge" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-[1000] flex h-14 border-t border-black/10 bg-white">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center text-sm font-medium ${active ? "text-line-blue" : "text-ink/60"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
