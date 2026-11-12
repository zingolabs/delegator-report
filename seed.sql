-- Example data for local development. Apply with: pnpm db:seed:local (db:reset:local does both).
-- Timestamps are unix ms.

INSERT OR REPLACE INTO reports (fingerprint, count, first_seen, last_seen, build_id, message, stack_clean, triaged_at, pr_url, note) VALUES
('1111111111111111111111111111111111111111111111111111111111111111', 42, 1761800000000, 1761900000000, 'a1b2c3d4',
 'TypeError: cannot read property balance of undefined',
 'at WalletView (wallet.tsx:88:12)' || char(10) || 'at render (react.js:1:1)', NULL, NULL, NULL),
('2222222222222222222222222222222222222222222222222222222222222222', 42, 1761700000000, 1761850000000, 'a1b2c3d4',
 'RangeError: invalid delegation amount',
 'at delegate (delegate.ts:40:9)' || char(10) || 'at onSubmit (form.tsx:12:3)', 1761860000000, 'https://github.com/zingolabs/delegator/pull/123', 'fix: clamp delegation amount'),
('3333333333333333333333333333333333333333333333333333333333333333', 7, 1761600000000, 1761950000000, 'e5f6a7b8',
 'Error: crosslink node unreachable',
 'at connect (rpc.ts:21:5)', NULL, NULL, NULL),
('4444444444444444444444444444444444444444444444444444444444444444', 1, 1761950000000, 1761950000000, 'e5f6a7b8',
 '',
 'at main (index.js:1:1)', NULL, NULL, NULL);

DELETE FROM occurrences WHERE fingerprint IN (
 '1111111111111111111111111111111111111111111111111111111111111111',
 '2222222222222222222222222222222222222222222222222222222222222222',
 '3333333333333333333333333333333333333333333333333333333333333333',
 '4444444444444444444444444444444444444444444444444444444444444444');

INSERT INTO occurrences (fingerprint, seen_at, version, platform, sample) VALUES
('1111111111111111111111111111111111111111111111111111111111111111', 1761800000000, '0.4.2', 'ios',
 '{"buildId":"a1b2c3d4","version":"0.4.2","platform":"ios","stack":"TypeError: cannot read property balance of undefined\n  at WalletView (wallet.tsx:88:12)\n  at render (react.js:1:1)","message":"TypeError: cannot read property balance of undefined","breadcrumbs":["app start","sync complete","open wallet"]}'),
('1111111111111111111111111111111111111111111111111111111111111111', 1761850000000, '0.4.2', 'android',
 '{"buildId":"a1b2c3d4","version":"0.4.2","platform":"android","stack":"TypeError: cannot read property balance of undefined\n  at WalletView (wallet.tsx:88:12)\n  at render (react.js:1:1)","message":"TypeError: cannot read property balance of undefined","breadcrumbs":["app start","open wallet"]}'),
('1111111111111111111111111111111111111111111111111111111111111111', 1761900000000, '0.4.3-dev', 'ios',
 '{"buildId":"a1b2c3d4","version":"0.4.3-dev","platform":"ios","stack":"TypeError: cannot read property balance of undefined\n  at WalletView (wallet.tsx:88:12)\n  at render (react.js:1:1)","message":"TypeError: cannot read property balance of undefined","breadcrumbs":["app start","sync complete","open wallet","pull to refresh"]}'),
('2222222222222222222222222222222222222222222222222222222222222222', 1761700000000, '0.4.2', 'android',
 '{"buildId":"a1b2c3d4","version":"0.4.2","platform":"android","stack":"RangeError: invalid delegation amount\n  at delegate (delegate.ts:40:9)\n  at onSubmit (form.tsx:12:3)","message":"RangeError: invalid delegation amount","breadcrumbs":["open delegate","enter amount","tap confirm"]}'),
('2222222222222222222222222222222222222222222222222222222222222222', 1761850000000, '0.4.2', 'android',
 '{"buildId":"a1b2c3d4","version":"0.4.2","platform":"android","stack":"RangeError: invalid delegation amount\n  at delegate (delegate.ts:40:9)\n  at onSubmit (form.tsx:12:3)","message":"RangeError: invalid delegation amount","breadcrumbs":["open delegate","enter amount","tap confirm"]}'),
('3333333333333333333333333333333333333333333333333333333333333333', 1761600000000, '0.4.3-dev', 'ios',
 '{"buildId":"e5f6a7b8","version":"0.4.3-dev","platform":"ios","stack":"Error: crosslink node unreachable\n  at connect (rpc.ts:21:5)","message":"Error: crosslink node unreachable","breadcrumbs":["app start"]}'),
('3333333333333333333333333333333333333333333333333333333333333333', 1761950000000, '0.4.3-dev', 'ios',
 '{"buildId":"e5f6a7b8","version":"0.4.3-dev","platform":"ios","stack":"Error: crosslink node unreachable\n  at connect (rpc.ts:21:5)","message":"Error: crosslink node unreachable","breadcrumbs":["app start","retry"]}'),
('4444444444444444444444444444444444444444444444444444444444444444', 1761950000000, '0.4.3-dev', 'android',
 '{"buildId":"e5f6a7b8","version":"0.4.3-dev","platform":"android","stack":"Error: boom\n  at main (index.js:1:1)","message":"","breadcrumbs":[]}');

DELETE FROM triage_events WHERE fingerprint = '2222222222222222222222222222222222222222222222222222222222222222';
INSERT INTO triage_events (fingerprint, at, action, actor, pr_url, note) VALUES
('2222222222222222222222222222222222222222222222222222222222222222', 1761860000000, 'triage', 'dorian', 'https://github.com/zingolabs/delegator/pull/123', 'fix: clamp delegation amount');

-- Move the seed rows in time so that the newest one is "now". The list and the charts show
-- recent days only.
UPDATE reports SET
  first_seen = first_seen + (CAST(strftime('%s','now') AS INTEGER) * 1000 - 1761950000000),
  last_seen  = last_seen  + (CAST(strftime('%s','now') AS INTEGER) * 1000 - 1761950000000),
  triaged_at = triaged_at + (CAST(strftime('%s','now') AS INTEGER) * 1000 - 1761950000000)
WHERE fingerprint IN
 ('1111111111111111111111111111111111111111111111111111111111111111', '2222222222222222222222222222222222222222222222222222222222222222', '3333333333333333333333333333333333333333333333333333333333333333', '4444444444444444444444444444444444444444444444444444444444444444') AND last_seen <= 1761950000000;
UPDATE occurrences SET seen_at = seen_at + (CAST(strftime('%s','now') AS INTEGER) * 1000 - 1761950000000)
WHERE fingerprint IN
 ('1111111111111111111111111111111111111111111111111111111111111111', '2222222222222222222222222222222222222222222222222222222222222222', '3333333333333333333333333333333333333333333333333333333333333333', '4444444444444444444444444444444444444444444444444444444444444444') AND seen_at <= 1761950000000;
UPDATE triage_events SET at = at + (CAST(strftime('%s','now') AS INTEGER) * 1000 - 1761950000000)
WHERE fingerprint IN
 ('1111111111111111111111111111111111111111111111111111111111111111', '2222222222222222222222222222222222222222222222222222222222222222', '3333333333333333333333333333333333333333333333333333333333333333', '4444444444444444444444444444444444444444444444444444444444444444') AND at <= 1761950000000;

-- Daily counters: one per occurrence, plus some spread over the last days for the trend lines.
DELETE FROM daily_counts WHERE fingerprint IN
 ('1111111111111111111111111111111111111111111111111111111111111111', '2222222222222222222222222222222222222222222222222222222222222222', '3333333333333333333333333333333333333333333333333333333333333333', '4444444444444444444444444444444444444444444444444444444444444444');
INSERT INTO daily_counts (fingerprint, day, version, platform, count)
SELECT fingerprint, seen_at / 86400000, version, platform, COUNT(*)
FROM occurrences WHERE fingerprint IN
 ('1111111111111111111111111111111111111111111111111111111111111111', '2222222222222222222222222222222222222222222222222222222222222222', '3333333333333333333333333333333333333333333333333333333333333333', '4444444444444444444444444444444444444444444444444444444444444444')
GROUP BY fingerprint, seen_at / 86400000, version, platform;
INSERT OR REPLACE INTO daily_counts (fingerprint, day, version, platform, count) VALUES
('1111111111111111111111111111111111111111111111111111111111111111', CAST(strftime('%s','now') AS INTEGER) / 86400 - 9, '0.4.2', 'ios', 3),
('1111111111111111111111111111111111111111111111111111111111111111', CAST(strftime('%s','now') AS INTEGER) / 86400 - 6, '0.4.2', 'android', 7),
('1111111111111111111111111111111111111111111111111111111111111111', CAST(strftime('%s','now') AS INTEGER) / 86400 - 5, '0.4.2', 'ios', 9),
('1111111111111111111111111111111111111111111111111111111111111111', CAST(strftime('%s','now') AS INTEGER) / 86400 - 3, '0.4.3-dev', 'ios', 12),
('1111111111111111111111111111111111111111111111111111111111111111', CAST(strftime('%s','now') AS INTEGER) / 86400 - 1, '0.4.3-dev', 'ios', 8),
('2222222222222222222222222222222222222222222222222222222222222222', CAST(strftime('%s','now') AS INTEGER) / 86400 - 12, '0.4.2', 'android', 18),
('2222222222222222222222222222222222222222222222222222222222222222', CAST(strftime('%s','now') AS INTEGER) / 86400 - 11, '0.4.2', 'android', 14),
('2222222222222222222222222222222222222222222222222222222222222222', CAST(strftime('%s','now') AS INTEGER) / 86400 - 8, '0.4.2', 'android', 8),
('3333333333333333333333333333333333333333333333333333333333333333', CAST(strftime('%s','now') AS INTEGER) / 86400 - 2, '0.4.3-dev', 'ios', 2),
('3333333333333333333333333333333333333333333333333333333333333333', CAST(strftime('%s','now') AS INTEGER) / 86400 - 1, '0.4.3-dev', 'ios', 3);
