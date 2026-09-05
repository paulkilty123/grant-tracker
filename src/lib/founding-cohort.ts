/**
 * Is this account a founding cohort member?
 *
 * The onboarding welcome screen opens with "Founding cohort, you're in". That
 * is true of everyone who has an account today and false of everyone arriving
 * through public signup from September, and telling a new signup they are in a
 * cohort they are not makes the rest of that first screen less believable.
 *
 * WHY A DATE RATHER THAN A COLUMN. The spec asked for a flag on the user or
 * organisation record. There is no such column today, and adding one means a
 * migration plus a backfill of all 39 existing organisations three weeks
 * before launch. It would also be a backfill with exactly one rule: everyone
 * who exists now is a founding cohort member, because the only ways in are the
 * invite-only /apply route and /cohort-signup-7k9m2x, and /signup is built but
 * unlinked until launch. That rule is a date, so this reads the date off
 * `auth.users.created_at`, which is already on the user record. Same answer,
 * no migration, and it stays correct on its own as people sign up.
 *
 * The limit worth knowing: a date cannot express "this person signed up in
 * October but we want to call them founding cohort". If that ever needs to be
 * possible, replace this function's body with a column lookup. Nothing outside
 * this file needs to change.
 */

/**
 * When public signup opens, and therefore when founding cohort membership
 * closes. Thursday 10 September 2026: one date, nothing opens before it.
 * The waitlist are emailed that morning and are public signups, not cohort.
 *
 * KEEP THIS IN STEP WITH THE ACTUAL LAUNCH DATE. If launch moves and this does
 * not, the first people through public signup are told they are founding
 * cohort members.
 */
export const PUBLIC_SIGNUP_OPENS = '2026-09-10T00:00:00.000Z'

/** Accounts created before public signup opened are founding cohort. */
export function isFoundingCohort(userCreatedAt: string | null | undefined): boolean {
  if (!userCreatedAt) return false
  const created = Date.parse(userCreatedAt)
  if (Number.isNaN(created)) return false
  return created < Date.parse(PUBLIC_SIGNUP_OPENS)
}
