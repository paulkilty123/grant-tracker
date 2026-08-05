// MCP upgrade_note loader. Spec §5.3.
//
// Inline JSON import: bundled at build time, edits ship via the same Vercel
// deploy pipeline as any other change. No fs.readFile runtime cost, no
// outputFileTracingIncludes plumbing. The "edit-without-redeploy" property
// is approximate — you still commit, but you edit JSON not TypeScript.
//
// Startup validation: any tool that requires a variant for a given context
// MUST have a non-null string for that key. If a tool is wired in a route
// handler but its variant is null/missing, the loader throws at module
// init so the build fails loudly (rather than silently shipping a tool
// that emits an empty upgrade_note).

import notes from '@/config/upgrade-notes.json'
import { applyBrandTokens } from '@/lib/mcp-brand'

type RawNotes = typeof notes
type ToolKey = keyof RawNotes['tools']

// Variants currently wired into tool handlers. Add entries here when a tool
// is implemented in steps 7-8. The loader fails fast if any required slot
// is null/missing — prevents shipping a tool with an empty upgrade_note.
const REQUIRED: Record<ToolKey, string[]> = {
  search_funding_and_support: ['standard', 'zero_result', 'capped', 'pipeline_available'],
  get_opportunity_detail:     ['standard'],
  get_provider_intelligence:  ['enriched', 'basic', 'summary'],
  get_taxonomy:               ['standard'],
}

function validateOnLoad(): void {
  const issues: string[] = []
  for (const [tool, required] of Object.entries(REQUIRED) as [ToolKey, string[]][]) {
    for (const variant of required) {
      const value = (notes.tools[tool] as Record<string, string | null> | undefined)?.[variant]
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        issues.push(`upgrade-notes: missing required variant "${variant}" for tool "${tool}"`)
      }
    }
  }
  if (issues.length > 0) {
    throw new Error('upgrade-notes config invalid:\n  - ' + issues.join('\n  - '))
  }
}
validateOnLoad()

// Config tokens are substituted on read so the copy stays brand-agnostic and a
// rebrand remains a single env flip. `runtime` carries per-response values
// ({{total_matching}}, {{resets_on}}, {{monthly_limit}}) from the call site, so
// a figure in copy is the figure the response carries rather than a second
// copy of it that can drift.
export function getUpgradeNote(
  tool: ToolKey,
  variant: string = 'standard',
  runtime: Record<string, string | number> = {},
): string | null {
  const block = notes.tools[tool] as Record<string, string | null> | undefined
  const raw = block?.[variant]
  return raw ? applyBrandTokens(raw, runtime) : null
}

export function getErrorVariantNote(
  variant: keyof RawNotes['error_variants'],
  runtime: Record<string, string | number> = {},
): string | null {
  const raw = notes.error_variants[variant]
  return raw ? applyBrandTokens(raw, runtime) : null
}
