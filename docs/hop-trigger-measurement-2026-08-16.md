# Is the silence a ceiling or an artefact?

Measured 16 August 2026, before building anything. Report: `reports/hop-measurement-2026-08-16.json`.
Instrument: `scripts/measure-hop.ts` on branch `exp/hop-measurement` (not merged, writes nothing).

## The question

The catalogue records **1,415 silences** — fields where a page was read and said
nothing. The surface renders two very different things identically:

- the funder genuinely does not say, anywhere
- the funder says it one click away, and we never looked

The first is a fact about the funder. The second is a fact about us. Which one
dominates decides whether widening the hop trigger comes before the eligibility
requeue or is beside the point.

## Method

346 live rows carry both a page-read stamp and at least one silence. They split
into three populations that fail for different reasons, and a single average
across them would hide the one that matters:

| | rows | silences | what it tests |
|---|---:|---:|---|
| **A** timing answered, never hopped | 202 | 560 | the hop is **structurally incapable** of firing here today |
| **B** timing unanswered, nothing came from a 2nd page | 101 | 415 | the hop had every reason to fire and produced nothing |
| **C** timing unanswered, a 2nd page did settle something | 43 | 168 | the ceiling: does more targeting help where a hop already runs? |

60 rows sampled (30 / 18 / 12), deterministically by id so a re-run draws the
same set. Each re-verified with the hop firing on **any** unanswered field
rather than only unanswered timing. A gain is a field that has a definite
answer now and had none before.

## The answer: an artefact, but not of the page count

**47 of 60 rows (78%) gained an answer they did not have.** So the silences are
overwhelmingly an artefact. But the cause is not the one the widening addresses:

| where the gain came from | rows |
|---|---:|
| **page 1** — the eligibility extraction merged this afternoon | **38** |
| a second page | 9 |
| nothing gained | 13 |

And of those 9, **seven are stratum C — rows that already hop today** under the
existing timing trigger. Stratum A, the only population where a widened trigger
is the sole thing that could fire, produced **2 gains in 30 rows**. Stratum B
fetched a second page 12 times out of 18 and gained **nothing at all**.

The mechanism is plain once you look at when the hop actually fired: in stratum
A only 11 of 30 rows fetched a second page, because in the other 19 the
extraction answered on page 1 and no hop was earned.

> **The 1,415 silences are mostly the extraction never having asked, which is
> already fixed and merged. They are not mostly a page-count problem.**

### An earlier draft of this document said the opposite

The first pass through the data reported **31 of 60 resolved by a hop**. That
was a trailing slash. `pagesRead` is normalised (`/apply`) and evidence carries
the fetched URL (`/apply/`), so a string comparison counted almost every page-1
fact as coming from a second page. Wise Music Foundation appeared as a hop
success sourcing a structure gate from a privacy policy; the facts were on page
1 all along. Corrected in the analysis, and the corrected figure is the one
above.

## What a second page is still worth

The two stratum-A gains are not nothing. Berkshire's Grassroots Grants — the row
that produced the false confirmation last week — resolved its structure gate and
three exclusions off `/who-can-apply`:

> Be not for profit This includes: Registered charities Charitable Incorporated Organisations (CIOs) Community Interest Co…
> We are unable to fund: Individuals Projects primarily delivered outside of Berkshire Retrospective costs…

Extrapolated, the widening is worth roughly **13 of the 202 stratum-A rows**, for
about £0.30 of extra fetching. Cheap, real, and an order of magnitude smaller
than the requeue.

## What is genuinely unanswerable

13 of 60 got nothing:

- **8 followed a second page and it still said nothing.** Fidelio, Trust for
  London, the Mercers' Company. These are real silences.
- **3 were unreadable** — a link problem, not a silence problem.
- 1 had nothing to follow, 1 earned no hop and gained nothing.

So roughly **a fifth of silences survive a second page**, and about a sixth of
those are actually dead links wearing a silence costume.

## Multi-fund landings: zero

Paul's rule — a hop landing on a page describing several funds must extract
nothing and put the row on the split list — is **built and tested**, and it
**fired zero times in 60 rows**. It is insurance, not a fix.

The worked example does not hold up either. Our Greggs Foundation rows are
already split three ways, and the front-door row is **archived**:

| title | apply_url | live |
|---|---|---|
| Community Action Fund | `/grants/community-funding` | yes |
| Greggs Foundation — Local Community Projects | `/grants` | no |
| Greggs Foundation Grants | `/` | no |

The live row already points one level down. (Separately: it holds
`is_rolling: true` **and** a deadline of 2026-08-28, with a `round_closed`
verdict — a contradiction worth its own look.)

## Two real bugs the widening surfaced

Both latent in production today, both reachable the moment the trigger widens.
Fixed and tested on the branch.

1. **`/apply/privacy-policy` passed the link filter.** The noise filter let a
   funding word in the path cancel a noise word in the path. A hop read Wise
   Music Foundation's privacy policy; two others read newsletters. Four junk
   pages were visited across 60 rows — money spent, no fact taken, because the
   gate held. Path noise is now disqualifying outright; only link-*text* noise
   is overridable.
2. **`\bnews\b` never matched "newsletter"** — the word boundary needs a
   non-word character after "news".

A control query confirms production has never done this: across the 59 live rows
that have hopped, 273 facts came from second pages and **none** from a junk
destination. The timing hop scores privacy pages at zero.

## The finding that matters more than any of the above

Of the new eligibility reads, **24 of 39 CONTRADICT what we hold** and 15
confirm. On `eligible_structures` — the matcher's hard gate, which silently
removes a fund from a search — the page disagrees with our tag **62% of the
time**.

| field | confirmed | contradicted |
|---|---:|---:|
| eligible_structures | 15 | **24** |
| exclusions | 13 | 13 |
| everything else | 13 | 2 |

Quality holds up on inspection. Every quote names forms or exclusions directly —
"applicants must be registered charities (i.e. registered with OSCR or the
Charities Commission…)", "we are not able to fund: applications from schools and
other formal education settings". The meaning check is doing its job; none of the
Berkshire-style "you do not meet our general eligibility criteria" sentences got
through. These land as proposals, not writes.

## Recommendation

**Reverse the order.** The requeue was held behind the hop change on the premise
that a one-page pass would come back falsely silent. Measured, it does not: page
1 answers 38 of 60. Holding the requeue costs more than it saves.

1. **Merge the hop widening now** — it is built, tested, and its marginal cost is
   near zero because no hop fires when page 1 answers. Keep the multi-fund rule
   as insurance and both link fixes on their own merits.
2. **Then run the requeue once, with the widening on.** A row that comes back
   silent on page 1 tries a second page in the same run, rather than being read
   twice. This is the "one pass, done properly" you asked for; the measurement
   only changes which pass it is.
   **£5.61 for 668 rows** at the measured £0.0084/row, against £3.87 without the
   widening. £1.74 buys the second page on every row that needs one.
3. **Expect proposals, not silence.** At the measured contradiction rate the
   requeue will raise on the order of **250 structure-gate disagreements** for
   review. That is the actual output of this work, and the actual cost is your
   review time, not the £5.61.

## Not proposed, and why

- **A hop in enrichment.** Enrichment has *no* hop at all — `fetchPageText`
  strips HTML before returning, so there are no links to score. Adding one means
  plumbing raw HTML through a route that also writes through the provenance
  ladder. That is its own piece of work, not a widening, and the measurement says
  the payoff is small. Deferred, deliberately.
- **Hopping for missing amounts.** The verifier does not extract `amount_min` or
  `amount_max` at all, so there is no silence to trigger on. The fix is an
  extraction change, not a hop, and amounts are the known-hard case — the
  extractor was ~33% wrong on rows ≥£250k. Separate decision.
- **Hopping for thin briefs.** `funder_brief` is not a verified field; the engine
  never reads it. Same reason.
- **A third page.** `MAX_PAGES` stays at 3 (apply_url + two hops). Nothing in the
  data argues for more: stratum B fetched a second page 12 times and gained
  nothing, which is evidence the ceiling is the funder's site, not our budget.
