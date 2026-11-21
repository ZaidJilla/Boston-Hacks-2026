// Server only. Never throws: falls back to the demo verdict.
import { GoogleGenAI } from "@google/genai";
import { DEMO_MODE } from "./config";
import { demoVerdict } from "./demo";
import type { ReceiptVerdict } from "./types";

export async function verifyReceipt(
  imageBase64: string | undefined,
  restaurantName: string,
): Promise<ReceiptVerdict> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !imageBase64) return DEMO_MODE ? demoVerdict : { valid: false, nameMatches: false, datedToday: false, reason: "No receipt" };

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const today = new Date().toISOString().slice(0, 10);
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        {
          text: `Is this a receipt from "${restaurantName}" dated ${today}? Reply only JSON: {"nameMatches":boolean,"datedToday":boolean,"reason":string}`,
        },
      ],
    });
    const parsed = JSON.parse((res.text ?? "{}").replace(/```json|```/g, "").trim());
    return { valid: Boolean(parsed.nameMatches && parsed.datedToday), ...parsed };
  } catch {
    return DEMO_MODE ? demoVerdict : { valid: false, nameMatches: false, datedToday: false, reason: "Verification failed" };
  }
}
