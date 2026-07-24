// MCP — auth primitives.
// Spec: docs/mcp-spec-v1.md §6.
//
// API keys are generated server-side, displayed once on creation, and stored
// only as SHA-256 hashes. Validation hashes the inbound key and looks up.
// Revocation flips status to 'revoked' (audit trail preserved, no row deletion).
//
// ToS content lives at docs/legal/mcp-tos.md with a `version` frontmatter
// field. The version stamp is recorded against each issued key for
// kill-switch enforcement if terms change.

import { createHash, randomBytes } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { brand } from '@/config/brand'

// ──────────────────────────────────────────────────────────────────────────
// API key generation and hashing
// ──────────────────────────────────────────────────────────────────────────

// NOT brand-derived — do not rename on a rebrand. This prefix is baked into
// the format of every API key already issued and stored (as a SHA-256 hash)
// in the api_keys table; changing it would invalidate every developer's
// existing key.
const KEY_PREFIX = 'gt_mcp_'
const RAW_BYTES = 16  // 128 bits of entropy → 32 hex chars

export interface GeneratedKey {
  raw: string         // full plaintext — show once to the user, never store
  hash: string        // SHA-256 hex (storage form)
  prefix: string      // first 12 chars of raw (display form, e.g. "gt_mcp_a3b8")
}

export function generateApiKey(): GeneratedKey {
  const entropy = randomBytes(RAW_BYTES).toString('hex')
  const raw = `${KEY_PREFIX}${entropy}`
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  }
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// ──────────────────────────────────────────────────────────────────────────
// API key record shape (matches public.api_keys schema, see migration 021)
// ──────────────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string
  user_id: string
  key_hash: string
  key_prefix: string
  name: string
  utm_source: string
  org_name: string | null
  use_case: string | null
  tos_version: string
  status: 'active' | 'revoked'
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// ToS reading and version pinning
// ──────────────────────────────────────────────────────────────────────────

export interface ParsedToS {
  version: string
  last_updated: string | null
  status: string | null
  body: string         // markdown body without frontmatter
}

const TOS_PATH = path.join(process.cwd(), 'docs', 'legal', 'mcp-tos.md')
let tosCache: { mtime: number; parsed: ParsedToS } | null = null

export async function readMCPToS(): Promise<ParsedToS> {
  // Lightweight in-memory cache keyed on mtime. Markdown edits hot-reload on
  // dev (cache miss); production reads file once per cold start.
  try {
    const { stat } = await import('fs/promises')
    const stats = await stat(TOS_PATH)
    const mtime = stats.mtimeMs
    if (tosCache && tosCache.mtime === mtime) return tosCache.parsed
    const raw = await readFile(TOS_PATH, 'utf-8')
    const parsed = parseTosFrontmatter(raw)
    tosCache = { mtime, parsed }
    return parsed
  } catch (err) {
    // Fallback for environments where docs/ isn't bundled. Returns a stub so
    // the flow doesn't crash; surfaces via the version string for debugging.
    return {
      version: 'v0-fallback',
      last_updated: null,
      status: 'ERROR: ToS file unreadable',
      body: `# Terms of Service\n\nTerms are being prepared. Contact ${brand.email.hello} for current terms.`,
    }
  }
}

function parseTosFrontmatter(raw: string): ParsedToS {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) {
    return { version: 'v0-unversioned', last_updated: null, status: null, body: raw }
  }
  const [, fm, body] = match
  const fields: Record<string, string> = {}
  for (const line of fm.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*"?([^"]*?)"?\s*$/i)
    if (m) fields[m[1]] = m[2]
  }
  return {
    version: fields.version ?? 'v0-unversioned',
    last_updated: fields.last_updated ?? null,
    status: fields.status ?? null,
    body,
  }
}
