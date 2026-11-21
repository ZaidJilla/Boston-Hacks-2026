# [NAME]

A map game for Boston college students. The city starts covered in fog. Eat at 3 restaurants in a neighborhood to unlock it, then climb the leaderboards for your city, your college, and each neighborhood. Every spot shows how to get there by T.

Built in 24 hours at BostonHacks 2026.

## Features

- Fogged map of Boston neighborhoods with every restaurant on it
- Filter by craving, budget, and T line
- Live MBTA arrivals and transit directions to each spot
- Receipt check-ins verified with Gemini
- Neighborhood badges minted on Hedera
- Line quests and a CO2-saved tracker

## Built with

Next.js, TypeScript, Tailwind, Leaflet, Firebase, Google Gemini, Google Routes API, MBTA GTFS and V3 API, Hedera, OpenStreetMap

## Run it locally

```
npm install
cp .env.example .env.local
npm run data:hoods && npm run data:gtfs && npm run data:food
npm run dev
```

Leave `NEXT_PUBLIC_DEMO_MODE=true` to try it without any API keys.

## Team

- 
- 
- 
- 
