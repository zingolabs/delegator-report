-- Daily counters: the history that the pruned occurrences table cannot give.
-- Apply to the remote D1 before the Worker that reads it is deployed.

CREATE TABLE IF NOT EXISTS daily_counts (
  fingerprint TEXT NOT NULL REFERENCES reports(fingerprint) ON DELETE CASCADE,
  day         INTEGER NOT NULL,   -- UTC day number: floor(unix ms / 86400000)
  version     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (fingerprint, day, version, platform)
);

CREATE INDEX IF NOT EXISTS daily_counts_day ON daily_counts (day);

-- Backfill from the occurrences that are still retained. Fingerprints with more reports than
-- retained occurrences get a lower total here than reports.count; that part is gone.
INSERT OR IGNORE INTO daily_counts (fingerprint, day, version, platform, count)
SELECT fingerprint, seen_at / 86400000, version, platform, COUNT(*)
FROM occurrences
GROUP BY fingerprint, seen_at / 86400000, version, platform;
