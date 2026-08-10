import { describe, it, expect } from 'vitest'
import {
  parseRecoveryLink,
  mergeAuthParams,
  messageForErrorCode,
  isMissingVerifierError,
} from './recovery-link'

/**
 * These cases exist because of a real lockout. The reset page read `?code=` and
 * nothing else, so every other redirect shape fell through to a usable password
 * form with no session and failed on submit with "Auth session missing!".
 *
 * The rule being protected: only a shape that can actually produce a session may
 * lead to the password form. Everything else must resolve to `error`, which the
 * page renders as an expired state with a resend.
 */
describe('parseRecoveryLink', () => {
  it('reads a PKCE code from the query', () => {
    expect(parseRecoveryLink('?code=abc123', '')).toEqual({ kind: 'code', code: 'abc123' })
  })

  it('reads a token hash from the query', () => {
    expect(parseRecoveryLink('?token_hash=pkce_abc&type=recovery', '')).toEqual({
      kind: 'token_hash',
      token: 'pkce_abc',
    })
  })

  // The regression. Supabase sends this when the single-use token has already
  // been spent, which is what an Outlook safe-links prefetch causes. The old
  // code saw no `code`, set no error, and showed the form anyway.
  it('treats a spent token as an error, not as a usable form', () => {
    const result = parseRecoveryLink(
      '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      '',
    )
    expect(result.kind).toBe('error')
  })

  it('treats an error in the fragment as an error', () => {
    const result = parseRecoveryLink('', '#error=access_denied&error_code=otp_expired')
    expect(result.kind).toBe('error')
  })

  // A dead link can carry a code alongside the error. The error has to win, or
  // we are back to exchanging a code that cannot work and showing the form.
  it('prefers the error when a code is present too', () => {
    const result = parseRecoveryLink('?code=abc123&error=access_denied&error_code=otp_expired', '')
    expect(result.kind).toBe('error')
  })

  it('returns none for implicit-flow tokens so the page falls back to the session check', () => {
    // detectSessionInUrl consumes these on load, so an established session is
    // the legitimate signal here rather than anything in the URL.
    const result = parseRecoveryLink('', '#access_token=eyJ&refresh_token=xyz&type=recovery')
    expect(result).toEqual({ kind: 'none' })
  })

  it('returns none for a bare visit with no link at all', () => {
    expect(parseRecoveryLink('', '')).toEqual({ kind: 'none' })
  })

  it('tolerates search and hash strings without their leading punctuation', () => {
    expect(parseRecoveryLink('code=abc123', '')).toEqual({ kind: 'code', code: 'abc123' })
  })

  it('prefers a token hash over a code when both are present', () => {
    const result = parseRecoveryLink('?token_hash=pkce_abc&code=abc123', '')
    expect(result).toEqual({ kind: 'token_hash', token: 'pkce_abc' })
  })
})

describe('mergeAuthParams', () => {
  it('merges fragment params in alongside query params', () => {
    const merged = mergeAuthParams('?a=1', '#b=2')
    expect(merged.get('a')).toBe('1')
    expect(merged.get('b')).toBe('2')
  })

  it('lets the query win on collision', () => {
    expect(mergeAuthParams('?a=query', '#a=fragment').get('a')).toBe('query')
  })
})

describe('messageForErrorCode', () => {
  it('explains an expired one-time token in plain terms', () => {
    const msg = messageForErrorCode('otp_expired')
    expect(msg).toMatch(/expired or has already been used/)
  })

  it('treats access_denied the same way', () => {
    expect(messageForErrorCode('access_denied')).toMatch(/expired or has already been used/)
  })

  it('decodes the plus signs in a passed-through description', () => {
    expect(messageForErrorCode('something_else', 'Email+link+is+invalid')).toBe(
      'Email link is invalid',
    )
  })

  it('falls back to a generic message with no code or description', () => {
    expect(messageForErrorCode(null)).toMatch(/not valid/)
  })

  // House copy: no dashes anywhere in user-facing text.
  it('never uses a dash in user-facing copy', () => {
    const messages = [
      messageForErrorCode('otp_expired'),
      messageForErrorCode('access_denied'),
      messageForErrorCode(null),
    ]
    for (const msg of messages) {
      expect(msg).not.toMatch(/[–—]|--/)
    }
  })
})

describe('isMissingVerifierError', () => {
  // PKCE binds the code to the browser that asked, so opening the email on a
  // phone after requesting on a laptop needs its own explanation.
  it('recognises the cross-browser PKCE failure', () => {
    expect(
      isMissingVerifierError('invalid request: both auth code and code verifier should be non-empty'),
    ).toBe(true)
  })

  it('does not claim unrelated failures are a verifier problem', () => {
    expect(isMissingVerifierError('Token has expired or is invalid')).toBe(false)
  })
})
