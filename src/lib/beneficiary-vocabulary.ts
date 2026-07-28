/**
 * The words funders use for who they help, mapped to beneficiary tags.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Sibling of eligibility-vocabulary.ts, same failure, different column.
 * `target_beneficiaries` comes only from the model, with no deterministic
 * floor beneath it — unlike `eligible_structures`, which has
 * ensureExplicitStructures(). So when the model's attention lands elsewhere,
 * an explicitly-named group is silently dropped and nothing catches it.
 *
 * Measured 2026-07-28: 40 live rows name homelessness in their own text and
 * only 19 carried the `homeless` tag. Of the 21 missing, 20 were plainly
 * correct — Sir Jules Thorn lists "youth/education, older people, disability,
 * health, homelessness" as its areas; Resonance's fund is literally titled
 * "National Homelessness Property Fund". A Manchester homelessness charity
 * could not see any of them.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS
 * ---------------------------------
 * Beneficiary tags do not merely rank, they RESCUE. A fund whose sector tags
 * miss the org is dropped before scoring; its beneficiary overlap is the
 * evidence that it should have been kept. An untagged beneficiary is therefore
 * invisible twice over.
 *
 * ADD-ONLY, AND ONLY ON THE FUNDER'S OWN WORDS
 * --------------------------------------------
 * This never removes a tag and never infers from sector or funder type. It
 * fires only where the source names the group. Over-tagging a beneficiary
 * sends an organisation to a funder that will reject it, which costs an
 * applicant the one thing they cannot get back.
 */

export interface BeneficiaryEntry {
  readonly tag: string
  readonly pattern: RegExp
  readonly because: string
}

/**
 * Mentions that name an ORGANISATION rather than a group of people.
 *
 * Social Investment Business's Energy Resilience Fund says it is "delivered in
 * partnership with Big Issue Invest, Charity Bank, Groundwork UK, Homeless Link
 * and others". Homeless Link is a sector infrastructure body — a delivery
 * partner, not the people being helped. It was the single false positive in the
 * 2026-07-28 audit and this is why the audit read sentences rather than counts.
 */
const ORGANISATION_NAME = /homeless link|shelter (?:england|scotland|cymru)|crisis uk|centrepoint|st mungo|depaul uk|refugee council|age uk|mind\b|scope\b|barnardo|mencap|carers uk|stonewall/gi

/** Phrases that introduce partners or funders, not beneficiaries. */
const PARTNER_CONTEXT = /(?:in partnership with|delivered (?:with|by)|administered by|alongside partners|funded by|supported by|in collaboration with)[^.]{0,160}/gi

/**
 * Phrases that introduce a REFERRER — someone who vouches for the applicant.
 *
 * Forth Giving requires applications to be "endorsed by a carer, minister, or
 * social/health/community education worker". The carer there is performing a
 * process role, not receiving support, and tagging the fund for carers would
 * send every carers' charity to a fund that is not for them. Same species as
 * the Homeless Link case above: a person named in a mechanism, not a
 * beneficiary.
 */
const REFERRER_CONTEXT = /(?:endorsed by|referred by|referral from|nominated by|signed off by|assessed by|must be (?:supported|endorsed|referred))[^.]{0,120}/gi

/**
 * Strip the spans where a beneficiary word would be naming an organisation or a
 * delivery partner, so the vocabulary reads only the funder's own description
 * of who benefits.
 */
export function stripNonBeneficiarySpans(text: string): string {
  return text
    .replace(PARTNER_CONTEXT, ' ')
    .replace(REFERRER_CONTEXT, ' ')
    .replace(ORGANISATION_NAME, ' ')
}

export const BENEFICIARY_VOCABULARY: readonly BeneficiaryEntry[] = [
  {
    tag: 'homeless',
    pattern: /\bhomeless(?:ness)?\b|rough sleep|sofa[- ]surf|temporary accommodation|housing insecurity|without a safe place|street homeless/i,
    because: 'Named as a group the funder supports, not merely a sector word.',
  },
  {
    tag: 'refugees_migrants',
    pattern: /\brefugees?\b|asylum seek|\bmigrants?\b|newly arrived communit|people seeking sanctuary|no recourse to public funds/i,
    because: 'Refugee, asylum and migrant status are named explicitly or not at all.',
  },
  {
    tag: 'ex_offenders',
    pattern: /ex[- ]offend|\bprison leaver|people leaving (?:prison|custody)|criminal justice system|\bresettlement\b|formerly incarcerated/i,
    because: 'A distinct group with its own funders; rarely implied by anything else.',
  },
  {
    tag: 'carers',
    pattern: /\bunpaid carers?\b|\byoung carers?\b|\bcarers?\b(?!\s*(?:allowance\s*)?(?:home|agency))|caring responsibilit|kinship care/i,
    because: 'Funders name carers directly; the word rarely appears incidentally.',
  },
  {
    tag: 'veterans',
    pattern: /\bveterans?\b|ex[- ]service (?:personnel|men|women)|armed forces communit|service leavers|military famil/i,
    because: 'Armed-forces funds are explicit about it.',
  },
  {
    tag: 'disabled_people',
    pattern: /\bdisabled people\b|\bdisabilit(?:y|ies)\b|learning disabilit|physical disabilit|sensory impair|neurodivers|\bautis/i,
    because: 'Disability is stated when it is a target, not inferred.',
  },
  {
    tag: 'mental_health',
    pattern: /\bmental health\b|\bmental (?:ill|well)|psychological wellbeing|\bsuicide prevention\b|\bbereavement\b/i,
    because: 'Named explicitly; a very common funder priority.',
  },
  {
    tag: 'older_people',
    pattern: /\bolder people\b|\belderly\b|\bpensioners?\b|\bover[- ]?(?:60|65|70)s?\b|later life|\bdementia\b|social isolation (?:in|among) older/i,
    because: 'Age-group funds say so.',
  },
  {
    tag: 'young_people',
    pattern: /\byoung people\b|\byouth\b|\bteenager|\badolescen|\bunder[- ]?(?:18|21|25|30)s?\b|\bNEET\b|young adults/i,
    because: 'The most commonly named group in UK grant-making.',
  },
  {
    tag: 'children',
    pattern: /\bchildren\b|\bchildhood\b|\bunder[- ]?(?:5|11|16)s?\b|early years|\bpupils?\b|\bschoolchildren\b|looked[- ]after children/i,
    because: 'Distinct from young people and usually named alongside it.',
  },
  {
    tag: 'women_girls',
    pattern: /\bwomen\b|\bgirls\b|violence against women|domestic abuse|\bmaternal\b|women[- ]led/i,
    because: 'Gender-targeted funds state it.',
  },
  {
    tag: 'ethnic_minorities',
    pattern: /ethnic minorit|\bBAME\b|\bBME\b|black[- ]led|racialised communit|people of colour|global majority|racial (?:justice|equality)/i,
    because: 'Named directly; never safe to infer.',
  },
  {
    tag: 'lgbtq',
    pattern: /\bLGBT|\bqueer\b|\btrans(?:gender)?\b|lesbian|\bgay\b|bisexual|sexual orientation/i,
    because: 'Named directly.',
  },
  {
    tag: 'people_in_poverty',
    pattern: /\bpoverty\b|low[- ]income|financial hardship|cost of living|deprivation|\bdestitut|food (?:poverty|insecurity)|fuel poverty|financially (?:vulnerable|excluded)/i,
    because: 'Poverty language is explicit and very common.',
  },
  {
    tag: 'rural_communities',
    pattern: /\brural\b|\bcountryside\b|remote communit|island communit|market town/i,
    because: 'Rural targeting is stated.',
  },
]

/**
 * Beneficiary tags the funder's own text names.
 *
 * Pure and add-only. Returns the tags found; the caller decides what to do with
 * them. `general_public` and `social_impact_orgs` are deliberately absent: the
 * first is a fallback rather than evidence, and the second describes the
 * applicant, not who ultimately benefits.
 */
export function beneficiariesFromText(text: string): { adds: string[]; matched: string[] } {
  const clean = stripNonBeneficiarySpans(text)
  const adds: string[] = []
  const matched: string[] = []
  for (const entry of BENEFICIARY_VOCABULARY) {
    if (!entry.pattern.test(clean)) continue
    matched.push(entry.tag)
    if (!adds.includes(entry.tag)) adds.push(entry.tag)
  }
  return { adds, matched }
}

/**
 * Deterministic floor for target_beneficiaries — the sibling of
 * ensureExplicitStructures() in classify.ts.
 *
 * Add-only by construction: it can never drop a tag the model or an admin set.
 * Capped so a funder listing its whole remit does not end up tagged for
 * everyone, which would be its own kind of noise.
 */
export function ensureExplicitBeneficiaries(
  current: string[],
  sourceText: string | null | undefined,
  opts?: { max?: number },
): string[] {
  const text = (sourceText ?? '').trim()
  if (!text) return current
  const max = opts?.max ?? 6
  const out = [...current]
  for (const tag of beneficiariesFromText(text).adds) {
    if (out.length >= max) break
    if (!out.includes(tag)) out.push(tag)
  }
  return out
}
