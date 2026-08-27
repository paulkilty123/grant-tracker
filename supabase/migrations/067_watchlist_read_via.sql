-- 067 — record WHICH reader produced a watchlist fingerprint.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY
--
-- `check-watchlist` fetches each listing page directly and fingerprints the
-- HTML. On 26 August it reported 16 errors out of 150 pages checked, 13 of them
-- an outright HTTP 403: Camden, Kensington & Chelsea, Power to Change, Wolfson
-- Foundation, Inspiring Scotland, Ashoka and others. Those funders have never
-- been checked once. They have no baseline, so they can never raise a
-- listing_changed alert, and September is exactly when their rounds reopen.
--
-- The reader proxy already gets through those hosts and is used by enrichment
-- and by verification. The watchlist was the one job still fetching direct-only.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A COLUMN RATHER THAN JUST ADDING THE FALLBACK
--
-- The proxy returns MARKDOWN and the direct fetch returns HTML, so the two
-- readers produce different fingerprints from an unchanged page. Without knowing
-- which reader produced the stored value, a single direct-fetch blip would read
-- as "this listing changed", flag every catalogue row on that URL into the
-- verification queue, and then read as changed AGAIN on the next successful
-- direct fetch. Two false alerts and a queue of pointless re-reads, from a page
-- that never moved.
--
-- So the reader is stored beside the fingerprint, and a change of reader
-- re-baselines instead of alerting. NULL means the fingerprint predates this
-- column and was therefore a direct read.

alter table public.funder_watchlist
  add column if not exists last_read_via text;

comment on column public.funder_watchlist.last_read_via is
  'Which reader produced last_fingerprint: direct | proxy. The two produce different fingerprints from the same page (HTML vs markdown), so a fingerprint is only ever compared against one taken the same way. NULL means it predates this column, i.e. direct.';
