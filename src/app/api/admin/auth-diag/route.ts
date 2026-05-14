// TEMPORARY DIAGNOSTIC — remove after debugging ADMIN_SECRET mismatch.
//
// Returns SHA256 hashes + byte lengths of both the server-side ADMIN_SECRET
// env var and the bearer token sent in the Authorization header. Never returns
// the values themselves. Brute-forcing SHA256 of a 64-char secret is
// computationally infeasible, so exposing the hash is safe. DELETE this
// endpoint once the mismatch is identified.

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// charCode-based zero-width detection so the source file stays plain ASCII
// (avoids git classifying the file as binary because of literal control chars
// in the source).
function hasZeroWidthOrBom(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (
      (c >= 0x200B && c <= 0x200F) ||  // ZWSP, ZWNJ, ZWJ, LRM, RLM
      (c >= 0x202A && c <= 0x202E) ||  // bidi embedding markers
      (c >= 0x2060 && c <= 0x2069) ||  // word-joiner, isolates
       c === 0xFEFF                     // BOM
    ) return true
  }
  return false
}

function invisibleChars(s: string): string[] {
  const flags: string[] = []
  if (s.length === 0) return ['empty']
  if (s.includes('\n')) flags.push('contains-newline')
  if (s.includes('\r')) flags.push('contains-carriage-return')
  if (s.includes('\t')) flags.push('contains-tab')
  if (s.startsWith(' ')) flags.push('leading-space')
  if (s.endsWith(' ')) flags.push('trailing-space')
  if (s.startsWith('"') || s.endsWith('"')) flags.push('wrapped-in-double-quotes')
  if (s.startsWith("'") || s.endsWith("'")) flags.push('wrapped-in-single-quotes')
  if (/[\x00-\x1F\x7F]/.test(s)) flags.push('control-chars')
  if (hasZeroWidthOrBom(s)) flags.push('zero-width-or-bom')
  if (/[^\x20-\x7E]/.test(s)) flags.push('non-ascii')
  return flags.length === 0 ? ['clean'] : flags
}

export async function GET(req: NextRequest) {
  const envSecret = process.env.ADMIN_SECRET ?? ''
  const auth = req.headers.get('authorization') ?? ''
  const tokenWithBearer = auth.trim()
  const tokenAfterStrip = auth.replace('Bearer ', '').trim()

  return NextResponse.json({
    note: 'Temporary auth-diag endpoint. Compare env vs token hashes. If both_sha256_equal is true, auth would pass on the main endpoint. DELETE this file after debugging.',
    env: {
      ADMIN_SECRET_present: envSecret.length > 0,
      length_chars:         envSecret.length,
      length_bytes:         Buffer.byteLength(envSecret, 'utf8'),
      sha256:               envSecret.length > 0 ? sha256(envSecret) : null,
      invisible_chars:      invisibleChars(envSecret),
    },
    request_header: {
      authorization_present:           auth.length > 0,
      raw_header_length:               auth.length,
      starts_with_Bearer_capital:      auth.startsWith('Bearer '),
      starts_with_bearer_lower:        auth.toLowerCase().startsWith('bearer '),
      token_after_bearer_strip_length: tokenAfterStrip.length,
      token_after_strip_sha256:        tokenAfterStrip.length > 0 ? sha256(tokenAfterStrip) : null,
      token_invisible_chars:           invisibleChars(tokenAfterStrip),
      raw_authorization_trimmed_sha256:
        tokenWithBearer.length > 0 ? sha256(tokenWithBearer) : null,
    },
    match: {
      strict_equal_after_strip:
        envSecret.length > 0 &&
        tokenAfterStrip.length > 0 &&
        envSecret === tokenAfterStrip,
      lengths_equal:
        envSecret.length === tokenAfterStrip.length,
      both_sha256_equal:
        envSecret.length > 0 &&
        tokenAfterStrip.length > 0 &&
        sha256(envSecret) === sha256(tokenAfterStrip),
    },
  })
}
