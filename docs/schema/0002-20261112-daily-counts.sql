CREATE TABLE daily_counts (
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (fingerprint, day, version, platform)
);

CREATE TABLE occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  seen_at INTEGER NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  sample TEXT NOT NULL
);

CREATE TABLE ratelimit (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window)
);

CREATE TABLE reports (
  fingerprint TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_clean TEXT NOT NULL DEFAULT '',
  triaged_at INTEGER,
  pr_url TEXT,
  note TEXT
);

CREATE TABLE triage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  pr_url TEXT,
  note TEXT
);

CREATE INDEX daily_counts_day ON daily_counts (day);

CREATE INDEX occurrences_fp_seen ON occurrences (fingerprint, seen_at DESC);

CREATE INDEX reports_count_last_seen ON reports (count DESC, last_seen DESC);

CREATE INDEX reports_last_seen ON reports (last_seen DESC);

CREATE INDEX triage_events_fp ON triage_events (fingerprint, at DESC);
