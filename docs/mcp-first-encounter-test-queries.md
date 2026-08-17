# MCP First-Encounter Test Queries

**Purpose.** A reference test set for evaluating Grant Tracker MCP against generic Claude on the queries our real users would ask. Grounded in the active-cohort profiles, not invented prompts. Becomes the reference set for submission and for every future "did we improve X?" check.

**Workflow.**
1. Paul runs each prompt in Claude Desktop **with** the Grant Tracker connector enabled → captures response.
2. Paul runs the same prompt in a fresh Claude Desktop conversation **without** any connector, **2–3 times** (Claude is non-deterministic; the consistent answer across runs is the baseline). → captures responses.
3. Compile `docs/mcp-first-encounter-comparison.md` with side-by-side rows, scored on the two metrics below, plus verdict + action.

**Two metrics.**
- **Direct-link rate** — fraction of results where the link goes to the actual funder's website, not a directory aggregator (`fundingcentral.org.uk`, `charityexcellence.co.uk`, `360giving.org`, etc.).
- **Deadline-accuracy rate** — fraction of results where the surfaced deadline is verifiable on the funder's actual site. Hallucinated or stale deadlines fail.

**Verdict scale.** WIN / TIE / LOSS / SCOPE-LIMIT-WIN — the last for cases where the MCP correctly tells the user "thin coverage on X" rather than fabricating, and that *is* the right answer.

---

## Cohort summary

Six members, anonymised. Activity threshold: ≥3 engagement signals across pipeline, interactions, match_feedback, search history, or feedback. Paul (and family-member accounts) excluded.

| ID | Structure | Location | Income band | Stage | Primary sectors | Beneficiary focus |
|----|-----------|----------|-------------|-------|------------------|--------------------|
| **A** | CIC (limited by guarantee) | Brighton & Hove | £100k–£250k | n/a | Creative, disability, health | Children, young people |
| **B** | Registered charity | Newham, London | £500k–£1m | n/a | Education, creative, community | Children, families, people in poverty |
| **C** | Registered charity | Southwark, London | £1m–£5m | Established (70 yrs) | Creative, young people, education, accessibility, sustainability | Children, families, disabled people, general public |
| **D** | Registered charity | Sussex | Under £10k | n/a | Young people (music) | Young people |
| **E** | Registered charity | UK-wide | £100k–£250k | n/a | Mental health, education, justice, young people | Young people, children, families |
| **F** | CIC (limited by guarantee) | UK-wide | Under £10k | Pre-revenue | Financial, disability, tech | Disabled people, older people, mental health |

### Activity signals worth carrying into the test

- **Member A: 20+ `match_feedback` rows flagging "Wrong area"** — sustained signal that geo precision is sensitive in the mid-40s match-score band, and the matcher is currently surfacing too-distant rows. Real-user data, not synthetic.
- **Member A: one explicit "Says only registered charities on the website" flag** — CIC-eligibility tagging is being penalised by users in the wild, consistent with [[structures-undertagging]].
- No `live_search_history` rows for any active member — phrasing has to be inferred, can't be lifted verbatim.

---

## Patterns in the active cohort

1. **Creative + young people clusters hard.** 4 of 6 (A, B, C, D) work in this intersection. Catalogue depth here matters most for first-encounter quality with our actual users — and it's also Grant Tracker's existing strength.
2. **2 of 6 are CICs (33%).** Structure-aware matching isn't an edge case for this cohort. CIC-eligibility tagging quality is a load-bearing test.
3. **South-East geographic skew.** 4 of 6 are London or Sussex. Zero active members from Northern England, the Midlands, Wales, Scotland, or Northern Ireland. *That's the gap to test honestly* — if a Manchester or Cardiff prompt returns confident-but-thin results rather than "we're thin here", we have a scope-honesty problem.
4. **Wide income range, both ends present.** Under £10k (D, F) and £1–5m (C) coexisting means matching has to handle both. The £20–100k middle is most populated.
5. **Multi-funding-type preferences are real.** 5 of 6 list ≥3 funding types in preferences — validates the multi-type positioning, but also means tests should genuinely cover programme / investment / in-kind alongside grant.

### Implication for "deliberately-thin" tests

The cohort gaps (geography: North/Midlands/devolved nations; sector: sport, environment-pure, refugees/migrants, housing, homelessness) are the legitimate scope-honesty test areas. Two are baked into the 14 below. Add more on subsequent test rounds if these surface scope-honesty failures.

---

## 14 prompts + 1 London stress test (H3)

Prompts are tagged with **primary axis** but most cross-cut — real users don't write single-axis queries. Sub-tags noted.

**Three-query triangle (Paul, 2026-05-26):** the submission needs to clear all three bars. Using the actual prompt IDs from this doc:
- **S1** — canonical cohort query (Member A: Brighton CIC, creative + young people). Tests post-catalogue baseline.
- **H2** — deliberately thin area (Welsh-language Cardiff). Tests honest scope-limiting + coverage_note visibility.
- **H3** — hardest-to-win London query (Member B: Newham, creative + education + children). Tests whether catalogue holds against Claude's strongest region.

Note: the doc's **H1** (Manchester sports CIC) is also a deliberately-thin test and pairs with H2 for the coverage_note visibility check, but it sits outside Paul's three-query triangle. Both H1 and H2 should run to give two data points on coverage_note rendering — sport-in-the-North and Welsh-language-in-Cardiff are different shapes of "thin" and may render differently in Claude.

The remaining 11 prompts in the 5/4/3/2 set test breadth across cohort. The triangle tests the three failure modes most likely to embarrass the submission.

### Sector-specific (5)

#### S1 — Member A's profile
> *"Find me grant funding opportunities currently open for theatre work with young people in Brighton. We are a CIC with annual income of approximately £150,000."*

Tests: creative + young people + Brighton + CIC + small-mid income. Hits the dominant cohort sector intersection. Watch for: geo-precision (do we surface SE-specific funders or pollute with national-only?), CIC eligibility flags.

#### S2 — Member B's profile
> *"What grant funding is currently open for creative education work with children in low-income areas of London? We're a registered charity with annual income around £700,000."*

Tests: education + creative + London + charity + mid-large income. Cross-axis: beneficiary group (children + people in poverty). Watch for: London precision (does it surface borough/region-specific funders), income-band fit.

#### S3 — Member C's profile
> *"Find me grants for a children's theatre charity in London. Annual income £1–5m."*

Tests: creative + young people + London + charity + large income. Watch for: established-org fit (some funders cap at smaller orgs), accessibility/disability inclusion.

#### S4 — Member D's profile
> *"Find grant funding for a small music charity working with young people in Sussex. We have annual income under £10,000."*

Tests: creative (music sub-sector) + young people + Sussex + charity + very small income. Watch for: micro-grant surfacing, Sussex regional coverage, sub-sector specificity (music vs general arts).

#### S5 — Member E's profile
> *"What's open right now for youth mental health and justice work UK-wide? Registered charity, around £200k annual income."*

Tests: mental health + justice + young people + UK-wide + charity. Cross-axis: two impact sectors at once. Per memory [[programme-regional-coverage]], mental_health programmes are sparse — this is also a partial scope-honesty test.

### Structure-specific (4)

#### T1 — Member A, CIC framing
> *"I run a CIC limited by guarantee in Brighton. What grant funding can I actually apply for — not just charity-only opportunities?"*

Tests: explicit CIC framing + the user's lived complaint ("not just charity-only"). Directly probes [[structures-undertagging]]. The MCP should filter out charity-only and explicitly tag CIC-eligible.

#### T2 — Member F, early-stage CIC
> *"I'm setting up a CIC focused on financial inclusion for disabled people. We're pre-revenue. What grants or social investment are open for early-stage CICs?"*

Tests: pre-revenue stage + CIC + multi-funding-type (grant + investment) + disability beneficiary + financial inclusion sector. Watch for: stage-aware matching (some grants require 1+ year operating history), investment surface.

#### T3 — Member B, programmes framing
> *"We're a registered charity working with children. What programmes — not just grants — are open for organisations like us in London?"*

Tests: explicit programme (accelerator/fellowship) ask, not grant. Validates multi-funding-type breadth. Watch for: do programmes actually surface, or does the model default to grants?

#### T4 — Member D, micro-org framing
> *"We're a tiny registered charity in Sussex, under £10k annual income. Most grants seem too big — what's open for organisations our size?"*

Tests: income-floor matching (many funders set minimums implicitly). User's framing ("most grants seem too big") signals where they're stuck. Watch for: small-grant surfacing, scope honesty if catalogue thin at this size.

### Funding-type (3)

#### F1 — In-kind, Member A
> *"What in-kind support or mentoring programmes are available for a small creative CIC in Brighton?"*

Tests: in-kind surface specifically. Per memory [[non-grant-breadth-lever]], non-grant categories are a positioning differentiator — this is the test that should win cleanly against Claude-alone. Watch for: does the MCP surface in-kind, or default to grants?

#### F2 — Sustainability, Member C
> *"What environmental or sustainability funding is available for cultural institutions in London?"*

Tests: cross-sector framing (environment ∩ creative). Watch for: classifier under/over-tagging on the env-arts intersection.

#### F3 — Investment, Member F
> *"What social investment is open for an early-stage disability-tech CIC? We're looking at loans or recoverable grants."*

Tests: investment + sub-instrument (loan, recoverable_grant). Validates si_instrument_type field. Watch for: does the MCP filter on si_instrument_type correctly, or surface generic "investment".

### London stress test (added 2026-05-26 — structural addition, not scope creep)

#### H3 — Member B profile, hardest-to-win London query
> *"Find me grant funding opportunities currently open for creative education work with children in Newham. We're a registered charity with annual income around £700,000."*

Tests: London-specific borough (Newham), creative + education intersection, charity at mid-large income (£700k), children beneficiaries. Member B's actual profile (Institute of Imagination).

**Why this is the hardest test:** London is where Claude-alone is structurally strongest. Mainstream UK children's charities, Newham-focused programmes, and major creative-education funders are all well-represented in LLM training data. If the MCP wins here it wins on the bar most likely to predict directory-install behaviour. If it loses or ties, we have a clear catalogue-depth signal pre-submission rather than post-submission.

**What we expect MCP to surface (from staged LCF + SCF catalogue):**
- LCF Ellerdale Trust (includes Newham, children, themes match) — *closed cycle, depends on between-rounds framing landing or row staying hidden*
- LCF Comic Relief Summer Holiday Programme (all London, children, food/wellbeing) — *closed cycle*
- LCF VRU Stronger Futures (all London, young people) — *closed cycle, less precise theme match*
- Catalogued national funders for creative-education + children (Arts Council, Esmée Fairbairn etc. depending on existing catalogue depth)

**Scoring focus:** beyond the standard direct-link rate + deadline-accuracy rate, watch specifically whether MCP names Ellerdale Trust with honest cycle framing. That's the single sharpest test of whether the audit-grade positioning is structurally working under London depth pressure.

### Deliberately-thin (2 — scope-honesty test)

#### H1 — Geographic gap
> *"Find me grant funding for a community sports CIC in Manchester. Annual income approximately £50,000."*

Tests: Manchester (cohort gap) + sport (no active cohort member) + CIC. **Expected best outcome:** MCP returns a small honest list of UK-wide and North-applicable funders, with a `coverage_note` saying "Northern England coverage is partial; for community sport specifically, recommend cross-checking with [direct resources]." Fabricated confidence here is a fail.

#### H2 — Devolved nation gap
> *"What grant funding is open for Welsh-language cultural projects in Cardiff?"*

Tests: Wales (cohort gap) + Welsh-language (narrow sub-sector) + creative. **Expected best outcome:** MCP names the few Welsh-specific funders we do hold (Arts Council Wales, Welsh Government schemes if catalogued) and explicitly scopes the gap ("Welsh-language specifically is partial; for full Welsh coverage, cross-check..."). Same fabrication test as H1.

---

## Scoring template — for `mcp-first-encounter-comparison.md`

```markdown
### Prompt [ID]: [short description]

**MCP response summary:** [1-2 lines]
**Claude-alone response summary (consistent across N runs):** [1-2 lines]

**Direct-link rate:**
- MCP: X/Y (e.g. 4/5)
- Claude-alone: X/Y

**Deadline-accuracy rate:**
- MCP: X/Y (verified against funder site)
- Claude-alone: X/Y

**Verdict:** WIN / TIE / LOSS / SCOPE-LIMIT-WIN

**Notes:** [key differentiator or gap]
**Action:** fix pre-submission [what] / scope-limit honestly via coverage_note / accept gap / classifier issue / scraper issue
```

## Coverage_note visibility check

Per discussion: the `coverage_note` field is load-bearing for honest scope-limiting, but only useful if Claude actually surfaces it. During the test run, watch H1 and H2 specifically:

- Does Claude render the coverage caveat in prose to the user, or silently consume it as metadata?
- If consumed silently: the soft fix (tool description telling Claude it MUST surface coverage_note) needs strengthening, or we fall back to embedding the prose into the result text itself.

If S5 (mental health programmes) and S4 (Sussex micro-org) also have partial coverage, the same visibility question applies there.

---

## Notes on what isn't covered

- **Cohort outside the active 6.** We have 47 outreach targets total. The 41 inactive ones aren't shaping these prompts — that's deliberate (only meaningful engagement counts), but it means this test set isn't representative of "everyone we might acquire", it's representative of "everyone who's actually using us so far."
- **Iterative queries.** Real users follow up — "tell me more about #3", "filter to closing in 30 days". Multi-turn behaviour isn't in this set; add separately if first-encounter passes and we want to test conversation flow.
- **Adversarial / edge cases.** Empty queries, conflicting filters, very-long free text. Worth a separate pass post-launch.
- **Non-English queries.** Welsh-language cultural projects asked *in Welsh*, etc. Out of scope for v1.
