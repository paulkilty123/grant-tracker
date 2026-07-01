// Eval adapter (build step 3): golden-set case → real context assembly.
//
// Loads a case's fixtures (synthetic + pinned snapshot + filler pool), maps each
// row to a GrantOpportunity and the case org to an Organisation, then calls the
// REAL src/lib/agent/context.ts. No stand-in engine remains — computeMatchScore
// and runEligibilityChecks run for real, offline, over the fixture catalogue.

import { readFileSync } from 'fs'
import path from 'path'
import type { GoldenCase, BriefingPack } from '../../src/lib/agent/types'
import { assembleBriefingPack, type ContextInput } from '../../src/lib/agent/context'
import type { GrantOpportunity, Organisation } from '@/types'

const FIXTURES_DIR = path.resolve(__dirname, '../../docs/goal-agent/golden-set/fixtures')
const PINNED_DIR = path.resolve(FIXTURES_DIR, 'pinned')

// Nation/broad tags are handled by the nation gate, not the local-area gate;
// only sub-national tags make a funder "local".
const BROAD_TAG = new Set(['', 'uk', 'uk-wide', 'ukwide', 'england', 'scotland', 'wales', 'northern ireland', 'nationwide', 'national'])

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function toGrant(row: Record<string, unknown>): GrantOpportunity {
  const deadline = (row.deadline as string | null) ?? null
  const locationTag = (row.locationTag as string | null) ?? null
  const derivedLocal = locationTag != null && !BROAD_TAG.has(locationTag.toLowerCase())
  const g = {
    id: String(row.fixture_id ?? row.id ?? row.title),
    title: String(row.title ?? ''),
    funder: String(row.funder ?? ''),
    funderType: (row.funderType as string) ?? 'trust_foundation',
    fundingType: (row.fundingType as string) ?? 'grant',
    description: String(row.description ?? row.title ?? ''),
    amountMin: (row.amountMin as number | null) ?? 0,
    amountMax: (row.amountMax as number | null) ?? 0,
    amountUndisclosed: Boolean(row.amountUndisclosed ?? false),
    deadline,
    isRolling: Boolean(row.isRolling ?? deadline === null),
    isLocal: Boolean(row.isLocal ?? derivedLocal),
    sectors: (row.sectors as string[]) ?? [],
    impactSectors: (row.impactSectors as string[]) ?? [],
    beneficiaryGroups: (row.beneficiaryGroups as string[]) ?? [],
    eligibilityCriteria: (row.eligibilityCriteria as string[]) ?? [],
    eligibleStructures: (row.eligibleStructures as string[]) ?? [],
    applyUrl: (row.applyUrl as string | null) ?? null,
    isInviteOnly: Boolean(row.isInviteOnly ?? false),
    locationTag,
    nextOpenDate: (row.nextOpenDate as string | null) ?? null,
    nextOpenDateParsed: (row.nextOpenDate as string | null) ?? null,
    source: 'scraped',
    minOrgIncome: (row.minOrgIncome as number | null) ?? null,
    maxOrgIncome: (row.maxOrgIncome as number | null) ?? null,
    // engine reads targetBeneficiaries; fixtures mostly use beneficiaryGroups
    targetBeneficiaries: (row.targetBeneficiaries as string[]) ?? (row.beneficiaryGroups as string[]) ?? [],
    // investment / programme / in-kind branch fields (present only where relevant)
    siMinInvestment: (row.siMinInvestment as number | null) ?? null,
    siRepaymentTermMonths: (row.siRepaymentTermMonths as number | null) ?? null,
    siInterestRatePercent: (row.siInterestRatePercent as number | null) ?? null,
    siSecurityRequired: (row.siSecurityRequired as string | null) ?? null,
    progStageTarget: (row.progStageTarget as string[]) ?? undefined,
    progNextCohortStart: (row.progNextCohortStart as string | null) ?? null,
    progLocationMode: (row.progLocationMode as string | null) ?? null,
    progLocationCity: (row.progLocationCity as string | null) ?? null,
    ikCapacityAvailable: (row.ikCapacityAvailable as string | null) ?? null,
    // matcher reads `funderBrief` (camelCase); context reads open_status from it
    funderBrief: row.funder_brief ?? null,
  }
  return g as unknown as GrantOpportunity
}

function toOrg(caseOrg: Record<string, unknown>): Organisation {
  const o = {
    id: 'eval-org',
    name: String(caseOrg.name ?? 'Eval org'),
    themes: [],
    niche_tags: [],
    excluded_niche_tags: [],
    beneficiary_groups: [],
    impact_sectors: [],
    funding_type_preferences: [],
    ...caseOrg,
    // engine reads years_operating; cases carry years_trading
    years_operating: (caseOrg.years_operating as number | null) ?? (caseOrg.years_trading as number | null) ?? null,
  }
  return o as unknown as Organisation
}

function loadPinned(ref: { title: string; funder: string }): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path.join(PINNED_DIR, `${slug(ref.funder)}__${slug(ref.title)}.json`), 'utf8'))
  } catch { return null }
}
function loadPool(poolPath: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(readFileSync(path.resolve(FIXTURES_DIR, path.basename(poolPath)), 'utf8')) as { rows?: Record<string, unknown>[] }
    return parsed.rows ?? []
  } catch { return [] }
}

export function buildPack(c: GoldenCase): BriefingPack {
  const rows: Record<string, unknown>[] = []
  for (const s of c.fixtures.synthetic ?? []) rows.push(s)
  for (const ref of c.fixtures.pinned_refs ?? []) { const snap = loadPinned(ref); if (snap) rows.push(snap) }
  if (c.fixtures.filler_pool) rows.push(...loadPool(c.fixtures.filler_pool))

  const input: ContextInput = {
    org: toOrg(c.org as Record<string, unknown>),
    goal: c.goal,
    pipeline: c.pipeline,
    orgFacts: c.org_facts,
    catalogue: rows.map(toGrant),
    asOf: c.as_of,
    userTurn: c.user_turn,
  }
  return assembleBriefingPack(input)
}
