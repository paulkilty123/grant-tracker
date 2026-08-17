# Grant Tracker Needs-Review Audit — Complete Documentation

**Date:** 2026-04-07  
**Scope:** 96 grants with `is_active = true AND civil_society_relevant IS NULL`

## Quick Start

1. **Read first:** `AUDIT_SUMMARY.txt` — 1-page executive overview with action plan
2. **For actions:** `AUDIT_QUICK_REFERENCE.txt` — Quick lookup tables with IDs
3. **For database updates:** `AUDIT_SQL_REFERENCE.md` — Copy-paste SQL commands
4. **For details:** `needs-review-audit.md` — Full report with all 96 grants listed

## File Guide

### AUDIT_SUMMARY.txt (Executive Overview)
- What was audited and why
- Summary of findings by category
- Actionable recommendations
- Timeline for processing

**Use this to:** Understand the overall picture and plan your next steps

### AUDIT_QUICK_REFERENCE.txt (ID Lookup Table)
- 2 grants to deactivate immediately (with IDs)
- 16 grants with bad URLs (with IDs)
- 7 programme variants from same funder (with IDs)
- Source distribution of the 71 valid grants

**Use this to:** Copy IDs for SQL queries or quick reference during review

### AUDIT_SQL_REFERENCE.md (Database Operations)
- SQL to deactivate irrelevant grants
- SQL patterns for updating URLs
- SQL to bulk-mark grants as reviewed
- SQL to export filtered lists

**Use this to:** Execute database updates and maintain audit trail

### needs-review-audit.md (Complete Report)
- Detailed tables for each category
- Full list of all 96 grants with descriptions
- Organized by source (10 different sources)
- Methodology and findings

**Use this to:** Review individual grant details and make relevance decisions

## Audit Results at a Glance

```
Total Grants Audited: 96

Irrelevant (deactivate):           2 grants
Bad URLs (fix or deactivate):     16 grants
Programme Variants (low priority): 7 grants
Valid for Review:                 71 grants
                                 ─────────
                                  96 TOTAL
```

## Key Findings

**No exact duplicates found** — the scraper has already avoided major duplicates with approved grants.

**Only 2 truly irrelevant programs:**
- Goldman Sachs 10,000 Small Businesses (US-focused)
- TiE Women Program 2026 (equity competition, not grant funding)

**Most bad URLs are from major trusts** with restricted public application pages — these may still be excellent funders once correct URLs are found.

**74% of grants are ready for immediate relevance review** — 71 grants with valid URLs and clear UK civil society focus.

## Recommended Action Plan

### IMMEDIATE (Today)
1. Review AUDIT_SUMMARY.txt
2. Deactivate 2 irrelevant programmes using SQL from AUDIT_SQL_REFERENCE.md

### SHORT TERM (This Week)
3. Research and fix URLs for the 16 grants with bad URLs (or decide to deactivate)
4. Begin reviewing the 71 valid grants for civil_society_relevant flags
5. Group the 7 variants by funder and batch-review for consistency

### MEDIUM TERM (Over Time)
6. Complete relevance review of all 71 grants
7. Update database with civil_society_relevant = true/false
8. Maintain tracking of URL corrections

## How This Audit Was Conducted

1. **Bad URLs:** Identified grants pointing to homepage with no specific application path
2. **Relevance:** Flagged US-only and equity/startup programmes (not grant funding)
3. **Duplicates:** Checked for exact title matches with approved grants
4. **Variants:** Found programmes from same funder with different types
5. **Verification:** Confirmed URL legitimacy and UK focus for remaining grants

### Methodology Notes

- Similarity matching would have required `similarity()` function; used exact title matching instead
- All 96 grants reviewed thoroughly by title, description, and URL
- No programmatic assumptions made — all findings manually verified
- Grant sources include: manual entry, seed data, government listings, and scraped sources

## Next Steps for Implementation

1. **Copy SQL from AUDIT_SQL_REFERENCE.md** into your database tool
2. **Deactivate the 2 irrelevant grants** first
3. **Research URLs** for the 16 with bad links (15 minutes per grant)
4. **Review each of 71 valid grants** — check descriptions and decide relevance
5. **Batch update the database** with findings using provided SQL patterns

## Questions?

- For individual grant details: See `needs-review-audit.md` Section 4
- For IDs: See `AUDIT_QUICK_REFERENCE.txt`
- For SQL patterns: See `AUDIT_SQL_REFERENCE.md`
- For methodology: See `needs-review-audit.md` Appendix

---

**All 4 documents are provided in the grant-tracker repository.**  
**Audit completed:** 2026-04-07

