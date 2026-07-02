// Claim-source ref convention, shared by the reasoner and the G1 grader.
//
// A claim's source.ref points into the briefing pack as `<id>::<field>`:
//   <candId>::deadline | amount | amountUndisclosed | isRolling | openStatus
//   <candId>::eligibility
//   <candId>::brief.<field>        (funder_brief citation snippet)
//   org::<field>                    (org-model field)
//   arithmetic::<field>             (a pack-computed number)

import type { BriefingPack, ClaimSourceKind, PackCandidate } from '../../src/lib/agent/types'

export function ref(id: string, field: string): string {
  return `${id}::${field}`
}

export interface Resolved {
  ok: boolean
  kind: ClaimSourceKind | null
  value: unknown
  detail: string
}

function findCand(pack: BriefingPack, id: string): PackCandidate | undefined {
  return pack.candidates.find(c => c.id === id)
    ?? pack.candidates.find(c => c.fixture_id === id)
}

export function resolveRef(pack: BriefingPack, r: string): Resolved {
  const [id, field] = r.split('::')
  if (!field) return { ok: false, kind: null, value: null, detail: `malformed ref '${r}'` }

  if (id === 'org') {
    const v = (pack.org as Record<string, unknown>)[field]
    return { ok: v !== undefined, kind: 'org_model', value: v, detail: `org.${field}` }
  }
  if (id === 'arithmetic') {
    const v = (pack.arithmetic as unknown as Record<string, unknown>)[field]
    return { ok: v !== undefined, kind: 'catalogue_field', value: v, detail: `arithmetic.${field}` }
  }

  const cand = findCand(pack, id)
  if (!cand) {
    // Rule-out annex items are real pack elements the model may cite when
    // ruling something out. They carry an eligibility verdict + identity only.
    const annex = pack.ruleOutAnnex.find(x => x.id === id)
    if (annex) {
      if (field === 'eligibility') return { ok: true, kind: 'engine_verdict', value: annex.eligibility, detail: `${id} eligibility (annex)` }
      if (field === 'title' || field === 'funder') return { ok: true, kind: 'catalogue_field', value: (annex as unknown as Record<string, unknown>)[field], detail: `${id} ${field} (annex)` }
      return { ok: false, kind: null, value: null, detail: `annex item '${id}' has no field '${field}'` }
    }
    return { ok: false, kind: null, value: null, detail: `no candidate '${id}' in pack` }
  }

  if (field.startsWith('brief.')) {
    const bf = field.slice('brief.'.length)
    const cite = cand.funder_brief?.citations?.[bf]
    if (cite) return { ok: true, kind: 'brief_citation', value: cite.snippet, detail: `${id} brief.${bf}` }
    const prose = cand.funder_brief ? (cand.funder_brief as Record<string, unknown>)[bf] : undefined
    return { ok: prose !== undefined, kind: 'brief_citation', value: prose ?? null, detail: `${id} brief.${bf}` }
  }

  switch (field) {
    case 'eligibility':
      return { ok: true, kind: 'engine_verdict', value: cand.eligibility, detail: `${id} eligibility` }
    case 'deadline':
      return { ok: true, kind: 'catalogue_field', value: cand.deadline, detail: `${id} deadline` }
    case 'amount':
      return { ok: true, kind: 'catalogue_field', value: { min: cand.amountMin, max: cand.amountMax, undisclosed: cand.amountUndisclosed }, detail: `${id} amount` }
    case 'amountUndisclosed':
      return { ok: true, kind: 'catalogue_field', value: cand.amountUndisclosed, detail: `${id} amountUndisclosed` }
    case 'isRolling':
      return { ok: true, kind: 'catalogue_field', value: cand.isRolling, detail: `${id} isRolling` }
    case 'openStatus':
      return { ok: true, kind: 'catalogue_field', value: cand.openStatus, detail: `${id} openStatus` }
    default: {
      const v = (cand as unknown as Record<string, unknown>)[field]
      return { ok: v !== undefined, kind: 'catalogue_field', value: v, detail: `${id} ${field}` }
    }
  }
}
