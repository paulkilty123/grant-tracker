// Scaffold-not-ghostwriter — enforced in code, not just scope.
//
// The authorship boundary is structural so both surfaces inherit it: the tool
// layer neither accepts nor returns application prose, only short structured
// scaffold fields. Two guards:
//   1. assertScaffoldOnly() rejects params that look like drafted content.
//   2. No tool may import the application builder's modules (eslint override
//      on this path forbids '@/lib/builder*' / application-draft imports).

import { AuthorshipError } from './types'

// A structured scaffold field is short. Anything longer is prose.
const PROSE_MAX_CHARS = 600
// Field names that would carry ghost-written content.
const CONTENT_FIELD = /(^|_)(answer|answers|draft|narrative|application|prose|body|essay|cover_letter|response)($|_)/i

export function assertScaffoldOnly(params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (CONTENT_FIELD.test(key)) {
      throw new AuthorshipError(`Field '${key}' resembles application content — this layer is scaffold-only.`)
    }
    if (typeof value === 'string' && value.length > PROSE_MAX_CHARS) {
      throw new AuthorshipError(`Field '${key}' is ${value.length} chars — application prose is not accepted by the tool layer.`)
    }
  }
}
