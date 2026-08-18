/**
 * User-facing UI toggles that Paul may want to flip without a code change.
 *
 * Each flag reads an env var and falls back to a default here, so there are two
 * ways to change one:
 *   1. Set the env var in Vercel and redeploy — no code change, no PR.
 *   2. Change the default below.
 *
 * NEXT_PUBLIC_ is required: these are read in client components, and a plain
 * server-side var would arrive undefined in the browser and silently take the
 * default. Note the value is inlined at BUILD time, so flipping it in Vercel
 * needs a redeploy to take effect — it is not a runtime switch.
 */

/** Env var read as a boolean. Anything other than 'true'/'false' takes the default. */
function envFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === 'true')  return true
  if (raw === 'false') return false
  return fallback
}

/**
 * The "Recently added" badge on the Find Funding grant card.
 *
 * ON by default since 2026-08-18, at Paul's request, replacing "New this week"
 * in the same position on the card.
 *
 * IT WAS SWITCHED OFF DELIBERATELY BEFORE, and the reasons have not gone away,
 * so they are kept here rather than deleted:
 *
 *   - The badge describes our ingestion schedule, not the grant. Nothing about
 *     when a row entered the catalogue bears on whether an organisation should
 *     apply to it.
 *   - It competes with the match score for attention, pulling the eye toward
 *     whatever is newest rather than whatever fits best.
 *   - It fails hardest exactly when the catalogue is doing well. 27 funds went
 *     live in a single batch on 2026-07-29, so a large share of one user's
 *     matches carried it at once, which reads as staged rather than as a
 *     catalogue quietly accumulating.
 *
 * The 14-day window makes that last point stronger, not weaker: a fortnight
 * catches more batches than a week does. If the cards start looking like a
 * sale rail, shortening the window is the first lever, and
 * NEXT_PUBLIC_SHOW_RECENTLY_ADDED=false turns it off without a deploy.
 */
export const SHOW_RECENTLY_ADDED_BADGE = envFlag(
  process.env.NEXT_PUBLIC_SHOW_RECENTLY_ADDED,
  true,
)

/** How recent a grant must be to carry the badge, in days. */
export const RECENTLY_ADDED_DAYS = 14
