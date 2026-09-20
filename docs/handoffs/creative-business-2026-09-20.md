# Handoff: funds a creative or hospitality business can apply to

Written 2026-09-20 by the orchestrating session, commissioned by Paul the
same morning after a trial user's reply (Rodger Grant, Redhill Fields Open
Air Events Ltd, Nottinghamshire, outdoor music venue launching May 2027).
Read `CLAUDE.md` first, all of it, then `programmes-cohorts-2026-09-08.md`
for the budget, citation and staging rules, then `scotland-2026-09-11.md`
for the shape of a batch. All of it applies here unchanged. Then this.

## Why this job exists

The catalogue is built for charities, CICs and social enterprises, and it
shows. Rodger is a private company limited by shares. Scored against the
669 live rows on 20 Sept he sees 52 matches, and 32 of them do not list
`ltd_shares` as eligible: they would turn him down at the first question.
His top two are BFI documentary funds, because "creative" is one sector.
Fixing his profile moved the heritage trusts out and moved nothing
useful in, because nothing useful is there.

He is the third for-profit signup in ten days (Marilu and Joseph are sole
traders). Every fund staged here is a fund the next creative business gets
too. Paul has promised him, in an email that goes out when pricing is
live, that "the strongest of these" will be on Shoots this week.

## The job in one sentence

Find the grants and programmes that a UK private company in live music,
festivals, hospitality or the creative industries can apply to today or
within 30 days, with a preference for the East Midlands and for Black-led
founders, that the catalogue does not hold, and stage each one hidden for
review.

**Target: 10 to 15 staged.** Stop there, or when the provider list is
worked through, or under the budget rule.

## The shape that qualifies

The three tests from the regions brief, unchanged, with test 1 read the
other way round for once:

1. **A private limited company can apply.** This batch exists for
   `ltd_shares`. A fund that also takes charities is fine; a fund that
   takes charities only is not this job (it is already the rest of the
   catalogue). Programmes count under Paul's ruling of 10 September
   (`feedback_programmes_include_social_enterprises_ltd_by_shares`), and
   under the 8 September bar: a named intake, something the applicant
   receives, and the organisation applying. **No support rows**: the
   growth hub's advice service, the creative network, the trade body. If
   the growth hub runs a named grant with a form, that is a row.
2. **The page states who can apply and what for.** A press release about
   a fund is not the fund. Stage the guidance or application page.
3. **Open now, rolling, or opening within 30 days** with a stated date.
   Closed with no reopening date goes to the results file as
   `closed_no_date`, not to staging. Rounds that open between now and May
   2027 with a stated date are worth a `between_rounds_scheduled` row with
   `next_open_date` set; say so in the results file so Paul can decide.

## Where to look, in this order

Providers first. Each of these is a named body with a funds page; walk
the page, list every fund, dedup against the catalogue by funder name and
by URL host before drafting anything.

1. **Arts Council England**: National Lottery Project Grants (open to
   companies; check the current £ bands and the rolling status), Developing
   Your Creative Practice is individuals-only so out. The catalogue holds
   ACE rows; check which.
2. **PRS Foundation**: The Open Fund for Organisations, Beyond Borders,
   the festival and promoter strands. Check what the catalogue holds under
   "PRS".
3. **Creative UK**: Creative Growth Finance is a loan (investment, not
   this batch unless it is a grant strand); look for the grant and
   programme strands for creative businesses.
4. **East Midlands Combined County Authority** and the **East Midlands
   growth hub** (D2N2 and its successors): business growth grants, any
   named creative or visitor-economy fund. Nottinghamshire County Council
   and Rushcliffe Borough Council business grants (Ratcliffe-on-Soar is
   Rushcliffe).
5. **The Hospitality Support Fund** that Rodger named: find what it is,
   who runs it, whether it is open. It may be a trade-body scheme.
6. **Black-led founder programmes**: Barclays Eagle Labs Black Founder
   programme (the catalogue holds Eagle Labs rows; check which), NatWest
   Black entrepreneur programmes, Lloyds Bank Black business programmes,
   Foundervine, Black Business Network, UK Black Business Show, the Do It
   Now Now grants, Cornerstone Partners. Corporates and banks, not trusts.
7. **Music-industry bodies**: Music Venue Trust (Pipeline Investment
   Fund), Arts Council's Supporting Grassroots Music fund, Youth Music (the
   catalogue may hold it; it takes organisations), Help Musicians (mostly
   individuals; check the organisational strands), the Music Export
   Growth Scheme, BPI.
8. **Innovate UK and UKRI creative strands**: only if a call is open now
   with a form; most are consortia and out of scope.

Stop when the list is walked. Do not go to Gemini for candidates; the
8 September handover records what that produced (fabricated quotes, a fund
closed since 2019).

## Tags, so the matcher does its job

- `eligible_structures` must include `ltd_shares` on every row staged
  here, and only the other structures the page actually names.
- `impact_sectors`: `creative` first for music and culture; `employment`
  or `social_economy` for business-growth funds; never `heritage` or
  `health` unless the page says so.
- `target_beneficiaries`: `ethnic_minorities` first on the Black-led
  programmes (classifier v4 rule: first tag is who the money is for);
  `general_public` first on open business funds.
- `location_tag`: the page's words. "East Midlands" or "Nottinghamshire"
  where it says so; "England" for ACE; "UK" for the banks.
- `funding_type`: by what the applicant receives. A grant is a grant; a
  cohort with a stipend is a programme; a loan is investment and goes in
  only if it has a grant element the page states.

## Staging

As `scripts/lipman-miliband-stage-2026-09-17.ts`: `stampNewGrant`, source
`system:creative-business-2026-09-20`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, a `funder_brief` with
`source: 'live_fetch'` and citations for every figure. Amounts only where
the page states a per-applicant figure (`feedback_pounds_on_a_page_are_rarely_the_award`;
the 18 Sept rules: a pot, a "total of", "government match funding" and
"money raised" are not awards). Never `admin:` sources on a staged row.

Results file: `docs/handoffs/creative-business-results-2026-09-20.json`,
one entry per candidate looked at, including the ones not staged and why.

## Budget

Zero Anthropic spend from this session: read pages with fetch or the
reader proxy (keyless r.jina.ai, ~20 a minute; Cloudflare-walled hosts go
to Paul's browser), write briefs by hand from the page. Do not run the
enrich route or the classifier; the overnight read will stamp `_page_read`.
No Vercel build: staging is a database write. If a page cannot be read
without a browser, list it in the results file as `bot_walled` and move on.

## What Paul decides, not you

Publish or reject every row (the NR gate). Whether a `between_rounds`
row is worth holding. Whether a support-shaped row with a form is a
programme. Any row where the page and the tags disagree.

## When it is done

Report to Paul: staged N of M looked at, the ones held and why, and which
of Rodger's nine stated interests each staged row answers. He will spot
check, publish, and email Rodger that they are in.
