# Place-based discovery: the draft query set

Drafted 2026-08-28. Not wired to anything yet.

## Why the current set went dry

`DEFAULT_QUERIES` is twenty fixed strings. The sweep runs one a day, so the whole
set is walked in twenty days and then repeats, and after six weeks it returns the
same national names every time. Measured on 27 August: **28 of the last 32
candidates were funders we already hold** — SSE, UnLtd, Clore, Charity Bank, Key
Fund, Resonance, Nesta, The Fore.

The queries are not broken. The vein is mined out. A fixed list always ends this
way; the fix is a list with a variable in it.

## Where the catalogue is actually thin

Live rows by place, 638 live rows in total:

| | |
|---|---|
| UK-wide | 261 |
| England / Scotland / Wales / NI | 34 / 34 / 18 / 13 |
| London | 21 |
| everywhere else | fewer than 10 each |

Checked against 42 major towns and cities, matching generously across
`location_tag`, `title` and `funder`:

**Nothing at all (26):** Liverpool, Sheffield, Leicester, Bradford, Cardiff,
Belfast, Wolverhampton, Stoke, Sunderland, Southampton, Portsmouth, Plymouth,
Norwich, Swansea, Doncaster, Middlesbrough, Blackpool, Preston, Wakefield,
Barnsley, Rotherham, Huddersfield, Dundee, Inverness, Milton Keynes, Reading.

**One or two (11):** Aberdeen, Bolton, Derby, Edinburgh, Wigan, Bristol,
Cambridge, Glasgow, Leeds, Luton, Newcastle, Oxford.

**London boroughs with nothing (13 of 32):** Barnet, Brent, Bromley, Greenwich,
Harrow, Havering, Hillingdon, Hounslow, Lewisham, Newham, Sutton, Waltham
Forest, Wandsworth.

A fundraiser in Liverpool or Sheffield currently sees only what a fundraiser in
Truro sees. That is the gap this closes.

## The shape: templates times places, not a longer list

Five templates over the place list, one query per run, rotating so the place
changes daily. The place is the variable, so the set does not exhaust the way a
fixed list does. Templates chosen for the four kinds of funder that actually give
locally:

1. `<place> community foundation grants for charities and community groups apply`
2. `<place> council small grants voluntary sector community fund how to apply`
3. `grants for charities in <place> local trust or foundation accepting applications`
4. `<place> housing association community fund grants for local organisations`
5. `<place> place-based fund community organisations apply` *(mayoral, combined
   authority, levelling-up successors)*

Template 2 wants care. Council pages are often lists of other people's funds
rather than a fund of their own, which is the `page_describes_different_fund`
shape that generated 83 review rows. Worth running templates 1 and 3 first and
seeing what 2 produces before it earns a permanent slot.

## Order of the place list

Not alphabetical. At one query a day the first month is what matters, so the
list runs biggest gap by population first:

Liverpool, Sheffield, Leicester, Bradford, Cardiff, Belfast, Wolverhampton,
Stoke, Sunderland, Southampton, Portsmouth, Plymouth, Norwich, Swansea,
Doncaster, Middlesbrough, Preston, Blackpool, Wakefield, Barnsley, Rotherham,
Huddersfield, Milton Keynes, Reading, Dundee, Inverness, then the eleven with one
or two rows, then the thirteen London boroughs.

That is 63 places. One template over all of them is 63 days; five templates is
most of a year, which is too slow to matter for September.

**So the cadence is the real decision, not the queries.** Options, cheapest
first:

- One place query a day alongside the existing general one. £2 a month, 63 days
  for one pass. Slow but additive and safe.
- Three a day. £6 a month, three weeks for a pass. Vercel is on Pro now, so
  sub-daily crons are allowed, but CLAUDE.md says raising cron cadence is its
  own piece of work with a canary rather than a config tidy.
- A one-off backfill run over the whole list, then one a day to maintain. The
  backfill is 63 searches at about 7p each, so roughly £4.50 once.

The backfill is the one I would choose. It buys the coverage now, in one
measurable spend, and leaves the daily query doing maintenance rather than
excavation.

## What to watch when it runs

The failure mode is not "no results". It is results that are real funders we
cannot use: a council page listing other people's grants, a fund for individuals,
a fund closed years ago. Discovery already dedups against the catalogue, and the
`needs_review` gate means nothing reaches users unattended.

The number to watch is not how many rows arrive, it is how many survive review.
The general slice is currently at four in thirty-two.
