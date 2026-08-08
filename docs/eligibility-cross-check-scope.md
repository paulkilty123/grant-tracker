# Eligibility cross-check — scope (revised)

**Date:** 2026-08-08
**Status:** scoped, not built.
**Origin:** Paul spot-checked Wee Grants (The Robertson Trust, Scotland-only) and
asked why `scio` had been removed. Two separate bugs sat on that one row.

---

## The two failure directions

**Removed a form the funder accepts.** The classifier read "registered
charities", did not see the literal string "SCIO", and treated the absence as
exclusion. A SCIO *is* a Scottish registered charity. The fund went invisible to
its core audience.

→ **Fixed.** `src/lib/structure-equivalents.ts` derives equivalent charity forms
at the write boundary in `mergeGrantUpdate`, so it survives every future
classifier pass. Backfilled 2026-08-08: 273 rows written, 82 skipped as pinned.

**Kept forms the funder bars.** The same row carried `cic_guarantee`,
`ltd_guarantee`, `ltd_shares` and `cooperative` while its own text said *"Cannot
be … Community Interest Companies, Limited Companies, or Community Benefit
Societies unless registered as charities."* Live to users, so a CIC could have
written a bid it was barred from submitting.

→ **This document.** Nothing cross-checks the brief's exclusions against the
structure tags.

---

## What the sample forced

A naive detector — negation clause followed by a structure name within the same
sentence — was run over the live catalogue. It found 4 rows. **One was real, one
was a clear false positive, two were unresolvable.** Right one time in three.
That result drives all three changes below.

### 1. Carve-out clauses suppress the flag entirely

Not downgrade it — **suppress**. The original scope had `unless`/`except`
lowering severity from critical to check. The sample shows a carve-out can
*invert* the meaning outright:

> Good Things Foundation: *"not eligible **unless** they are Community Interest
> Companies, have clear social purpose, or are strategic partners"*

The negation is followed by "Community Interest Companies", so the pattern
fires — but CICs are precisely who *is* eligible. Removing that tag would have
hidden the fund from its intended audience. A downgraded flag still puts a
correct row in front of a reviewer as a suspected error, and reviewer attention
is the scarce resource this whole surface exists to protect.

When `unless`, `except`, `other than` or `provided that` appears in the matched
clause, emit nothing.

### 2. Every flag must quote its triggering sentence

Two of the four could not be judged because the phrase that caused the match was
not recoverable:

- **Network for Social Change** — flagged on `Ltd`, but the exclusion sentence
  extracted as `null`. Something matched across a field boundary in the
  concatenation of `who_can_apply` + `exclusions`.
- **The Fore** — exclusion sentence was the bare words `"not eligible"`, with no
  visible object.

A flag that cannot show the sentence that produced it is unreviewable, and an
unreviewable flag is worse than none: it costs attention and yields no decision.
Same principle as the enrichment citations — the evidence travels with the claim.

Match against `who_can_apply` and `exclusions` **separately**, never a
concatenation, so the quote is always attributable to a real sentence in a real
field.

### 3. Ships at `check` severity, never `critical`

Precision on the only real sample was 1 in 3. `critical` blocks publication, and
a false block hides a real fund from everyone — the more expensive error by the
gate's own standard. It surfaces in the Inbox for a human and blocks nothing
until precision is demonstrated on a reviewed batch.

Promote to `critical` only when a run over the live catalogue produces a set a
human confirms is mostly right.

---

## Shape

A new code `structure_contradicts_brief` in `deriveReviewReasons()`, severity
`check`, classified `'info'` in the publish gate's `POLICY`. The exhaustive
`Record<ReviewReasonCode, …>` means adding the code without classifying it fails
`tsc --noEmit`.

Detection, per structure, per field:

```
(cannot be|not eligible|are excluded|do not fund|
 will not fund|are not accepted|ineligible)  [^.]{0,120}  <structure synonym>
```

`[^.]` is load-bearing — it stops a match crossing a full stop and pairing an
exclusion in one sentence with a structure named in the next.

Then: suppress on carve-out, capture the matched sentence, emit with the quote.

**Out of scope:** inferring structures the brief implies but never names. That is
the classifier's job, and widening a detector into a tagger is how it stops being
trustworthy.

---

## Parked — needs a full brief read

Both were left unresolved on 2026-08-08 and **were not edited**:

- **The Fore — The Fore Grants Programme.** Tagged `registered_charity, cio,
  cic_guarantee, cooperative`. Exclusion text extracted as the bare `"not
  eligible"` with no object, no carve-out. Genuinely suspicious; unjudgeable from
  stored text.
- **Network for Social Change — Grants.** Tagged `registered_charity, cio,
  ltd_guarantee, unincorporated`. Flagged on `Ltd`; triggering sentence not
  recoverable. Also carries a pinned `eligible_structures`, so the backfill
  skipped it — a prior admin decision is in play and should be understood before
  anything overwrites it.

Read both funder pages, decide, then use them as the first precision test for
the detector above.

---

## Also outstanding

**Scottish place names are not matched.** `structure-equivalents.ts` matches the
word "Scotland" but not Glasgow, Edinburgh, Highland, Fife, Aberdeen, Dundee,
Lanarkshire, Ayrshire. Virgin Money Foundation (`"North East England &
Glasgow"`) gained `cio` but not `scio` in the 8 August backfill. A miss, not a
bad write — the backfill is incomplete rather than wrong. Add a place-name list
and re-run.

**The exclusion guard is untested.** `EXCLUDES_INCORPORATED_CHARITY` suppressed
0 rows, because no row currently carries exclusion text naming SCIOs or CIOs as
barred. Wired and correct by inspection; never exercised against real data.
