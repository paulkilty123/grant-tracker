# Grant Tracker — Business Viability Reassessment
**April 2026**

---

## Executive Summary

Grant Tracker operates in a genuine, large, and underserved market. The UK grant funding ecosystem distributed **£23+ billion** across more than 14,000 grant-makers in 2023-24, and the addressable customer base — registered charities, CICs, and social enterprises — numbers well over **300,000 organisations**. The market need is real and growing: grant application volumes are surging (some foundations reporting 50–400% increases), meaning organisations need smarter tools more urgently than ever.

**The honest verdict: conditionally viable, but the window is narrowing.** The technical foundation is strong, the strategic insight is sound, but the product is currently thin on the one thing that makes the entire proposition work — grant catalogue depth. A sophisticated matching engine on a ~300-grant database is like a GPS with half the roads missing. Fixing this is not optional; it is the single highest-leverage action available.

---

## 1. Market Opportunity

### Size and Addressable Base

The market is bigger than it appears from the pricing tier alone.

- **170,000+** registered charities in the UK
- **37,000+** Community Interest Companies (growing 12% year-on-year)
- **131,000+** social enterprises contributing £78 billion to the economy
- **Total addressable organisations: ~300,000+**, of which a realistic serviceable market is the ~50,000–80,000 organisations with annual income above £30,000 who are actively pursuing grant funding

At £115/year, capturing just **5,000 subscribers** generates £575,000 ARR — enough to be a self-sustaining business with a lean team. That is less than 2% of the serviceable market.

### Market Tailwinds

The conditions are actively improving for a tool like Grant Tracker:

- Foundation grant-making hit a record **£8.24 billion** in 2023-24 (up 6% in real terms), meaning there is more money flowing into the system
- Application volumes are surging dramatically — competition for grants is intensifying, making quality matching and preparation support far more valuable
- The UK charity sector's income crossed **£100 billion** in early 2025, signalling sector health
- The UK government is actively unlocking new philanthropic investment pipelines
- **73% of UK charities feel unprepared for AI** — a huge opportunity for a tool that brings AI capability in a sector-specific, approachable way

### Market Headwinds

- Small and medium charities remain cash-constrained on technology spend, making conversion harder
- ~19% of UK charities are still at the first stage of digital adoption — some segments of the market will be slow to convert
- The public spending environment is difficult, increasing grant competition and potentially reducing some statutory funding streams

---

## 2. Competitive Landscape

This is where the picture gets more complicated. The competitive environment has changed significantly, and the strategic response matters.

### Incumbent Players

**Idox GrantFinder** is the established market leader, with 8,500+ continuously updated funding opportunities and roots going back to 1985. Its pricing appears enterprise-oriented (custom quotes, not published), which historically left a wide gap at the SME/small charity level — the gap Grant Tracker was built to fill. However, Idox has also launched free-tier access for organisations with under £30,000 income (via My Funding Central), which captures the bottom of the market.

**360Giving / GrantNav** is free and covers over £300 billion of historical grants data from 300+ UK funders. It is a research tool, not a matching tool, but its existence means "free grant discovery" is already a known commodity. Grant Tracker must be better, not cheaper.

**Grants Online, GrantFinder.co.uk** are established UK directories. Functional but static — no matching intelligence, no CRM layer, no AI.

### New Entrants — This Is the Urgent Concern

**Instrumentl** (US-based, but expanding) just raised **$55 million from Summit Partners** in April 2025 to accelerate its AI grant fundraising platform. Instrumentl's pricing starts at $179/month (~£140/month). They are well-funded, have momentum, and will likely pursue UK expansion aggressively. This is the most serious competitive threat.

**Granter.ai** is an AI-native grant consultant (not just a database) with 800+ businesses on its waitlist. It was explicitly planning UK expansion in Q4 2025. Its model — autonomous AI agent that finds, drafts, and manages grant applications — represents a different but powerful approach to the same problem.

**Charity Excellence** offers a free ChatGPT-powered grant finder. Free tools that are "good enough" will suppress willingness to pay at the low end of the market.

### Competitive Position Summary

| Player | Catalogue Depth | Matching Intelligence | CRM/Pipeline | UK-Specific | Price Point |
|--------|----------------|----------------------|--------------|-------------|-------------|
| Idox GrantFinder | ★★★★★ | ★★★ | ★★★ | ✓ | £££ (enterprise) |
| Grant Tracker | ★★ | ★★★★ | ★★★★ | ✓ | £ |
| Instrumentl | ★★★★ | ★★★★ | ★★★★ | ✗ (US-focus) | ££££ |
| Granter.ai | ★★★ | ★★★★ | ★★★ | Expanding | Unknown |
| 360Giving / GrantNav | ★★★★★ | ★ | ✗ | ✓ | Free |
| Charity Excellence | ★★★ | ★★ | ✗ | ✓ | Free |

Grant Tracker's current competitive advantage is: **the most intelligent matching engine at the most accessible price point, with a UK-sector-specific lens**. That is a real and defensible position — but only if the catalogue depth is fixed.

---

## 3. Current Product State

### Genuine Strengths

The codebase is more mature than a "side project" and reflects serious product thinking:

- **Sophisticated matching algorithm** (1,286 lines of TypeScript) — 5-dimensional scoring, IDF-weighted sector matching, structure mismatch caps, title keyword veto logic. This is not a simple keyword search; it is proprietary matching intelligence that took real effort to build.
- **Full funding type taxonomy** — Grants, Programmes, Investment, In-Kind properly classified and searchable, with nuanced sub-types. This matters because most directories treat all funding as "grants."
- **Pipeline CRM** — deadline tracking, application stage management. Rare in this price tier.
- **Match Briefing** — funder language analysis, criterion matching, watch-outs. This is differentiated; Idox does not have this.
- **Corporate Partners module** — a separate matching library for corporate funding, which most charity tools ignore entirely.
- **Admin/Intelligence layer** — foundations for longitudinal funder intelligence already exist in the codebase (admin/intelligence page, watchlist, discovery panels, 360Giving integration panel).
- **Local funding page** — geography-aware grant discovery, which is a persistent pain point for charities serving specific regions.
- **Alert system** — proactive notification infrastructure already built.

### Critical Weaknesses

**Catalogue depth is the single biggest problem.** ~300 grants vs. Idox's 8,500+ means that even with superior matching intelligence, users will frequently find nothing relevant. A brilliant recommendation engine on a thin catalogue generates one outcome: churn and word-of-mouth that says "it's good but there aren't many grants on it." The product cannot succeed at current catalogue depth.

**Zero paying customers / unverified willingness to pay.** The pricing (£115/year) is reasonable but untested. The central commercial question — will UK charities actually pay for this? — remains unanswered. This is the most important experiment to run.

**No moat yet on the data side.** The longitudinal funder intelligence concept (timing patterns, award competitiveness, application-to-award ratios) is the right long-term differentiator, but it doesn't exist yet in any meaningful form. Building it requires consistent data collection over time, which must start now.

**Pricing may be too low.** At £115/year (£9.58/month), Grant Tracker is priced below the "software budget" threshold for most mid-sized charities. Idox charges enterprise rates. A charity that successfully wins one additional grant through Grant Tracker could be winning £5,000–£50,000. The ROI argument supports a price point of £25–40/month (~£300–480/year) without friction — potentially 3–4x current pricing.

---

## 4. Financial Viability Scenarios

### Scenario A — Current trajectory (no major changes)
- Catalogue stays thin, word of mouth is lukewarm
- Instrumentl and Granter.ai enter UK market with heavy marketing budgets
- Conversion rate is low; churn is high
- **Outcome: not viable.** Revenue never reaches self-sustaining level before competitive pressure overwhelms a thin product.

### Scenario B — Catalogue fix + pricing increase + 18-month runway
Assumptions:
- Catalogue grows to 1,500+ grants within 6 months (via 360Giving import + targeted scraping)
- Pricing increased to £25/month or £200/year (with 6-month tier at £120)
- First 200 paying subscribers within 12 months via targeted outreach to charities / CVSs
- Funder intelligence data collection begins now

| Metric | Month 6 | Month 12 | Month 18 |
|--------|---------|---------|---------|
| Subscribers | 50 | 200 | 500 |
| Annual pricing | £200 | £200 | £220 |
| ARR | £10K | £40K | £110K |
| Monthly cost (Vercel + Supabase + Claude API) | ~£150 | ~£300 | ~£600 |

At 500 subscribers, this is a real business generating meaningful income. Still small, but de-risked and defensible if the intelligence data moat is being built.

### Scenario C — Accelerated path
If a partnership with a Councils for Voluntary Service (CVS) network or national umbrella body (e.g. NCVO, NAVCA) can be secured, the go-to-market changes entirely. CVSs serve thousands of local charities; a single institutional deal could bring 200–500 users in one transaction. This is the fastest route to viability and would also validate the product credibly.

---

## 5. The Strategic Bets That Matter

### Must-Win (Existential)

**1. Fix catalogue depth within 90 days.** 360Giving has open data covering £300 billion of historical grants from 300+ UK funders. The admin panel already has a 360Giving integration panel. This is the fastest legitimate route to a deep, current catalogue. Supplemented with targeted scraping of major trust and foundation websites, getting to 1,500+ grants is achievable. Without this, nothing else matters.

**2. Get the first 10 paying subscribers within 60 days.** Not as validation of the business model — as forcing function to learn. Cold outreach to 50 UK charities or CICs who are actively fundraising. Offer a 3-month free trial in exchange for a structured feedback session. Convert 10 to paying. The learnings from this will reshape every product decision.

### Should-Win (Differentiation)

**3. Begin logging funder intelligence data now.** Every grant that is added should capture: open date, close date, award decision date (when published), total pot, number of awards, average award size. This data has almost no value today but becomes the moat in 18-24 months. "This funder typically opens in October, runs for 6 weeks, awards to 8% of applicants at an average of £12,500" is information that does not exist anywhere publicly. This is the Bloomberg Terminal thesis.

**4. Raise the price.** £115/year is below the psychological threshold for "professional tool." Increase to £199/year (or £20/month) and test whether conversion rate changes meaningfully. The ROI for a charity that wins one grant is enormous. Own that framing.

**5. Identify one CVS or umbrella body partnership.** A single deal with an organisation like NAVCA, NCVO, or a large regional CVS that co-promotes Grant Tracker to its member charities in exchange for a revenue share or subsidised group access would be transformative for early growth.

### Nice-to-Win (Future Moat)

**6. Match Briefing as a premium feature.** The match briefing page already exists in the codebase. It analyses funder language, surfaces the criteria that matter, and flags watch-outs. This is a genuinely differentiated feature that Idox does not have. Gate it behind a paid tier or present it as a clear upgrade driver.

**7. Shoots.** The micro-grant cohort idea is interesting but is a distraction until Grant Tracker has 500+ paying subscribers. Prove Grant Tracker first.

---

## 6. Key Risks

**Competitive intensity** is the biggest existential risk. Instrumentl's $55M raise means they have the capital to build a UK-specific product, hire a UK sales team, and price aggressively to acquire market share. The window for Grant Tracker to establish a defensible user base is likely 18–24 months.

**Catalogue quality vs. quantity.** Importing data at scale is easy; keeping it accurate and timely is hard. A grant that closed 3 months ago still appearing in results destroys trust faster than a thin catalogue does. Data freshness infrastructure must be built alongside catalogue expansion.

**Willingness to pay in the sector.** UK charities are under financial pressure. The "free tools are good enough" argument will be made. Grant Tracker needs a clear, honest answer to "why pay when 360Giving is free?" — the answer is matching intelligence + pipeline management + briefing + intelligence, but that message must be tested with real users.

**Solo founder bandwidth.** Grant Tracker is, as best as can be assessed, a solo project. The catalogue expansion, sales outreach, product development, and customer success work needed in the next 6 months is significant. Prioritisation is critical; parallelisation requires either funding or a co-founder/contractor.

---

## 7. Overall Viability Verdict

**Grant Tracker is viable, but not yet proven.** The market is real, the technology is ahead of many competitors in intelligence and UX, and the pricing leaves room to raise while remaining competitive. The strategic insight — that longitudinal funder intelligence is the durable moat — is correct and not yet matched by any competitor.

The path to viability requires three things happening in the next 6 months:

1. **Catalogue to 1,500+ grants** — the product simply cannot be sold on a ~300 grant database
2. **First paying customers** — even 20–30 paying subscribers validates the model and forces clarity on positioning
3. **Funder intelligence data collection begins** — the clock on building the moat started the day the first grant went live; every day without logging decisions is data lost forever

If these three things happen, Grant Tracker has a plausible path to £100K+ ARR within 18 months and a genuinely defensible position before Instrumentl or Granter.ai can dominate the UK market.

If they don't happen in the next 6 months, the competitive window narrows materially and the opportunity is harder to recover.

---

*Prepared April 2026. Market data sourced from NCVO, Charity Commission, 3rd Sector Mission Control, Grand View Research, and Instrumentl/Crunchbase public disclosures.*
