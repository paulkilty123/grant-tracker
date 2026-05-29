-- ── Alternative funding types ────────────────────────────────────────────────
-- Extends the funder_type enum to support non-grant capital routes:
--   competition    — pitch prizes, innovation challenges, awards
--   loan           — repayable social lending (often interest-free / low rate)
--   crowdfund_match — matched crowdfunding campaigns

ALTER TYPE funder_type ADD VALUE IF NOT EXISTS 'competition';
ALTER TYPE funder_type ADD VALUE IF NOT EXISTS 'loan';
ALTER TYPE funder_type ADD VALUE IF NOT EXISTS 'crowdfund_match';
