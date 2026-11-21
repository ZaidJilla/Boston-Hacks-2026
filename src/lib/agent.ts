// Server only. Craving concierge. Real implementation (Person 3): a Mastra Agent with Gemini
// as the model and tools: searchRestaurants (data.ts), getArrivals (mbta.ts), getRoute (routes.ts).
// Never throws: falls back to a keyword filter so demo mode works with no keys.
import { restaurants } from "./data";
import type { Craving, Restaurant } from "./types";

export interface ConciergeReply {
  message: string;
  picks: Restaurant[];
}

export async function askConcierge(prompt: string): Promise<ConciergeReply> {
  // TODO(Person 3): if GEMINI_API_KEY is set, run the Mastra agent and return its structured answer.
  const q = prompt.toLowerCase();
  const budget = /cheap|budget|\$(?!\$)/.test(q) ? 1 : undefined;
  const craving = (Object.values(
    ["pizza", "ramen", "tacos", "burgers", "coffee", "dessert", "chinese", "indian", "thai", "seafood", "sandwiches"],
  ) as Craving[]).find((c) => q.includes(c));
  const picks = restaurants
    .filter((r) => (!craving || r.craving === craving) && (!budget || r.price <= budget))
    .slice(0, 3);
  return {
    message: picks.length ? "Here are a few spots near a T stop." : "Nothing matched. Try another craving.",
    picks,
  };
}
