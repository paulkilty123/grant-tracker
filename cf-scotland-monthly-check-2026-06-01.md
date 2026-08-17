# Scottish community foundations – monthly check

**Run date:** 2026-06-01
**Foundations checked:** Foundation Scotland, Corra Foundation
**Source:** scraped_grants table where funder matches "foundation scotland" or "corra"

## Summary

| Foundation | DB rows | Live funds | Action required |
|---|---|---|---|
| Foundation Scotland | 18 specific + 2 generic landing entries | ~126 (11 paged listing pages) | 1 status flip + large catalogue gap |
| Corra Foundation | 1 (Boost Fund) | 1 (Boost Fund) | None |

The Foundation Scotland live list paginates rounds-based community funds — funds disappear from the list between application windows even though their pages remain live. So "not in pagination" does **not** automatically mean closed. Verified two such cases (Blackford, Bairdwatson) below.

---

## Foundation Scotland

### 🔄 Updated (status flip needed)

**Baillie Gifford International Fund** — currently `is_active=false` in DB, but the live page shows the 2026 round is open now.
- ID: `22b5670a-dc7e-406a-aae4-e7926ea51d78`
- Grant size: up to £5,000 (matches DB)
- Who for: UK-registered charities working on climate-emergency projects outside the UK
- Key dates: enquiry forms deadline 17/08/26, stage-two applications 14/09/26, decisions by 17/11/26
- URL: https://foundationscotland.org.uk/apply-for-funding/funding-available/baillie-gifford-international-fund
- **Recommended SQL:**
  ```sql
  UPDATE scraped_grants
  SET is_active = true, deadline = '2026-08-17'
  WHERE id = '22b5670a-dc7e-406a-aae4-e7926ea51d78';
  ```

### ✓ No changes (verified between-rounds; DB state correct)

- **Blackford Community Fund** — DB deadline 2026-08-07 is the next round (live page also shows 07/08/26). The 13/03/26 round has closed. Fund is between rounds in the listing but page is live; DB is correct.
- **Bairdwatson Charitable Trust** — live page still active; current round closed 06/02/26, no future round date posted yet. DB `is_active=true` is reasonable for now, but worth re-checking next month — if the next round isn't announced by July, consider flipping to inactive.

### ✅ Possibly closed (not in live list; need verification)

These four are in DB but did not appear in the 126-result live pagination. Their pages may still resolve (between rounds) — flagged for future verification rather than immediate change:

- **An Suidhe Wind Farm Community Fund** — DB already marked `is_active=false`; consistent with reality.
- **Barr Education and Training Fund** (id `0b19ebd6-86f5-4dff-a893-e29bd76fd18d`)
- **Beinneun Community Fund** (id `d83e1ad9-b8d5-4367-8a26-0fed8b5698f4`) — DB has `beinneun-community` URL; live list only shows the *Student Scholarship* variant.

### 🆕 Catalogue gaps (large)

Foundation Scotland operates ~126 live funds — DB tracks 18 of them. Most missing rows are wind-farm community funds tied to specific community-council areas (low priority unless a user in that postcode signs up). However, **seven Scotland-wide / multi-region funds** are conspicuously absent and would be valuable adds:

| Title | Scope | Size | Cadence |
|---|---|---|---|
| Volant Charitable Trust grants programme | Scotland-wide | up to £15k/yr × 3yrs (£45k total) | 2-stage, multi-year |
| Volant Charitable Trust Small Grants Programme | Scotland-wide | smaller awards | separate listing |
| PF Charitable Trust | Scotland-wide | up to £5,000 | rolling |
| The Rooney Family Foundation | Edinburgh + Scottish Borders | up to £5,000 | rolling (~6 weeks) |
| Essentia Foundation | (not deep-checked) | – | – |
| Victoria League in Scotland Trust | (not deep-checked) | – | – |
| The Bill and Lorraine Budge Foundation | (not deep-checked) | – | – |

Volant is the most consequential miss — it's the only fund pinned at the top of every page of Foundation Scotland's pagination, suggesting they treat it as a flagship.

Recommended seed pattern (per `catalogue_seed_pattern.md`):
```
funder = 'Foundation Scotland'
funder_type = 'trust_foundation'
is_local = true
location_tag = 'Scotland'
source = 'manual'
is_active = true
url_status = 'unchecked'
```

---

## Corra Foundation

### ✓ No changes

Only one fund is currently open: **Boost Fund** — already in DB (`de330452-6267-4a05-b612-150df595a02a`) with correct URL, amount range £250–£3,000, ongoing deadline. DB state matches live exactly.

The Corra "funding" page also references closed/historical programmes via the "Grant programmes" sub-page; these are not in scope (closed for applications).

---

## Suggested next steps

1. Run the SQL above to reactivate Baillie Gifford International Fund.
2. Decide whether to seed Volant, PF Charitable Trust, and Rooney Family Foundation — three Scotland-wide gaps in the catalogue.
3. Next month: re-check Bairdwatson for a 2026 second-round announcement; if none by Aug, flip to inactive.
