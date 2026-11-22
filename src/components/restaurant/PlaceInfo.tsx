// Server components for the restaurant detail page. They stream in after the rest of the page
// (wrap them in <Suspense>) because the photo and details lookup can take a few seconds.
import { cravingById, type Restaurant } from "@/lib/geo";
import { formatOsmHours } from "@/lib/hours";
import { getPlaceDetails } from "@/lib/places";
import PhotoGallery, { PhotoPlaceholder } from "./PhotoGallery";

export function PhotosSkeleton() {
  return <div className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-fog/60" aria-busy="true" aria-label="Loading photos" />;
}

export async function RestaurantPhotos({ r }: { r: Restaurant }) {
  const d = await getPlaceDetails(r);
  const emoji = cravingById.get(r.craving)?.emoji;
  if (!d.photos.length) return <PhotoPlaceholder emoji={emoji} label={`No photos of ${r.name} yet`} />;
  return <PhotoGallery photos={d.photos} name={r.name} emoji={emoji} source={d.source} />;
}

/** Google Maps search link for the place. Works without an API key. */
function mapsSearchUrl(r: Restaurant): string {
  const q = [r.name, r.address, "Boston, MA"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span aria-hidden="true" className="w-5 shrink-0 text-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="sr-only">{label}</dt>
        <dd className="text-sm">{children}</dd>
      </div>
    </div>
  );
}

const linkClass = "font-medium text-line-blue underline underline-offset-2 break-words";

export function DetailsSkeleton() {
  return (
    <div className="space-y-3 rounded-lg bg-white p-3" aria-busy="true" aria-label="Loading details">
      {[0, 1, 2].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-fog/60" style={{ width: `${80 - i * 15}%` }} />)}
    </div>
  );
}

export async function RestaurantDetails({ r }: { r: Restaurant }) {
  const d = await getPlaceDetails(r);
  const website = safeHref(d.website ?? r.website);
  const mapsUrl = safeHref(d.googleMapsUrl) ?? mapsSearchUrl(r);
  const hours = d.hours?.length ? d.hours : formatOsmHours(r.openingHours);
  const tel = r.phone?.replace(/[^\d+]/g, "");
  const tags = [
    r.diet.vegetarian && "Vegetarian options",
    r.diet.vegan && "Vegan options",
    r.diet.glutenFree && "Gluten-free options",
    r.wheelchair === "yes" && "Wheelchair accessible",
    r.wheelchair === "limited" && "Limited wheelchair access",
  ].filter((t): t is string => Boolean(t));

  return (
    <div className="space-y-3">
      {(d.rating !== undefined || d.openNow !== undefined) && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {d.rating !== undefined && (
            <span>
              <span className="font-semibold">{d.rating.toFixed(1)}</span>
              <span aria-hidden="true" className="text-line-orange"> ★</span>
              {d.ratingCount !== undefined && (
                <span className="text-ink/60"> ({d.ratingCount.toLocaleString("en-US")} on Google)</span>
              )}
            </span>
          )}
          {d.openNow !== undefined && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                d.openNow ? "bg-line-green/10 text-line-green" : "bg-line-red/10 text-line-red"
              }`}
            >
              {d.openNow ? "Open now" : "Closed now"}
            </span>
          )}
        </p>
      )}

      {d.summary && <p className="text-sm leading-relaxed text-ink/80">{d.summary}</p>}

      <section className="rounded-lg bg-white px-3 py-1" aria-labelledby="info-h">
        <h2 id="info-h" className="sr-only">Details</h2>
        <dl className="divide-y divide-ink/10">
          <Row icon="📍" label="Address">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {r.address ? `${r.address}, ${r.neighborhoodName}` : `Open in Google Maps`}
            </a>
          </Row>
          {website && (
            <Row icon="🌐" label="Website">
              <a href={website} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {prettyHost(website)}
              </a>
            </Row>
          )}
          {r.phone && tel && (
            <Row icon="📞" label="Phone">
              <a href={`tel:${tel}`} className={linkClass}>{r.phone}</a>
            </Row>
          )}
          {hours.length > 0 && (
            <Row icon="🕒" label="Hours">
              <ul className="space-y-0.5">
                {hours.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </Row>
          )}
        </dl>
      </section>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Good to know">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink/80 ring-1 ring-ink/10">{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
