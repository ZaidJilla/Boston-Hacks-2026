# How we use Mastra

The craving concierge is a [Mastra](https://mastra.ai) agent running on Gemini. A student types what they want in plain English ("cheap ramen near the Green Line") and gets restaurants they can reach by T, with live arrivals.

Code: [`src/lib/agent.ts`](../src/lib/agent.ts) · API: [`src/app/api/concierge/route.ts`](../src/app/api/concierge/route.ts) · UI: [`src/app/concierge/page.tsx`](../src/app/concierge/page.tsx)

## Why an agent

The main filters in this app are craving, budget, and location. The map has them as controls. The concierge handles the same filters from a sentence, so the model has to turn messy language into structured filters and then check them against real data. That is a tool-calling problem, which is what Mastra is for.

## Design

```
student message ──► Mastra Agent (Gemini 2.0 Flash)
                        │  calls tools as needed
                        ├─ searchRestaurants({ craving, maxPrice, line, independentOnly })
                        ├─ getRoute({ restaurantId })        → Google Routes, or our station-data estimate
                        └─ getArrivals({ restaurantId })     → MBTA V3 live predictions
                        │
                        ▼
              structured output { message, pickIds[] }
                        │
                        ▼
   server maps pickIds to real restaurants ──► cards with live arrival chips
```

### Tools

All three are Mastra `createTool` definitions with `zod` input schemas, defined in `agent.ts`.

| Tool | Input | What it does |
| --- | --- | --- |
| `searchRestaurants` | craving, maxPrice (1 to 3), line, independentOnly | Filters our restaurant data. The T line is matched against the restaurant's nearest stop. |
| `getRoute` | restaurantId | Transit route and time from campus. Uses the same code as the "Get there" button. |
| `getArrivals` | restaurantId | Live MBTA arrivals at the nearest stop. |

### Guardrails

- **No invented restaurants.** The agent returns restaurant ids, not names. The server looks each id up in our data and drops any it doesn't know, so the model can't recommend a place that doesn't exist.
- **Structured output.** The reply is validated against a `zod` schema (`message` plus up to 3 `pickIds`).
- **Never breaks the demo.** With no `GEMINI_API_KEY`, or if the model call fails, a keyword parser (`parseQuery` in `src/lib/search.ts`) answers from the same filter function. The response includes `source: "gemini" | "fallback"` so we can tell which ran.
- **Server only.** The key never reaches the browser.

### Conversation

The page keeps the chat history and sends the last 6 turns with each request, so follow-ups like "something cheaper" work.

## Try it

```
npm run dev
# open /concierge, or:
curl -X POST localhost:3000/api/concierge \
  -H 'content-type: application/json' \
  -d '{"prompt":"cheap ramen near the Green Line"}'
```

Set `GEMINI_API_KEY` in `.env.local` to use the agent. Without it you get the fallback.

## Screenshots

TODO (capture with a real key before judging):
- [ ] Concierge chat with picks and live arrival chips
- [ ] A follow-up question using conversation history
