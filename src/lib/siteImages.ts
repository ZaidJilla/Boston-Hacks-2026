// Server only. Finds photos and a one-line description on a restaurant's own website.
// Used live by places.ts and ahead of time by scripts/photos.ts. Never throws.

export interface SiteScrape {
  photos: string[];
  summary?: string;
}

const MAX_HTML_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
export const MAX_SITE_PHOTOS = 5;
// A normal browser UA: many small restaurant sites refuse unknown clients.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Logos, icons and page furniture, not photos of the place or the food. */
// Always junk wherever it appears ("smlogotransp.png", "nav_logo.png").
const JUNK_ANYWHERE = /logo|favicon|sprite|wp-emoji|\/plugins\/|gravatar|facebook\.com\/tr/i;
// Junk only as a whole word, so "mustard", "french-toast" and "pineapple" photos survive.
const JUNK_WORDS = new RegExp(
  "(?:^|[/_\\-.\\s])(?:" +
    [
      "icons?", "badges?", "buttons?", "arrows?", "placeholder", "spacer", "blank", "pixel", "loader", "loading",
      "separator", "seperator", "divider", "pattern", "texture", "avatar", "emoji", "social", "facebook", "fb",
      "instagram", "insta", "ig", "twitter", "tiktok", "yelp", "app-?store", "google-?play", "play-?store",
      "doordash", "grubhub", "ubereats", "uber-?eats", "seamless", "opentable", "resy", "tripadvisor",
      "payments?", "visa", "mastercard", "paypal", "qr", "captcha", "cookies?", "flags?", "stars?", "ratings?",
      "maps?", "markers?", "pins?", "phone", "email", "close", "menu-?icon", "hamburger-?menu",
    ].join("|") +
    ")(?=$|[/_\\-.\\s\\d])",
  "i",
);
const isJunk = (s: string) => JUNK_ANYWHERE.test(s) || JUNK_WORDS.test(s);
const PHOTO_EXT = /\.(jpe?g|webp|png|avif)(?:$|[?#])/i;

export function safeHttpUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  const v = m?.[1] ?? m?.[2];
  return v === undefined ? undefined : decodeEntities(v);
}

/** Every <meta property|name="key" content="..."> value, in page order. */
function metaAll(html: string, key: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const c = attr(tag, "content");
    if (k === key && c) out.push(c);
  }
  return out;
}

/** The widest candidate in a srcset ("a.jpg 400w, b.jpg 1200w" -> b.jpg). */
function largestFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; w: number } | undefined;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, size = "1x"] = part.trim().split(/\s+/);
    const w = parseFloat(size) * (size.endsWith("x") ? 1000 : 1);
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

/** schema.org "image" values from JSON-LD blocks (string, array, or ImageObject). */
function jsonLdImages(html: string): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number): void => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    for (const key of ["image", "photo", "photos"]) {
      const img = o[key];
      for (const x of Array.isArray(img) ? img : [img]) {
        if (typeof x === "string") out.push(x);
        else if (x && typeof x === "object" && typeof (x as { url?: unknown }).url === "string") out.push((x as { url: string }).url);
      }
    }
    for (const [k, x] of Object.entries(o)) if (k !== "image" && typeof x === "object") visit(x, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]), 0);
    } catch {
      /* broken JSON-LD is common; skip it */
    }
  }
  return out;
}

/** Photos from <img> tags, skipping tiny ones (width/height attributes under 200px). */
function imgTagImages(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const w = parseInt(attr(tag, "width") ?? "", 10);
    const h = parseInt(attr(tag, "height") ?? "", 10);
    if ((w && w < 200) || (h && h < 150)) continue;
    if (/\blogo\b|\bicon\b/i.test(attr(tag, "alt") ?? "")) continue;
    const src =
      largestFromSrcset(attr(tag, "data-srcset") ?? attr(tag, "srcset")) ??
      attr(tag, "data-src") ??
      attr(tag, "data-lazy-src") ??
      attr(tag, "data-image") ??
      attr(tag, "src");
    if (src) out.push(src);
  }
  return out;
}

function cssBackgroundImages(html: string): string[] {
  return [...html.matchAll(/background(?:-image)?\s*:[^;"']*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map((m) => decodeEntities(m[1]));
}

/** Image URLs sitting in inline JSON (Wix, Squarespace, Next.js sites render images from data). */
function inlineImageUrls(html: string): string[] {
  return [...html.matchAll(/https?:\\?\/\\?\/[^\s"'<>()\\]+?\.(?:jpe?g|webp)(?=[\s"'<>()\\?#]|$)/gi)].map((m) =>
    m[0].replace(/\\\//g, "/"),
  );
}

/** Same picture at another size counts once: strip WordPress "-300x200", Wix "/v1/...", queries. */
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    try {
      path = decodeURIComponent(path); // "%7Emv2" and "~mv2" are the same Wix image
    } catch {
      /* keep it encoded */
    }
    return (u.host + path)
      .toLowerCase()
      .replace(/\/v1\/.*$/, "")
      .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
      .replace(/\.(jpe?g|png|webp|avif)(\.webp)?$/, "");
  } catch {
    return url;
  }
}

function looksLikePhoto(url: string): boolean {
  if (url.startsWith("data:")) return false;
  let path: string;
  try {
    const u = new URL(url);
    path = decodeURIComponent(u.pathname + u.search);
  } catch {
    return false;
  }
  if (/\.(svg|gif|ico)(?:$|[?#])/i.test(path)) return false;
  if (isJunk(path)) return false;
  // Image CDNs often drop the extension; allow them, otherwise insist on a photo extension.
  return PHOTO_EXT.test(path) || /wixstatic|squarespace-cdn|images\.squarespace|wsimg|website-files|cloudfront|imgix|ctfassets|shopify|googleusercontent|_next\/image/i.test(url);
}

async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

/** Every likely photo on the page, best first, deduplicated. Not yet checked to load. */
export function extractPhotos(html: string, pageUrl: string): string[] {
  const candidates = [
    ...metaAll(html, "og:image:secure_url"),
    ...metaAll(html, "og:image"),
    ...metaAll(html, "twitter:image"),
    ...jsonLdImages(html),
    ...imgTagImages(html),
    ...cssBackgroundImages(html),
    ...inlineImageUrls(html),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    // Our pages are served over https, where an http image would be blocked.
    const url = safeHttpUrl(raw, pageUrl)?.replace(/^http:/, "https:");
    if (!url || !looksLikePhoto(url)) continue;
    const key = dedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function extractSummary(html: string): string | undefined {
  const s = metaAll(html, "og:description")[0] ?? metaAll(html, "description")[0];
  if (!s) return undefined;
  return s.length > 280 ? `${s.slice(0, 277).trimEnd()}…` : s;
}

/**
 * True when the URL serves a real image of at least `minBytes` (icons and thumbnails are smaller).
 * Reads at most minBytes of the body.
 */
export async function isUsableImage(url: string, minBytes = 15_000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      await res.body?.cancel().catch(() => {});
      return false;
    }
    if ((res.headers.get("content-type") ?? "").includes("svg")) return false;
    const len = Number(res.headers.get("content-length"));
    if (len) {
      await res.body?.cancel().catch(() => {});
      return len >= minBytes;
    }
    return (await readCapped(res, minBytes)).byteLength >= minBytes;
  } catch {
    return false;
  }
}

/**
 * Fetch the site and pull its photos and description.
 * With `verify`, each photo is downloaded to check it loads and isn't an icon (slower, used by the script).
 */
export async function scrapeSite(website: string | null | undefined, opts: { verify?: boolean } = {}): Promise<SiteScrape | null> {
  // Callers pass URLs from our committed OSM data, never from a request.
  const site = safeHttpUrl(website);
  if (!site) return null;
  try {
    const res = await fetch(site, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const html = new TextDecoder().decode(await readCapped(res, MAX_HTML_BYTES));
    const all = extractPhotos(html, res.url || site);

    let photos: string[];
    if (opts.verify) {
      photos = [];
      // check in small batches, stop once we have enough
      for (let i = 0; i < all.length && i < 20 && photos.length < MAX_SITE_PHOTOS; i += 4) {
        const batch = all.slice(i, i + 4);
        const ok = await Promise.all(batch.map((u) => isUsableImage(u)));
        batch.forEach((u, j) => ok[j] && photos.length < MAX_SITE_PHOTOS && photos.push(u));
      }
    } else {
      photos = all.slice(0, MAX_SITE_PHOTOS);
    }

    const summary = extractSummary(html);
    return photos.length || summary ? { photos, summary } : null;
  } catch {
    return null;
  }
}
