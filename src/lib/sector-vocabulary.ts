/**
 * The words funders use for what they fund, mapped to impact sectors.
 *
 * Third and last of the vocabulary backstops, after eligibility-vocabulary.ts
 * (who may apply) and beneficiary-vocabulary.ts (who benefits). Same failure
 * each time: the model reads the funder's page, names some of what it finds,
 * and nothing deterministic catches what it missed.
 *
 * WHY SECTORS MATTER MOST OF THE THREE
 * ------------------------------------
 * impact_sectors is a HARD GATE, not just a ranking input. A grant whose
 * sectors miss the org is dropped before it is ever scored. Measured on Mustard
 * Tree 2026-07-28, 252 of 728 live grants were gated out that way.
 *
 * And the gate is not the problem — rescuing every one of them would have
 * surfaced a single extra grant above the dashboard's 55% threshold, because
 * without a sector match they score in the 40s anyway. The problem is that the
 * sector tag is missing in the first place:
 *
 *   Hilden Charitable Fund funds refugees and homeless people. Tagged
 *   [justice, community]. Add `housing` and it goes 51% -> 65% AND past the
 *   gate. Aviva Foundation, same, 51% -> 65%.
 *
 * One missing tag is fourteen points and the difference between visible and
 * invisible.
 *
 * ADD-ONLY, EVIDENCE-ONLY
 * -----------------------
 * Never removes a tag, never infers from funder type or beneficiary. Fires only
 * where the source names the activity. classify.ts caps sectors at 4, so this
 * cannot bloat a row into matching everyone.
 */

export interface SectorEntry {
  readonly sector: string
  readonly pattern: RegExp
  readonly because: string
}

/**
 * Spans where a sector word describes the APPLICANT or the funder, not the
 * work being funded. "We fund charities working in education" is education;
 * "our trustees have backgrounds in education" is not, and neither is a fund
 * "delivered with Groundwork" being an environment fund.
 */
const NOT_THE_WORK = /(?:in partnership with|delivered (?:with|by)|administered by|funded by|our (?:trustees|board|founder|history)|was (?:founded|established) by|the funder(?:'s)? own)[^.]{0,140}/gi

/** Exclusion clauses — "we do not fund X" must never tag X. */
const EXCLUSION = /(?:we (?:do not|don't|cannot|can't) (?:fund|support)|not fund(?:ed|ing)?|excluded?|exclusions?(?: include)?|ineligible|will not (?:fund|support))[^.]{0,180}/gi

/**
 * Idioms where a sector word describes an ORGANISATION'S CONDITION, not a field
 * of work. Every one of these was a live false positive found by probing the
 * patterns before applying them, 2026-07-28:
 *
 *   "financially sustainable organisations"        -> tagged environment
 *   "improving the financial health of charities"  -> tagged health
 *   "state of the art facilities"                  -> tagged creative
 *   "learning and development for staff"           -> tagged education
 *   "equality and diversity in our own governance" -> tagged justice
 *
 * Capacity-building funders use this register constantly, so without the strip
 * the backstop would have tagged a large slice of the catalogue for sectors
 * nobody funds.
 */
const ORG_IDIOM = /financial(?:ly)? (?:health|sustainab\w+)|health of the organisation|healthy reserves|sustainab\w+ (?:growth|business model|income|future for the (?:charity|organisation))|financially sustainab\w+|state of the art|learning and development for staff|staff (?:learning|training) and development|our own (?:governance|practice|recruitment)|organisational (?:health|resilience|sustainability)/gi

export function stripNonSectorSpans(text: string): string {
  return text.replace(NOT_THE_WORK, ' ').replace(EXCLUSION, ' ').replace(ORG_IDIOM, ' ')
}

export const SECTOR_VOCABULARY: readonly SectorEntry[] = [
  {
    sector: 'housing',
    pattern: /\bhousing\b|\bhomeless(?:ness)?\b|rough sleep|\btenanc|\baccommodation\b|temporary accommodation|sofa[- ]surf|\bshelter(?:s|ed)?\b|supported living|move[- ]on\b/i,
    because: 'Homelessness work IS housing work, and funders routinely name one without the other.',
  },
  {
    sector: 'food',
    pattern: /\bfood bank\b|\bfoodbank|\bfood (?:poverty|insecurity|aid|club|parcel|provision)\b|\bhot meals?\b|\bfree school meals\b|\bpantry\b|community (?:kitchen|fridge|cafe)|holiday hunger/i,
    because: 'Food aid is named plainly and is often subsumed under "poverty" instead.',
  },
  {
    sector: 'employment',
    pattern: /\bemployab|\bemployment\b|\bjob(?:s| ?seek| ?readiness| ?club)\b|\bwork placement|\bapprenticeship|\bvocational\b|\bskills? (?:training|development|for work)\b|back into work|\bNEET\b|\btraineeship/i,
    because: 'Training-into-work is distinct from education and often tagged as neither.',
  },
  {
    sector: 'financial',
    pattern: /\bdebt advice\b|\bfinancial (?:inclusion|capability|resilience|hardship|literacy|education)\b|\bmoney advice\b|\bbenefits? advice\b|\bcost of living\b|\bfuel poverty\b|\bpoverty\b|\bdestitut|welfare rights/i,
    because: 'Poverty and money-advice work; commonly the only sector a hardship fund has.',
  },
  {
    sector: 'mental_health',
    pattern: /\bmental health\b|\bwellbeing\b|\bcounselling\b|\btherap(?:y|eutic)\b|\bsuicide\b|\bbereavement\b|psychological support|\bloneliness\b|social isolation/i,
    because: 'Named explicitly and very often the second sector a health fund should carry.',
  },
  {
    sector: 'health',
    pattern: /\bhealth\b|\bhealthcare\b|\bmedical\b|\bhospice\b|\bhospital\b|\bnursing\b|\bphysical activity\b|\bpalliative\b|\bdiagnos|\bpatient/i,
    because: 'Broad but explicit; the physical-health counterpart to mental_health.',
  },
  {
    sector: 'disability',
    // Two patterns removed here after probing, 2026-07-28:
    //   \baccessib(?:le|ility)\b — "making collections accessible to the
    //     public" is a heritage phrase about public access. It tagged Idlewild
    //     Trust's cultural-heritage conservation fund as a disability fund.
    //   \bSEND?\b — under the /i flag this matches the ordinary word "send",
    //     which appears in almost every grant page ("send us your application").
    // Both are now required to carry disability context.
    pattern: /\bdisabilit(?:y|ies)\b|\bdisabled\b|learning disabilit|\bsensory impair|\bneurodivers|\bautis|\bwheelchair\b|special educational needs|\bSEN[D]?\s+(?:pupils?|children|students?|provision|school)|accessib\w+\s+(?:facilit|toilet|entrance|ramp|lift|parking|adaptation)|disabled access|step[- ]free/i,
    because: 'Disability-focused funds say so; rarely implied by health alone.',
  },
  {
    sector: 'education',
    pattern: /\beducation(?:al)?\b|\bschools?\b|\bpupils?\b|\bliteracy\b|\bnumeracy\b|\btutor|\bcurriculum\b|\bteacher|\battainment\b|\bearly years\b|\bcollege\b|\bstudy support\b|\blearning (?:programme|support|opportunit|difficult)/i,
    because: 'Explicit, and distinct from employment skills training.',
  },
  {
    sector: 'young_people',
    pattern: /\byouth (?:work|club|service|provision|programme)\b|\byoung people\b|\bteenager|\badolescen|\byouth[- ]led\b|detached youth/i,
    because: 'Youth work is a sector as well as a beneficiary group.',
  },
  {
    sector: 'older_people',
    pattern: /\bolder people\b|\belderly\b|\bdementia\b|\blater life\b|\bage[- ]friendly\b|\bpensioners?\b/i,
    because: 'Ageing-focused provision is its own sector.',
  },
  {
    sector: 'community',
    pattern: /\bcommunity (?:centre|hall|space|hub|development|cohesion|building|group)\b|\bgrassroots\b|\bvolunteer|\bneighbourhood\b|\bsocial cohesion\b|\bcommunity[- ]led\b/i,
    because: 'Community infrastructure and volunteering.',
  },
  {
    sector: 'justice',
    pattern: /\bhuman rights\b|\badvocacy\b|\blegal (?:advice|aid|support|rights)\b|\bdiscrimination\b|\basylum\b|\brefugee\b|\bmigrat|\bcriminal justice\b|\bprison\b|\bracial justice\b|\bsocial justice\b|\bcampaign(?:ing)?\b|\bequalit(?:y|ies) (?:for|of|and human|in society)|tackling inequalit/i,
    because: 'Rights, advice and advocacy work.',
  },
  {
    sector: 'environment',
    pattern: /\benvironment(?:al)?\b|\bclimate\b|\bbiodiversity\b|\bconservation\b|\brewilding\b|\bcarbon\b|\brecycl|\bgreen space\b|\bwildlife\b|nature (?:conservation|recovery|restoration|reserve)|natural environment|nature[- ]based|sustainab\w* (?:energy|transport|food|farming|development goals)/i,
    because: 'Named explicitly.',
  },
  {
    sector: 'creative',
    pattern: /\barts\b|\bartistic\b|\bartists?\b|\bmusic\b|\btheatre\b|\bdance\b|\bcreative\b|\bculture\b|\bcultural\b|\bfilm\b|\bliterature\b|\bcraft/i,
    because: 'Arts and culture.',
  },
  {
    sector: 'heritage',
    pattern: /\bheritage\b|\bhistoric\b|\blisted building\b|\barchive|\bmuseum\b|\bconservation of (?:buildings|monuments)\b|\bchurch(?:es)? (?:repair|building)\b/i,
    because: 'Built and cultural heritage.',
  },
  {
    sector: 'sport',
    pattern: /\bsport(?:s|ing)?\b|\bphysical activity\b|\bfootball\b|\bcricket\b|\brugby\b|\bswimming\b|\bathletics\b|\bleisure centre\b/i,
    because: 'Sport and physical recreation.',
  },
  {
    sector: 'social_economy',
    pattern: /\bsocial enterprise\b|\bsocial investment\b|\bco-?operative\b|\bcommunity business\b|\btrading (?:income|arm)\b|\bsocial trading\b|\benterprise development\b/i,
    because: 'The social-economy sector itself.',
  },
]

/** Sectors the funder's own text names. Pure, add-only. */
export function sectorsFromText(text: string): { adds: string[]; matched: string[] } {
  const clean = stripNonSectorSpans(text)
  const adds: string[] = []
  const matched: string[] = []
  for (const entry of SECTOR_VOCABULARY) {
    if (!entry.pattern.test(clean)) continue
    matched.push(entry.sector)
    if (!adds.includes(entry.sector)) adds.push(entry.sector)
  }
  return { adds, matched }
}

/**
 * Deterministic floor for impact_sectors.
 *
 * Capped low by default: classify.ts already caps the model at 4 sectors, and a
 * row tagged for everything matches everyone, which is noise rather than reach.
 * The cap is why this adds at most a small number of tags to an already-tagged
 * row while still rescuing a row the model left almost bare.
 */
export function ensureExplicitSectors(
  current: string[],
  sourceText: string | null | undefined,
  opts?: { max?: number },
): string[] {
  const text = (sourceText ?? '').trim()
  if (!text) return current
  const max = opts?.max ?? 4
  const out = [...current]
  for (const s of sectorsFromText(text).adds) {
    if (out.length >= max) break
    if (!out.includes(s)) out.push(s)
  }
  return out
}
