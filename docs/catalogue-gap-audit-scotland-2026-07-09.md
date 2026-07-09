# Catalogue Gap Audit — Scotland / Edinburgh (2026-07-09)

**Trigger:** Tinderbox (Edinburgh, music/arts for young people) is the first real user candidate flagged for the adviser. Lesson from the CGK ground-truth run — check local catalogue depth *before* a user's first briefing, not discover it in one.

**Status:** REVIEW DOC — nothing here is live. All candidates staged for Paul's sign-off before activation.

---

## 1. Gap analysis

Scotland overall is healthy — 40 local cash grants, 2nd nationally behind London (vs Manchester's 6). But that depth is Scotland-wide/Glasgow-weighted. **Edinburgh-specific coverage was thin: 1 row** (City of Edinburgh Council). Six real, prominent Scottish funders a local fundraiser would expect to find were absent entirely: Hugh Fraser Foundation, Gannochy Trust, William Grant Foundation, Cattanach, Volant Charitable Trust, SCVO. A SQL dedup check confirmed **zero existing rows (active or archived)** for any of the six — this is genuinely net-new sourcing, not a reactivation case like the larger-awards audit.

Corra Foundation (already catalogued via the Boost Fund) turned out to be under-catalogued in a different way: Boost Fund is one of seven live Corra programmes, six of which — including a four-stream Scottish-Government-funded Alcohol and Drugs Fund up to £120k/year — were missing.

**Verification standard applied to every candidate:** every field taken from the funder's own page (or, where a delivery partner administers applications, that partner's live operational page); numerics carry a verbatim source quote; anything unconfirmable left `null` and flagged — never inferred; no false floors/ceilings; invite-only and closed-window funders flagged explicitly rather than staged as live.

---

## 2. Staged (12 rows, `source='admin:gap-audit-scotland-2026-07-09'`, all `is_active=false` / Needs Review)

| Funder | Row | Amount | Deadline | Note |
|---|---|---|---|---|
| Hugh Fraser Foundation | General Grants | undisclosed (discretionary) | rolling quarterly, next cut-off 31 Jul 2026 | |
| Gannochy Trust | Perth & Kinross Grants | £1,000–uncapped (tiered) | 2 Oct 2026 | Full remit restricted to P&K |
| Gannochy Trust | Scotland Youth Development Grants | £1,000–£10,000 | 2 Oct 2026 | Narrower strand, Scotland-wide |
| Gannochy Trust | Youth Panel Fund | up to £10,000 | 14 Aug 2026 | P&K-only, not Edinburgh-relevant but genuinely open |
| Volant Charitable Trust | Small Grants | up to £5,000 | closed, reopens ~Sept 2026 | Exact reopen date unconfirmed |
| Volant Charitable Trust | Large Grants | £10,000–£75,000 | 28 Sep 2026 | See §3 — resolved an amount conflict |
| Corra Foundation | Henry Duncan Grants 2026 | up to £50,000 | **23 Jul 2026** | Deadline is close — review promptly |
| Corra Foundation | YoYo Fund | up to £10,000 | 1 Sep 2026 | |
| Corra Foundation | Alcohol & Drugs Fund — Local Support Grants | up to £60,000/yr | rolling, through Apr 2029 | |
| Corra Foundation | Alcohol & Drugs Fund — Local Support Micro Grants | £1,000–£15,000/yr | rolling, through Apr 2029 | Fund's own page copy stale ("opens June 2026") — verify live status |
| Corra Foundation | Alcohol & Drugs Fund — Partnership and Delivery Grants | up to £120,000/yr | 18 Aug 2026 | Also open to public bodies (outside our structures taxonomy) |
| Corra Foundation | Alcohol & Drugs Fund — Children, Young People & Families Grants | up to £120,000/yr | 18 Aug 2026 | |

**Boost Fund (existing row, `de330452-…`): no correction needed.** The sourcing pass flagged it as understating Corra's two-tier structure, but the live row's `funder_brief.typical_award` already carries the full split ("Constituted groups and charities: £500–£3,000. Unconstituted groups: £250–£1,500"), and the top-level `amount_min`/`amount_max` (250/3,000) is a defensible envelope across both tiers. Verified before editing — left as-is.

To bulk-remove if unwanted: `delete from scraped_grants where source='admin:gap-audit-scotland-2026-07-09'`.

---

## 3. Volant amount conflict — resolved

The research pass flagged a discrepancy: Volant's own static page states Large Grants are "up to £15k/year, £45k total over 3 years"; Foundation Scotland's live delivery page states "up to £25k/year, £75k total," with a **£10,000 minimum grant request** not mentioned elsewhere. Fetched Foundation Scotland's actual live application page directly (not a cached/indexed copy) to settle it: **£75,000 total / £25,000 per year / £10,000 minimum is correct** — it's the live operational page or Foundation Scotland actually process applications against, Volant's own page reads as stale. Staged with the £75k figures.

---

## 4. Considered and excluded

| Funder | Why excluded |
|---|---|
| **William Grant Foundation** | Invite-only by the funder's own account — "we don't have an open application process," &lt;4% of 2024 grants went to cold-contacted orgs. Listing it as an actionable opportunity would be misleading. |
| **Cattanach** | Rebranded to "Elevate Great"; former grants pages return 404. Current site states no formal application process exists. Nothing to stage or correct (confirmed zero existing catalogue rows). |
| **SCVO** | Does run grant rounds (confirmed via their own 360Giving data, ~£10m since 2014) but almost entirely Scottish-Government digital-inclusion funding, currently between rounds, and gated on already being (or becoming) a Digital Participation Charter signatory. Too narrow/conditional for a general catalogue row — flagged for future digital-inclusion-specific matching if it recurs as a gap. |

---

## 5. Recommendation

Edinburgh-specific depth is still just the one council row plus whatever Foundation Scotland/Robertson Trust/Creative Scotland already surface Scotland-wide (all three confirmed present and reasonably deep in the dedup check) — this pass closes the six-funder gap without over-fragmenting into Perth-only noise (only the genuinely Edinburgh/Scotland-relevant Gannochy row is prioritised; the P&K-only rows are staged for completeness, correctly flagged as not Edinburgh-relevant). Review in the normal Needs Review batch; Henry Duncan's 23 Jul deadline is the one time-sensitive item.
