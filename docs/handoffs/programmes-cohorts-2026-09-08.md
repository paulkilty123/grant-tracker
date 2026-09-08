# Handoff: accelerators, incubators and cohort programmes

Written 2026-09-08 by the orchestrating session (grant-tracker-be), replacing
`programmes-cities-2026-09-08.md` after Paul ruled on what that job found.
Read `CLAUDE.md` first, all of it, then `programmes-2026-09-07.md` for the
staging shape and the four tests. Then this.

## What changed and why

The cities brief searched city first. Working outward from six cities reached
the bodies a city reliably has, which are its council for voluntary service,
its growth hub and its social enterprise network. All six rows it staged are
advice-and-training services reached through a phone line or a contact form.

**Paul's ruling, 8 September: he does not want support rows.** The six staged
under the old brief are for him to reject in the review queue; ESEN and GSEN
were never staged and stay unstaged.

The supply he is after does not organise itself by city. It is national
networks, banks, corporates and impact investors running cohorts, and their
local presence is a delivery location rather than a separate fund. So this
brief searches **provider first**, and the six cities become a coverage lens
rather than the search axis.

## The job in one sentence

Find accelerators, incubators, cohort programmes, structured training and
impact venture support that a UK charity, CIC or social enterprise can apply
to, that the catalogue does not hold, and stage each one hidden for review.

`funding_type` is `programme`, `in_kind` or `investment`. Live counts today:
**18 programme**, 48 in_kind, 46 investment. The 18 is the number to move.

**Target: 40 staged.** Stop there, or when the provider list is worked
through, or under the budget rule below.

## The shape that qualifies, and the one that does not

A candidate qualifies when it has **a cohort or a round, and something you
receive**. Concretely, all three:

1. **A named intake.** A cohort, a programme year, an application window, a
   next start date. "Applications open until 14 November" or "cohort four
   starts in January" both count. A permanently open advice offer does not.
2. **Something received.** A place on a programme, a grant, investment, a
   bursary, mentoring over a fixed term, workspace for the cohort's length. A
   phone line, a helpdesk, a members' directory or a signposting service is
   not.
3. **The organisation applies**, and the page says who can apply. Programmes
   for individual founders with no route for the organisation are out, as
   before. Under-represented-founder programmes are in when the applicant is a
   registered business, charity or social enterprise.

**Explicitly out, and report rather than stage:** the CVS, TSI, growth hub and
social enterprise network support class, under `support_service_class`; ongoing
one-to-one advice reached by contact form; membership bodies; conferences;
consultancies selling a service; anything where the "application" is a booking.

If a provider runs both, and many do, stage the cohort programme and ignore
the advice service.

## Where to look: provider first

Every name is a **lead to verify, not a fact**. Confirm on the provider's own
page, read today, and report what fails with the sentence that failed it.

- **Social enterprise networks and intermediaries:** Impact Hub's UK locations
  and their accelerator programmes, UnLtd, Big Issue Invest and the Big Issue
  group, Bethnal Green Ventures, Zinc, CAN, Pilotlight's programme work as
  distinct from its advice, Social Enterprise UK's programmes with corporate
  partners, Locality, Plunkett.
- **Banks and financial institutions:** NatWest's accelerator hubs, Lloyds
  Bank's social entrepreneur and academy programmes, Santander's business and
  social enterprise programmes, Barclays Eagle Labs, Virgin Money and Virgin
  StartUp, Triodos, Charity Bank, Unity Trust, Co-operative Bank. Banks
  frequently run a named cohort with a bursary attached, which is exactly the
  shape wanted.
- **Corporates and tech:** the telcos' community and tech-for-good programmes,
  Google.org and Microsoft and AWS nonprofit or social impact programmes,
  Salesforce, the big four's social enterprise and pro bono cohort programmes
  as distinct from open advice, retailers' community accelerators.
- **Impact investors and foundations running programmes:** Better Society
  Capital's investee programmes, Access Foundation, Fair4All Finance,
  Resonance, Key Fund, Social Investment Business, Esmée and similar
  foundations' capacity or investment-readiness cohorts.
- **Scotland, already banked and worth starting with:** Firstport's Build It
  (grants up to £40,000 for early-stage social enterprises) and its Community
  Enterprise Fund. Both were verified in the cities job and failed only its
  city-anchor test, which this brief drops. Stage them first.
- **Universities and innovation hubs** with a social venture or charity track,
  in the six cities and elsewhere. SETsquared was checked and is commercial
  tech with no charity route, so do not re-check it.

Providers already in the catalogue often run several programmes and are
cheaper to verify than a new provider. School for Social Entrepreneurs is
covered: its eight current programmes are all held, and its London programme
page is gone, so do not restage it.

## Cities as a coverage lens, not a gate

A national programme is **in scope** if we do not already hold it. That is the
change from the cities brief. Where a programme names a cohort in Brighton,
London, Bristol, Manchester, Edinburgh or Glasgow, tag `location_tag` to the
city and set `is_local: true`; otherwise tag the nation or `UK` and leave
`is_local` false. Report the city spread in the summary so the coverage gap
stays visible, but never stage a weak row to fill a city.

## Budget: one session, sequential, no fan-out

Unchanged from the cities brief and it held well there.

1. **No subagents, no Workflow, no parallel fan-out.** One session, provider
   list in order.
2. **At most two page reads per candidate**: the programme page, plus one
   linked eligibility or guidance page. Two hops, then `not_found`.
3. **One web search per provider, not per candidate.**
4. **No Anthropic API spend.** Fetch with node and a browser user agent, then
   the Chrome browser, then `unreadable`. No third-party reader proxy.
5. **Batches of ten.** Dry run, `npx tsc --noEmit`, commit, push, message
   grant-tracker-be with counts before the next batch. Under three in a batch,
   stop and say so.

## Citations: the rule this job is under

Set after three faults in two days on the previous jobs.

**A quote may only be pasted from page text you fetched in this session.** A
search result summary is a lead to go and read, never a quote. A proxy render
is not the page. A news line that mentions the fund is not a sentence about
eligibility. And before concluding a page does *not* say something, prove your
buffer holds the whole page: a truncated read reports true text as absent, and
that has now caught two sessions in one day.

## Dedup, staging and results

Dedup in SQL before drafting, by host, title words and funder, against the
whole table including archived and rejected rows, per CLAUDE.md. A match that
is archived or rejected is `already_held` with the id, and Paul decides.

Stage exactly as the programmes brief says: `stampNewGrant`, `is_active:
false`, `pipeline_state: 'tagged_awaiting_review'`, source
`system:programmes-cohorts-2026-09-08` at trust 50, never `admin:` or
`user_verified:`. `funding_subtypes` from `src/lib/funding-subtypes.ts`:
`accelerator`, `incubator`, `cohort_grant`, `fellowship`, `training`,
`includes_grant`, `support_programme` only where a fixed-term programme genuinely
fits it. Amounts only for a per-applicant figure. Eligibility never omitted
where the page states it.

Results in `docs/handoffs/programmes-cohorts-results-2026-09-08.json`, the same
shape as before, with `why` values including `support_service_class`,
`already_held`, `individuals_only`, `no_open_route`, `gives_nothing`,
`eligibility_unstated`, `unreadable`, `not_found`. Close with staged count,
city spread, and the live programme count before and after.

## What grant-tracker-be checks afterwards

A sample re-read against the three qualifying tests; the staged count
re-derived in SQL; a dedup query over every staged title and host; confirmation
that no staged row is active and none carries an `admin:` or `user_verified:`
source; and every quote checked against the page it names.
