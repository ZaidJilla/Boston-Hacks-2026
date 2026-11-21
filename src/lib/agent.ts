// Server only. Craving concierge built with Mastra, running on Gemini.
// Without GEMINI_API_KEY (or if the model call fails) it falls back to a keyword filter,
// so demo mode never throws.
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { GEMINI_MODEL } from "./config";
import { getRestaurant, getStation, restaurants } from "./data";
import { getArrivals } from "./mbta";
import { getTransitRoute } from "./routes";
import { CRAVINGS, LINES, NEIGHBORHOOD_IDS, parseQuery, searchWithRelaxation } from "./search";
import type { Restaurant } from "./types";

export interface ConciergeReply {
  message: string;
  picks: Restaurant[];
  /** Filters that were loosened to find these picks. Empty when the match is exact. */
  dropped: string[];
  source: "gemini" | "fallback";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ---- Tools (each one is a typed function the model can call) ----

export const searchRestaurantsTool = createTool({
  id: "searchRestaurants",
  description:
    "Find restaurants. Filter by craving, neighborhood, max price tier (1=$, 2=$$, 3=$$$), the T line at the nearest stop, and independent-only. If nothing matches it loosens filters automatically: `exact` is false and `dropped` lists what it loosened.",
  inputSchema: z.object({
    craving: z.enum(CRAVINGS as [string, ...string[]]).optional(),
    neighborhood: z.enum(NEIGHBORHOOD_IDS as [string, ...string[]]).optional().describe("Use when the student names an area, e.g. chinatown"),
    maxPrice: z.number().int().min(1).max(3).optional(),
    line: z.enum(LINES as [string, ...string[]]).optional(),
    independentOnly: z.boolean().optional(),
  }),
  execute: async (input) => {
    const { results, exact, dropped } = searchWithRelaxation({ ...input, limit: 6 } as Parameters<typeof searchWithRelaxation>[0]);
    return {
      exact,
      dropped,
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        craving: r.craving,
        price: r.price,
        isChain: r.isChain,
        neighborhood: r.neighborhood,
        nearestStop: getStation(r.nearestStopId)?.name,
        lines: getStation(r.nearestStopId)?.lines,
      })),
    };
  },
});

const getArrivalsTool = createTool({
  id: "getArrivals",
  description: "Live MBTA arrivals at a restaurant's nearest stop.",
  inputSchema: z.object({ restaurantId: z.string() }),
  execute: async ({ restaurantId }) => {
    const r = getRestaurant(restaurantId);
    return r ? await getArrivals(r.nearestStopId) : [];
  },
});

const getRouteTool = createTool({
  id: "getRoute",
  description: "Transit route and travel time from the student's campus to a restaurant.",
  inputSchema: z.object({ restaurantId: z.string() }),
  execute: async ({ restaurantId }) => {
    const r = getRestaurant(restaurantId);
    return r ? await getTransitRoute(undefined, { lat: r.lat, lng: r.lng }, r.nearestStopId) : null;
  },
});

let agent: Agent | null = null;
function getAgent(apiKey: string): Agent {
  return (agent ??= new Agent({
    id: "craving-concierge",
    name: "Craving concierge",
    instructions: [
      "You help Boston college students without a car find food reachable by the T.",
      "Work out the craving, budget, and T line from what the student says.",
      "Always call searchRestaurants. Only recommend restaurants it returned, never invent one.",
      "Use getRoute or getArrivals when the student asks how long it takes or when the next train is.",
      "Prefer independent places when it is a tie. Budget words like cheap or broke mean maxPrice 1.",
      "The app shows restaurant cards itself, so reply in one or two short plain sentences and do not list details.",
      "If the student names an area, pass it as neighborhood.",
      "If searchRestaurants returns exact=false, say in one sentence which filters were loosened (the dropped list) and present the picks as the closest alternatives. Never say nothing was found when results is not empty.",
      "If results is empty, say so and suggest a looser craving or budget. No emoji.",
    ].join("\n"),
    model: createGoogleGenerativeAI({ apiKey })(GEMINI_MODEL),
    tools: { searchRestaurants: searchRestaurantsTool, getArrivals: getArrivalsTool, getRoute: getRouteTool },
  }));
}

// ---- Public entry point ----

function fallback(prompt: string): ConciergeReply {
  const { results, exact, dropped } = searchWithRelaxation({ ...parseQuery(prompt), limit: 3 });
  const message = !results.length
    ? "Nothing matched. Try another craving, a cheaper budget, or a different line."
    : exact
      ? "Here are a few spots near a T stop."
      : `No exact match, so I loosened the ${dropped.join(" and ")}. Closest options:`;
  return { message, picks: results, dropped, source: "fallback" };
}

export async function askConcierge(prompt: string, history: ChatTurn[] = []): Promise<ConciergeReply> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallback(prompt);
  try {
    const messages = [...history.slice(-6), { role: "user" as const, content: prompt }].map((t) =>
      t.role === "user"
        ? { role: "user" as const, content: t.content }
        : { role: "assistant" as const, content: t.content },
    );
    // Cap the wait so a slow or overloaded model falls back instead of hanging the chat.
    const out = await Promise.race([
      getAgent(key).generate(messages, { maxSteps: 4 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 15 s")), 15_000)),
    ]);
    const text = out.text?.trim();
    if (!text) {
      console.error("[concierge] Gemini returned no text (rate limit or error?), using fallback");
      return fallback(prompt);
    }

    // Picks are whatever the last searchRestaurants call returned, so the model can't invent a place.
    const known = new Map(restaurants.map((r) => [r.id, r]));
    let ids: string[] = [];
    let dropped: string[] = [];
    for (const step of out.steps ?? []) {
      for (const tr of step.toolResults ?? []) {
        const p = (tr as { payload?: { toolName?: string; result?: { results?: { id: string }[]; dropped?: string[] } } }).payload;
        if (p?.toolName === "searchRestaurants" && Array.isArray(p.result?.results)) {
          ids = p.result.results.map((r) => r.id);
          dropped = p.result.dropped ?? [];
        }
      }
    }
    const picks = ids.map((id) => known.get(id)).filter((r): r is Restaurant => Boolean(r)).slice(0, 3);
    return { message: text, picks, dropped, source: "gemini" };
  } catch (err) {
    console.error("[concierge] Gemini/Mastra call failed, using fallback:", err instanceof Error ? err.message : err);
    return fallback(prompt);
  }
}
