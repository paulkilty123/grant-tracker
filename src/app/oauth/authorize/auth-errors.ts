/**
 * Failure codes the authorize server actions return, and the copy the client
 * renders for each.
 *
 * WHY codes rather than thrown messages: Next.js strips server-action error
 * messages in production builds and replaces them with a generic
 * "An error occurred in the Server Components render. The specific message is
 * omitted in production builds..." paragraph. Copy carried inside a thrown
 * Error therefore never reaches the user. It reads correctly in dev, in code
 * review and in a local build, and only breaks once deployed, which is exactly
 * how it shipped: someone mistyping an existing address on the connect screen
 * was shown React internals instead of "Sign in instead."
 *
 * So the action returns a code and this module owns the words. Nothing
 * user-facing may travel back from a server action as an Error message.
 */

export type AuthErrorCode =
  | 'missing_fields'
  | 'password_too_short'
  | 'limiter_unavailable'
  | 'rate_limited'
  | 'email_exists'
  | 'create_failed'
  | 'create_no_user'
  | 'signin_after_create_failed'
  | 'signin_failed'

/** Actions return this on failure, and redirect (never returning) on success. */
export type AuthActionResult = { ok: false; code: AuthErrorCode }

export const AUTH_ERROR_COPY: Record<AuthErrorCode, string> = {
  missing_fields:             'Email and password are required.',
  password_too_short:         'Password must be at least 8 characters.',
  limiter_unavailable:        'Account creation is briefly unavailable. Please try again in a few minutes.',
  rate_limited:               'Too many accounts created from this network. Please try again later.',
  email_exists:               'An account with that email already exists. Sign in instead.',
  create_failed:              'Could not create the account. Please check the address and try again.',
  create_no_user:             'Could not create the account. Please try again.',
  signin_after_create_failed: 'Account created, but sign-in failed. Please sign in to continue.',
  signin_failed:              'That email and password did not match an account.',
}

/** Shown when something genuinely unexpected escapes the action. */
export const AUTH_ERROR_FALLBACK = 'Something went wrong. Please try again.'
