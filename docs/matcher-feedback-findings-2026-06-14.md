# Match feedback review — findings + fix-list

**Date:** 14 June 2026. **Source:** `match_feedback` table (the admin feedback page), reviewed in full.
**Bottom line:** 156 flags, 4 users, 85% negative — but it is real, recent, free cohort signal and **not** a wrong-profile artefact (avg scores differ healthily by user, not the uniform ~30% cap). It is concrete matcher-v2 input with named test cases. Feeds [[project_post_launch_matching_workstreams]].

## Volume + who

- 156 flags, all in the last 60 days. 132 down / 24 up.
- Concentrated in two cohort members: **Institute of Imagination** (Newham registered charity, education/creative/community — 94 flags, avg 58) and **ThirdSpace Theatre** (Brighton CIC, creative/disability/health — 55 flags, avg 40). Remainder: a few from Philomina (Asian Community Concern) / BankAbility.
- Profiles checked — neither shows the wrong-`legal_structure` signature, so this is genuine matcher/catalogue signal (per [[feedback_verify_profile_before_blaming_match]]).
- Score-band pattern: negatives cluster at 40–55 (weak mid-band discrimination); positives at 64–73. Most damaging are the high-score false positives at 78–82 (top of the list).

## The four patterns, ranked by impact

### 1. Geography — dominant volume ("Wrong area" repeated ~20×)
Newham charity downvoting grants for other boroughs (Wandsworth, Lewisham), the North, and Somerset CF — at scores 18–44. Root cause: **matcher-logic** — `location` is a rankable dimension (max 25), not a gate, so a correctly-tagged regional grant still surfaces to an out-of-region org because the sector match carries it. The filter-vs-rank class ([[feedback_filter_vs_rank_silent_exclusion]]). Borough nuance: London boroughs are both "London" and specific, so a Lewisham-only grant scores ~44 for a Newham org.
- **Data assist:** 34 active grants (5.5%) had null `location_tag` → read as national, surface everywhere. **FIXED 2026-06-14** (all 34 are national funders → set `'UK'`; see actions).

### 2. Niche over-matching — the trust-damaging high scorers
"Not a music org" at **82**; Music for All, Youth Music Trailblazer, Arts Council grassroots-music, Theatres Trust all surfacing to a general creative/education org. Root cause: **matcher-logic** — rewards the `creative` sector match but doesn't down-weight when the grant *requires* a niche (`music`, `theatre`) the org lacks. Highest scores → worst for trust.

### 3. CIC structure leakage (ThirdSpace)
"CICs aren't funded according to their website" / "Says only registered charities" at score 44 — charity-only grants shown to a CIC. Root cause: **data** — 64 active grants (10%) have empty `eligible_structures`, so the engine can't gate a CIC out. **Nuance (do NOT bulk-fill):** empty is often *correct*; over-filling re-creates the over-exclusion bug ([[project_structures_overtagging_resolved]] / [[project_structures_undertagging]]). The fix is targeted — mark the genuinely *charity-only* funders so CICs are excluded, not fill all 64.

### 4. Freshness / lifecycle
"Already closed — was open Feb–March" at **78**; "will only fund existing grantees" at 69. Root cause: **data** — `open_status` null on nearly all flagged grants, so the matcher can't down-rank closed/invite-only. Closed grant at 78 = sharpest single trust hit. Ties to [[project_deadline_systemic_redesign_pending]].

## Systemic sizing (active published = 617)

| Issue | Count | % | Note |
|---|---|---|---|
| null `location_tag` | 34 | 5.5% | all national funders → FIXED to 'UK' |
| empty `eligible_structures` | 64 | 10% | do NOT bulk-fill (over-exclusion); target charity-only only |
| `open_status` null on flagged grants | most | — | freshness gap; ties to deadline redesign |

## Matcher-v2 test cases (named, from real feedback)

- **Geo gate:** Somerset CF grant must NOT surface to a Newham/London org; a Lewisham-only grant must rank well below a Newham/pan-London grant for a Newham org.
- **Niche down-weight:** Arts Council "Supporting grassroots music" / Music for All / Youth Music Trailblazer must NOT score 78–82 for a non-music creative org (IoI).
- **CIC structure:** charity-only grants must be ruled out (not scored 44) for ThirdSpace (CIC).
- **Lifecycle:** a closed dated round (Genting 2025/26) must not score 78 for anyone.
These become golden-set-style regression checks when matcher v2 is built. Re-read `matching.ts` first — mind the three `primaryDomainMismatch` veto paths ([[feedback_matcher_three_veto_paths]]) — and the `/api/admin/golden-queries` matcher suite.

## Actions

**Done 2026-06-14 (prod writes, Paul-approved):**
- 34 null `location_tag` → `'UK'` (all confirmed national funders), `location_tag` pinned in `field_provenance` so the crawl/enricher can't silently revert ([[feedback_scraped_field_fixes_revert]]).
- **Genting Good Causes Fund 2025/26** — closed round still marked open, scoring 78 to a Newham org: `open_status='closed'` + deactivated (archived). Re-activate when the 2026/27 round opens.

**Staged for Paul's nod (judgment calls, not bulk):**
- **Albert Hunt Trust** ("only fund existing grantees", score 69) → recommend `is_invite_only=true`. Reversible; confirm it's permanently invite-only vs a one-year state before applying.

**Not actioned (deliberate — matcher-v2 / careful work):**
- Geo gate + niche down-weight = `matching.ts` logic, post-launch per delivery plan; don't patch piecemeal (veto-path risk).
- Charity-only structure marking = targeted data pass, not bulk-fill; fold into the next classifier/structures pass.
- "Tried previously / didn't get anywhere" (Crowdfunder, score 34) = user history, not a catalogue error — correctly left.

---

## Addendum 2026-06-17 — view-drift fix + two refinements surfaced by Little Green Pig

The `grants_with_funder` view was silently dropping `niche_tags` + income/si/prog/ik columns, so niche exclusion/boost + income gate + investment/programme/in-kind eligibility were dark on every surface. **Fixed 2026-06-17** (view + `supabase/schema.sql`); see [[feedback_view_drift_matcher_blind]]. This was the correctness floor — re-measure matcher-v2 against `golden-queries` + the feedback AFTER this, since the baseline shifts (expected, not a regression). Verified working on LGP: 28 music/performing-arts grants now correctly suppressed, zero tagging leaks.

**Matcher-v2 item — temper the excluded-niche cap when the grant ALSO matches a wanted niche.** The excluded-niche cap (`matching.ts` ~1453) caps any grant whose niche tags overlap the org's `excluded_niche_tags`, *without* checking whether the grant also matches a niche the org selected. Worked example: **Little Green Pig** (creative-writing/literacy; excluded music/theatre/dance/crafts/visual_arts; selected literature/literacy_numeracy) now has **Arts Council England National Lottery Project Grants suppressed** — its niche tags `[visual_arts, theatre, music, literature]` trigger the exclusion, even though it carries `literature` (LGP's wanted niche) and is plausibly LGP's single most relevant major funder. This is a *false negative* (the invisible, dangerous kind). Fix: when `grant.nicheTags ∩ org.niche_tags` (wanted) is non-empty, skip or temper the exclusion cap — "exclude music" should mean "don't show music-*focused* grants," not "hide every multi-artform grant that also funds music." Regression case: Arts Council Project Grants must surface (not cap to 35) for LGP. Also a possible onboarding-UX note: striking off everything-but-one-niche is more aggressive than users may intend (it removes broad funders that include their niche).

**Verified correct, no change needed — local orgs do NOT bury national grants.** Checked on the LGP `geographic_reach='local'` question (location logic `matching.ts` 558–632): a UK-wide grant scores `locationScore=12` with `locationMismatch=false` (no cap) — it surfaces normally and competes on sector/beneficiary/size. Only grants restricted to a *different* specific area (Scotland/Wales/other region/borough) get `locationMismatch=true` → capped at 15 for a local/regional org. A local-to-the-org grant gets the +8 bonus (→20). So a UK-wide funder ideal for local delivery surfaces fine; it just isn't boosted the way an own-area funder is. The only tuning judgment (not a bug): whether national's 12-vs-local's-20 gap is right — arguably national deserves slightly above 12 for a local org since UK-wide = full eligibility. Low priority.
