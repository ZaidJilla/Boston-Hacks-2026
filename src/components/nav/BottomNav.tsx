"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LINE_COLORS } from "@/lib/config";
import { ChatIcon, MapIcon, PersonIcon, PlanIcon, TrophyIcon } from "@/components/signage/Icons";

// Each tab owns a line color, shown as a bar on top of the active tab.
const TABS = [
  { href: "/", label: "Map", Icon: MapIcon, color: LINE_COLORS.green },
  { href: "/plan", label: "Plan", Icon: PlanIcon, color: LINE_COLORS.silver },
  { href: "/concierge", label: "Concierge", Icon: ChatIcon, color: LINE_COLORS.blue },
  { href: "/leaderboard", label: "Leaderboard", Icon: TrophyIcon, color: LINE_COLORS.orange },
  { href: "/profile", label: "Profile", Icon: PersonIcon, color: LINE_COLORS.red },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="surface-dark fixed inset-x-0 bottom-0 z-[1000] bg-ink pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-nav max-w-xl">
        {TABS.map(({ href, label, Icon, color }) => {
          const active = href === "/" ? path === "/" || path.startsWith("/restaurant") : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[12px] font-bold ${
                  active ? "text-white" : "text-navoff"
                }`}
              >
                <span
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: active ? color : "transparent" }}
                  aria-hidden="true"
                />
                <Icon size={22} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
