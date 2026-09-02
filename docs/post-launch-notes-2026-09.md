# Post-launch notes, September 2026

Paul, 2026-09-01: "Until 11 September: no new defect classes, no new sweeps, no
report longer than three decisions for me. The launch invariants and the publish
canaries are the whole job. Anything else you find, note it in a post-launch
file and move on."

This is that file. Nothing here is launch work. Each entry says what was seen,
where, and what the cheap next step would be, so that whoever picks it up after
the 11th does not have to find it again. Add to it; do not act on it before then.

---

## Found 1 September

### The "unless" clause has no detector

The front-door rule (17 Aug, reaffirmed 1 Sep): a homepage or banked-index
landing is not a defect **unless the funder runs separately paged funds we are
hiding behind one row**. The counter now encodes the first half (a bare origin
or `apply_url == funding_index_url` is a front door and does not count as Live
and wrong). Nothing detects the second half. A funder with five paged programmes
catalogued as one row pointing at its index looks identical to a single-fund
trust pointing at its homepage.

Cheap next step: for each of the 27 front-door rows, count sibling rows on the
same domain (the `siblingsOnSite` figure the card already shows). A front door
with several live siblings is the case the clause is about; a front door with
none is almost certainly fine. Propose, do not apply.

### 14 named-fund rows point at their funder's index

Among the 27 front doors, 14 have a specific fund title but link to the banked
funding index rather than the fund's own page: SWEF, Resonance (two rows),
Comic Relief, Football Foundation, Wellcome, ACNI, Sussex Crisis Fund, Ernest
Cook, AHF, Active Travel England, Hatch, Nuffield, Groundwork. Not wrong, and a
fundraiser can navigate from there, but a weaker link than the catalogue should
carry. Propose-not-apply, one page read each, after launch.

### Two Ready rows carry links nobody can apply from

Both surfaced by reading the Ready list for the LIMIT=5 dry run:

- **Green-Works** links to a Wikipedia article. Wikipedia is not in
  `apply-route-hosts.ts`, so `apply_route_not_applyable` does not fire. Adding
  it is a one-line change, but it is a new detector rule and therefore waits.
- **Computer Aid** links to a blog post rather than an application page.

Neither is live. Both were left in Ready rather than being published by hand.

### Turing Trust "give-computers" is probably out of scope

The page is a donation route for old hardware, contradicted on who-can-apply and
exclusions. It is in Ready because nothing blocks it; it should probably be
rejected as `non_funder` or moved to In-Kind with a rewritten brief. Judgement
call; left for Paul.

### The 30 "everything else" live rows

The 1 Sep split of the then-75 Live and wrong: 18 contradictions (launch work),
27 front doors (removed from the count), 30 everything else. The 30 are:
2 `page_unreadable` (one is The Paley Trust, whose link is a `mailto:`),
1 `never_verified`, and 27 `page_describes_different_fund` rows landing on a
non-root, non-index page: HDH Wills `/grants`, Pilgrim `/grants`, Robertson
`/funding/types-of-funding`, Esmée, Essex CF, Devon CF, Historic England (two),
Community Shares Booster Fund, AF3 and others. Eight of the 27 also carry
contradicted eligibility or rounds lines, but those were read off a page the
engine says is not about this fund, so they were not counted as contradictions.

Most of these are "the funder's grants listing, one level below the homepage".
The 17 Aug ruling would very likely cover them too, but extending the front-door
definition to "a path that looks like an index" is exactly the appearance-based
judgement CLAUDE.md warns against. The right fix is to bank the index URL for
these funders (`funding_index_url`), after which the existing rule applies with
no code change. Post-launch: bank indexes for the 27, one funder at a time.

### The admin amount fields do not say which figure they want

Oxfordshire Thriving in Nature stored £500,000 as `amount_max` for two months
because a hand edit on 29 July copied the applicant income cap into the award
slot, and admin trust then pinned it. The Add Grant and edit forms show a bare
input with no hint of what the page says. Cheap next step: render the figures
the reader extracted from the page (`field_evidence`) beside the amount inputs,
labelled, so the slip is visible at the moment it is made. Corrected 1 Sep with
the page quote; not launch work.

### `scripts/_tmp-gone.ts`

A diagnostic left from the 410 work. Delete when convenient.

### Stale memory

`project_publish_gate_v1.md` says "arming and cron wiring left". The gate has
been armed at LIMIT=5 in production since about 17 Aug. Corrected 1 Sep in the
memory index; noted here in case the old wording resurfaces.

---

## Standing constraints until 11 September

- Needs reading and Needs enrichment are the engine's, on its normal cadence.
- Link needs fixing (17 after the counter fix): none live, nobody misled.
  Post-launch, propose-not-apply.
- Nothing truthful to show: dropped 1 Sep (three rows, `rejected`).

## Found 2 September

### Eleven relinks, propose after the 11th

Five live rows carry a banked `funding_index_url` that differs from their
link, so the front-door rule does not cover them and the engine reads the link
as a different fund: Robertson Trust, Esmée Fairbairn (Creative, Confident
Communities), Essex CF, Devon CF, Idlewild Trust. Six more live rows link to a
page named after a fund, where whether the page is about this row's fund is a
reading question: Community Shares Booster Fund, Heathrow HAPi, VCSE Contract
Readiness, Historic England Heritage at Risk, Catch22 GoodTech Ventures, AF3
(also unreadable). Plus Quartet's Express Grant Programme, whose link is the
programmes index while the fund's own page
(`/grants/express-grant-programme/`) states the £5,000 ceiling. Propose, do
not apply.

### Law Society Pro Bono Charter is held by hand

Marked `saved_for_later` on 2 Sep. The page confirms it is OPEN ("applications
can be made using the form below"), so the invitation-only rule does not
catch it, and the machine would have published it. It is a charter for law
firms to sign, not funding a charity can apply for. Nothing detects that
without a new rule. Paul to rule: reject as out of scope, or keep.

### Five live invitation-only trusts

The `page_says_invite_only` rule (2 Sep) surfaced five LIVE rows whose page
confirms applications are by invitation: Alan and Babette Sainsbury Charitable
Fund, Indigo Trust, Mark Leonard Trust, Linbury Trust, Aurora Trust. They now
sit in Live and wrong. Not retracted; Paul's call.

### A page addressed to the giver: three now, detector after launch

Turing Trust "give-computers" (a donation route for old hardware), the SYCF
donor page (August), and the Law Society Pro Bono Charter (a charter for law
firms to sign; rejected out_of_scope 2 Sep). All three read cleanly, name a
funder, and state no defect the engine looks for, because they are written to
the person GIVING rather than the one applying. Paul: note it, no new rule
this week. Cheap next step: the reader already extracts who-can-apply; a
who-can-apply that names donors, firms, or "your organisation's old equipment"
is the signal.

### Angels' Den 2026 is a closed pitch round showing an event date

The row's deadline is 9 September 2026, which is the pitch event at The
Elgiva; the description itself says applications closed 11 May 2026. The
£120,000 was nulled on 2 Sep as a pool. The date is a launch-invariant
question the day after the event: it will trip "deadline passed" on
10 September and the removal actuator will take it from there.
