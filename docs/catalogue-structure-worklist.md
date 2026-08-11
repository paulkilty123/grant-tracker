# Catalogue structure worklist — split and re-point

**Opened:** 2026-08-11
**Source:** `reports/catalogue-structure-2026-08-11.json` (9 rows returned
`multiple_funds`), plus per-funder verification since.

One row per fund is the rule. A row that points at a page describing several
funds cannot carry a correct deadline, amount, or eligibility, because there is
no single answer to give. This list tracks those rows to resolution.

**Three outcomes, and they are not the same job:**

- **Split** — the page really does describe several distinct funds. Create one
  row per fund, revive rather than duplicate any archived row, and keep the
  generic row live until the replacements are activated.
- **Re-point** — the right rows already exist; they are just aimed at a shared
  landing page instead of their own. No new rows, only URLs.
- **Not a split** — the "programmes" are navigation categories, past grantees,
  or stages of one process. Recorded so the engine's flag is not re-litigated
  every time it runs.

---

## Re-point

### The Bromley Trust — 3 rows *(done 2026-08-11)*

All three rows pointed at `/our-approach/`, a philosophy page. Paul's review
found the funds actually live behind `/apply-for-funding/`, which names both
programmes and holds the eligibility quiz gating the application form:

> "We can only accept applications for funding that fit within one of our two
> grant programmes: Human Rights Grants Programme, Prison Reform Grants
> Programme"

All three re-pointed there. No split needed — the two programme rows were
already correct in shape. Both verified **open** on 2026-08-11 ("We have two
open grant programmes, Human Rights and Prison Reform"), income band
£100k–£1.2m.

**Still open:** neither programme row has a deadline. The application route is a
quiz then a form, with no stated closing date, so rolling is the likely answer
but it has not been evidenced. Not activatable until it is.

> Note: `/our-approach/` returns **401 to a direct fetch** and reads only through
> the proxy, yet its row showed `url_status: ok` from the 9 August check. The
> link checker is very likely not proxy-aware, so bot-walled funders can show
> green while being unreadable. Own bug, not tracked here.

---

## Split — done, awaiting activation

### Ufi VocTech Trust — 4 rows created 2026-08-11
All four verified **closed** to new applicants, so none is activatable:
Challenge ("Applications are currently closed"), Together ("Applications have
closed", closed 20 July), Activate ("Applications are currently closed", its
advertised next round is January 2026 and already past), Ignite (invitation
only, and only to previously unsuccessful Ufi applicants). Generic row stays
live. See `docs/lifecycle-review-additions-2026-08-11.md` for why this became
the worked example for enrich-before-review.

### Baring Foundation — 3 rows created, resolved 2026-08-11
All three initially pointed at the same generic listing page. The single open
opportunity is a **themed call** under Strengthening Civil Society: legal tools
to hold corporations to account, migration focus, deadline 11am Monday
7 September 2026, £150,000 over three years (or £50,000 over 18 months for
exploratory work).

**Strengthening Civil Society is now live**, re-pointed at the call
announcement, with the real terms taken from the application guidelines PDF.
Arts and International Development stay inactive — no open opportunity. The
generic `Baring Foundation Grants` row is **archived**, superseded.

**The guidelines PDF inverted what the announcement implied**, and this is the
reason enrichment must be given the authoritative document rather than the
nearest page. The news story says applicants need "an annual income in the
region of £2 million", which reads as a target. The guidelines say:

> "have an income of under £2m a year (we have some flexibility with this, if
> your income is slightly over £2m, please get in touch to discuss your
> eligibility)"

That is a ceiling. Enriching from the announcement alone produced a brief
stating income "must be in the region of £2 million" and an exclusion reading
"organisations with annual income significantly below £2 million may fall
outside the target profile" — which would have told an eligible £200k charity it
was out of scope, while `max_org_income = 2000000` sat correctly in the
structured field beside it. Passing the PDF as an `additionalSource` and
re-running produced the correct text. **A funder's announcement is not a
sufficient source when guidelines exist.**

---

## Split — genuine, blocked

### Barrow Cadbury Trust — 6 programmes
Criminal Justice, Economic Justice, Migration, Fair by Design, The Connect Fund.
Blocked: the funder's pages name the programmes but give no amounts or
deadlines, so splitting now produces rows thinner than the one they replace.
Needs per-programme pages, or accept name-and-brief-only rows deliberately.

### School for Social Entrepreneurs — 6 programmes
Trading for Good and its regional variants, Social Investment Gateway. Same
blocker as Barrow Cadbury.

### Somerset Community Foundation — reconciled 2026-08-11
Not a split job after all. The funder's page marks each fund open or closed
explicitly, and the five open ones already had rows, so the work was
reconciliation:

| Fund | Deadline | State |
|---|---|---|
| Crisis and Resilience Alliance | 4 Sep 2026 | Re-pointed, £40k–£80k added. **Staged, not live** |
| HPC Small Grants | **24 Aug 2026** | Deadline was missing entirely; added |
| HPC Open Grants | 7 Sep 2026 | Already correct |
| Oake Sunshine | 12 Oct 2026 | Already correct |
| Social Investment | 21 Aug 2026 | Already correct |

**`Stronger Communities Fund` was `is_active = true` while the funder's page
read "Closed. Expected to re-open: Autumn 2026."** Live and wrong to users, and
it is the fund Charlotte flagged, so a cohort user could see it. Now between
rounds. Mendip Hills also corrected (we held Autumn 2026 against the funder's
Early 2027).

**Gap:** `WCS Pickford Trust Fund` has no row at all. Closed, so low priority.

---

## Not a split — verified, do not re-open

| Row | Engine flagged | What it actually is |
|---|---|---|
| The Grocers' Charity | 18 "programmes" | Past grantee categories, not funds |
| Fishmongers' Company — Charitable Grants | 2 "programmes" | Stages of one application process |
| The Julia Rausing Trust — Grants | 3 "programmes" | Navigation categories (Giving Themes, Place-based, Strategic) |

The engine will keep flagging these on every run; that is expected, and the
answer is recorded here rather than re-derived.

> Julia Rausing separately carries evidence for `is_invite_only = true`, held
> pending the invite-only decision.
