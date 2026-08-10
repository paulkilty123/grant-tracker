/**
 * Works out what a Supabase password-recovery redirect actually handed us.
 *
 * This is the logic that was wrong. The reset page used to read `?code=` and
 * nothing else, so every other shape of redirect fell through to a password
 * form with no session behind it and failed on submit with "Auth session
 * missing!". Supabase can land on the reset page in four different shapes and
 * three of them are not `?code=`:
 *
 *   ?token_hash=...&type=recovery        the link we want the email to send
 *   ?code=...                            PKCE, after /auth/v1/verify succeeds
 *   ?error=access_denied&error_code=...  the token was already spent
 *   #access_token=...&type=recovery      implicit flow, tokens in the fragment
 *
 * Kept pure and separate from the page so the mapping can be tested directly.
 */

export type RecoveryLink =
  /** Supabase told us the link is dead. Never show a password form. */
  | { kind: 'error'; message: string }
  /** A token we can redeem with verifyOtp. Redeem on click, never on load. */
  | { kind: 'token_hash'; token: string }
  /** A PKCE code we can exchange. Bound to the browser that requested it. */
  | { kind: 'code'; code: string }
  /** Nothing usable in the URL. Fall back to checking for a live session. */
  | { kind: 'none' }

/**
 * Merges query and fragment params. Supabase uses the fragment for implicit
 * flow and for some error redirects, so reading only `location.search` misses
 * them. Query wins on collision.
 */
export function mergeAuthParams(search: string, hash: string): URLSearchParams {
  const merged = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  if (fragment) {
    new URLSearchParams(fragment).forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value)
    })
  }
  return merged
}

export function messageForErrorCode(
  code: string | null | undefined,
  description?: string | null,
): string {
  if (code === 'otp_expired' || code === 'access_denied') {
    return 'This reset link has expired or has already been used. Reset links last one hour and work only once.'
  }
  if (description) return description.replace(/\+/g, ' ')
  return 'This reset link is not valid any more.'
}

export function parseRecoveryLink(search: string, hash: string): RecoveryLink {
  const params = mergeAuthParams(search, hash)

  // Errors first. A dead link can still carry other params, and treating it as
  // usable is precisely the bug this module exists to prevent.
  const errorCode = params.get('error_code')
  if (errorCode || params.get('error')) {
    return { kind: 'error', message: messageForErrorCode(errorCode, params.get('error_description')) }
  }

  const tokenHash = params.get('token_hash')
  if (tokenHash) return { kind: 'token_hash', token: tokenHash }

  const code = params.get('code')
  if (code) return { kind: 'code', code }

  return { kind: 'none' }
}

/** PKCE ties the code to the browser that asked, so another device has no verifier. */
export function isMissingVerifierError(message: string): boolean {
  return /verifier/i.test(message)
}
