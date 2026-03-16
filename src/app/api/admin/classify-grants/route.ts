// Admin-only endpoint: AI classification pass for scraped_grants
// Reads unclassified active grants, calls Claude Haiku to assign:
//   - impact_sectors[]      (1–4 from the 12-sector taxonomy)
//   - funding_type          (one of 7 types)
//   - eligible_structures[] (explicit legal structures if stated)
//
// GET  /api/admin/classify-grants          — return current stats
// POST /api/admin/classify-grants          — classify a batch
//   Body: { offset?: number; limit?: number; force?: boolean }
//   Returns: { classified, failed, total, done, nextOffset }
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 minutes — batches of 20 × Claude calls

const ADMIN_EMAIL = 'paulkilty1@gmail.com'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

// ── Auth ──────────────────────────────────────────────────────────────────────
async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ── Taxonomy validation sets ───────────────────────────────────────────────────
const VALID_SECTORS = new Set([
  'creative', 'environment', 'health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice',
  'financial', 'international',
])

const VALID_FUNDING_TYPES = new Set([
  'grant', 'accelerator', 'support_programme', 'social_investment',
  'diversity_fund', 'blended_finance', 'in_kind',
])

const VALID_STRUCTURES = new Set([
  'cic_guarantee', 'cic_shares', 'cio', 'registered_charity',
  'ltd_guarantee', 'ltd_shares', 'llp', 'cooperative',
  'unincorporated', 'sole_trader', 'not_registered',
])

// ── Claude Haiku classification ────────────────────────────────────────────────
interface GrantInput { id: string; title: string; funder: string; description: string }
interface ClassificationResult {
  id: string
  impact_sectors: string[]
  funding_type: string
  eligible_structures: string[]
}

async function classifyBatch(grants: GrantInput[]): Promise<ClassificationResult[]> {
  const inputData = grants.map(g => ({
    id: g.id,
    title: g.title ?? '',
    funder: g.funder ?? '',
    description: (g.description ?? '').slice(0, 500),
  }))

  const prompt = `You are classifying UK funding opportunities for a grant database.

For each grant in the input array, return a JSON array with one classification object.

OUTPUT FORMAT — return ONLY a JSON array, no markdown, no explanation:
[
  {
    "id": "<copy id field exactly>",
    "impact_sectors": ["<1 to 4 sector values>"],
    "funding_type": "<exactly one funding type value>",
    "eligible_structures": ["<legal structure values, or empty array []>"]
  }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPACT SECTOR TAXONOMY — choose 1 to 4 that best describe this grant:

creative       arts, culture, heritage, music, film, media, creative industries
environment    climate, biodiversity, energy, sustainability, nature, ecology
health         physical health, mental health, wellbeing, disability, social care
education      schools, learning, skills, training, early years, youth education
tech           technology, digital, AI, data, open source, innovation, STEM
housing        housing, homelessness, property, regeneration, rough sleeping
food           food poverty, food banks, agriculture, nutrition, food waste
employment     jobs, employment, livelihoods, enterprise, economic inclusion
community      community development, civic, volunteering, neighbourhoods, local
justice        social justice, human rights, equality, racial equity, criminal justice, asylum
financial      financial inclusion, money advice, debt, poverty, benefits
international  international development, global south, fair trade, migration, refugees

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDING TYPE TAXONOMY — choose exactly one:

grant              One-off or multi-year cash grant, award, bursary, prize money
accelerator        Structured cohort programme — mentoring, workspace, pitch prep, network (even if includes a small cash element)
support_programme  Fellowship, capacity building, mentoring, incubator, training, CPD — no significant cash grant
social_investment  Repayable loan, patient capital, investment — money must be repaid
diversity_fund     Grant or programme explicitly targeting underrepresented groups: women, Black/ethnic minority founders, disabled people, LGBTQ+, rural communities
blended_finance    Part grant part loan, matched trading, community shares, crowdfund match
in_kind            Non-cash support: software credits, tax relief, ad grants, free workspace, pro bono services

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELIGIBLE STRUCTURES — legal structures explicitly stated as eligible.
Return [] if the description does not explicitly restrict or list eligible types.

Valid values: cic_guarantee, cic_shares, cio, registered_charity,
              ltd_guarantee, ltd_shares, llp, cooperative,
              unincorporated, sole_trader, not_registered

Common mappings:
"registered charities only / charities only"  → ["registered_charity", "cio"]
"CICs / Community Interest Companies"         → ["cic_guarantee", "cic_shares"]
"social enterprises (broad)"                  → ["cic_guarantee","cic_shares","cio","registered_charity","ltd_guarantee","ltd_shares","cooperative"]
"any incorporated organisation"               → ["cic_guarantee","cic_shares","cio","registered_charity","ltd_guarantee","ltd_shares","llp","cooperative"]
"individuals / sole traders / freelancers"    → ["sole_trader","unincorporated"]
Not stated / open to all / "organisations"    → []

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRANTS TO CLASSIFY:
${JSON.stringify(inputData, null, 2)}

Return ONLY the JSON array. No markdown fences. No other text.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message ?? res.statusText}`)
  }

  const data = await res.json() as { content?: { type: string; text: string }[] }
  let text = (data.content?.[0]?.text ?? '').trim()

  // Strip markdown fences if model includes them
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()

  // Extract JSON array even if model adds prose around it
  if (!text.startsWith('[')) {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error(`No JSON array in response. Got: ${text.slice(0, 200)}`)
    text = match[0]
  }

  return JSON.parse(text) as ClassificationResult[]
}

// ── Validate and sanitise a classification result ──────────────────────────────
function validate(raw: ClassificationResult) {
  const impact_sectors = Array.isArray(raw.impact_sectors)
    ? raw.impact_sectors.filter(s => VALID_SECTORS.has(s)).slice(0, 4)
    : []

  const funding_type = VALID_FUNDING_TYPES.has(raw.funding_type)
    ? raw.funding_type
    : 'grant'  // safe fallback

  const eligible_structures = Array.isArray(raw.eligible_structures)
    ? raw.eligible_structures.filter(s => VALID_STRUCTURES.has(s))
    : []

  return { impact_sectors, funding_type, eligible_structures }
}

// ── GET — return classification stats ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('scraped_grants')
    .select('impact_sectors, funding_type')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total       = data.length
  const classified  = data.filter(g => Array.isArray(g.impact_sectors) && g.impact_sectors.length > 0).length
  const unclassified = total - classified
  const defaultType = data.filter(g => g.funding_type === 'grant' || !g.funding_type).length

  return NextResponse.json({ total, classified, unclassified, defaultType })
}

// ── POST — classify a batch of grants ─────────────────────────────────────────
// Body: { offset?: number; limit?: number; force?: boolean }
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number; force?: boolean }
  const offset = body.offset ?? 0
  const limit  = body.limit  ?? 20  // 20 grants = 1 Claude call
  const force  = body.force  ?? false

  const supabase = getAdminClient()

  // Fetch this chunk — unclassified (or all if force)
  let query = supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors')
    .eq('is_active', true)
    .order('id')
    .range(offset, offset + limit - 1)

  // Without --force, only fetch grants that have no impact_sectors yet
  // We filter client-side after fetch because Supabase array filtering is limited
  const { data: grantsRaw, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grantsRaw || grantsRaw.length === 0) {
    return NextResponse.json({ classified: 0, failed: 0, total: 0, done: true, nextOffset: offset })
  }

  // Filter to unclassified unless force
  const grants = force
    ? grantsRaw
    : grantsRaw.filter(g => !Array.isArray(g.impact_sectors) || g.impact_sectors.length === 0)

  let classified = 0
  let failed = 0

  if (grants.length > 0) {
    try {
      const results = await classifyBatch(grants as GrantInput[])

      // Map id → validated classification
      const byId: Record<string, ReturnType<typeof validate>> = {}
      for (const r of results) {
        if (r?.id) byId[r.id] = validate(r)
      }

      // Write to Supabase in parallel
      const updates = grants
        .filter(g => byId[g.id])
        .map(g => {
          const r = byId[g.id]
          const patch: Record<string, unknown> = {
            impact_sectors: r.impact_sectors,
            funding_type:   r.funding_type,
          }
          if (r.eligible_structures.length > 0) {
            patch.eligible_structures = r.eligible_structures
          }
          return supabase
            .from('scraped_grants')
            .update(patch)
            .eq('id', g.id)
        })

      const updateResults = await Promise.all(updates)
      const writeErrors   = updateResults.filter(r => r.error)
      classified += grants.length - writeErrors.length
      failed     += writeErrors.length

    } catch (err) {
      console.error('[classify-grants] Batch failed:', err)
      failed += grants.length
    }
  }

  // done when we got fewer rows than requested (last page)
  const done = grantsRaw.length < limit

  return NextResponse.json({
    classified,
    failed,
    skipped: grantsRaw.length - grants.length,  // already-classified, skipped
    total:   grantsRaw.length,
    done,
    nextOffset: offset + grantsRaw.length,
  })
}
