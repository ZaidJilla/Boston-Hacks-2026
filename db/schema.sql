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

-- Optional (Person 2, if time): continuous aggregate for the neighborhood leaderboard.
