// Server only. Receipt verification with Gemini vision. Never throws.
import { GoogleGenAI, Type } from "@google/genai";
import { DEMO_MODE } from "./config";
import { demoVerdict } from "./demo";
import type { ReceiptVerdict } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const TIMEOUT_MS = 15_000;
/** ~4 MB image. The client should downscale to ~1600 px JPEG before upload. */
export const MAX_RECEIPT_BASE64_CHARS = 5_500_000;

const reject = (reason: string): ReceiptVerdict => ({ valid: false, nameMatches: false, datedToday: false, reason });
const fallback = (reason: string): ReceiptVerdict => (DEMO_MODE ? demoVerdict : reject(reason));

/** Today's date in Boston. toISOString() is UTC, which is "tomorrow" after 7 PM EST. */
export function todayInBoston(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now); // YYYY-MM-DD
}

/** Accepts raw base64 or a data URL. Returns clean base64 + mime type. */
export function parseImage(input: string): { data: string; mimeType: string } | null {
  const m = input.match(/^data:(image\/[\w.+-]+);base64,(.*)$/s);
  const data = (m ? m[2] : input).replace(/\s/g, "");
  if (!data) return null;
  // TODO(Raed): sniff magic bytes when there's no data-URL prefix
  // (iVBOR = png, /9j/ = jpeg, UklGR = webp). HEIC from iPhones: ask Zaid to convert client-side.
  return { data, mimeType: m?.[1] ?? "image/jpeg" };
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

/**
 * Loose merchant match: receipts abbreviate ("SWEETGREEN #123", "Tatte Bakery & Cafe").
 * TODO(Raed): normalize (lowercase, strip punctuation/"the"/"#123"/"inc"), then accept if
 * either contains the other or token overlap is high. Test with real receipts.
 */
export function namesMatch(receiptName: string, restaurantName: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(receiptName);
  const b = norm(restaurantName);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

export async function verifyReceipt(
  imageBase64: string | undefined,
  restaurantName: string,
): Promise<ReceiptVerdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!imageBase64) return DEMO_MODE && !key ? demoVerdict : reject("Add a photo of your receipt");
  if (imageBase64.length > MAX_RECEIPT_BASE64_CHARS) return reject("Photo is too large, try again");
  if (!key) return fallback("Receipt check is unavailable right now");

  const image = parseImage(imageBase64);
  if (!image) return reject("Couldn't read that photo");

  try {
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: TIMEOUT_MS } });
    const today = todayInBoston();
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { inlineData: image },
        {
          text:
            `You verify restaurant receipts for a game. Today is ${today} in Boston.\n` +
            `Expected restaurant: "${restaurantName}".\n` +
            `Read the photo. Report whether it is a real printed or digital receipt, the merchant ` +
            `name exactly as printed, and the transaction date as YYYY-MM-DD ("" if not visible). ` +
            `Do not guess unreadable fields.`,
        },
      ],
      config: { responseMimeType: "application/json", responseSchema: RECEIPT_SCHEMA, temperature: 0 },
    });

    const r = JSON.parse(res.text ?? "{}") as Partial<GeminiReceipt>;
    // Our rules, not Gemini's opinion:
    if (!r.isReceipt) return reject(r.reason || "That doesn't look like a receipt");
    if (!r.legible) return reject("Receipt is blurry, try a clearer photo");
    const nameMatches = namesMatch(r.merchantName ?? "", restaurantName);
    const datedToday = r.receiptDate === today;
    // TODO(Raed): decide whether to allow yesterday's date between midnight and 4 AM.
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
    console.error("verifyReceipt failed", err);
    return fallback("Couldn't verify the receipt, try again");
  }
}
