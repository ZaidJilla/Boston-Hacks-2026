-- Tiger Data (Postgres + TimescaleDB). Safe to re-run.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS users (
  uid          text PRIMARY KEY,
  display_name text NOT NULL,
  email        text NOT NULL DEFAULT '',
  college      text NOT NULL DEFAULT 'Other',
  points       integer NOT NULL DEFAULT 0,
  co2_saved_kg numeric(8,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_points_idx ON users (points DESC);
CREATE INDEX IF NOT EXISTS users_college_points_idx ON users (college, points DESC);

-- Time-series of check-ins. Hypertable partitioned on created_at.
CREATE TABLE IF NOT EXISTS checkins (
  id              bigserial,
  uid             text NOT NULL REFERENCES users(uid),
  restaurant_id   text NOT NULL,
  neighborhood    text NOT NULL,
  nearest_stop_id text NOT NULL,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  verified        boolean NOT NULL DEFAULT false,
  tx_signature    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('checkins', 'created_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS checkins_hood_idx ON checkins (neighborhood, uid);

-- Hypertable unique keys must include the time column, so first visits live here.
CREATE TABLE IF NOT EXISTS first_visits (
  uid           text NOT NULL REFERENCES users(uid),
  restaurant_id text NOT NULL,
  PRIMARY KEY (uid, restaurant_id)
);

CREATE TABLE IF NOT EXISTS unlocks (
  uid          text NOT NULL REFERENCES users(uid),
  neighborhood text NOT NULL,
  badge_mint   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, neighborhood)
);

CREATE TABLE IF NOT EXISTS quests (
  uid       text NOT NULL REFERENCES users(uid),
  line      text NOT NULL,
  stop_ids  text[] NOT NULL DEFAULT '{}',
  completed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (uid, line)
);

-- Daily chunks line up with the daily aggregate below and "this week" queries.
-- Only affects chunks created from now on, so it's safe to re-run.
SELECT set_chunk_time_interval('checkins', INTERVAL '1 day');

-- Continuous aggregate: check-ins per player per neighborhood per day. Powers the
-- neighborhood leaderboard and the "check-ins over time" chart. materialized_only = false
-- means real-time: rows newer than the last refresh are still included.
CREATE MATERIALIZED VIEW IF NOT EXISTS checkins_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', created_at) AS day,
       neighborhood,
       uid,
       count(*) AS checkins
  FROM checkins
 WHERE verified
 GROUP BY day, neighborhood, uid
WITH NO DATA;

SELECT add_continuous_aggregate_policy('checkins_daily',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists     => TRUE);
