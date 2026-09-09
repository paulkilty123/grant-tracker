# Waitlist gap 1: men's and older men's wellbeing

Written 2026-09-08. Read-only: nothing in the catalogue was changed.

Serves two waitlist signups: **Men Walk Talk** (men's mental health walking
groups, Cornwall and the South West) and **Men in Sheds Hull** (older men's
isolation and practical skills, Hull).

## The headline, corrected

The gap is real but it is **not** "we hold no funders for these organisations".
It is narrower and more fixable than the row count suggested:

- **Nothing in the live catalogue is addressed to men.** Confirmed against all
  1,991 rows, not a truncated page: zero live rows whose title, description or
  brief is about men specifically. Five rows carry the `men_boys` beneficiary
  tag, of which one is live, and that one is a DCMS gaming pilot for boys aged
  11 to 16.
- **But both organisations do have reachable funders**, they are just not
  labelled for men. Men in Sheds Hull has Sir James Reckitt Charity (live, Hull
  and East Yorkshire) and both Freemasons' Charity grants (live, UK, later
  life). Men Walk Talk has Cornwall Community Foundation Community Grants
  (live) and Sport England's Movement Fund (live, physical activity).

So the fix is mostly **one wrongly rejected row, one duplicate, and tagging** —
not a hunt for new funders. That matters because it is cheap.

> A note on how this was checked, because it nearly went wrong. The first query
> pulled the table without pagination and Supabase capped it at 1,000 rows,
> reporting 338 live where the true figure is 581. The "zero rows about men"
> finding came from the paginated re-run over all 1,991. Same failure family as
> the truncated buffer earlier today.

## The one genuine defect, and it is the best-matched fund in the catalogue

**Men's Health Community Fund** — `9605bf45-9c22-467f-92fc-a3a5ba04b6fe`,
currently **rejected**.

Rejection reason on the row: `dead_url: verdict of 7 Sept 2026, applied at
Paul's word: Page not found.`

That verdict was correct about the URL and wrong about the fund. The row's
`apply_url` was a **Find a Grant government listing**, which has since been
removed. The fund itself is live on its own funder's site:

> "The Men's Health Community Fund will invest at least £6.3 million in
> community and grassroots organisations that work in the country's most
> deprived areas where men face the worst health outcomes."
> — peopleshealthtrust.org.uk/partner-with-us/business-partners/mens-health

> "The Fund will open for applications in summer 2026 with grants to be awarded
> later in the year."
> — peopleshealthtrust.org.uk/news/stories/trust-partners-with-government-and-movember-on-major-new-mens-health-fund

It is a DHSC, Movember and People's Health Trust partnership, England, for
community and grassroots organisations working on men's health, covering mental
health, debt, housing, family relationships and income at moments like the
transition to fatherhood, job loss or retirement. That is Men Walk Talk's work
described almost exactly.

We already hold People's Health Trust as a live provider (Health Justice Fund),
so this is a provider we know.

**Recommended: un-reject, re-point `apply_url` at People's Health Trust's own
page, and treat as between rounds.** The row's stored deadline of 15 July 2026
has passed, so it should not go live as open. State changes are Paul's, so
nothing was done here.

## The second defect: a duplicate

**Hull Community Fund** is held twice, `b06af7a3-a1be-4572-a259-70260f20d8b6`
and `49d410cd-2107-421e-b35b-158793a21c0e`. Identical funder, URL, £10,000 cap
and 7 September 2026 deadline.

Both are correctly hidden right now: the deadline was yesterday and the expire
cron did its job. The problem is that when Two Ridings reopens the fund, **two
identical rows reappear** for the most locally relevant funder Men in Sheds Hull
has. Worth merging before that happens rather than after.

## Checked and correctly hidden, no action needed

Recorded so nobody re-opens these as if they were defects:

| row | state | why it is right |
|---|---|---|
| Cornwall Community Foundation Resilience Fund (`2402fd26`) | published, hidden | Reopens 1 June 2027, well outside the 30-day lead |
| Masonic Later Life Inclusion Small Grants (`ac210e86`) | archived | Deliberately superseded: "MCF domain moved to freemasonscharity.org.uk; replaced by gap_audit_2026-06-12 Small/Large Grants rows". Those two replacements are live |

## Dead ends, verified rather than assumed

| provider | outcome | evidence |
|---|---|---|
| **Movember** (direct) | No route | "We are therefore unable to review or consider direct and unsolicited funding requests" and "We do not accept direct and unsolicited requests for funding". Its funding is for research and health-service interventions, and its community route into England is the Men's Health Community Fund above |
| **UK Men's Sheds Association** | Unreadable | Bot-walled on direct fetch and in the Chrome browser, both the homepage and /funding-opportunities/. Worth a retry another day: it is the obvious provider for Men in Sheds Hull |

Also checked and not held at all: Men's Health Forum, Prostate Cancer UK,
Independent Age, Centre for Ageing Better, Age UK, Toolstation, Lions Clubs,
Rotary, Andy's Man Club, Baton of Hope. None was staged, because none was read
today, and an unread provider is a lead rather than a row.

## What to do, in order

1. **Un-reject the Men's Health Community Fund and re-point it at People's
   Health Trust's page.** One row, and it is the single best-matched fund in the
   catalogue for a waitlist signup. Paul's call: it is a state change.
2. **Merge the two Hull Community Fund rows** before the fund reopens.
3. **Tag for men.** Nothing addressed to men is discoverable as such today. The
   Freemasons' and Sir James Reckitt rows serve these organisations without
   saying so. A tagging pass over the rows that already serve men would improve
   both organisations' matches without adding a single row.
4. **Retry UK Men's Sheds Association** when the wall lifts. It is the one
   obvious provider still unread.

## What was deliberately not done

No rows were staged. The two candidate providers that would have justified new
rows were either closed to unsolicited applications (Movember) or unreadable
(UK Men's Sheds Association), and staging an unread provider is the failure this
week has been correcting for. The available fix here is a rejected row, a
duplicate and tagging, which is cheaper than discovery and better targeted.
