/**
 * The three things that must exist before any digest is sent (spec §6b).
 *
 * None of this is design work and all of it is the difference between a test
 * and an incident. Rendering ACC's digest is not the same as sending only to
 * ACC: there are 41 organisations in production with real addresses on them,
 * and email is the one surface with no undo — no rollback, no edit, no "we'll
 * fix it in the next deploy".
 *
 * Kept in its own module so the guards can be unit-tested without standing up
 * a route, and so there is one obvious place to read before changing them.
 */

/**
 * Who may receive a digest. EMPTY BY DEFAULT, which means nobody.
 *
 * `DIGEST_ALLOWED_RECIPIENTS` is the name the spec gives it. The older
 * `ALERT_RECIPIENT_ALLOWLIST` is honoured as a fallback because it is already
 * set in production and gates the alert email; a rename that silently opened
 * the gate for a deploy would be precisely the wrong failure.
 *
 * No wildcards, no domain matching. A list of addresses or nothing.
 */
export function digestAllowlist(): string[] {
  const raw = process.env.DIGEST_ALLOWED_RECIPIENTS ?? process.env.ALERT_RECIPIENT_ALLOWLIST ?? ''
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

export function isDigestRecipient(email: string): boolean {
  return digestAllowlist().includes(email.trim().toLowerCase())
}

/**
 * Dry run is the DEFAULT. A real send requires `DIGEST_DRY_RUN=false`.
 *
 * The safe state is what you get from doing nothing, so a cron wired up by
 * someone who has not read this file sends no email. Only the exact string
 * "false" opts out — an unset, empty, misspelt or truthy value all stay dry,
 * because every way of getting this wrong should fail closed.
 */
export function digestIsDryRun(): boolean {
  return (process.env.DIGEST_DRY_RUN ?? '').trim().toLowerCase() !== 'false'
}

/** True in Vercel's production environment, false everywhere else including local. */
export function isProductionEnv(): boolean {
  return (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === 'production'
}

/**
 * "[TEST] " on any send that is not production.
 *
 * The cheapest possible protection against a staging or preview run landing in
 * a member's inbox looking like the real thing. Costs one string and is
 * painful to retrofit after the first time it matters.
 */
export function testSubjectPrefix(): string {
  return isProductionEnv() ? '' : '[TEST] '
}
