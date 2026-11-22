"use client";
// Swipeable photo strip. Photos that fail to load are dropped; with none left, shows the placeholder.
import { useState } from "react";
import type { PlacePhoto } from "@/lib/places";
import FoodArt, { FOOD_BG } from "./FoodArt";

/** No photo yet: an illustration of the kind of food the place serves, with its category. */
export function PhotoPlaceholder({
  name,
  category,
  categoryLabel,
}: {
  name: string;
  /** e.g. "chinese", "pizza" (restaurant.category) */
  category: string;
  /** e.g. "Chinese", "Pizza" (restaurant.categoryLabel) */
  categoryLabel: string;
}) {
  return (
    <div
      className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-card"
      style={{ background: FOOD_BG[category] ?? FOOD_BG.other }}
      role="img"
      aria-label={`${categoryLabel} illustration. No photo of ${name} yet.`}
    >
      <FoodArt category={category} className="h-[78%] w-auto drop-shadow-[0_6px_0_rgba(0,0,0,0.08)]" />
      <span className="absolute bottom-3 left-3 rounded-full bg-ink px-3 py-1 text-[13px] font-extrabold text-white" aria-hidden="true">
        {categoryLabel}
      </span>
      <span className="absolute bottom-3 right-3 text-[12px] font-bold text-muted" aria-hidden="true">
        No photo yet
      </span>
    </div>
  );
}

export default function PhotoGallery({
  photos,
  name,
  category,
  categoryLabel,
  source,
  sourceUrl,
}: {
  photos: PlacePhoto[];
  name: string;
  category: string;
  categoryLabel: string;
  source: "google" | "website" | "yelp" | "none";
  /** the business page on the photo source; Yelp photos must link back to it */
  sourceUrl?: string;
}) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shown = photos.filter((p) => !broken.has(p.url));
  const [index, setIndex] = useState(0);

  // Every photo failed to load (dead link, hotlink block): fall back to the illustration.
  if (!shown.length) return <PhotoPlaceholder name={name} category={category} categoryLabel={categoryLabel} />;

  const many = shown.length > 1;
  const current = Math.min(index, shown.length - 1);

  return (
    <figure className="space-y-1.5">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`Photos of ${name}`}
        role="region"
        tabIndex={many ? 0 : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {shown.map((p, i) => (
          <div key={p.url} className="relative aspect-[16/9] w-full shrink-0 snap-center overflow-hidden rounded-card bg-panel">
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
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted">
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
          ) : source === "yelp" ? (
            <>
              Photos from{" "}
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#D32323] underline underline-offset-2"
                >
                  Yelp
                </a>
              ) : (
                "Yelp"
              )}
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
