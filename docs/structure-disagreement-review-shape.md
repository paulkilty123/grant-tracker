# How 250 structure disagreements get reviewed in one sitting

Proposal, 16 August 2026. Nothing built. This is the shape to agree before the
requeue runs, because the requeue is what produces the queue.

## The reframe that changes the size of the job

The measured figure is that on `eligible_structures` the funder's page
disagrees with our tag **62% of the time**. That is a real number and it is not
250 wrong tags.

It is 250 rows where **the page's wording and our tag list do not line up
literally**. Look at what the disagreements actually are, from the 24 measured:

| the page says | we hold | is our tag wrong? |
|---|---|---|
| "Non-profit organisations" | charity, CIO, CIC, ltd by guarantee, co-op, unincorporated | No. Ours is a defensible reading of vague prose. |
| "Charities registered with the Charity Commission or organisations with exclusively charitable objectives" | charity, CIO, SCIO | No. Same meaning. |
| "non-fee paying colleges and schools, charities and other not-for-profit organisations" | charity, CIO | **Yes, we are too strict.** Schools are excluded by our tag. |
| "Businesses must be incorporated" | charity, CIO, unincorporated | **Yes, and in the direction that matters.** |

Rows 1 and 2 are noise from a literal string comparison. Row 3 costs a
fundraiser a fund they could have won. Row 4 sends someone to apply where they
will be refused.

**So the first job of the shape is not presentation, it is classification.** If
all 250 arrive as one list, the two thirds that are wording noise bury the
handful that are actually dangerous.

## Four decision classes, computed in code

The verifier already writes a `proposed` value next to every disagreement. Set
`C` = what we hold, `P` = what the page supports. Every disagreement falls into
exactly one class by set relation, with no judgement required to sort it:

**Correction, 16 August, after reading the engine rather than assuming.** The
first draft of this section proposed computing a set relation on the review
screen. That work already exists. `compareStructures` in `verify-row.ts` returns
`confirmed | widens | narrows | widens and narrows`, and line 1444 writes the
direction into the evidence note as *"the page widens what we hold"*. The note
is persisted on every disagreement, without exception, so the classes are a
**direct read of stored evidence**:

| Class | Stored signal | What it means | Who decides |
|---|---|---|---|
| **1. Confirmed** | `agrees: true` | Page supports what we hold | **Nobody.** Recorded, never queued |
| **2. We are too strict** | note: *widens* | Page admits more than we do | **Bulk accept** per transition, sample checked |
| **3. We are too permissive** | note: *narrows* | Page admits fewer than we do | **Paul, grouped.** Never bulk, never automatic |
| **4. Conflict** | note: *widens and narrows* | Genuine disagreement | **Paul, individually,** with the quote |

Reading it rather than recomputing it matters for more than saved effort. The
engine's comparison already handles what a naive set relation gets wrong: it
decides whether "registered charities" also covers CIOs and SCIOs by reading the
page's own jurisdiction, and falls back to our `location_tag` only where the page
is silent. A fresh comparison written for the review screen would re-introduce
the exact bug that logic exists to fix, where a page naming the Charity
Commission of England and Wales confirmed a row tagged `scio`.

The asymmetry between 2 and 3 is the whole design. Class 2 failing means a
fundraiser never sees a fund they could have won; the fix only ever adds
matches, and the funder's own page is the authority, so it is safe in bulk.
Class 3 failing means we tell someone they are eligible where the funder bars
them. That is the failure rule 6 of `CLAUDE.md` exists to prevent, and it is the
one that costs trust in the catalogue rather than a match. It does not get a
bulk button.

Class 1 is expected to be the largest and it costs nothing.

## What grouping is actually available

Measured against the 700 rows the requeue will touch, not estimated:

| Grouping | Collapses to | Verdict |
|---|---|---|
| By funder | 474 groups | **Weak.** 390 of 700 rows are the only row for their funder |
| By current tag set | 279 groups | Better |
| **By funder, head only** | **18 funders cover 143 rows** | **Strong, do these first** |
| By transition `C → P` | Not yet measurable | **Expected strongest.** Proposed sets come from a small vocabulary |

Two things follow. Funder grouping is not the lever it looks like, because the
catalogue is mostly one fund per funder. But there is a fat head: **18 funders
account for 143 rows**, so 18 decisions clear a fifth of the queue. Those go
first.

The real lever is grouping by transition, because "we hold charity+CIO, page
says charity+CIO+school" will repeat across unrelated funders. That cannot be
measured until the requeue has run, which is the point of showing you the split
before you review anything.

## What you see

One screen, groups not rows, ordered by class 3 first then 4, then 2, then a
count of class 1 you never open.

Each group shows the transition, the row count, the funder's own quote from a
representative row, and the fund titles. Three actions: **accept for all**,
**reject for all**, **open the rows individually**. Class 3 and 4 groups have no
accept-for-all button.

## Sequence

1. Run the requeue. It writes evidence only, changes no user-visible value.
2. Classify the output into the four classes and print the split.
3. **Bring you the split before any review.** If class 3 is 30 rows the shape
   holds and it is one sitting. If it is 200 the shape is wrong and we redesign
   before you spend the time.
4. Review, head funders first.

Step 3 is the check. The claim "one sitting" is not yet proven, and the honest
version is that it is provable cheaply, before you commit any attention to it.

## Non-negotiables carried in

**Approved by Paul, 16 August 2026**: run the requeue, print the class split
before he spends attention, decide the sitting from the split. Bulk accept for
"too strict" only, never for "too permissive".

**And the rule the Greggs row forced, which generalises to this queue:** an
inferred value may not drive an automatic action. There it was a year-less
deadline resolved to a past year, which turned an open fund into a closed one.
Here the equivalent is a proposed structure set the page did not actually
enumerate — "non-profit organisations" is not an enumeration. A class 1
auto-resolve must rest on the page naming the forms, not on the model expanding
a vague phrase into the same set we happen to hold. Where it cannot, the row
leaves class 1 and becomes a proposal like any other.

- Class 3 and 4 never auto-apply, and never get a bulk accept.
- An accepted proposal writes with an `admin:` source, because you decided it.
  An auto-resolved class 1 does **not**, or it pins a value no human reviewed
  and blocks re-enrichment for good.
- Eligibility is never a paid feature. Corrections land on every tier.
