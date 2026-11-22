// Server only. Receipt verification with Gemini vision. Never throws.
import { GoogleGenAI, Type } from "@google/genai";
import { DEMO_MODE, GEMINI_MODEL } from "./config";
import { demoVerdict } from "./demo";
import { RECEIPT_GRACE_HOURS } from "./scoring";
import type { ReceiptVerdict } from "./types";
const TIMEOUT_MS = 15_000;
/** ~4 MB image. The client should downscale to ~1600 px JPEG before upload. */
export const MAX_RECEIPT_BASE64_CHARS = 5_500_000;

const reject = (reason: string): ReceiptVerdict => ({ valid: false, nameMatches: false, datedToday: false, reason });

const TZ = "America/New_York";

/** Today's date in Boston. toISOString() is UTC, which is "tomorrow" after 7 PM EST. */
export function todayInBoston(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // YYYY-MM-DD
}

/**
 * Receipt dates we accept right now: today, plus yesterday during the first
 * RECEIPT_GRACE_HOURS after midnight (late dinner, check in on the walk home).
 */
export function acceptableReceiptDates(now = new Date()): string[] {
  const dates = [todayInBoston(now)];
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < RECEIPT_GRACE_HOURS) dates.push(todayInBoston(new Date(now.getTime() - (hour + 1) * 3_600_000)));
  return dates;
}

// First characters of base64 for each format's magic bytes.
const SIGNATURES: [string, string][] = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["UklGR", "image/webp"],
];
// Image types Gemini accepts. HEIC/HEIF (iPhone default) is fine, no client conversion needed.
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Accepts raw base64 or a data URL. Returns clean base64 + mime type, or null if not a supported image. */
export function parseImage(input: string): { data: string; mimeType: string } | null {
  const m = input.match(/^data:([\w/.+-]+);base64,(.*)$/s);
  const data = (m ? m[2] : input).replace(/\s/g, "");
  if (!data) return null;
  const sniffed = SIGNATURES.find(([sig]) => data.startsWith(sig))?.[1];
  const declared = m?.[1]?.toLowerCase();
  const mimeType = sniffed ?? (declared && SUPPORTED.has(declared) ? declared : null);
  return mimeType ? { data, mimeType } : null;
}

// What we ask Gemini for. Richer than ReceiptVerdict so we can decide on our side.
interface GeminiReceipt {
  isReceipt: boolean;
  merchantName: string;
  receiptDate: string; // YYYY-MM-DD or ""
  legible: boolean;
  reason: string;
}

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isReceipt: { type: Type.BOOLEAN },
    merchantName: { type: Type.STRING },
    receiptDate: { type: Type.STRING },
    legible: { type: Type.BOOLEAN },
    reason: { type: Type.STRING },
  },
  required: ["isReceipt", "merchantName", "receiptDate", "legible", "reason"],
};

// Grammar and company suffixes: never part of a name's identity.
const STOP = new Set(["the", "and", "of", "inc", "llc", "co", "corp", "ltd", "company"]);
// Places and venue words: on receipts as branch names, so they don't identify a restaurant.
const PLACE = new Set([
  "boston", "cambridge", "somerville", "brookline", "allston", "brighton", "ma", "store", "location",
  "restaurant", "restaurants", "eatery",
]);
// Food and venue categories shared by many restaurants. "Pizza" alone must not match every pizza place.
const GENERIC = new Set([
  "pizza", "pizzeria", "ramen", "sushi", "burger", "burgers", "taco", "tacos", "taqueria", "cafe", "coffee",
  "bakery", "deli", "grill", "kitchen", "house", "bar", "pub", "tavern", "bistro", "diner", "express",
  "noodle", "noodles", "pho", "thai", "chinese", "indian", "dumpling", "dumplings", "bbq", "tea", "juice",
  "bagel", "bagels", "donut", "donuts", "wings", "chicken", "sandwich", "sandwiches", "salad", "seafood",
  "oyster", "steak", "steakhouse", "market", "shop", "pastry", "creamery", "ice", "cream",
]);

/** Normalized words: no accents/punctuation/store numbers/grammar words. */
function words(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // café -> cafe
    .toLowerCase()
    .replace(/#\s*\d+/g, " ") // store numbers
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !STOP.has(w));
}

/**
 * Merchant match. Receipts abbreviate and add store numbers and branch names
 * ("SWEETGREEN #123 BOYLSTON", "TATTE BKRY"), but a different business must not pass.
 * - If the restaurant has distinctive words ("tatte", "sweetgreen"), most of them must appear.
 * - If its name is only generic/place words ("Boston Pizza"), every word must appear, so
 *   "Pizza Hut" doesn't count as "Boston Pizza".
 */
export function namesMatch(receiptName: string, restaurantName: string): boolean {
  const receipt = words(receiptName);
  const name = words(restaurantName);
  if (!receipt.length || !name.length) return false;

  const receiptCompact = receipt.join("");
  // A word "appears" if it matches a receipt word (allowing POS abbreviations), or the receipt
  // spells it across a space: "SWEET GREEN" contains "sweetgreen".
  const appears = (w: string) =>
    receipt.some((x) => wordMatches(x, w)) || (w.length >= 4 && receiptCompact.includes(w));

  const isDistinctive = (w: string) => !GENERIC.has(w) && !PLACE.has(w);
  const distinctive = name.filter(isDistinctive);
  if (distinctive.length) return distinctive.filter(appears).length / distinctive.length >= 0.6;

  // Generic-only name ("Boston Pizza", "Pizza"): every word must appear, and the receipt can't
  // name a different business ("Joe's Pizza", "Pizza Hut" carry distinctive words of their own).
  const extra = receipt.filter((w) => isDistinctive(w) && !name.some((n) => wordMatches(w, n)));
  return name.every(appears) && extra.length === 0;
}

function wordMatches(x: string, w: string): boolean {
  if (x === w) return true;
  const [short, long] = x.length <= w.length ? [x, w] : [w, x];
  if (short.length < 3 || short[0] !== long[0]) return false;
  if (long.startsWith(short)) return true;
  // Letters of the short word appear in order in the long one: bkry ⊂ bakery.
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length && short.length >= long.length / 2;
}

// Gemini returns 503 "high demand" / 429 / 500 under load. These usually clear in a second.
const TRANSIENT = new Set([429, 500, 503]);
async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (i >= attempts || !status || !TRANSIENT.has(status)) throw err;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}

export async function verifyReceipt(
  imageBase64: string | undefined,
  restaurantName: string,
): Promise<ReceiptVerdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!imageBase64) return DEMO_MODE && !key ? demoVerdict : reject("Add a photo of your receipt");
  if (imageBase64.length > MAX_RECEIPT_BASE64_CHARS) return reject("Photo is too large, try again");
  // No key: the no-keys demo passes; anything else can't verify, so it fails closed.
  if (!key) return DEMO_MODE ? demoVerdict : reject("Receipt check is unavailable right now");

  const image = parseImage(imageBase64);
  if (!image) return reject("Couldn't read that photo");

  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: TIMEOUT_MS } });
    const res = await withRetry(() => ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { inlineData: image },
        {
          // Neither the expected restaurant NOR today's date is in the prompt: told what to look
          // for, the model "reads" it off blurry or old receipts. It transcribes; our code compares.
          text:
            `Transcribe this photo for a receipt checker.\n` +
            `- isReceipt: is it a printed or digital purchase receipt?\n` +
            `- legible: can you clearly read the merchant name AND the date? false if blurry, cut off or too dark.\n` +
            `- merchantName: the business name exactly as printed, "" if not clearly readable.\n` +
            `- receiptDate: the transaction date as YYYY-MM-DD, "" if not clearly readable.\n` +
            `Never guess or infer text you cannot actually read.`,
        },
      ],
      config: { responseMimeType: "application/json", responseSchema: RECEIPT_SCHEMA, temperature: 0 },
    }));

    const r = JSON.parse(res.text ?? "{}") as Partial<GeminiReceipt>;
    // Our rules, not Gemini's opinion:
    if (!r.isReceipt) return reject(r.reason || "That doesn't look like a receipt");
    if (!r.legible) return reject("Receipt is blurry, try a clearer photo");
    const nameMatches = namesMatch(r.merchantName ?? "", restaurantName);
    const datedToday = acceptableReceiptDates().includes(r.receiptDate ?? "");
    return {
      valid: nameMatches && datedToday,
      nameMatches,
      datedToday,
      reason: !nameMatches
        ? `Receipt is from "${r.merchantName}", not ${restaurantName}`
        : !datedToday
          ? "Receipt isn't from today"
          : "Receipt verified",
    };
  } catch (err) {
    // Fail closed, even in demo mode: a Gemini outage must not turn any photo into a verified
    // check-in. (Simulated check-ins never reach here.)
    console.error("verifyReceipt failed", err);
    return reject("Couldn't verify the receipt, try again");
  }
}
