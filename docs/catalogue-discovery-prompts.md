# Catalogue Discovery Prompts

**Purpose.** Internal research process for closing catalogue gaps surfaced by first-encounter tests or live user feedback. Claude does discovery → human triages → verified candidates go through the standard scrape/manual-ingest pipeline with full URL validation + admin Needs Review gate.

**Not a product feature.** Discovery output is *never* directly served to users. The MCP catalogue stays "scraped from the funder's own site." Discovery is a research tool that *generates the next batch of scrape targets*, nothing more.

**When to use.** A first-encounter test or live user query surfaces a gap shape — region X, sector Y, funder-type Z. Run the matching prompt template below to get a candidate list, triage it, queue verified candidates for the next catalogue session.

---

## Workflow

1. **Identify the gap shape** from the failing query (region / sector / nation / beneficiary / structure).
2. **Run the matching prompt template** below in a Claude conversation (or via WebSearch tooling).
3. **Triage the output**:
   - URL resolves to a real funder page? (live HTTP check)
   - Funder is currently active? (not sunset / merged / closed)
   - Not already in our catalogue? (grep `scraped_grants.funder` and `funder_watchlist.name`)
   - Plausible eligibility match for the gap query?
4. **Queue verified candidates** into `data/catalogue-session-stage/discovery-queue-<date>.json` with the standard staging shape (`staged-<source>-<slug>` external_id, `is_active=false`, full eligibility text).
5. **Ingest at the next catalogue session** OR sooner if the gap is launch-critical.

Note on yield calibration per [[audit-estimates-optimistic]]: discovery output typically overstates actionable yield by 2-3×. Sample-verify three candidates before sizing the work.

---

## Prompt templates

### Template 1 — Regional gap (community foundations + council grants)

> *"List the regional community foundations and council-level grant programmes serving [REGION]. For each, give me: organisation name, primary URL, what they currently fund, typical award range, whether they're currently open or between rounds. Focus on programmes that fund voluntary/community sector organisations including charities, CICs, and community groups — not just registered charities. Skip national funders that aren't regionally focused. Include the major regional community foundation specifically by name and URL."*

Use when: a region-tagged query returns thin results with the regional community foundation absent or shallow (e.g. H1 Manchester, S1 Sussex).

### Template 2 — Sector gap (national funders for a specific sector)

> *"List active UK funders that specifically support [SECTOR] work — not generic community funders. For each, give me: funder name, primary URL, currently-open programmes if any, typical award range, organisational structures they fund (charities, CICs, etc.), any geographic restrictions. Skip funders that have closed permanently or have no current programmes. Include trust foundations, government schemes, lottery funds, and corporate funders for this sector."*

Use when: a sector-tagged query returns mainly cross-sector funders with low match quality.

### Template 3 — Devolved-nation gap

> *"List active funders specifically serving [Wales / Scotland / Northern Ireland], including: national community foundations, devolved government grants, sector-specific funders, language/cultural funders if relevant. For each: name, primary URL, what they fund, typical award range, eligibility for charities / CICs / community groups, current open/closed status. Skip UK-wide funders that aren't specifically targeting [nation]."*

Use when: H2-style devolved-nation query returns thin results.

### Template 4 — Beneficiary-group gap

> *"List active UK funders specifically supporting [BENEFICIARY_GROUP] — for example, organisations led by, working with, or specifically funding work that benefits [GROUP]. For each: funder name, primary URL, current programmes, typical award range, structural eligibility, geographic scope. Include funders that explicitly prioritise [GROUP] in their funding criteria, not generic funders who happen to fund them."*

Use when: beneficiary-tagged query returns only generic community funders.

### Template 5 — Structure-specific gap (CICs, social enterprises, community groups)

> *"List active UK funders that explicitly fund [STRUCTURE] — for example, [STRUCTURE]-eligible programmes from trusts, government schemes, and lottery funds. Skip charity-only funders. For each: funder name, primary URL, current programmes, typical award range, whether they fund [STRUCTURE] specifically or just include them in a broader eligibility list. Include social investment alongside grants where relevant."*

Use when: structure-tagged query (especially CIC or social enterprise) returns charity-skewed results.

---

## What to capture per candidate (output schema)

For each verified candidate, capture in the staging JSON:

```json
{
  "discovery_session": "manchester-2026-05-26",
  "gap_query": "the failing query that triggered this discovery",
  "candidate": {
    "funder": "Funder Name",
    "title": "Programme name (if known)",
    "primary_url": "https://funder.example/",
    "apply_url": "https://funder.example/specific-programme/",
    "themes": ["sector", "sector"],
    "amount_range": "£X-£Y",
    "status": "open|between_rounds|rolling|sunset",
    "eligibility_structures": ["registered_charity", "cic_guarantee", ...],
    "geographic_scope": "...",
    "discovery_source": "Claude WebSearch | manual research | etc.",
    "triage_status": "pending|verified|rejected",
    "triage_notes": "URL resolves: yes/no. Already in catalogue: yes/no. Notes."
  }
}
```

After triage, verified candidates get promoted to the standard `staged-<source>-<slug>` row format used in `data/catalogue-session-stage/*.json`.

---

## What NOT to do

- **Don't trust Claude's funder details verbatim.** Amount ranges, deadlines, and eligibility text need to be verified against the funder's own page before ingest. Claude can hallucinate plausible-sounding numbers.
- **Don't skip the URL-resolves check.** A 404'd URL is the cleanest no-go signal.
- **Don't insert without admin review.** Discovery candidates flow through the same `is_active=false` → Needs Review → admin activation gate as all manual rows. Never bypass.
- **Don't run discovery against gaps that already have a known catalogue path.** If we have a scraper queued for Forever Manchester sub-funds, don't also run a discovery query — wait for the scraper output.
