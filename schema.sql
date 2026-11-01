-- delegator-report D1 schema. Idempotent: safe to re-run.
-- Not deployed yet: edit in place and `pnpm db:reset:local`. Start a migrations/ folder on first deploy.

-- One row per crash fingerprint: the aggregate and the triage state.
CREATE TABLE IF NOT EXISTS reports (
  fingerprint TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 1,
  first_seen  INTEGER NOT NULL,   -- unix ms
  last_seen   INTEGER NOT NULL,   -- unix ms
  build_id    TEXT NOT NULL,      -- part of the fingerprint, so constant per row
  message     TEXT NOT NULL,      -- from the first report (untrusted)
  stack_clean TEXT NOT NULL DEFAULT '', -- frame-like lines only; the shape agents read
  triaged_at  INTEGER,            -- unix ms, NULL = untriaged
  pr_url      TEXT,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS reports_count_last_seen ON reports (count DESC, last_seen DESC);
CREATE INDEX IF NOT EXISTS reports_last_seen ON reports (last_seen DESC);

-- One row per received report. The first occurrence of a fingerprint is kept forever;
-- after that only the newest N are retained (see MAX_OCCURRENCES in report.post.ts).
CREATE TABLE IF NOT EXISTS occurrences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  seen_at     INTEGER NOT NULL,   -- unix ms
  version     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  sample      TEXT NOT NULL       -- JSON of the full payload (untrusted)
);

CREATE INDEX IF NOT EXISTS occurrences_fp_seen ON occurrences (fingerprint, seen_at DESC);

-- Dumb per-client-per-hour rate limit counter.
CREATE TABLE IF NOT EXISTS ratelimit (
  key    TEXT NOT NULL,            -- sha-256(client IP) until device keys exist
  window INTEGER NOT NULL,         -- floor(now / 1h)
  count  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window)
);

-- Append-only triage history. Written only by POST /triage (WRITE_TOKEN).
CREATE TABLE IF NOT EXISTS triage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  at          INTEGER NOT NULL,   -- unix ms
  action      TEXT NOT NULL,      -- 'triage' | 'reset'
  actor       TEXT NOT NULL,
  pr_url      TEXT,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS triage_events_fp ON triage_events (fingerprint, at DESC);
