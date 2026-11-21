# CLAUDE.md

Context for Claude Code. Read this before every task.

## What we're building

A mobile-first web app for BostonHacks 2026 (due **9:00 AM Sunday Nov 22**, judging starts 9:30).

Boston is split into neighborhoods covered in fog. You unlock a neighborhood by eating at **3 restaurants** in it. Unlocking feeds a ranked system with three leaderboards: citywide, by college, and per neighborhood. Getting around uses the T, so transit is built into every screen.

Working name: **[NAME]** (rename once we claim the domain).

## Who it's for

College students in Boston without a car who stay in their campus bubble. The game pushes them to explore the city by T, filtered by craving and budget.

## Prizes we're targeting

- **Main track: Bos(tons) of Eats and Streets.** Must be a web app, must use Boston transit, must filter by craving, budget, and location.
- **Best Use of Gemini API:** receipt verification (vision) plus the craving concierge, both on Gemini.
- **Best Use of Solana:** NFT badge minted on neighborhood unlock, check-ins written on-chain (devnet).
- **Best Use of Tiger Data:** all game data lives in Tiger Data (Postgres + TimescaleDB). Check-ins are a hypertable; leaderboards are SQL.
- **Best Use of Mastra:** the craving concierge agent (and the check-in workflow) built with the Mastra TypeScript framework.
- **Best Use of Vultr:** the app runs in Docker on a Vultr instance.
- **Best Domain Name from GoDaddy Registry:** claim the code on the sponsor page, register the domain.
- **DEV Writing Challenge:** publish a project write-up on DEV.
- **Build Your Hackathon A-Team with SpaceXSI:** raffle for building with **Cursor and Grok Bot** this weekend. Read the rules on the sponsor page and claim the code. Someone must actually use both and keep proof (screenshots).
- Pitch only: Most Innovative Startup Idea, if that prize is still offered.

Judging criteria: impact, user fit, technical implementation, design, presentation. A working polished demo beats more features. Each sponsor integration must be real, visible in the demo, and explained in the README.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Leaflet + react-leaflet, OpenStreetMap tiles (map must be client-only, load with `next/dynamic` and `ssr: false`)
- Firebase Auth (Google sign-in) on the client; `firebase-admin` on the server only to verify ID tokens. No Firestore.
- **Tiger Data** via `pg` (`DATABASE_URL`). Schema in `db/schema.sql`.
- Turf.js for point-in-polygon and distances
- Gemini via `@google/genai` (server-side only)
- **Mastra** (`@mastra/core`, `@ai-sdk/google`, `zod`) for the concierge agent, with Gemini as the model
- **Solana devnet** via `@solana/web3.js` and `@solana/spl-token` (server-side only). Badges are 0-decimal, supply-1 SPL mints; check-ins use the Memo program. Ask before adding Metaplex.
- MBTA GTFS static (`https://cdn.mbta.com/MBTA_GTFS.zip`) parsed at build time by scripts
- MBTA V3 API (`https://api-v3.mbta.com`) for live predictions
- **Trip planner:** our own, in `src/lib/planner.ts`. Dijkstra over `data/graph.json` (built from MBTA GTFS by `scripts/graph.ts`: subway, light rail, bus, Silver Line), with live waits from MBTA predictions and live alerts. Free, no billing. Google Routes API is an optional fallback only.
- Deploy: Docker on a Vultr Cloud Compute instance (port 8080)

Don't add dependencies beyond these without asking.

## Folder structure

```
scripts/            One-off data builders. Run with `npm run data:*`. Output goes to /data.
data/               Static JSON/GeoJSON the app reads. Generated, but committed for the demo.
db/                 schema.sql for Tiger Data
docs/               DEV post draft, pitch script, sponsor notes
src/app/            Pages and API routes (App Router)
  page.tsx          The map (home)
  leaderboard/      Citywide / college / neighborhood tabs
  profile/          Unlocked neighborhoods, badges, line quests, CO2 saved
  restaurant/[id]/  Detail, nearest station, live arrivals, "Get there", check-in
  concierge/        Chat with the craving concierge agent
  api/checkin/      Verify location + receipt, write check-in, handle unlocks
  api/concierge/    Runs the Mastra agent
  api/directions/   Proxy to Google Routes API
  api/predictions/  Proxy to MBTA V3 predictions
src/components/     UI components
src/lib/            Shared logic. Keep game rules in scoring.ts, nothing hardcoded in components.
  db.ts             Tiger Data pool (null without DATABASE_URL)
  solana.ts         mintBadge, logCheckin
  agent.ts          Mastra agent and tools
```

## Game rules (source of truth: src/lib/scoring.ts)

- Check-in is valid if the user is within **75 m** of the restaurant AND the receipt passes Gemini verification (name matches, dated today).
- One check-in per restaurant per user counts toward unlocks.
- **3** distinct verified restaurants in a neighborhood = unlocked.
- Points: 10 per check-in, +50 per neighborhood unlock, +5 if the restaurant is independent (not a chain), +25 per completed line quest.
- **Line quests:** check in near 5 different stops on one subway line.
- College = the user's .edu email domain mapped through `src/lib/colleges.ts`.
- CO2 saved per trip = rideshare estimate minus transit/walk estimate, using a flat per-km factor in scoring.ts.

## Database schema (Tiger Data, `db/schema.sql`)

```
users         uid PK, display_name, email, college, points, co2_saved_kg, created_at
checkins      id, uid, restaurant_id, neighborhood, nearest_stop_id, lat, lng, verified, tx_signature, created_at   (hypertable on created_at)
first_visits  (uid, restaurant_id) PK. Enforces one counted check-in per restaurant per user.
unlocks       (uid, neighborhood) PK, badge_mint, created_at
quests        (uid, line) PK, stop_ids text[], completed
```

Leaderboards are SQL: citywide and college query `users` by `points`; per-neighborhood counts distinct restaurants per user from `checkins`. The TypeScript row shapes live in `src/lib/types.ts`.

## Demo mode

`NEXT_PUBLIC_DEMO_MODE=true` must always work, even with **no API keys set**:
- Shows a "Simulate check-in" button that skips location and receipt checks.
- Seeds ~40 fake users across BU, Northeastern, Tufts, MIT, Harvard, Emerson (`npm run data:seed`).
- Without `DATABASE_URL`, the server uses the in-memory store in `src/lib/store.ts`.
- Any external call (Gemini, Mastra, Solana, Google Routes, MBTA, Tiger Data) falls back to a canned response instead of throwing.

The live pitch is 3 minutes. Every feature must be demoable without walking anywhere. Before judging, run the demo once with real keys (Tiger Data, Gemini, Solana devnet) so the sponsor integrations are shown live.

## Rules

- Never commit secrets. Keys live in `.env.local`; keep `.env.example` updated when adding one.
- All Gemini, Mastra, Solana, Tiger Data, and Firebase Admin calls happen in API routes or server code, never in the browser.
- The repo is public (Devpost requires it).
- Small focused commits. One feature per branch.
- Prefer finishing and polishing over starting new features. After ~5 AM, only fix bugs and polish.

## Design direction

The app should feel like Boston, not a generic SaaS dashboard.
- T line colors are the palette anchors: Red `#DA291C`, Orange `#ED8B00`, Green `#00843D`, Blue `#003DA5`, Silver `#7C878E`. Use them for lines, quests, and progress, not as random decoration.
- Fogged neighborhoods: muted grey wash. Unlocked: clear, with a colored edge.
- The map is the hero. Keep chrome minimal and thumb-reachable on mobile.
- Copy is plain and short, sentence case. Buttons say exactly what they do ("Check in", "Get there").
- Must be usable at 375 px wide, with visible keyboard focus and decent contrast.

## Commands

```
npm run dev              Start local dev server
npm run data:all         Run hoods, gtfs, food in order
npm run data:graph       Build the trip planner graph from MBTA GTFS (data/graph.json)
npm run data:hoods       Prepare neighborhood GeoJSON
npm run data:gtfs        Parse MBTA GTFS into stations, lines, travel times
npm run data:food        Pull restaurants from OpenStreetMap and tag them
npm run data:seed        Seed demo users into Tiger Data
npm run db:migrate       Apply db/schema.sql to Tiger Data
npm run solana:setup     Fund a devnet wallet and create the badge collection
npm run build            Production build
```
