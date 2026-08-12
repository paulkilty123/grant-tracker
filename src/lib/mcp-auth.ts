// Grant Tracker MCP — auth primitives.
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
// Safe to import here: mcp-brand has no imports of its own, so no cycle.
import { MCP_CONTACT_EMAIL } from '@/lib/mcp-brand'

// ──────────────────────────────────────────────────────────────────────────
// API key generation and hashing
// ──────────────────────────────────────────────────────────────────────────

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
    //
    // Logged, not swallowed. This fired on every production request to
    // /mcp/terms from 2026-07-25 to 2026-08-12 and nobody knew, because the
    // page renders happily and its DRAFT banner only triggers on a status
    // starting "DRAFT", not on this "ERROR:" one. A served legal page with no
    // terms in it is worth a line in the log.
    console.error('[mcp-tos] unreadable at', TOS_PATH, '- serving fallback:', err)
    return {
      version: 'v0-fallback',
      last_updated: null,
      status: 'ERROR: ToS file unreadable',
      // No hardcoded address: the old one outlived the domain move here,
      // behind a fallback nobody was watching.
      body: `# Terms of Service\n\nTerms are being prepared. Contact ${MCP_CONTACT_EMAIL} for current terms.`,
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
