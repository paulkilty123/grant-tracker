/**
 * Turns a failed pipeline / interaction write into something a user can act on,
 * and makes sure the real reason reaches the console either way.
 *
 * Why this exists: Charlotte (Mustard Tree) could not add anything to her
 * pipeline for days. Every call site caught the error with a bare `catch {}` and
 * showed "Failed to save — please try again", so the actual cause — a row-level
 * security rejection, Postgres code 42501, because her org has apply_access =
 * false — never surfaced anywhere. Retrying could never have worked, and the
 * copy invited exactly that.
 *
 * The rule: never discard the error object. Log it, then map the codes we
 * understand to a specific message and let everything else fall back.
 */

/** The bits of a PostgrestError we care about, without importing the type. */
type PgLikeError = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

function asPgError(e: unknown): PgLikeError | null {
  if (typeof e !== 'object' || e === null) return null
  const maybe = e as PgLikeError
  return typeof maybe.code === 'string' || typeof maybe.message === 'string' ? maybe : null
}

/**
 * Postgres rejects an RLS-violating write with 42501. On the Apply-tier tables
 * that means the org is not entitled, not that anything is wrong with the data,
 * so "please try again" is actively misleading.
 */
export const ENTITLEMENT_MESSAGE =
  'Your account does not have the pipeline switched on yet. Get in touch and we will sort it out.'

export function isEntitlementError(e: unknown): boolean {
  return asPgError(e)?.code === '42501'
}

/**
 * Logs the underlying error and returns the message to show.
 *
 * @param e       whatever was caught
 * @param context short label for the console line, e.g. 'addToPipeline'
 * @param fallback message for causes we do not recognise
 */
export function describePipelineWriteError(
  e: unknown,
  context: string,
  fallback = 'Could not save that. Please try again.',
): string {
  const pg = asPgError(e)

  // Always log the real thing. This is the bit that was missing.
  console.error(`[pipeline:${context}] write failed`, {
    code: pg?.code,
    message: pg?.message,
    details: pg?.details,
    hint: pg?.hint,
    raw: e,
  })

  switch (pg?.code) {
    case '42501':
      return ENTITLEMENT_MESSAGE
    case '23505': // unique_violation
      return 'That one is already in your pipeline.'
    case '23502': // not_null_violation
    case '23503': // foreign_key_violation
    case '23514': // check_violation
      return 'Something is missing from your organisation profile. Please check it and try again.'
    case '22P02': // invalid_text_representation, typically a bad enum value
      return 'We could not save one of those details. Please let us know so we can fix it.'
    case 'PGRST301':
      return 'Your session has expired. Please sign in again.'
    default:
      return fallback
  }
}
