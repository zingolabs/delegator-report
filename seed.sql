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
