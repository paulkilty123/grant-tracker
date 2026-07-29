# Manchester and homelessness catalogue research — 29 July 2026

Prompted by onboarding Mustard Tree, a Greater Manchester anti-poverty and
homelessness charity. Six parallel desk-research passes plus a reverse-lookup
from charity accounts. **27 funds staged, all inactive behind the review gate.**

Every URL was independently re-verified before staging. Amounts and deadlines
were recorded only where the funder's own page states them.

---

## The incoming charity, from its own 2024-25 accounts

Useful context, and it validates the profile:

- Revenue **£2.137m**, 45 staff, 100 volunteers, 340 trainees
- Three community shops: Ancoats, Eccles (Salford), Little Hulton
- Trust portfolio is **four large national funders and nothing else**:
  - National Lottery Community Fund — £498,232 over 5 years
  - Garfield Weston — £200,000 over 2 years
  - Manchester City Council — £230,000, 2-year ESOL and training contract
  - Zochonis Charitable Trust — £50,000

That concentration is the finding. The gap is small local trusts, and that is
what this research went after.

---

## Best fits found

| Fund | Why | Deadline |
|---|---|---|
| **Henry Smith — Welcome for Newcomers** | £200k over 3 years, **no income cap at all** | 26 Aug 2026 |
| **Edward Holt Trust** | GM homelessness, income ceiling £3m, multi-year | 16 Oct 2026 |
| **Peter Kershaw Trust** | GM social welfare, **no maximum grant** | 30 Sep 2026 |
| **Fishmongers' Company** | Prisons/resettlement funded nationally, income band £250k–£5m | reopens ~Dec |
| **Salford CVS** | ~15 Salford funds; the charity has an Eccles hub | rolling |

---

## The £2.1m awkward band

Repeatedly, a fund that fitted on theme excluded the applicant on size:

| Funder | Cap | Verdict |
|---|---|---|
| A B Charitable Trust | £1.5m income | **excluded** |
| The Charity Service | £1m expenditure | excluded |
| The Fore | £500k revenue | excluded |
| Forte (formerly Trusthouse) | £250k / £500k | excluded |
| Torus Foundation | £500k | excluded |
| Barratt Redrow (last round) | under £2m | excluded |
| Edward Holt Trust | under £3m | **fits** |
| Fishmongers' Company | £250k–£5m | **fits** |
| Henry Smith Welcome for Newcomers | none | **fits** |

Too big for small-charity funds, too small for invitation-only corporate ones.
Worth an `income_cap` sweep across poverty-tagged rows.

---

## Material aid: a market gap, not just a catalogue gap

Asked for funders of furniture, white goods and clothing. **Six of the obvious
names are not grant-makers at all** — End Furniture Poverty, Reuse Network,
Turn2us, Trussell, Alexandra Rose, Feeding Britain are advocacy bodies,
networks, or services for individuals.

The funding that exists flows either as **goods** or as **grants to individuals
via frontline referrers**. Staged as in-kind: In Kind Direct, Neighbourly,
FareShare Greater Manchester, The Hygiene Bank, Wickes.

**Neighbourly is structurally important** — Aldi, Lidl, M&S and Sainsbury's
community giving all runs through it. Their own corporate pages are dead ends.

If the catalogue only models cash grants to organisations, it will structurally
under-serve this charity type.

---

## Real funders with no public application route

Named in real accounts, no website, no route. Exactly the invisible kind — and
not addressable by any scraper.

- **The Booth Charities** (221800) — Salford only, distributes ~£1.0m a year,
  charitable expenditure £978,000. Domain does not resolve. Significant for any
  Salford-delivering charity; the approach is a letter to the Salford office.
- **The Barnabas Charitable Trust** (299718) — inner-city Manchester, Sheffield
  and Liverpool. No website. Not the international Barnabas Fund (1092935).
- **The Remembering Nell Foundation** — Manchester, memorial fund, domain dead.
- **"Dickanson's Charity"** — on the Booth Centre's funder wall exactly as
  spelled; could not be matched to a registered charity. Possibly a typo.

---

## Referral routes, not income

Worth telling a frontline charity about, but not catalogue rows:

- **Manchester Relief in Need Charity** — hardship grants to individuals,
  applied for by a support worker on a client's behalf. Rolling, monthly.
- **Macc / Real Change Manchester** — practical items for people leaving the
  streets, drawn down by partner organisations. £476,486 over 10 years.
- **GM Migrant Destitution Fund** — up to £80/month to individuals with no
  recourse to public funds, via referral partners.

---

## Closed, with a known or likely return

Staged as watch-list rows carrying `next_open_date`:

- **GM Mayor's Charity** — all four programmes shut. On remit the best fit in
  Greater Manchester for this charity type. £4.7m distributed since 2019.
- **GM Environment Trust "Renew"** — clothes, furniture, bikes, tools
  redistribution, GM-specific. Closest thing to a furniture fund that exists.
- **Glasspool Flexible Frontline Fund** — best-fit material aid nationally. No
  new partner round before 2027.
- **Skipton Charitable Foundation** — reopens 1 Sep 2026. Funds core costs.
- **Fishmongers' Company**, **City & Guilds Local Community Skills Fund**.

---

## Large funders confirmed closed or invitation-only

Saves anyone the trip:

- **Oak Foundation** — winding down housing and homelessness grant-making after
  three decades.
- **Tudor Trust** — invitation-only since the racial-justice restructure.
- **Sylvia Adams Charitable Trust** — closed permanently, spent out.
- **Justice Together** — no further open rounds.
- **St James's Place** — widely listed as an open £90k funder; its own site says
  invitation only.
- Also invitation-only or no unsolicited route: Berkeley, Barratt Redrow, Wates,
  Openwork, Mace, Willmott Dixon, Coutts, Peter Sowerby, Steel, Unbound
  Philanthropy, The Bell Foundation, Julia Rausing.

---

## Follow-ups

1. **London homelessness charities' accounts are the biggest unworked seam.**
   Providence Row, The Passage, Thames Reach, Connection at St Martin's, Depaul,
   Centrepoint, St Mungo's all publish long text-based trust lists. A pass
   targeting just their annual report PDFs would likely double the funder list.
2. **Roughly half of small-charity filings are image scans with no text layer.**
   `tesseract` on the machine running the research would materially raise the
   hit rate. Charity Commission accounts are reachable programmatically via
   `/charity-details/<orgid>/accounts-and-annual-returns`.
3. **GrantNav (360Giving) returned 503 throughout**, so the open-data
   cross-check never ran. Worth retrying.
4. **manchester.gov.uk returns 403 to automated fetches** and loads fine in a
   browser. Its Neighbourhood Investment Fund and Community Events Funding are
   both described as open and are unverified for that reason. Add to the
   reader-proxy host list.
