# Handoff: discovery week, 22 to 28 September 2026

Written 2026-09-21 by the orchestrating session, commissioned by Paul the
same evening: "need to do a funding discovery search over the next week so
next week shows new matches as well as general additions to the catalogue".
Read `CLAUDE.md` first, all of it, then `programmes-cohorts-2026-09-08.md`
for the budget, citation and staging rules, then `scotland-2026-09-11.md`
for the shape of a batch. All of it applies here unchanged. Then this.

## Why this job exists

Tuesday 29 September's digest goes to a cohort whose trials Paul has just
extended to 1 October, on the promise that the platform keeps finding
things. The catalogue plan (`catalogue-plan-2026-q4.md`) wants net growth
every week regardless. This batch serves both: rows chosen so that the
seven named trial organisations each see at least one genuinely new match
next Tuesday, and the rest of the batch is general additions.

The review queue was empty on 21 September, so nothing staged is waiting
to become a match. Everything here is new discovery.

## The job in one sentence

Stage 30 rows hidden for review by Friday 26 September: about half aimed
at the seven shapes below, half general, every one a fund a charity, CIC or
social enterprise can apply to today or within 30 days, that the catalogue
does not hold.

**Target: 30 staged.** Paul reviews and publishes over the weekend so the
rows are live before Tuesday's send.

## The seven shapes, and what each needs

Run the scorer pattern (`loadAdminDb`, `grants_with_funder`,
`normaliseScrapedGrant`, `computeMatchScore`) against each org before you
stage, so "new match" is measured, not assumed. A row counts only if it
scores 55 or more for that org and lists their legal structure.

| Org (id prefix) | Shape | Where to look |
|---|---|---|
| Bridlington Cricket Foundation (8a3139de), CIO, East Riding | grassroots sport, cricket, women and disability sport | Sport England small grants, ECB and Yorkshire Cricket Foundation, Hull and East Yorkshire funders (Two Ridings CF dated funds, Sir James Reckitt is held), Sported partners, Barclays and Cash4Clubs are held |
| GoStart (2b8d875a), charity, Suffolk | community transport for older and disabled people | Motability Foundation is closed (watch), Suffolk CF dated funds, Suffolk County Council community grants, Esmée Fairbairn is out of scope, rural funds (Prince's Countryside Fund is held?), age and disability trusts with an East Anglia interest |
| Mercury Theatre (b35d2980), charity, Colchester, income £500k to £1m | producing theatre, education, community | Essex CF dated funds, Colchester and Essex council arts grants, theatre trusts not held (check Esmée, Foyle, Fenton Arts, Garrick, Mackintosh, Leche, Idlewild, John Thaw), Arts Council strands beyond Project Grants |
| Unicorn Theatre (a33c3512), charity, London, £1m to £5m | theatre for young audiences | London arts trusts not held (Foyle, Garrick, Mackintosh, John Lyon's is held, City Bridge is held), children's arts funders, Paul Hamlyn strands |
| The Apex Project (98b5b3e3), CIC by shares, London | youth employment, enterprise, ethnic minorities | youth employment funders (Youth Futures Foundation, Blagrave, Berkeley, Jack Petchey), London boroughs' youth funds, enterprise programmes open to CICs by shares (UnLtd awards for organisations, School for Social Entrepreneurs is held) |
| Paws and Pause (9bee94d2), CIC by guarantee, South London, under £10k | mental health recovery, supported employment, traineeships | mental health trusts (Zurich Community Trust, Henry Smith is held?, Mercers, Trust for London is held?), Lambeth and Southwark borough and CF funds, employment charities' grants (Rank Foundation, Barrow Cadbury is held), Big Issue Invest's programmes |
| Redhill Fields (ff6c8e7a), Ltd by shares, Nottinghamshire | live music, hospitality, Black-led | see `creative-business-2026-09-20.md`; PRS Open Fund for Organisations is folded, Liveline is held, Motability irrelevant; what is left is East Midlands and Nottinghamshire business grants with a form, and any Black-led founder programme with an intake before May 2027 |

Dedup against the catalogue by funder name AND apply URL before drafting.
Several "not held?" above are guesses; the dedup decides.

## The general half

In yield order from the Q4 plan:

1. **Reopenings.** 282 closed funds are held. List the ones whose page now
   shows an open round or a date within 30 days, and record the date on the
   row (`next_open_date`) rather than staging a duplicate. These count as
   new matches when they go live and cost nothing to find.
2. **Community foundations' dated funds.** One row per foundation today;
   the convention allows a row per dated fund. Pick the CFs that cover the
   seven orgs above first (Two Ridings, Suffolk, Essex, London, Nottinghamshire)
   so the two halves overlap.
3. **Film and documentary**, second tranche per the plan (BFI immersive and
   screen heritage, Film Hub North and Wales, Creative Scotland and Screen
   Scotland small schemes). Three BFI rows went in last week.

## Rules that decide edge cases

- The three tests from the Scotland brief: the applicant is a charity, CIC
  or social enterprise (a programme open to any business counts if a
  trading social enterprise could join); the page states who can apply and
  what for; open now, rolling, or a dated opening within 30 days.
- No support rows (help desks, advice services, networks). Named intake,
  something received, the organisation applying.
- Amounts only where the page states a per-applicant figure. The 18 Sept
  rules: a pot, a "total of", "government match funding" and "money raised"
  are not awards.
- Tags: first sector is the primary; first beneficiary is who the money is
  for; `general_public` first for open funds; a fund for one group gets that
  group first and nothing padded, because the gate now caps grants AND
  programmes whose primary group the org does not serve.
- `eligible_structures` from the page. If a page says "constituted
  organisations" include the CICs and Ltd by guarantee; include `ltd_shares`
  only when the page admits companies.

## Staging

As `scripts/lipman-miliband-stage-2026-09-17.ts`: `stampNewGrant`, source
`system:discovery-week-2026-09-22`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, `funder_brief` with
`source: 'live_fetch'` and a citation for every figure. Never `admin:` on a
staged row. Results file `docs/handoffs/discovery-week-results-2026-09-22.json`,
one entry per candidate looked at, staged or not, with the reason.

## Budget

No Anthropic spend from the session: pages by fetch or the keyless reader
proxy (about 20 a minute; Cloudflare-walled hosts go to Paul's browser).
Briefs written by hand from the page. The overnight verify read (production
key) stamps `_page_read` on staged rows; that is the only model cost, about
30 reads. No Vercel build: staging is a database write.

## What Paul decides

Publish or reject every row. Reopening dates on held rows are written by
the session (they are facts from the page) and listed in the report.

## When it is done

Report: staged N of M looked at; per trial org, which staged rows score 55+
for them (the measured number); reopenings dated; the ones held and why.
Paul spot checks and publishes before Tuesday 29 September.
