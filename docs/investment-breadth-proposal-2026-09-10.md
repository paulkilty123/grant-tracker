# Proposal: growing the investment side of the catalogue

Written 2026-09-10, on launch day, for Paul. Self-directed in reply to his
question: how do we increase the investment opportunities across the
sub-categories, blended finance, social investment, loans and impact
investment? He suggested researching the providers and then scanning each
one for opportunities, and asked whether there is a better way.

**The short answer: yes, there is a better way, and it is mostly not
research.** The UK social investment market is small and already listed in
three public directories. We hold most of the providers already. The lever is
splitting and repairing what we hold, then watching the providers' own fund
pages so new funds arrive on their own. Web searching and asking a language
model for candidates is the last thing to do, not the first, and the
programmes work on 8 September showed why.

Everything below was read from the live database today. No API spend was
used and none is needed for the first three steps.

---

## Where we are

| | Live rows |
|---|---:|
| Whole catalogue | 603 |
| Investment | 44 |
| Programmes | 18 |
| In-kind | 49 |

The 44 live investment rows come from about 25 providers. By instrument:

| Instrument tag | Live rows |
|---|---:|
| loan | 24 |
| social_investment | 24 |
| blended | 10 |
| equity | 4 |
| revenue_share | 2 |
| community_shares | 1 |
| quasi_equity, convertible | 0 |
| no instrument tag at all | 8 |

(Rows carry more than one tag, so the column does not sum to 44.)

Behind the live layer sit another 80 investment rows that are hidden:
33 archived, 23 rejected, 7 waiting for review, 3 tagged but never
published, 2 between rounds. That hidden pile is the first place to look,
and the reasons it is hidden tell us what actually goes wrong.

## Why investment rows die

I read every rejection and archive reason. They fall into four piles.

1. **Duplicates of a row we already hold.** Sixteen. Charity Bank three
   times, Key Fund three times, Social Investment Business four times,
   Triodos twice, Big Issue Invest, CAF Venturesome, Fredericks, Access.
   Every one of these was a search finding a provider we held under a
   different fund name. This is the same trap the programmes work hit with
   Firstport: **search by the provider's name, never by the fund's name.**
2. **Wholesalers and intermediaries, not lenders to charities.** Better
   Society Capital, its Community Investment Enterprise Facility, Access's
   Growth Fund. They put money into fund managers and CDFIs, who then lend
   to frontline organisations. A fundraiser cannot apply. Out of scope by
   the audience rule, correctly.
3. **Homepage rows that went dead.** About twenty archived rows point at a
   provider's homepage with no product page: ART Business Loans, BCRS,
   Purple Shoots, Social and Sustainable Capital, Social and Community
   Capital, Shared Interest, Fair4All Finance, Nesta, Locality, Big Issue
   Invest's homepage, and so on. They were archived because the URL check
   failed, not because anyone decided the provider had stopped lending.
   Some of these providers are still trading. Some only lend to businesses.
   Each needs one read of the right page, not a search.
4. **Genuinely closed.** Access's 2025 dormant assets release, the
   Government Better Futures Fund, SIB's Resilience Fund and Community
   Enterprise Fund, the Cambridgeshire fund whose host now sells desk
   space. Correct, leave them.

So the failure is almost never "we could not find them". It is "we found
them, then lost them to a duplicate check that ran fund-first, or to a
homepage URL that died".

## What a search would add

The catalogue's own discovery cron has been searching for social
investment since the summer. Its results for this type: 8 published, 24
rejected, 3 tagged and never finished, 1 captured. A one-in-four hit rate,
and the rejects are the duplicates and wholesalers above. The Gemini
research pass produced 3 live rows. The programmes handover of 9 September
found the same pattern across three search methods and concluded that
discovery is not the lever there. Investment is a smaller and better-listed
market than programmes, so the conclusion holds harder here.

There is one more reason to be cautious. The people who lend to charities
in the UK number a few dozen. Good Finance, the sector's own directory, is
the list. A search cannot find a lender that is not on it, and a search
that returns one usually returns a business CDFI or a venture fund whose
audience rule will fail.

---

## The plan, in order of return on effort

### 1. Clear the seven rows already waiting. Zero research.

Another session's provider walk this morning staged six investment rows,
and a seventh is older. They are in the review queue now:

- Charity Bank: loans over £750,000, development finance, the energy
  efficiency loan programme
- Key Fund Regional Growth Fund
- Big Issue Invest equity and revenue participation
- Resonance Housing Pathways Fund
- Bethnal Green Ventures accelerator (tagged, never reviewed)

Plus two between rounds that the fixed reopening sweep will now resurface
on their own: SIB Flexible Finance and Innovate UK Investor Partnerships.

That is up to nine live rows for one review session. The three Charity Bank
rows and the Big Issue Invest equity row are exactly the sub-category
spread you asked for: large loans, property, green, and equity.

### 2. Walk the held providers and split the front doors. One day.

Same method as Firstport: for each of the 25 live providers, open their
funding page and list every separately paged fund. Where we hold one row
standing in front of several, split it. Where a fund has no page of its own,
leave it as one row.

The ones I expect to yield, from what their pages already show in the
watchlist fingerprints:

- **Big Issue Invest** advertises social impact loans, blended finance and
  grant support, and equity and revenue participation as three separate
  products. We hold the loans twice and the blend not at all.
- **Social Investment Business** runs Community Builders, Energy
  Resilience, Reach Fund and Flexible Finance, each on its own page. Reach
  is a grant. Check the others are all live rows and correctly typed.
- **Resonance** has four live rows and a fifth waiting; their fund list
  runs to more.
- **Key Fund** has six live rows and describes one unified product on its
  current page. This may need merging rather than splitting. The provider's
  page decides, not the row count.
- **Access** is live as a single row with a £25,000 to £500,000 ticket.
  Access does not lend to charities; it funds the intermediaries who do.
  That row needs a hard look. If what it describes is the Growth Fund
  delivered through Key Fund, SIB, Big Issue Invest and others, then the
  fund belongs on those providers' rows and the Access row is a wholesaler
  like Better Society Capital.
- **Social Investment Scotland, WCVA Social Investment Cymru, Community
  Finance Ireland** each hold one row for the nation. Each runs more than
  one product.

Do it with a synthetic check before trusting the count, the way the
programmes work did: pick one provider whose fund count you already know,
and confirm the walk reports it.

### 3. Re-check the twenty homepage rows. Half a day.

For each archived homepage row, one question: does this provider still
lend to charities and social enterprises, and where is the product page?
Reinstate with a product URL if yes, leave archived with a reason if no.
Rough expectation from the names: Social and Sustainable Capital,
Social and Community Capital, Fredericks and Fair4All are charity lenders
and probably come back. ART, BCRS, GC Business Finance, Let's Do Business
and Finance For Enterprise are business CDFIs and probably do not, unless
their page says social enterprises explicitly. Nesta's impact investment
arm and Power to Change's Trade Up have closed. Shared Interest lends to
fair trade producers overseas, out.

### 4. Cross-check against the three directories. Half a day, and the only new research.

This replaces "research the providers". The providers are already listed:

- **Good Finance investor directory.** The sector's own list of social
  investors open to charities and social enterprises. This is the universe
  for loans, blended and social investment. Read the list, compare each
  name against the funders we hold, and the difference is the true gap. It
  will be short.
- **Access's list of programme delivery partners.** Blended finance in the
  UK is mostly Access money delivered by named intermediaries. The partner
  list is the blended finance gap list.
- **Community Shares Unit, Ethex and Crowdfunder.** For community shares.
  We hold Ethex and the Booster Fund. The Booster Fund row is tagged
  "restricted", which is not an instrument; it is a blended equity match
  and should say so.

Two bot-wall warnings. Directory pages sometimes refuse non-browser
fetches; if one does, it goes through your browser and gets pasted, the
same as the GLA rows. And a directory row is not a fund: Responsible
Finance's loan finder was rightly rejected as "directory, not a fund". The
directory gives us the provider name; the provider's own page gives us the
row.

Names I would expect the cross-check to surface, to be verified on their
pages and not taken from here: Architectural Heritage Fund (loans for
community buildings, a real gap for the village hall and heritage rows we
hold as grants), Co-operative and Community Finance, Development Bank of
Wales social enterprise lending, Lloyds Bank Foundation's social
investment work, Barrow Cadbury's social investment, UnLtd's investment
products, Comic Relief's social investment arm, Arts and Culture Finance.
Any of these could already be closed, merged or out of scope. That is what
the page read is for.

### 5. Enrol every investor's fund page on the watchlist. Two hours, then free forever.

Five investor pages are watched today: SIB Flexible Finance, Big Issue
Invest, Power Up London, Unity Trust Bank and WCVA. Key Fund, Charity
Bank, SIB's main funding page, Resonance, CAF Venturesome, Social
Investment Scotland, Ethex and Access are not. Investors launch funds on
their own funding page and nowhere else. Once the page is watched, a new
fund reaches the review queue the morning after it appears, at no cost.

This is the "better way" in one line: **watch twenty pages instead of
searching the web.** The market is small enough that this covers it.

### 6. Fix the instrument tags so the sub-categories are real. One hour.

Eight live investment rows carry no instrument at all, and two carry
"restricted", which is not one. Until every row has an instrument, a
filter by sub-category is wrong, and the equity-versus-structure gate
cannot protect a charity from being shown a fund it cannot legally take.
The taxonomy already has loan, blended, social_investment, equity,
quasi_equity, convertible, revenue_share and community_shares.

On "impact investment": I would not add it as a tag. Every social investor
calls what it does impact investment, so as a category it would overlap
social_investment on every row and separate nothing. What people mean by
it in practice is the growth-capital end: equity, quasi-equity,
convertibles and revenue share. Those tags exist and have four, zero, zero
and two rows. That is the real thinness, and the fix is finding the
providers, not the label. If you want "impact investment" as a display
grouping over those four tags on the Find Funding page, that is a
rendering decision and a separate conversation.

---

## What not to do

- **No web-search sweep and no language-model candidate list** until steps
  one to five are done. The catalogue's own numbers say one in four search
  results survives, and the survivors are duplicates of providers we hold.
- **No new rows from a homepage.** Every row points at the fund's own page,
  where a fundraiser could apply. A homepage row is how the twenty archived
  rows got there.
- **No fund-first dedup.** Provider name first, always.
- **Not during the freeze.** Steps one to six are catalogue work that ends
  in rows going live, which is user-visible. Each publish batch is your go.
  The reading, staging and watchlist enrolment can happen before that.

## Expected result

From the pile that already exists: nine rows in step one, roughly ten to
fifteen from splitting front doors, five to eight reinstated homepage
providers. That takes investment from 44 to somewhere around 70 live rows
without a single search, most of them loans and blended, with equity and
revenue share moving from six rows to perhaps ten. The directory
cross-check in step four adds the genuinely new providers on top, and I
would guess at fewer than ten of those because the market is that size.

The number I am least sure of is the front-door split, because a provider
page can list six funds and have one open. Step two's synthetic check is
there for that reason.

## What I need from you

One decision now: is "impact investment" a tag, or a display grouping over
equity, quasi-equity, convertible and revenue share? My recommendation is
the grouping.

Then a go for each publish batch, per the freeze.
