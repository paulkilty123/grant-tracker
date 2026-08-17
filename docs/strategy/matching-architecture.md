# Matching architecture — where signal lives, and why it stays structured

**Status:** decision note, 17 June 2026. Written so the matcher-v2 work doesn't drift toward a semantic/embedding rewrite. Reads with the match-feedback findings (`docs/matcher-feedback-findings-2026-06-14.md`) and the goal-agent build spec.

## The settled position

1. **The deterministic matcher (`matching.ts`) stays structured and deterministic.** Fast, cheap, explainable, verifiable. It is the free-tier acquisition engine and the agent's input. Tune it; do not rebuild it; do not put per-match LLM/embedding inference in its runtime path.
2. **The org's free-text "what we do" is underused signal — but its home is ingestion-time tagging, not runtime semantic similarity.** Use the existing classifier/LLM to derive accurate sector/niche/beneficiary tags from the org's mission and website (and to keep grant tagging tight). Tag quality is ~80% of the match-quality gap, so better tags feeding the structured matcher is the highest-leverage improvement. "Use the description" = "use it to produce better structured tags," not "compute similarity at match time."
3. **Genuine semantic judgment belongs in the agent (paid Companion).** Understanding an org's situation and judging fit against the goal + verified data is what the reasoning core is built to do, and it's the defensible tier. Don't duplicate it in the free filter.

## Why semantic matching would make the current problems worse (the counterintuitive bit)

The reported failures are **precision** problems (a music grant surfacing for a literacy org; wrong-area grants), not **recall** problems. Embedding similarity rewards topical closeness — and a music grant *is* topically close to a creative-arts-for-young-people org. A semantic-similarity score would rank that music grant **higher** for Little Green Pig, not lower. The thing that correctly separates them is the **structured niche tag** (music vs literacy); same for geography, where only the structured `location_tag` captures the restriction (descriptions can be topically identical). Semantics helps find *missed* matches (recall); it actively hurts when excluding topically-similar-but-wrong ones (precision) — which is 85% of the match feedback.

**The clincher:** in both cases that prompted this (LGP, IoI), the structured tags were already *correct* — the orgs were tagged literacy/stem, the grants tagged music. The failure was pure plumbing (the `grants_with_funder` view dropped `niche_tags`), not a missing semantic layer. Neither case needed semantics; both are fixed by structured tags + the view fix. Strong evidence the structured approach is sound; the gaps are data-plumbing and tag-quality.

## When semantics *would* earn a place (later, bounded)

Only if **recall** becomes the proven problem (orgs missing relevant grants whose tags don't capture their phrasing). Then: precomputed embeddings (offline, at save/ingestion — never per-match), used as a small recall booster / tie-breaker *within* the structured candidate set, never as a primary ranker. Low priority while precision is the pain.

## Sequencing for the matcher-v2 work

1. **View fix — DONE 2026-06-17.** `grants_with_funder` now exposes niche_tags + income/si/prog/ik fields (it had silently dropped them — "view drift"). This was the correctness floor: the matcher couldn't be fairly evaluated while blind to its own inputs.
2. **Re-measure** against the match-feedback cases + `golden-queries` now the matcher can see its inputs. Expect the view fix to clear several patterns (niche over-match, income eligibility) on its own. The golden-queries baseline will shift — that's correct, not a regression.
3. **Bounded, evidence-led tuning pass** on what's genuinely still broken: geography (rank → gate), and the niche down-weight gap (the specialism dampener needs *both* sides to carry niche tags, so a grant with a specialist niche surfacing to an org with *no* niche tags isn't dampened). Tune against observed failures; mind the three `primaryDomainMismatch` veto paths.
4. **Not a ground-up review/rewrite.** The matcher is the ~70%-reproducible commodity layer the strategy gives away free — invest effort in the agent and the data, not in matcher sophistication.

## Process lesson banked

The view-drift bug (view silently dropped columns the matcher reads) means: **any new `scraped_grants` column the matcher or eligibility engine reads must be added to `grants_with_funder`, or it goes dark on every surface.** Schema source updated (`supabase/schema.sql`) with an inline warning at the view definition.
