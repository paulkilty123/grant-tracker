# Grant Tracker MCP — Smoke Test Sheet

**Date:** ____________   **Client:** ☐ Claude Desktop  ☐ ChatGPT  ☐ Gemini  ☐ curl   **Key:** `gt_mcp_…________`

Run the prompts in order in a single conversation. Tick the box if the response matches "Expect". Note anything off in **Notes**.

---

### 1. Health  ☐ pass  ☐ fail
**Prompt:** *"Call the Grant Tracker health_check tool."*
**Expect:** Tool call `health_check` → `status: "ok"`, `catalogue_size` ≥ 575, `rate_limit_status` present.
**Notes:** ____________________________________________________________

### 2. Taxonomy  ☐ pass  ☐ fail
**Prompt:** *"What sector taxonomies does Grant Tracker use?"*
**Expect:** Tool call `get_taxonomy({taxonomy: "sectors"})` → 14 sectors returned.
**Notes:** ____________________________________________________________

### 3. Search  ☐ pass  ☐ fail
**Prompt:** *"Find me open grants for community work in Scotland."*
**Expect:** `search_funding_and_support({funding_type:["grant"], sector:["community"], region:["scotland"]})` → ≥1 result, each with `grant_tracker_url` + `match_quality.signals` populated.
**Notes:** ____________________________________________________________

### 4. Drill-in  ☐ pass  ☐ fail
**Prompt:** *"Tell me more about the first result."*
**Expect:** `get_opportunity_detail` called with the `opportunity_id` from step 3 — not a hallucinated ID. Full description + eligibility returned.
**Notes:** ____________________________________________________________

### 5. Funder intelligence  ☐ pass  ☐ fail
**Prompt:** *"What else does that funder offer?"*
**Expect:** `get_provider_intelligence({opportunity_id: …})` → `active_opportunities.by_type` counts present (grant/programme/investment/in-kind).
**Notes:** ____________________________________________________________

### 6. Zero-result honesty  ☐ pass  ☐ fail
**Prompt:** *"Find mental-health programmes in Yorkshire."*
**Expect:** Zero results returned honestly, with `zero_result_diagnostic` + `adjacent_suggestions`. **Fail** if the model fabricates results or silently broadens the search.
**Notes:** ____________________________________________________________

### 7. Rate-limit observability  ☐ pass  ☐ fail
**Check:** every tool response above has a `rate_limit_status` block; remaining counters decrement across the run.
**Notes:** ____________________________________________________________

---

### Failure quick triage
- **401 `auth_required`** → key wrong or missing.
- **429 + `Retry-After`** → rate-limit; check `details.which_limit`.
- **Tool never appears** → client doesn't speak Streamable HTTP, or SDK <1.26.
- **"Server not found"** → must be `https://www.granttracker.co.uk/...` (apex 307s and some clients drop POST).

### Overall result:  ☐ All pass  ☐ Pass with notes  ☐ Block launch

**Reviewer signature / handle:** _______________________
