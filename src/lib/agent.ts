// Server only. Craving concierge built with Mastra, running on Gemini.
// Without GEMINI_API_KEY (or if the model call fails) it falls back to a keyword filter,
// so demo mode never throws.
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { GEMINI_MODEL } from "./config";
import { getRestaurant, getStation, places, restaurants } from "./data";
import { findDetours, supportedKinds, type Detour } from "./detour";
import { getArrivals } from "./mbta";
import { parseTrip, resolveLocation } from "./resolve";
import { getTransitRoute } from "./routes";
import { CRAVINGS, LINES, NEIGHBORHOOD_IDS, parseQuery, searchWithRelaxation } from "./search";
import type { PlaceRow, Restaurant } from "./types";

export interface DetourInfo {
  id: string;
  addedMin: number;
  reason: string;
}

export interface ConciergeReply {
  message: string;
  picks: Restaurant[];
  /** Landmarks and stores suggested by a route-aware answer (they have no detail page yet). */
  places?: PlaceRow[];
  /** Present for route-aware answers: extra minutes and why each pick fits the trip. */
  detours?: DetourInfo[];
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


// Last places we suggested, so asking again surfaces new ones. Per server process, shared by all
// callers: fine for the demo, move to per-user storage if this ships.
const recent: string[] = [];
const RECENT_MAX = 30;
const remember = (ids: string[]) => {
  recent.push(...ids);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
};

const KINDS = ["food", "shop", "landmark"] as const;

function runDetour(input: {
  from: string; to: string; kind?: (typeof KINDS)[number]; craving?: string; maxPrice?: number;
  independentOnly?: boolean; stepFree?: boolean; maxAddedMin?: number;
}) {
  const kind = input.kind ?? "food";
  const from = resolveLocation(input.from);
  const to = resolveLocation(input.to);
  if (!from || !to)
    return { error: `Could not find ${!from ? `"${input.from}"` : `"${input.to}"`}. Ask for a T station or neighborhood.` };
  if (!supportedKinds().includes(kind))
    return { unsupported: true, available: supportedKinds(), note: `No ${kind} data yet. Only ${supportedKinds().join(", ")} can be suggested.` };
  const search = (exclude?: Set<string>) =>
    findDetours({
      from, to, kind,
      craving: input.craving as Restaurant["craving"] | undefined,
      maxPrice: input.maxPrice as 1 | 2 | 3 | undefined,
      independentOnly: input.independentOnly,
      stepFree: input.stepFree,
      maxAdded: input.maxAddedMin ?? 12,
      exclude,
    });
  // Small pools (11 shopping places) run dry after a few asks. Then repeat rather than say nothing.
  const fresh = search(new Set(recent));
  const picks = fresh.length ? fresh : search();
  remember(picks.map((d) => d.place.id));
  return {
    from: from.label, to: to.label,
    directMin: picks[0]?.directMin ?? null,
    results: picks.map((d) => ({
      id: d.place.id, name: d.place.name, kind: d.place.kind, craving: d.place.craving, price: d.place.price,
      isChain: d.place.isChain, neighborhood: d.place.neighborhood,
      addedMin: d.addedMin, onRoute: d.onRoute, feelsFar: d.feelsFar, reason: d.reason,
    })),
  };
}

export const findDetourTool = createTool({
  id: "findDetour",
  description:
    "Route-aware discovery. Use when the student says where they are and where they are going and also wants food, shopping, or something to see on the way. Returns places that add only a few minutes to that trip, each with `addedMin` and a `reason`. Results change on every call, so call it again for new ideas. `from` and `to` are a T station, neighborhood, or campus name.",
  inputSchema: z.object({
    from: z.string().describe("Where the student is now, e.g. Kenmore or Northeastern"),
    to: z.string().describe("Where they are headed, e.g. Chinatown"),
    kind: z.enum(KINDS).optional().describe("food (default), shop (shopping centers and districts), or landmark"),
    craving: z.enum(CRAVINGS as [string, ...string[]]).optional(),
    maxPrice: z.number().int().min(1).max(3).optional(),
    independentOnly: z.boolean().optional(),
    stepFree: z.boolean().optional().describe("Only places not known to be inaccessible"),
    maxAddedMin: z.number().min(3).max(30).optional().describe("Most extra minutes they will accept. Default 12."),
  }),
  execute: async (input) => runDetour(input),
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
      "When the student gives a start and an end (\"I'm at Kenmore going to Chinatown\") or asks for something on the way, call findDetour instead of searchRestaurants.",
      "With findDetour, say the extra minutes in plain words and lead with the pick that feels surprising (feelsFar) or is a new neighborhood. Never claim a place is on the way unless addedMin is small.",
      "If the student asks again or says they want something different, call findDetour again. It returns new places each time. Never repeat a place you already named.",
      "Set kind to shop for shopping (these are shopping centers, districts and markets, not single stores), landmark for museums, parks, and sights, and food otherwise. Only recommend places findDetour returned.",
    ].join("\n"),
    model: createGoogleGenerativeAI({ apiKey })(GEMINI_MODEL),
    tools: { searchRestaurants: searchRestaurantsTool, findDetour: findDetourTool, getArrivals: getArrivalsTool, getRoute: getRouteTool },
  }));
}

// ---- Public entry point ----

const kindOf = (q: string): (typeof KINDS)[number] =>
  /\b(shop|shopping|store|stores|boutique|bookstore|vintage|thrift)\b/i.test(q)
    ? "shop"
    : /\b(food|eat|hungry|lunch|dinner|breakfast|brunch|restaurant|coffee|snack|bite)\b/i.test(q)
      ? "food"
      : /\b(museum|landmark|sightsee|sightseeing|see something|walk|gallery|historic)\b|\bpark\b(?!\s*(street|st\b))/i.test(q)
        ? "landmark"
        : "food";

const placeById = new Map(places.map((p) => [p.id, p]));

function fallback(prompt: string): ConciergeReply {
  const trip = parseTrip(prompt);
  if (trip) {
    const filters = parseQuery(prompt);
    const out = runDetour({ from: trip.from.label, to: trip.to.label, kind: kindOf(prompt), craving: filters.craving, maxPrice: filters.maxPrice, independentOnly: filters.independentOnly });
    const found = "results" in out ? out.results : undefined;
    if (found?.length) {
      const known = new Map(restaurants.map((r) => [r.id, r]));
      const picks = found.map((r) => known.get(r.id)).filter((r): r is Restaurant => Boolean(r));
      const extra = found.map((r) => placeById.get(r.id)).filter((p): p is PlaceRow => Boolean(p));
      return {
        message: `Here are a few spots that barely change your trip from ${trip.from.label} to ${trip.to.label}.`,
        picks,
        places: extra,
        detours: found.map((r) => ({ id: r.id, addedMin: r.addedMin, reason: r.reason })),
        dropped: [],
        source: "fallback",
      };
    }
  }
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
    let detours: DetourInfo[] | undefined;
    type ToolOut = { results?: { id: string; addedMin?: number; reason?: string }[]; dropped?: string[] };
    for (const step of out.steps ?? []) {
      for (const tr of step.toolResults ?? []) {
        const p = (tr as { payload?: { toolName?: string; result?: ToolOut } }).payload;
        if ((p?.toolName === "searchRestaurants" || p?.toolName === "findDetour") && Array.isArray(p.result?.results)) {
          ids = p.result.results.map((r) => r.id);
          dropped = p.result.dropped ?? [];
          detours =
            p.toolName === "findDetour"
              ? p.result.results.map((r) => ({ id: r.id, addedMin: r.addedMin ?? 0, reason: r.reason ?? "" }))
              : undefined;
        }
      }
    }
    const picks = ids.map((id) => known.get(id)).filter((r): r is Restaurant => Boolean(r)).slice(0, 3);
    const extra = ids.map((id) => placeById.get(id)).filter((p): p is PlaceRow => Boolean(p)).slice(0, 3);
    return { message: text, picks, places: extra, detours, dropped, source: "gemini" };
  } catch (err) {
    console.error("[concierge] Gemini/Mastra call failed, using fallback:", err instanceof Error ? err.message : err);
    return fallback(prompt);
  }
}
