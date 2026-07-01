// STAND-IN eligibility engine for build step 1.
//
// The real engine is src/lib/eligibility.ts (runEligibilityChecks). Step 3
// wires that in at fixture-build time so gates compare against engine truth.
// Until then this lightweight stand-in produces plausible verdicts using the
// agent-level reason-code vocabulary the golden set asserts on (schema Rule 5).
// Reason codes here are intentionally aligned with REASON_CODES in types.ts.

import type { EligibilityVerdict, EligibilityIssue, PackCandidate } from '../../src/lib/agent/types'

const DEVOLVED = new Set(['scotland', 'wales', 'northern ireland'])
const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'nationwide', 'national', 'england'])

// Parse an income band string → [min, max] in whole pounds (null = open-ended).
export function parseIncomeBand(band: string | undefined | null): [number | null, number | null] {
  if (!band) return [null, null]
  const b = band.toLowerCase().replace(/,/g, '')
  const num = (s: string): number | null => {
    const m = s.match(/£?\s*([\d.]+)\s*(k|m|million|thousand)?/)
    if (!m) return null
    let v = parseFloat(m[1])
    const unit = m[2]
    if (unit === 'k' || unit === 'thousand') v *= 1_000
    if (unit === 'm' || unit === 'million') v *= 1_000_000
    return Math.round(v)
  }
  if (/^under\b/.test(b)) return [null, num(b)]
  if (/^over\b|\+\s*$/.test(b)) return [num(b), null]
  const parts = b.split(/[–—-]|to\b/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) return [num(parts[0]), num(parts[1])]
  const single = num(b)
  return [single, single]
}

interface OrgLike {
  legal_structure?: string
  annual_income_band?: string
  primary_location?: string
  geographic_reach?: string
  beneficiary_groups?: string[]
  years_trading?: number
}

export function evaluateEligibility(cand: PackCandidate, org: OrgLike): EligibilityVerdict {
  const issues: EligibilityIssue[] = []
  const blocker = (code: string, message: string) => issues.push({ code, severity: 'blocker', message })
  const warn = (code: string, message: string) => issues.push({ code, severity: 'warning', message })

  // Structure
  const struct = (org.legal_structure ?? '').toLowerCase()
  if (cand.eligibleStructures && cand.eligibleStructures.length > 0 && struct) {
    if (!cand.eligibleStructures.map(s => s.toLowerCase()).includes(struct)) {
      blocker('structure_mismatch', `Funder accepts ${cand.eligibleStructures.join(', ')}; org is ${struct}.`)
    }
  }

  // Invite-only
  if (cand.isInviteOnly) blocker('invite_only', 'Fund is invitation-only.')

  // Income floor / ceiling
  const [orgMin, orgMax] = parseIncomeBand(org.annual_income_band)
  if (cand.minOrgIncome != null && orgMax != null && orgMax < cand.minOrgIncome) {
    blocker('org_income_below_floor', `Funder minimum income £${cand.minOrgIncome.toLocaleString()}; org tops out at £${orgMax.toLocaleString()}.`)
  }
  if (cand.maxOrgIncome != null && orgMin != null && orgMin > cand.maxOrgIncome) {
    blocker('org_income_above_ceiling', `Funder maximum income £${cand.maxOrgIncome.toLocaleString()}; org starts at £${orgMin.toLocaleString()}.`)
  }

  // Nation / location
  const loc = (cand.locationTag ?? '').toLowerCase()
  const orgLoc = `${org.primary_location ?? ''} ${org.geographic_reach ?? ''}`.toLowerCase()
  if (loc && !BROAD_LOCATION.has(loc)) {
    const locWords = loc.split(/[,/]/).map(s => s.trim())
    const overlaps = locWords.some(w => w && orgLoc.includes(w))
    if (!overlaps) {
      if (locWords.some(w => DEVOLVED.has(w))) {
        blocker('nation_mismatch', `Funder is ${cand.locationTag}-only; org is in ${org.primary_location ?? 'another area'}.`)
      } else {
        warn('nation_mismatch', `Funder region ${cand.locationTag} may not cover the org's area.`)
      }
    }
  }

  // Beneficiary overlap (soft)
  const candBen = (cand.beneficiaryGroups ?? []).map(s => s.toLowerCase())
  const orgBen = (org.beneficiary_groups ?? []).map(s => s.toLowerCase())
  if (candBen.length > 0 && orgBen.length > 0 && !candBen.some(b => orgBen.includes(b))) {
    warn('beneficiary_mismatch', `Funder targets ${cand.beneficiaryGroups?.join(', ')}; org serves ${org.beneficiary_groups?.join(', ')}.`)
  }

  // Trading-years floor (synthetic fixtures may carry minTradingYears)
  const minYears = (cand as unknown as { minTradingYears?: number }).minTradingYears
  if (typeof minYears === 'number' && typeof org.years_trading === 'number' && org.years_trading < minYears) {
    blocker('insufficient_trading_years', `Funder requires ${minYears}+ years; org has ${org.years_trading}.`)
  }

  const hasBlocker = issues.some(i => i.severity === 'blocker')
  const status = hasBlocker ? 'ineligible' : issues.length > 0 ? 'check' : 'eligible'
  const reason = hasBlocker
    ? issues.filter(i => i.severity === 'blocker').map(i => i.message).join(' ')
    : issues.length > 0
      ? issues.map(i => i.message).join(' ')
      : 'Meets the checked eligibility criteria.'
  return { status, issues, reason }
}
