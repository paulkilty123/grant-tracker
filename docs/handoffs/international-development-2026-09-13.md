# Handoff: International development

Written 2026-09-13, late, by the orchestrating session, commissioned by Paul
the same evening ("first put an international development batch"). Read
`CLAUDE.md` first, then `northern-ireland-2026-09-11.md` for the staging
rules, budget and results-file shape. All of it applies unchanged. Then this.

## Why this job exists

Our Sansar signed up on 13 September: a Brighton-registered charity running
a children's home, a girls' safe house and an end-to-child-labour project in
Province 2, Nepal. With a correct profile (international reach, sectors
international, education, women; specialisms development aid, humanitarian,
violence against women and girls, girls' empowerment) the catalogue clears
the 65 floor on two rows, and both are wrong: B&Q home starter kits and a
housing association fund, pulled in by a housing tag. The same gap showed on
Free Tibet in June (`project_freetibet_humanrights_gap_2026-06-25`).

What the catalogue holds for UK charities working overseas, 13 Sept:

| live | Allan & Nesta Ferguson, Souter, Eleanor Rathbone, C B & H H Taylor (closes 16 Sept), Charles Hayward general, Network for Social Change, Waterloo Foundation (generic page, "no funding detail"), Comic Relief International (generic page, "wrong fund"), Gatsby (not open) |
| hidden | Hilden (closed to summer 2027), Baillie Gifford International (Scotland only), British Council collaboration, Bromley Trust human rights |
| staged tonight | Jephcott Charitable Trust Grants, `33c0aa63`, Needs reading |

So the honest live count for a small UK charity with a project in Nepal is
about four, and two of those point at pages a reader cannot apply from.

## The job in one sentence

Find the UK trusts and foundations that fund UK-registered charities for
development, child protection, health, education and human rights work
overseas, that the catalogue does not hold, and stage each one hidden for
review. **Target: 12 staged.**

## The shape that qualifies

1. A UK charity, CIO or constituted group applies (the grantee is the UK
   body, not the overseas partner). Funders that give only to organisations
   registered in the country of work are `out_of_scope`.
2. The page states who can apply, what for, and how. A Charity Commission
   register entry is not an apply route.
3. Open now, rolling, or opening within 30 days with a stated date.

Read `who_can_apply` before anything else. Many of these trusts are
Christian foundations, invitation-only, or "we do not accept unsolicited
applications"; the second and third are results-only, `no_apply_route`.

## Where to look, in order

**Dedup first, by funder and by host, against the whole table.** The
staging script does both; run it dry before reading a page.

Every host below was tried tonight by direct fetch. Mark which failed so
the next session goes straight to the browser for those.

| lead | tonight | note |
|---|---|---|
| Jephcott Charitable Trust | staged | amounts not on site; guidelines PDF on the Documents page may state them |
| Beatrice Laing Trust | closed | "closed to new applications until further notice" on laingfamilytrusts.org.uk, results only |
| Marr-Munning Trust | 403 bot wall | overseas development, UK charities; browser |
| Evan Cornish Foundation | fetch failed | health, education, human rights, UK and overseas; find the right host |
| Charles Hayward Foundation Overseas | 403 | the site blocks fetch; the general row is live, the overseas small grants (up to about £5k, Africa) may deserve its own row; browser |
| Peter Stebbings Memorial Charity | fetch failed | small overseas grants; host unknown |
| Rowan Charitable Trust | fetch failed | development, environment; host unknown |
| Ericson Trust | fetch failed | small grants, overseas development among them |
| Bryan Guinness Charitable Trust | fetch failed | small; check it accepts applications |
| The Funding Network | 404 on /apply | pitch events, not a grant; probably `out_of_scope` unless a charity intake exists |
| Waterloo Foundation World Development | live row is generic | the World Development programme page may deserve a row of its own; read it |
| Comic Relief international | live row is generic | check whether any international round is open; if not, the row is a `check` for Paul |

Further leads not tried: The Tolkien Trust (unsolicited?), Miss K M Harbinson,
The Sylvia Waddilove Foundation (medical overseas), The Dulverton Trust
(check whether overseas is still funded), Global Fund for Children (US, may
fund UK partners), The A B Charitable Trust (human rights, UK), The
Bromley Trust (held, scheduled), Big Give Christmas Challenge (match funding,
in_kind or programme?), The Souter Charitable Trust (held), The Lloyd's
Register? (no), St James's Place Foundation (closed), Tudor Trust (closed to
new applications), Esmée Fairbairn (UK only).

## Rules that bit tonight

- A fetch that returns HTTP 202 with an empty body is a bot wall, not a
  page. Do not stage from it and do not let a model guess from the domain.
- Amounts on a page are rarely the award (`feedback_pounds_on_a_page_are_rarely_the_award`).
- Every staged row lands in Needs reading until the 01:00 verify run reads
  it; never forge `_page_read`.
- Source for every write: `system:international-2026-09-13`, never `admin:`.

## Results file

`docs/handoffs/international-development-results-2026-09-13.json`, same
shape as the Northern Ireland results: brief, run, mode, staged (tier, title,
id, state, note), and a `not_staged` list with a reason code per lead.
