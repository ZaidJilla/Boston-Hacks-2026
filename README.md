# [NAME]

A map game for Boston college students. The city starts covered in fog. Eat at 3 restaurants in a neighborhood to unlock it, then climb the leaderboards for your city, your college, and each neighborhood. Every spot shows how to get there by T.

Built in 24 hours at BostonHacks 2026.

## Features

- Fogged map of Boston neighborhoods with every restaurant on it
- Filter by craving, budget, and T line
- Craving concierge: ask for "cheap ramen near the Green Line" and get picks with routes
- Live MBTA arrivals and transit directions to each spot
- Receipt check-ins verified with Gemini
- Neighborhood badges minted as NFTs on Solana
- Line quests and a CO2-saved tracker

## How we use the sponsors

| Sponsor | What we built with it |
| --- | --- |
| Gemini API | Reads receipt photos to confirm the restaurant and date. Powers the concierge. |
| Solana | A badge NFT is minted to the player on each neighborhood unlock. Every check-in is written to devnet with the Memo program. |
| Tiger Data | All game data. Check-ins are a hypertable, leaderboards are SQL queries. |
| Mastra | The concierge agent, with tools for restaurant search, live arrivals, and routes. |
| Vultr | The app runs in Docker on a Vultr instance. |
| GoDaddy Registry | Our domain: TODO |
| DEV | Write-up: TODO |
| SpaceXSI | Built with Cursor and Grok Bot. |

## Built with

Next.js, TypeScript, Tailwind, Leaflet, Firebase Auth, Tiger Data, Mastra, Google Gemini, Solana, Google Routes API, MBTA GTFS and V3 API, OpenStreetMap

## Run it locally

```
npm install
cp .env.example .env.local
npm run data:hoods && npm run data:gtfs && npm run data:food
npm run dev
```

Leave `NEXT_PUBLIC_DEMO_MODE=true` to try it without any API keys. Fake users, canned responses, and a "Simulate check-in" button make every feature work without walking anywhere.

To use the real services, fill in `.env.local` (see `.env.example`), then:

```
npm run db:migrate
npm run data:seed
npm run solana:setup
```

## Deploy

```
docker build -t [name] .
docker run -p 8080:8080 --env-file .env.local [name]
```

On Vultr: create a Cloud Compute instance with Docker, copy the env file, run the container, and point the domain at the instance IP.

## Team

- Raed
- 
- 
- 
