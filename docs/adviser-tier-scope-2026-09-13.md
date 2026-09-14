# Adviser tier: suggested scope

For Paul, 13 September 2026. A working scope, not a spec. Feasibility notes use Code's 12 September review: built, close, far.

## Purpose

Adviser is the tier where Shoots stops being a tool you use and becomes a colleague who holds the fundraising in their head. Below Adviser, the agent responds to what the user has done. Adviser decides what they should do next, and works when nobody is logged in.

It exists for three reasons:

1. It is the value the whole product is built towards. Match and Apply are entry points.
2. It is the part nobody can copy from a search box: the verified catalogue, a plan, and what happens after.
3. It replaces work that organisations currently pay consultants for, or go without.

## The one rule

The intelligence is the same at every tier. What changes is what the agent can see and do.

| Tier | The agent | Sees |
|---|---|---|
| Match | reacts to what you saved | your bookmarks |
| Apply | keeps your pipeline honest | your pipeline |
| Team | works across organisations | several organisations |
| Adviser | plans ahead and acts unasked | everything, all the time |

This keeps the principle that depth scales with capacity, not price. Cheaper tiers are not made dumber; they are narrower.

## What stays below Adviser

Included here so the line is visible. None of this is Adviser.

- Match: a plain-English line on every match saying why you qualify. Watches bookmarked funders and tells you when a round reopens or criteria change. Deprivation data on the profile.
- Apply: deadline and stewardship nudges from the pipeline. Bid review inside the builder (built). One-click applied, won, declined.
- Team: a view of what is due across all organisations. A monthly plan per organisation, forwardable.

## Adviser scope

### 1. The goal

The user sets a target: amount, date, and how much must be unrestricted. Adviser recommends the mix, tracks secured against target, and says every week what the gap is and which three moves close it.

Status: built and validated against a real pipeline. This is the anchor feature and should be the first thing an Adviser user sees.

### 2. The plan that runs itself

A weekly email built from the goal, not from bookmarks. Three moves, each with one line of reasoning in the funder's terms. One-click actions to record what happened.

Status: close. The digest builds and rotates a list. Choosing three by fit, deadline and effort is a scoring change. One-click links are needed for outcomes anyway.

### 3. Watching funders

Adviser watches every funder relevant to the profile, not only saved ones. Criteria changes, reopenings, quiet closures and new programmes are surfaced to the user with the source and the date checked.

Status: close. The verification engine already sees this nightly. The gap is that only the admin reads it. This is plumbing, and it is what makes the "always on" claim true.

### 4. Funder dossiers

For any funder in view: what they fund, what they gave last year and to whom, average award, what they refuse, when they reopen, who to write to. Every line cited.

Status: far. Depends on importing 360Giving. Free data, deferred since July, and the single most valuable data job on the list. This is the feature that closes the gap with Fundin.

### 5. Readiness

For CICs, social enterprises and ventures: what kind of money fits now, what fits in a year, and what to have ready. Repayable finance, blended finance, contracts and programmes as stages, not just a list.

Status: close. Structure gates are built. Needs trading income and years operating on the profile, and a small rule set.

### 6. Outcomes and learning

Wins and declines recorded with reasons. Over time: "this funder has declined you twice for size, stop applying" and "organisations like you were declined here first time and won the second". Anonymised and opt-in across users.

Status: recording is close (same one-click mechanism as item 2). The cross-user signal needs volume and is a later phase. Every month without recording is data lost, so recording starts at every tier, and Adviser is where it is used.

### 7. Stewardship and reporting

Drafts from the pipeline at the right time: the thank you, the six-month update, the report from what was promised, and the "we are applying again" note. Report dates held as obligations.

Status: close. The pipeline knows the won date. Drafting is a digest rule plus the material bank.

### 8. Evidence of need and the evidence pack

Indices of Multiple Deprivation and neighbourhood data for the organisation's postcode, linked to local and national priorities, ready to drop into an application. One evidence base, reshaped for funders, investors and commissioners.

Status: deprivation data is close (needs a postcode field). The multi-audience evidence pack is far and belongs with contracts.

### 9. Board report

A one-page income forecast against target, monthly, generated.

Status: close once the goal is in use. Output only.

### 10. Contracts and tenders

Local authority commissioning, framework agreements, corporate procurement with social value weighting, as a feed matched to delivery capability.

Status: far. Nothing in the catalogue. Contracts Finder has a free API but tenders need their own review gate. Not before November. The most distinctive item and the least built.

## Out of scope

- CRM integration. A different product and buyer. Revisit when a large organisation will pay for it.
- Ghostwriting. Adviser scaffolds and checks. The human writes the sentences that matter.
- Chat as the main interface. Adviser lives in email and the plan, not in a conversation.
- Funders on the network. The endgame, but it needs profiles and outcomes first.

## Dependencies, in order

1. Digest on a cron for every profile. Without this, nothing in Adviser is true.
2. One-click actions in email. Serves the plan, outcomes and the decline nudge.
3. Postcode, trading income and years operating on the profile. Three fields.
4. Engine changes surfaced to users.
5. 360Giving import.
6. Contracts feed, from November.

## How it is sold

Adviser is a per-organisation add-on, not a fourth rung above Team. A charity adds it to itself. A consultant adds it to the clients who need it. This avoids Team-with and Team-without variants.

## Pricing shape

No number set here; the 5 September decision stands and the review is in December. The anchor is not Apply but consultant days. Adviser replaces a few days a year of the work a fundraising consultant sells (funding search, strategy, bid review, evidence of need). It can sit well above Apply, likely two to three times, and still look inexpensive. Copy should say "a fraction of a consultant's day rate" and never name a competitor.

## Naming

The features below Adviser get plain names: alerts, nudges, the monthly plan. The word Adviser is reserved for the tier. If every tier has "a version of Adviser", the upgrade looks like more of the same.

## Risks

- Cannibalising the upgrade. Keep the Match plan reactive (three things from what you saved). The plan that sets a target and works out the mix is Adviser only.
- Claiming always-on before it exists. Cron first, then the claim.
- Building four tiers at once. Ship the Match and Apply pieces first; they are mostly digest rules. Adviser stays allowlisted while it earns its price.
- Consultants and the connector. The connector binds the oldest organisation. Confirm it is fixed before selling Team or Adviser to consultants.

## Open questions

- Which of the four allowlisted Adviser organisations should be the pilot for the weekly plan?
- Does the goal need a restricted/unrestricted split at launch, or is a single target enough for small organisations?
- Who owns outcomes data in partnerships, including Crowdfunder?
- Is the first evidence borrow deprivation data (a day's work) or 360Giving (a big import)? Recommendation: deprivation first.
