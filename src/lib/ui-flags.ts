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
 * The "New this week" badge on the Find Funding grant card.
 *
 * OFF by default, deliberately. The badge describes our ingestion schedule, not
 * the grant: nothing about when a row entered the catalogue bears on whether an
 * organisation should apply. It also competed with the match score for
 * attention, pulling the eye toward whatever is newest rather than whatever
 * fits best.
 *
 * And it failed hardest exactly when the catalogue was doing well — 27 funds
 * went live in a single batch on 2026-07-29, so a large share of one user's
 * matches carried it at once, which reads as staged rather than as a catalogue
 * quietly accumulating.
 *
 * Kept behind a flag rather than deleted so it can come back if wanted:
 *   NEXT_PUBLIC_SHOW_NEW_THIS_WEEK=true
 *
 * If a genuine "new" signal is ever wanted, a "recently added" filter or a
 * weekly digest is the better home — somewhere the user opts into, rather than
 * a permanent badge on every card.
 */
export const SHOW_NEW_THIS_WEEK_BADGE = envFlag(
  process.env.NEXT_PUBLIC_SHOW_NEW_THIS_WEEK,
  false,
)

/** How recent a grant must be for that badge, in days. Only read when it is on. */
export const NEW_THIS_WEEK_DAYS = 7
