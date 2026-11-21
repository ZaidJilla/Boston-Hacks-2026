# Tiger Data in [NAME]

<!-- TODO(Raed): fill in before ~6 AM. Judges skim, so lead with the screenshot. -->

## What lives in Tiger Data

Every piece of game state: users, check-ins, first visits, neighborhood unlocks and line quests. Schema: [`db/schema.sql`](../db/schema.sql).

## Why check-ins are a hypertable

<!-- Check-ins are append-only events with a timestamp: classic time-series. Partitioning on
created_at keeps "this week" queries fast as the table grows, and enables continuous aggregates. -->

## The queries

<!-- Paste the real SQL from src/lib/leaderboard.ts and src/lib/store.ts:
- Citywide and by-college leaderboards
- Per-neighborhood leaderboard (distinct restaurants per user)
- The check-in transaction (first_visits guard, unlock detection, quest update)
- Optional: continuous aggregate, e.g. check-ins per neighborhood per day -->

## Screenshot

<!-- Tiger Cloud console showing the checkins hypertable and a leaderboard query result. -->
