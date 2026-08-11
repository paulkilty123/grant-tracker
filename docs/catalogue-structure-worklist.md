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

### The Bromley Trust — 2 rows *(added 2026-08-11)*

Both `The Bromley Trust — Human Rights` and `— Prison Reform` point at
`https://www.thebromleytrust.org.uk/our-approach/`. Dedicated pages exist:

| Row | Should point at |
|---|---|
| Human Rights | `https://www.thebromleytrust.org.uk/human-rights/` |
| Prison Reform | `https://www.thebromleytrust.org.uk/prison-reform/` |

No split needed — the two rows are already correct in shape. Verified
2026-08-11, both **open**:

> "We have two open grant programmes, Human Rights and Prison Reform, and are
> only able to accept applications for funding which fit within these."

Each dedicated page carries live criteria including the income band
(£100k–£1.2m), which the shared page does not attribute to either programme.
Re-pointing is also what makes the income figure attributable per row.

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

### Baring Foundation — 3 rows created 2026-08-11
Strengthening Civil Society is **open**, deadline 7 September 2026, and is the
only opportunity on the funder's own current-opportunities page. International
Development is between rounds and invite-only. Arts is **absent** from that page
entirely — no closure notice, simply not listed — so its row's URL does not
describe it and it has no evidenced open status.

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

### Somerset Community Foundation — 16 programmes
One row staged so far (Crisis and Resilience Alliance, **open**, deadline
4 September 2026). Of the remainder, 11 are closed with reopen dates from
Autumn 2026 onward — those belong in between-rounds, not in a split queue.

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
