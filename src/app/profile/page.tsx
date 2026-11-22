"use client";
// Your progress: points and rank, how much of Boston you've unlocked, line quests and home base.
import Link from "next/link";
import { useEffect, useState } from "react";
import LineBullet from "@/components/signage/LineBullet";
import PageHeader from "@/components/signage/PageHeader";
import BadgeShelf from "@/components/badges/BadgeShelf";
import RankMedallion from "@/components/rank/RankMedallion";
import RankLine from "@/components/rank/RankLine";
import StationDots from "@/components/signage/StationDots";
import { PersonIcon } from "@/components/signage/Icons";
import Fold from "@/components/ui/Fold";
import Button, { buttonClass } from "@/components/ui/Button";
import { useUser } from "@/lib/auth";
import { LINE_COLORS } from "@/lib/config";
import { factsFrom } from "@/lib/badges";
import { hoodRankFor, rankProgress } from "@/lib/scoring";
import { stations } from "@/lib/data";
import type { HomeResult, Profile } from "@/lib/types";

const SHOW_FIRST = 6;
const stationName = (id: string | null) => (id ? stations.find((s) => s.id === id)?.name : undefined);

function Stat({ label, value, tone = "light" }: { label: string; value: string; tone?: "light" | "dark" }) {
  return (
    <li
      className={`rounded-card px-3 py-3 ${tone === "dark" ? "surface-dark bg-ink text-white" : "border-2 border-ink bg-white"}`}
    >
      <p className={`text-[26px] font-black leading-none tracking-[-0.5px] tabular-nums ${tone === "dark" ? "text-signal" : ""}`}>
        {value}
      </p>
      <p className={`mt-1 text-[13px] font-bold ${tone === "dark" ? "text-white/80" : "text-muted"}`}>{label}</p>
    </li>
  );
}

/** A bar that grows from empty when it first shows. */
function Bar({ pct, color = LINE_COLORS.green, label }: { pct: number; color?: string; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-panel" role="img" aria-label={label}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${shown}%`, background: color }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, isDemo, signIn, signOutUser, getIdToken } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [home, setHome] = useState<HomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setError(null);
    (async () => {
      const token = await getIdToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        const [p, h] = await Promise.all([fetch("/api/profile", { headers }), fetch("/api/home", { headers })]);
        if (!p.ok) throw new Error();
        const data = (await p.json()) as Profile;
        if (alive) setProfile(data);
        if (h.ok && alive) setHome((await h.json()) as HomeResult);
      } catch {
        if (alive) setError("Couldn't load your profile. Try again in a moment.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, getIdToken]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Profile" />
        <p className="p-4 text-[15px] text-muted" aria-busy="true">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader
          eyebrow="Profile"
          title="Your Boston"
          subtitle="Sign in to keep your points, neighborhoods and line quests."
          leading={
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-line-blue text-white">
              <PersonIcon size={24} />
            </span>
          }
        />
        <div className="space-y-3 p-4">
          <Button className="w-full" onClick={signIn}>
            Sign in with Google
          </Button>
          <p className="text-[14px] text-muted">Use your school email so you count for your college.</p>
        </div>
      </div>
    );
  }

  const unlocked = profile?.neighborhoods.filter((n) => n.unlocked).length ?? 0;
  const total = profile?.neighborhoods.length ?? 25;
  const homeStation = stationName(home?.stationId ?? null);
  const homeName = profile?.neighborhoods.find((n) => n.id === home?.neighborhood)?.name;

  return (
    <div className="pb-6">
      <PageHeader
        eyebrow={profile?.rank ? `Rank ${profile.rank} of ${profile.totalPlayers}` : "Profile"}
        title={user.displayName}
        subtitle={user.college}
        leading={
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-signal text-[26px] font-black text-ink" aria-hidden="true">
            {user.displayName[0]?.toUpperCase()}
          </span>
        }
      />

      <div className="space-y-5 px-4 pt-4">
        {error && (
          <p role="alert" className="rounded-card border-2 border-line-red bg-line-red/10 p-3 text-[15px] font-bold">
            {error}
          </p>
        )}

        {!profile && !error && <p className="text-[15px] text-muted" aria-busy="true">Loading your progress…</p>}

        {profile && (
          <>
            <section aria-labelledby="rank-h" className="surface-dark rounded-card bg-ink p-4 text-white">
              <div className="mb-3 flex items-center gap-4">
                <RankMedallion rankId={rankProgress(profile.points).rank.id} size={96} />
                <div className="min-w-0">
                  <h2 id="rank-h" className="eyebrow text-signal">
                    Your rank
                  </h2>
                  <p className="text-[26px] font-black leading-tight tracking-[-0.5px]">{rankProgress(profile.points).rank.name}</p>
                  <p className="text-[14px] text-white/80">{rankProgress(profile.points).rank.blurb}</p>
                </div>
              </div>
              <RankLine points={profile.points} tone="dark" />
            </section>

            <ul className="grid grid-cols-3 gap-2.5" aria-label="Your totals">
              <Stat label="Points" value={String(profile.points)} tone="dark" />
              <Stat label="Check-ins" value={String(profile.checkins)} />
              <Stat label="kg CO₂ saved" value={String(Math.round(profile.co2SavedKg * 10) / 10)} />
            </ul>

            <BadgeShelf facts={factsFrom(profile, home?.stationId ?? null)} />

            <section aria-labelledby="explored-h" className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <h2 id="explored-h" className="text-[20px] font-black leading-tight tracking-[-0.5px]">
                  You&rsquo;ve explored {unlocked} of {total} neighborhoods
                </h2>
                <span className="text-[24px] font-black tabular-nums">{Math.round((unlocked / total) * 100)}%</span>
              </div>
              <Bar pct={(unlocked / total) * 100} label={`${unlocked} of ${total} neighborhoods unlocked`} />

              <ul className="space-y-2.5">
                {(profile?.neighborhoods ?? []).slice(0, SHOW_FIRST).map((n) => (
                  <li key={n.id} className="rounded-card border-2 border-hairline bg-white px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[16px] font-extrabold">{n.name}</span>
                        {hoodRankFor(n.spots) && (
                          <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.4px]">
                            {hoodRankFor(n.spots)?.name}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-black ${
                          n.unlocked ? "bg-line-green text-white" : "bg-panel text-muted"
                        }`}
                      >
                        {n.unlocked ? "Unlocked" : `${n.visited} of ${n.needed}`}
                      </span>
                    </div>
                    <StationDots total={n.needed} done={n.unlocked ? n.needed : n.visited} label={`${n.name}: ${n.visited} of ${n.needed} eaten`} />
                  </li>
                ))}
              </ul>
              <Fold open={showAll} id="hoods-rest">
                <ul className="space-y-2.5 pt-2.5">
                  {(profile?.neighborhoods ?? []).slice(SHOW_FIRST).map((n) => (
                    <li key={n.id} className="rounded-card border-2 border-hairline bg-white px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-[16px] font-extrabold">{n.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-black ${
                          n.unlocked ? "bg-line-green text-white" : "bg-panel text-muted"
                        }`}
                      >
                        {n.unlocked ? "Unlocked" : `${n.visited} of ${n.needed}`}
                      </span>
                    </div>
                    <StationDots total={n.needed} done={n.unlocked ? n.needed : n.visited} label={`${n.name}: ${n.visited} of ${n.needed} eaten`} />
                  </li>
                  ))}
                </ul>
              </Fold>
              {profile.neighborhoods.length > SHOW_FIRST && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  aria-controls="hoods-rest"
                  className={`${buttonClass("outline")} w-full`}
                >
                  {showAll ? "Show fewer" : `Show all ${profile.neighborhoods.length}`}
                </button>
              )}
            </section>

            <section aria-labelledby="quests-h" className="space-y-3">
              <h2 id="quests-h" className="text-[20px] font-black leading-tight tracking-[-0.5px]">
                Line quests
              </h2>
              <p className="-mt-1.5 text-[14px] text-muted">Eat near 5 different stops on one line.</p>
              <ul className="space-y-2.5">
                {profile.quests.map((q) => (
                  <li key={q.line} className="rounded-card border-2 border-hairline bg-white px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <LineBullet line={q.line} size={28} />
                        <span className="truncate text-[16px] font-extrabold">{q.name}</span>
                      </span>
                      <span className="shrink-0 text-[14px] font-black tabular-nums">
                        {q.completed ? "Done" : `${q.stops} of ${q.needed}`}
                      </span>
                    </div>
                    <StationDots total={q.needed} done={q.completed ? q.needed : q.stops} color={q.color} label={`${q.name}: ${q.stops} of ${q.needed} stops`} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section aria-labelledby="home-h" className="surface-dark rounded-card bg-ink p-4 text-white">
          <h2 id="home-h" className="eyebrow text-signal">Home base</h2>
          <p className="mt-1 text-[20px] font-black tracking-[-0.5px]">
            {home?.neighborhood ? (homeName ?? home.neighborhood.replace(/-/g, " ")) : "Not set yet"}
          </p>
          <p className="text-[14px] text-white/80">
            {homeStation ? `Nearest station: ${homeStation}. ` : ""}The farther you ride from home, the more a visit is worth.
          </p>
          <Link href="/onboarding" className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-white px-5 text-[15px] font-extrabold text-ink">
            {home?.neighborhood ? "Change home" : "Set your home"}
          </Link>
        </section>

        {!isDemo && (
          <button type="button" onClick={signOutUser} className="hit-44 text-[15px] font-bold text-muted underline underline-offset-2">
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
