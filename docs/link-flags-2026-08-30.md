# The 174 link-flagged rows are not 174 broken links

Measured 2026-08-30, every page read from production through
`/api/admin/read-page`. No Anthropic call.

## The headline, and what is under it

The verifier's live counts are 74 `wrong_fund`, 59 `multiple_funds`, 41
`no_funding_detail` against 400 verified. Read as "174 rows whose first click is
useless". Opened, they are:

| What the page actually is | Rows |
|---|---:|
| A fundraiser landing here could work out whether to apply, and how | 78 |
| The funder's own site, but a grants index rather than this fund's page | 93 |
| Funder name too plain to judge by matching | 1 |
| Genuinely not this funder's page | **2** |

And both of the two survive only as artefacts:

- **Community Shares — Booster Fund.** The page is Cloudflare's bot check:
  "Performing security verification ... Ray ID: a334e2387c67c5e9". A bot wall,
  not a wrong link.
- **Ernest Kleinwort Charitable Trust.** `ekct.org.uk/grants/` reads 7,029
  characters and opens "Applicants must be organisations registered with one
  year of filed accounts with the Charity Commission in England & Wales or
  Office of the Scottish Charity Register". That is the funder's own grants
  page. It failed only because "Ernest Kleinwort" is not in the first 4,000
  characters and is not derivable from the host `ekct`.

**So the number of rows where the link goes to the wrong fund is, as far as this
can measure, zero.**

## This is the third time this pile has been opened and behaved this way

On 2026-08-21, 51 `wrong_fund` rows: the flag was simply wrong on 10, 26 were a
funder's grants index that Paul had already ruled acceptable ("a link landing on
a funder's homepage is fine and shouldn't appear as a problem"), 11 could not be
read, 4 were certainly wrong. Four of fifty-one.

Today, 174 rows: two candidates, both artefacts.

The pile is not shrinking because rows get fixed. It is not a defect pile.

## What the flags are actually detecting

Not "this link is broken" but "this page describes more than one fund, or
describes the funder rather than the fund". That is true of 93 of these rows and
it is a real product weakness — a fundraiser clicking through to a grants index
has to find their fund again — but it is a different problem with a different
fix, and it is not urgent in the way a broken link is.

## Three mistakes this measurement made, all caught by opening rows

1. **A 4,000-character excerpt is not the page.** Judging "does this name the
   funder" on the excerpt reported `charleshaywardfoundation.org.uk` as not
   Charles Hayward's page. The nav filled the excerpt.
2. **The hostname is evidence and was being ignored.** Adding it removed two of
   the five.
3. **A funder can have no distinctive tokens.** "A B Charitable Trust" loses
   *charitable* and *trust* to the stop list and *a* and *b* to the length
   filter, leaving an empty array — and `[].some()` is false, so a plain name
   read as evidence of the wrong funder. It cannot be. That row now reports
   "too plain to judge" instead of a verdict.

Each of the three inflated the "genuinely wrong" count. None was visible from the
totals.

## What is worth doing instead

Not a link-fixing sweep. Two smaller things:

- **Stop the flags reading as defects.** 171 of 174 are either fine or
  acceptable-by-policy. Whatever surfaces these counts is describing a crisis
  that is not there, and it has now cost three separate investigations.
- **The 93 index pages are a deeper-URL job**, the same shape as the thin-page
  triage on 2026-08-29: find the fund's own page where one exists, leave the row
  alone where it does not. Worth doing, not worth doing first.

---

# The understated class: asked, not yet answered

Egin was showing £15,000 against a published £100 to £35,000. Every sweep so far
has hunted figures we cannot support; nobody had looked for figures BELOW what
the page states, and that class is invisible from any count we hold because an
understated row looks exactly like a correct one.

`scripts/understated-ceilings-2026-08-30.ts` asks the question over all 387
readable published rows with a ceiling. **It is not yet trustworthy and its
number should not be quoted.** Three rounds of output, three classes of defect,
all found by reading the rows it produced:

1. **The reader was inventing billions.** `£25,000 Multi year awards` parsed as
   £25 billion because the unit alternation swallowed the M of "Multi";
   `£2,000 may` became £2 billion, `£200 Maximum` became £200 million. All four
   of the largest "findings" were this. The bug was in
   `/api/admin/read-page` itself, so every caller had it. Fixed with
   `(?![a-z])`.
2. **Directory pages attributed other funders' grants.** Paul Hamlyn's £150,000
   was proposed as the Dixie Rose Findlay Trust's ceiling, because that row's
   apply_url is a Young Camden Foundation listing. Six or more per-grant
   ceilings on one page is now treated as a directory and skipped — 9 rows.
3. **Pool and turnover figures in the other word order.** "We aim to distribute
   around £42,500 per year" and "under £250,000 turnover" both read as
   ceilings; the disqualifiers only covered "distributed" and
   "turnover of under".

### The class is empty

Both survivors were checked against production and neither is understated.

- **Clothworkers' Foundation.** The live row is titled "Small Capital Grants (up
  to £15,000)" and holds £15,000, correct for that fund. The larger programme is
  already its own row, "Large Capital Grants (over £15,000)".
- **Manchester Airports Group.** The £50,000 Flagship Award is London Stansted's.
  Manchester Airport's Community Trust Fund is capped at £3,000, exactly as we
  show. A Manchester charity sent to the Flagship Award wastes an afternoon.

**A fifth false-positive class, and the one most likely to recur: a
fund-specific row measured against a multi-fund funder page.** The other four
are parsing and attribution bugs; this one is a category error, and it will fire
on any funder where we hold one row and the site describes several. Both
survivors were this.

The scan is not being re-run. It was worth asking — the question was invisible
from every count we hold — and the answer is zero. It earned its keep on the
reader defects it exposed instead, one of which (`£25,000 Multi` parsing as £25
billion) was in the shared reader and therefore in every caller. Checked against
production: nothing above £50m exists and the single row at exactly £50m is an
inactive UKRI row, so that bug never reached live data.

What the scan originally reported, before the checks:

- **Manchester Airports Group** — we show £3,000; the page offers a "Flagship
  Award which offers grants of up to £50,000 for larger, capital projects".
- **Clothworkers' Foundation** — we show £15,000, which the page describes as
  the boundary of its SMALL grants: "137 Large Grants (over £15,000)".

So the early read is closer to "one of two" than "one of forty". That is worth
knowing and it is not a finished answer: the filters that removed the false
positives will also be hiding true ones, and false negatives are not measurable
from this side. The re-run against the fixed reader is the next step.

## The excerpt defect had no other callers

Checked before it was forgotten. `/api/admin/read-page` is called by exactly two
scripts, both written on 30 August and both fixed. No production code path asked
a 4,000-character window a question about a whole page.

The nearest similar shape is `containsGrantClosedIndicators` in
`src/lib/url-validator.ts`, which tests the first 30KB for closure wording. It is
safe by direction: it only makes a POSITIVE claim, so a phrase past the window is
a missed flag rather than a false assertion about the page — and the window is
stated in the code. Left alone.

---

# Index-page proposals: the first ten

`scripts/propose-fund-pages-2026-08-30.ts`. Proposes only, never applies — the
17 August hop corrected 14 URLs automatically, at least 4 were wrong or
worthless, and it was reverted.

**Zero proposals from the first ten, and that is the answer rather than a broken
script.** Four were opened by hand to check:

| Row | What the page links to |
|---|---|
| Esmée Fairbairn — Arts, Culture & Heritage | 41 links. The fund does not exist under that name any more. |
| Groundwork — Just About Managing Fund | 0 links. Nothing to hop to. |
| Cash for Kids — Cost of Living | 24 links, every one site nav: Donate, Fundraising, News, Privacy Policy. |
| Arnold Clark Community Fund | 99 links, almost all car marques — Abarth, Alfa Romeo, BYD. It is a dealership site and the community fund page is the fund page. |

Three of the ten (DCR Allen, James Ahern, Eranda Rothschild) are rows whose title
IS the funder: there is no separate fund page to find, because the row is the
funder's general grantmaking.

## The one real finding, and it is not a URL

**Esmée Fairbairn — Arts, Culture & Heritage** already points at
`/apply-for-a-grant/creative-confident-communities-guidance/`, which is the
correct current page. Esmée's three aims are now Our Natural World, A Fairer
Future, and Creative, Confident Communities. "Arts, Culture & Heritage" is the
old name.

So the row's TITLE is stale, not its link. A fundraiser searching for arts
funding finds a name the funder retired; a fundraiser who clicks lands correctly.
Renaming rows is a different job from re-pointing them and it is not in this
script's remit.

## What the first ten say about the other 83

The candidate-hunting premise — that a funder's index links onward to each fund's
own page — held for none of the four sites opened. Two had no onward fund links
at all, one had only site chrome, and one had a retired fund name. Before running
the remaining 83, that premise is worth doubting rather than assuming.
