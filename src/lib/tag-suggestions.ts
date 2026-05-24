// Tag taxonomies + disagreement-check helpers, shared between the admin
// GrantEditor (per-grant view) and the /api/admin/audit-tag-agreement
// route (bulk catalogue scan).
//
// Extracted from src/components/admin/GrantEditor.tsx 2026-05-24 so both
// the client editor and the server-side audit see exactly the same
// matching rules — if the synonyms diverge, audit results stop matching
// the editor's per-grant feedback and admins lose trust in both.

export type TagOption = { value: string; label: string }

// ── Taxonomies ───────────────────────────────────────────────────────────────

export const IMPACT_SECTOR_OPTIONS: TagOption[] = [
  { value: 'community',         label: 'Community' },
  { value: 'young_people',      label: 'Young People' },
  { value: 'health',            label: 'Health' },
  { value: 'mental_health',     label: 'Mental Health' },
  { value: 'education',         label: 'Education' },
  { value: 'employment',        label: 'Employment' },
  { value: 'creative',          label: 'Arts & Culture' },
  { value: 'environment',       label: 'Environment' },
  { value: 'housing',           label: 'Housing' },
  { value: 'food',              label: 'Food' },
  { value: 'sport',             label: 'Sport' },
  { value: 'heritage',          label: 'Heritage' },
  { value: 'disability',        label: 'Disability' },
  { value: 'older_people',      label: 'Older People' },
  { value: 'women',             label: 'Women & Gender' },
  { value: 'justice',           label: 'Justice & Rights' },
  { value: 'tech',              label: 'Technology' },
  { value: 'financial',         label: 'Financial Inclusion' },
  { value: 'international',     label: 'International' },
  { value: 'social_economy',    label: 'Social Economy' },
  { value: 'social_innovation', label: 'Social Innovation' },
]

export const BENEFICIARY_OPTIONS: TagOption[] = [
  { value: 'children',           label: 'Children (under 16)' },
  { value: 'young_people',       label: 'Young People (16-25)' },
  { value: 'older_people',       label: 'Older People (65+)' },
  { value: 'families',           label: 'Families' },
  { value: 'women_girls',        label: 'Women & Girls' },
  { value: 'men_boys',           label: 'Men & Boys' },
  { value: 'lgbtq',              label: 'LGBTQ+' },
  { value: 'ethnic_minorities',  label: 'Ethnic Minorities' },
  { value: 'refugees_migrants',  label: 'Refugees & Migrants' },
  { value: 'disabled_people',    label: 'Disabled People' },
  { value: 'mental_health',      label: 'Mental Health' },
  { value: 'homeless',           label: 'Homeless People' },
  { value: 'veterans',           label: 'Veterans' },
  { value: 'ex_offenders',       label: 'Ex-Offenders' },
  { value: 'people_in_poverty',  label: 'People in Poverty' },
  { value: 'rural_communities',  label: 'Rural Communities' },
  { value: 'general_public',     label: 'General Public' },
]

// ── Synonyms ─────────────────────────────────────────────────────────────────
// Extra terms the brief might use that aren't in the tag label. Used by
// suggestTags() to catch obvious classifier misses. Lowercase; word-boundary
// matched against the brief blob — keep terms generic enough that false
// positives are rare. When you add a new sector/beneficiary, add synonyms
// here too or detection drops to label-only.

export const SECTOR_SYNONYMS: Record<string, string[]> = {
  community:         ['community', 'neighbourhood', 'grassroots'],
  young_people:      ['young people', 'youth', 'teenager', 'adolescent', 'under 25', '16-25', 'children and young'],
  health:            ['health', 'healthcare', 'wellbeing', 'illness', 'medical'],
  mental_health:     ['mental health', 'mental wellbeing', 'depression', 'anxiety', 'psychological'],
  education:         ['education', 'school', 'learning', 'training', 'literacy'],
  employment:        ['employment', 'jobs', 'work', 'career', 'workforce', 'employability'],
  creative:          ['arts', 'culture', 'creative', 'music', 'theatre', 'cultural', 'performing arts', 'visual arts'],
  environment:       ['environment', 'climate', 'green', 'sustainability', 'biodiversity', 'nature', 'ecology', 'carbon'],
  housing:           ['housing', 'homeless', 'tenancy', 'accommodation'],
  food:              ['food', 'nutrition', 'hunger', 'food bank', 'food poverty'],
  sport:             ['sport', 'physical activity', 'recreation', 'exercise', 'fitness'],
  heritage:          ['heritage', 'historic', 'museum', 'monument', 'archaeology'],
  disability:        ['disability', 'disabled', 'special needs', 'sen', 'accessibility'],
  older_people:      ['older people', '65+', 'elderly', 'pensioner', 'ageing', 'aging'],
  women:             ['women', 'girls', 'female', 'gender equality', 'gender'],
  justice:           ['justice', 'rights', 'criminal justice', 'human rights', 'equality', 'discrimination'],
  tech:              ['technology', 'digital', 'tech', 'innovation', 'software'],
  financial:         ['financial inclusion', 'poverty', 'debt', 'financial', 'cost of living', 'destitution'],
  international:     ['international', 'global', 'overseas', 'developing countries'],
  social_economy:    ['social enterprise', 'social economy', 'cic', 'community interest', 'social business'],
  social_innovation: ['social innovation', 'systems change', 'social impact'],
}

export const BENEFICIARY_SYNONYMS: Record<string, string[]> = {
  children:           ['children', 'kids', 'child', 'under 16', 'pupil'],
  young_people:       ['young people', 'youth', '16-25', 'teenager', 'young adult'],
  older_people:       ['older people', '65+', 'elderly', 'pensioner', 'senior'],
  families:           ['families', 'parent', 'family'],
  women_girls:        ['women', 'girls', 'female', 'mother'],
  men_boys:           ['men', 'boys', 'male', 'father'],
  lgbtq:              ['lgbtq', 'lgbt', 'gay', 'lesbian', 'queer', 'trans', 'bisexual'],
  ethnic_minorities:  ['ethnic', 'minorit', 'global majority', 'bame', 'racialised', 'black, asian'],
  refugees_migrants:  ['refugee', 'asylum seeker', 'migrant', 'displaced'],
  disabled_people:    ['disabled', 'disability', 'special needs', 'sen', 'autism', 'neurodivergent'],
  mental_health:      ['mental health', 'mental illness', 'depression', 'anxiety'],
  homeless:           ['homeless', 'rough sleep', 'housing crisis'],
  veterans:           ['veteran', 'armed forces', 'ex-service', 'military'],
  ex_offenders:       ['ex-offender', 'prisoner', 'ex-prisoner', 'criminal justice', 'rehabilitation'],
  people_in_poverty:  ['poverty', 'low income', 'deprivation', 'destitution', 'hardship'],
  rural_communities:  ['rural', 'countryside', 'village'],
  general_public:     ['general public', 'open to all', 'anyone'],
}

// ── Matcher ──────────────────────────────────────────────────────────────────
// Word-boundary match — avoids false positives like "men" matching the "men"
// inside "employment", or "sport" matching inside "support". Uses \b on
// alphanumeric edges; works correctly with hyphens and apostrophes since
// those are non-word characters in JS regex.

export function termMatches(briefText: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(briefText)
}

// ── Brief text builder ───────────────────────────────────────────────────────
// Concatenates the brief fields most likely to mention sectors / beneficiaries
// plus the grant title and description. Lowercased for case-insensitive match.

export type BriefSourceFields = {
  funder_brief?: Record<string, string | null> | null
  description?: string | null
  title?: string | null
}

export function buildBriefText(grant: BriefSourceFields): string {
  const brief = grant.funder_brief ?? {}
  return [
    brief.what_they_fund,
    brief.who_can_apply,
    brief.priorities,
    brief.strong_application,
    brief.exclusions,
    brief.funder_tips,
    grant.description,
    grant.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// ── Suggestion core ──────────────────────────────────────────────────────────
// Returns { missing, extra }:
//   missing — options whose label or synonym appears in the brief but is NOT
//             in the current value list. "AI may have missed this."
//   extra   — options that ARE tagged but whose label/synonyms aren't found
//             anywhere in the brief. "Verify this is right."
// Pure text-match — no API calls. Safe to run server-side.

export type TagSuggestions = { missing: string[]; extra: string[] }

export function suggestTags(
  options: TagOption[],
  currentValues: string[],
  briefText: string,
  synonyms: Record<string, string[]> = {},
): TagSuggestions {
  if (!briefText) return { missing: [], extra: [] }
  const missing: string[] = []
  const extra:   string[] = []
  for (const opt of options) {
    const terms = [opt.label.toLowerCase(), ...(synonyms[opt.value] ?? [])]
    const mentioned = terms.some(t => termMatches(briefText, t))
    const tagged    = currentValues.includes(opt.value)
    if (mentioned && !tagged) missing.push(opt.value)
    if (tagged && !mentioned) extra.push(opt.value)
  }
  return { missing, extra }
}

// ── Label helper ─────────────────────────────────────────────────────────────

export function labelFor(options: TagOption[], value: string): string {
  return options.find(o => o.value === value)?.label ?? value
}

// ── Brief thinness gate ──────────────────────────────────────────────────────
// Audit results from grants with thin briefs are noisy — the classifier
// had nothing to work with, and suggestTags() has nothing to compare to.
// 200 chars is a soft floor; below this we flag the grant as "brief-thin"
// and exclude it from the disagreement score (but still surface it as
// needing enrichment).

export const THIN_BRIEF_THRESHOLD = 200

export function isBriefThin(grant: BriefSourceFields): boolean {
  return buildBriefText(grant).length < THIN_BRIEF_THRESHOLD
}
