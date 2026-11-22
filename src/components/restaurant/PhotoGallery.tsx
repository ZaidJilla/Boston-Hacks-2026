"use client";
// Swipeable photo strip. Photos that fail to load are dropped; with none left, shows the placeholder.
import { useState } from "react";
import type { PlacePhoto } from "@/lib/places";

export function PhotoPlaceholder({ emoji, label }: { emoji?: string; label: string }) {
  return (
    <div
      className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl bg-fog/60 text-6xl"
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{emoji ?? "🍽️"}</span>
    </div>
  );
}

export default function PhotoGallery({
  photos,
  name,
  emoji,
  source,
}: {
  photos: PlacePhoto[];
  name: string;
  emoji?: string;
  source: "google" | "website" | "none";
}) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shown = photos.filter((p) => !broken.has(p.url));
  const [index, setIndex] = useState(0);

  if (!shown.length) return <PhotoPlaceholder emoji={emoji} label={`No photos of ${name} yet`} />;

  const many = shown.length > 1;
  const current = Math.min(index, shown.length - 1);

  return (
    <figure className="space-y-1.5">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`Photos of ${name}`}
        role="region"
        tabIndex={many ? 0 : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {shown.map((p, i) => (
          <div key={p.url} className="relative aspect-[16/9] w-full shrink-0 snap-center overflow-hidden rounded-2xl bg-fog/60">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote hosts vary per restaurant */}
            <img
              src={p.url}
              alt={many ? `${name}, photo ${i + 1} of ${shown.length}` : name}
              loading={i === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setBroken((b) => new Set(b).add(p.url))}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-xs text-ink/60">
        <span className="min-w-0 truncate">
          {source === "google" ? (
            <>
              Photo{shown[current]?.author ? " by " : " from Google"}
              {shown[current]?.author &&
                (shown[current].authorUrl ? (
                  <a href={shown[current].authorUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {shown[current].author}
                  </a>
                ) : (
                  shown[current].author
                ))}
              {shown[current]?.author && " · Google"}
            </>
          ) : (
            "From their website"
          )}
        </span>
        {many && (
          <span className="flex shrink-0 gap-1" aria-hidden="true">
            {shown.map((p, i) => (
              <span key={p.url} className={`h-1.5 w-1.5 rounded-full ${i === current ? "bg-ink" : "bg-ink/25"}`} />
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
