import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT, "data");
export const CACHE_DIR = path.join(ROOT, "scripts", ".cache");

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Download a URL once and reuse it from scripts/.cache on later runs. Pass --fresh to refetch. */
export async function cachedFetch(
  url: string,
  file: string,
  init?: RequestInit,
): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const p = path.join(CACHE_DIR, file);
  if (fs.existsSync(p) && !process.argv.includes("--fresh")) {
    console.log(`  cache hit ${file}`);
    return fs.readFileSync(p);
  }
  console.log(`  fetching ${url.slice(0, 90)}${url.length > 90 ? "…" : ""}`);
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": "boston-fog-map-hackathon/0.1", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(p, buf);
  return buf;
}

export function writeJson(name: string, data: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const p = path.join(DATA_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data) + "\n");
  console.log(`  wrote data/${name} (${(fs.statSync(p).size / 1024).toFixed(0)} KB)`);
}

export function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")) as T;
}

/** Round coordinates to ~1 m to keep committed files small. */
export const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;
