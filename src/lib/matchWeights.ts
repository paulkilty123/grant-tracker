// ── Match scoring weights ────────────────────────────────────────────────────
// All tunable values live here. Change a number, push — no need to touch
// the algorithm or scoring logic.
//
// Trigger for option 2 (reason-aware weights):
//   150+ feedback events OR 6 weeks of cohort data, whichever comes first.

// Action-bar like/dislike  (casual signal — one click in the action row)
export const LIKE_SCORE_BOOST        = 12   // direct score boost for liked grants
export const DISLIKE_SCORE_PENALTY   = 15   // direct score reduction for disliked grants (was 20 — reduced for transient disinterest)
export const LIKE_SECTOR_BOOST       = 3    // added per sector found in a liked grant
export const DISLIKE_SECTOR_PENALTY  = 2    // added per sector found in a disliked grant

// Match-block feedback  (considered signal — user read the match reasoning)
export const FB_UP_SCORE_BOOST       = 16   // higher than LIKE — more deliberate signal
export const FB_DOWN_SCORE_PENALTY   = 22   // higher than DISLIKE — more deliberate signal
export const FB_UP_SECTOR_BOOST      = 4    // per sector in an up-voted grant
export const FB_DOWN_SECTOR_PENALTY  = 3    // per sector in a down-voted grant
