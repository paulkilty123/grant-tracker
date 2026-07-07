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
// Containers are walked so nested strings (constraints[].text, jsonb blobs)
// can't smuggle prose past the top-level check. Depth-capped defensively.
const MAX_DEPTH = 6

function assertField(path: string, key: string, value: unknown, depth: number): void {
  if (CONTENT_FIELD.test(key)) {
    throw new AuthorshipError(`Field '${path}' resembles application content — this layer is scaffold-only.`)
  }
  if (typeof value === 'string' && value.length > PROSE_MAX_CHARS) {
    throw new AuthorshipError(`Field '${path}' is ${value.length} chars — application prose is not accepted by the tool layer.`)
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertField(`${path}[${i}]`, key, v, depth + 1))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertField(`${path}.${k}`, k, v, depth + 1)
  }
}

export function assertScaffoldOnly(params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    assertField(key, key, value, 0)
  }
}
