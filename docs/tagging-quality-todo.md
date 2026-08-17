# Tagging quality — consolidated to-do

**Created:** 17 June 2026. Pulls the scattered tagging items (match-feedback review, catalogue audit, four memories) into one actionable brief. **Why now:** the `grants_with_funder` view fix (17 Jun) means tags finally reach the matcher end-to-end — before it, even perfect tags were dropped, so this work pays off in match quality only now.

## Use the tools that already exist

- **Tagging Quality dashboard** — `/dashboard/admin/quality` (`src/app/dashboard/admin/quality/page.tsx`). Catalogue-wide field coverage (worst-first), sector/beneficiary distribution, and **provenance** (who set each tag: admin / ai / scraper / seed) for the four most-debated fields (impact_sectors, target_beneficiaries, eligible_structures, funder_brief).
- **Tag Audit** — `/dashboard/admin/urls?tab=tag_audit`. The per-grant worklist.
- **Re-classify by ID list** admin panel (shipped 2026-05-19) + `scripts/classify-grants.mjs` — re-run the classifier on targeted rows / in batch.
- **Classifier** — `src/lib/classify.ts` (19-sector taxonomy + funding type + structures + niche).

So monitoring + worklist + re-run tooling all exist. This doc is the **accuracy + prompt-fix** work those surface but can't perform.

## The honest reframe — coverage is good; the lever is accuracy + selective niche

Live counts (607 active-published; dashboard shows 653 incl. inactive-published — use the dashboard as canonical):

| Field | State | To-do? |
|---|---|---|
| impact_sectors | 0 empty | Coverage done. **Accuracy** is the question (not visible by count). |
| funder_brief | 0 null | Present everywhere; **depth** varies (the upstream lever). |
| target_beneficiaries | ~2-5 empty | Done. |
| eligible_structures | ~64-72 empty | **Targeted** charity-only marking — NOT bulk-fill. |
| niche_tags | 393 empty (65%) | **Selective** — only specialist grants need them. Not on the dashboard. |
| deadline / amount_max | 73% / 79% "coverage" | Mostly **legitimate absence** (rolling / `amount_undisclosed`). Not tagging to-do. |

The match-quality gap is ~80% tag *accuracy/depth*, not blanks (memory: classifier under-tagging is a v1 dependency). So this is a targeted accuracy job, not a big fill.

## The to-do, in order

### 1. Classifier prompt fix — structures under-tagging — DONE 2026-06-17 (pending deploy + re-run)
`src/lib/classify.ts`. Evidence (20-row sample): the failure is narrow and specific — **when the text explicitly names CICs/social enterprises as ELIGIBLE, the classifier drops the CIC structure** (e.g. BBC Children in Need "Registered charities, CICs and community groups" → just `[registered_charity]`; Asda Foodbank; Ernest Kleinwort Medium; TheGivingMachine). It correctly *excludes* CIC where text says "CICs cannot apply" (Hedley, Chapman, London Catalyst). So it's not a community-foundation-charity-only problem per se — it's **explicit-CIC-eligible → CIC omitted**.
Fix applied: an **explicit-mention INCLUSION hard rule** (rule 1) — if a type is explicitly named eligible, MUST include its mapped values even when charities are named first; does NOT fire on silence or on exclusion phrasing — plus a compound-phrasing mapping row. Safe by construction: it only adds structures on explicit naming, so it cannot revive the 189-row over-tagging (which came from *guessing* from funder type/sector). tsc clean.
**~78 active-published rows are likely CIC-under-tagged** (CIC/social-enterprise named eligible, `cic_guarantee` absent) — the scoped re-classification target to verify the fix before any wider batch. Matches the ThirdSpace CIC-leakage. Memory: [[project_structures_undertagging]].

**NOT classifier-prompt fixes (scope correction, 2026-06-17):**
- **Geographic path-3** — `classify.ts` does NOT handle location at all (sectors/structures/niche/beneficiaries only). The location fix lives in the enricher/scrapers, not here. Separate workstream. Memory: [[project_mcp_geographic_two_layer_mismatch]].
- **Sector-label drift** — the slugs already match across classify.ts / types / matching.ts; this is a display-label alignment audit across files, not a prompt change. Memory: [[project_sector_label_drift]].

### 2. Selective niche enrichment — INVESTIGATED 2026-06-17: no action needed (filling would HARM)
Of 392 niche-empty grants, only 43 are creative-sector and 33 sport — the only sectors where orgs set niches, so the only place the dampener fires. **Reviewed all 43 creative + sampled sport: every one is a GENERAL arts/cultural/community/sport funder, not sub-sector-specific** (Baring, Gulbenkian, Paul Hamlyn arts-based-learning, Hugo Burge; general community/youth-sport funders). The genuinely specialist grants (Music for All, Youth Music, the Arts Councils) **already carry niche tags**. So the empties are *correctly* empty.
**Do NOT bulk-classify the niche-empty set.** Forcing a niche onto a general funder would make the specialism-conflict dampener (×0.45) wrongly bury it for orgs with a different niche — active harm. The IoI-class gap (specialist grant + blank niche) effectively doesn't exist: specialists are tagged, generals are blank, which is the correct shape. Verified, closed.
**Optional follow-up (different task):** a *precision* audit of EXISTING niche-tagged grants (any wrongly tagged → over-dampening?) — quality of present tags, not filling blanks. Lower priority; LGP analysis suggested existing creative niche tags are accurate.

### 3. Eligible-structures: targeted charity-only marking (~64 rows)
Mark the genuinely charity-only funders so CICs are gated (the ThirdSpace leakage). **NOT a bulk-fill** — over-fill re-creates the over-exclusion bug ([[project_structures_overtagging_resolved]]). Judgment pass via Tag Audit, likely manual rather than classifier.

### 4. Small accuracy fixes
Women sector under-tag (~4-6 rows: 8 mention women/girls, 2 tagged). Fold into the batch.

### 5. Brief depth (the upstream lever)
Briefs are 100% present but tag depth tracks brief depth ([[project_brief_quality_now_binding_constraint]]). Where tags look thin, re-enrich `funder_brief` from source first, then re-classify.

## Two dashboard enhancements (small, high-value)
- **Add `niche_tags` to the coverage list** — the 393-gap is currently invisible there.
- **Flag legitimate-null vs genuine-gap** — amount_max should not count rows with `amount_undisclosed=true` as missing; deadline already pairs with rolling. Otherwise the worst-first list points at honest absence, not work.

## Structures CIC fix — DONE 2026-06-17 (deterministic, not the classifier)

Prompt fix pushed to main (commit `f9dc794f`). **The re-classify-by-ID panel was tried first and FAILED — do not use it for structures.** In explicit-ID mode it honours empty (`honourEmpty = grantIds.length > 0`, route line 352), so when Haiku returned `[]` (it's unreliable/conservative on structures) the panel *wrote* `[]`, wiping 3 of the 6 smoke rows. The classifier is the wrong tool for a field whose correct answer is readable from the eligibility text.

**Fix applied deterministically instead:** 50 rows where the source text explicitly names CICs/social enterprises eligible → set text-faithful structures (CIC included), `field_provenance.eligible_structures` pinned to `admin:tagging_fix_2026-06-17` (admin > ai > scraper, so the crawl can't revert). CIC-eligible pool 327→377. ~28 candidates correctly skipped (Community Shares *excludes* CICs; individual/research grants; non-grants; "likely/inferred" hedges). ~7 residual loose-text matches are correct skips ("CICs should verify" / "no info").

**Step 3 — DONE 2026-06-17 (commit `47b9fc73`):**
1. **Deterministic CIC/structure guard** — `ensureExplicitStructures()` in `classify.ts`, applied at both classify write sites. Add-only; when the source text positively names CICs/social-enterprises (and, for the empty-edge, charities) eligible AND carries no exclusion/uncertainty cue, ensures `cic_guarantee`/`cic_shares` (+ charity types) are present. Conservative negative-cue guard suppresses on "charities only" / "likely" / "cannot apply" / "should verify" / "not companies or CICs" etc. Unit-tested (8/8 cases incl. the Community-Shares exclusion). Guarantees future correctness regardless of Haiku's inconsistency.
2. **Stopped `honourEmpty` wiping `eligible_structures`** — the field is now only written when non-empty; re-classify can never wipe structures to `[]` (clearing is manual-only). `target_beneficiaries` honour-empty retained (Haiku returns those reliably).

**Smoke test first (6 rows)** — confirm CIC now appears AND nothing is over-tagged:
```
0d061c73-9285-4445-a242-6425c7a89995   BBC Children in Need Main Grants
27c436ad-babd-45f4-9214-4de4000d234f   Better Community Business Network Grant Initiative
6e32f1bc-2acd-4e86-bbeb-b73980d141dc   Community Grants Programme (TheGivingMachine)
b6add755-6f1c-453b-9cfe-54e6b88b3f6d   Ernest Kleinwort — Medium Grants
3babd148-b901-41b2-8f88-91b11a87a631   Foodbank Fundamentals Fund (Asda)
39e09339-ca23-4c69-ba13-13997221fd54   Local Community Spaces Fund (Asda)
```

**Then the full 78** (idempotent — re-running the 6 is harmless):
```
6192dca0-0913-47ca-82cb-3891a30eed3a, da45f5fc-31ff-4a5d-9fd9-9821c65b46d7, 0114ad82-c985-4e59-9c5b-791cd5c3f1df, 3babd148-b901-41b2-8f88-91b11a87a631, 99189563-2034-46e8-90dc-5dbfd2dcdd58, 39e09339-ca23-4c69-ba13-13997221fd54, 48495fde-7dfc-42ff-860a-2c63753ce83a, 2d0a123a-2fbd-4fa8-930f-d361d0f21d49, 73f90eb8-c0cb-4cf5-b11e-81d4601f81fa, 0d061c73-9285-4445-a242-6425c7a89995, 27c436ad-babd-45f4-9214-4de4000d234f, 6621aeb1-5ca6-414f-92a9-355b86dac4a7, 6a57acbc-0c38-45f4-ad35-17a79c059f5b, 99a71fd2-fccc-4947-a4fd-4fdd81b58bd0, 9e63bf54-8956-4816-b32d-d164f99ab0ea, d29103be-5800-4beb-920f-205b48a78e78, d679e8d8-0c17-4c9f-aec9-2464bbb2ec9d, 3b90b319-ebd8-448a-af7a-ad85a0e55556, aec5dee3-6c6b-43b4-abe7-92ece9c390c0, 5fcfa9df-c3f9-41c0-8701-417b90dece8e, f375d0d1-f7e5-4393-a078-8b3ab3cec3b4, cc5f93d2-aa9e-4873-aaa9-2a425b8868e1, 283f4277-aca4-4cc1-ae9e-2d2aebcf54f3, de330452-6267-4a05-b612-150df595a02a, 043634a3-19fa-4636-9a0f-d5449163948c, 6bee86de-f50a-4c01-b409-d72a6f4ed686, 759177bd-20e8-4141-821a-93f5ebe820dd, 595ccabb-817c-48a1-9f3d-de394d09a458, bd579490-8767-407b-87c8-64d969215de6, c3718c76-0cb3-405b-901d-6c8ae11e93eb, ecc51127-8d55-40df-aebf-02274d9593ac, e50c4cb8-d335-448c-857d-dc92837ccf84, 45f7e90d-4045-4abb-907c-165d82513c3b, 3e1f3112-b680-408d-a0a5-31ca4c8ea8e0, d38779a7-0873-4f2f-91e2-638739a2eb64, bec586cc-4172-4d15-bb05-5fd5f24c7bb9, 6344f1bf-cc8a-4410-a4b6-f15e200559f5, 5e37d1c3-0cc8-4b9a-9459-086a0d3027cc, 266a1eac-562b-4a32-9d89-f5e42bfaeb4e, 2a73af65-02cd-4bb5-a609-c86309ce0fc3, 1fc7173e-a9af-4efc-bc1d-92c592fd6b2c, 6e6fc005-7390-4000-b43c-8220faafb17b, b3794a4d-7951-4d66-8f16-2b78cbca651e, 75f6bb6d-0784-46a4-a2eb-c2c2978403e1, 1765c329-ba73-4c58-b779-1eb0db6fc87a, 088f1eec-36fa-401f-91ed-bb3d474b5582, 29e9ed97-ea0a-4b23-8a11-50d59ccf85a7, e2caeabf-32ee-46c8-8263-34eecae77e59, cd293f78-a57b-4f6d-b524-84239c1b5328, bad7f78e-e3ee-4b67-8469-01572928b106, 0d40a15e-3341-4f5f-8f93-d19a11ca0fde, 72fc0c20-8491-49e4-bdc8-ad909b13cf50, 368c7f4b-2915-455b-9663-8e2c57d615dc, db1bf0ef-7ba5-406a-95f3-d45da71384fd, 348351e9-432d-45f4-a51a-9763ef4bfd6d, 7f9dfb2d-b9f0-4e5f-8d6b-2fd30a1a2984, 0c6e62c9-7eab-4494-8cb4-f3801a36c8e7, 8687dd37-8bc0-4c35-9830-aa31f9b6eeb3, a93d83d5-6f1a-4170-8327-324c59663b57, b4dd4488-867a-48c2-9853-1250c43865f6, 18d9e659-bfdc-4d37-9625-6e740f7b46e8, 4e036244-6f5c-4c1b-b475-129eaf4e55de, 6e6e8050-27ca-456a-846c-91a1198681fd, 5c396ce2-92b2-40c2-96d0-2c334009acbf, 0b545d02-996a-4269-83d5-544dd7b25367, b6add755-6f1c-453b-9cfe-54e6b88b3f6d, f47db5b5-af42-49c5-b807-ce993c3bd9fc, 6e32f1bc-2acd-4e86-bbeb-b73980d141dc, 0e506d16-9e5c-47e0-aae9-7f3444b3646c, 036a2937-bb8f-4f9e-9840-33a4bd450b33, 85286aab-8a73-4259-ba56-1b7fa99163cf, be050793-3afa-4705-b435-038727a4806f, f4cc6956-affd-496c-9954-09c189ddea02, c32ecdba-2fab-4131-a430-69bf1e6a1cae, 083b94ba-9461-447e-805b-07fc0387c8fe, 1a5b26f7-4ceb-4a08-8f6c-7ea50c450b51, 70c2c973-e718-4d50-9394-8ff7d1092da6, 5438550b-eec4-48a6-8452-f64ebcb32d35
```

**Verify after the run:** (1) the 6 smoke rows now include `cic_guarantee` and nothing spurious; (2) re-check **ThirdSpace Theatre** (the CIC org from the match feedback) — charity-only-looking grants should now read as CIC-eligible; (3) run `golden-queries`. Then proceed to the next item.

## Sequencing
1. Prompt fixes (§1) → 2. batch re-classify the specialist/accuracy subset (§2, §4) → 3. targeted charity-only structure marking (§3) → 4. **re-measure**: golden-queries + the match-feedback cases (baseline shifted after the view fix — expected), and watch the Tagging Quality dashboard move.

## Notes
- Burns **Anthropic API billing** (the classifier), not session tokens. Mechanical with a verifiable end state (coverage %, golden-queries) → good for a focused batch / `/goal` run, not interactive work.
- **Pre-launch dependency** per the strategy. After the view fix, this is the next-highest-leverage match-quality lever.
- Provenance is the accuracy proxy: ai-/scraper-set tags carry more accuracy risk than admin-set — prioritise auditing those.
