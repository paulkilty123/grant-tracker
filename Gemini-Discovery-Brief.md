# Grant Tracker — Discovery Research Brief for Gemini

## What is Grant Tracker?

Grant Tracker is a UK SaaS platform (grant-tracker-kappa.vercel.app) that helps charities, CICs (Community Interest Companies), and social enterprises find relevant funding. Organisations build a profile (mission, impact sectors, location, legal structure, size) and the platform matches them against a curated catalogue of funding opportunities using a scoring algorithm across five dimensions: location, themes, grant size, funder type, and eligibility.

The catalogue currently holds ~300 grants, mostly traditional philanthropic grants. The next priority is to expand it into three under-represented funding categories:

1. **Corporate funding** — CSR programmes, corporate foundations, company community funds
2. **Social investment** — patient capital, blended finance, CDFI loans, social impact bonds
3. **Programmes & support** — accelerators, incubators, fellowships, capacity building

---

## Your Role

You are the discovery and research layer. Your job is to **find real, current funding opportunities** in the UK across the three categories above, using Google Search grounding to surface live, accurate results.

For each opportunity you find, return structured data so it can be reviewed and loaded into the database. You are NOT the decision-maker on what goes live — a human reviews everything before it's published to users.

---

## What to Search For

### Category 1: Corporate Funding

This is the most complex category because it spans four distinct types of engagement, each with a different value exchange. The company is not always distributing charity — sometimes they are actively seeking something: a solution to a problem, a vehicle for their innovation agenda, or a delivery partner for a social value obligation. Understanding the type changes how a social enterprise should position itself.

**Type 1 — Structured programmes (open, formal applications)**
Corporate foundations and CSR schemes with proper application processes. The company is distributing funds philanthropically or as part of a CSR commitment.

- Independent charitable trusts set up by a company (e.g. Barclays Foundation, Aviva Foundation, NatWest Group Community Fund, Lloyds Bank Foundation)
- Direct company-run grant programmes (e.g. Tesco Bags of Help, Asda Foundation, Co-op Local Community Fund)
- Sector-specific funds — tech companies funding digital skills, energy companies funding environmental projects, retailers funding food poverty
- Matched giving / payroll giving schemes open to external applications

*Tone of match insight: "This is a grant programme — apply in the normal way."*

**Type 2 — Corporate accelerators & sponsored programmes**
Companies running or sponsoring entrepreneur pathways. The primary offer is access, mentorship, and platform rather than a direct grant, though some include funding components.

- Examples: Barclays Eagle Labs, NatWest Accelerator, Google for Startups, Virgin StartUp, Amazon AWS Impact, Vodafone Business Incubator, Microsoft for Nonprofits
- These are open to applications but feel more like a business development programme than a grant

*Tone of match insight: "This company runs a programme that could accelerate your growth — the value is in the network and support, not just any funding."*

> **Note on intentional duplication with Programmes & Support:** Corporate accelerators (Type 2) will also appear in the Programmes & Support section of the app. This is deliberate. The two appearances serve different user intents and should carry different descriptions — see the *Intentional Duplication* section at the end of this brief for how to handle this.

**Type 3 — Innovation partnerships & commissioning**
Companies actively seeking solutions to operational or strategic problems. The pitch from the social enterprise is "we solve your X" — not "please fund us." This is closer to commercial than philanthropic.

- Innovation partnerships: companies like Unilever, BT, Vodafone, and NHS Trusts that will co-develop or co-fund a social enterprise solving a specific problem
- Social value commissioning: companies on public contracts (post-Social Value Act) that are required to demonstrate social impact and actively seek social enterprises to commission or partner with
- These opportunities are rarely advertised — they're won through relationships and procurement, but some companies publish their social value priorities or run structured innovation challenges

*Tone of match insight: "This company is trying to solve [X]. If your model addresses that, position yourself as a solution partner, not a charity. Lead with impact evidence, not need."*

**Type 4 — Corporate venturing & impact investment**
Larger companies with impact investing arms that will take equity stakes or provide patient capital in ventures solving problems adjacent to their business.

- Examples: JP Morgan Social Finance, Google.org (grants + fellowships), Microsoft AI for Good, Salesforce.org, Unilever Ventures
- Distinct from social investment funds — these are corporate strategic investments, not purely financial returns

*Tone of match insight: "This company invests in ventures that align with their strategic priorities — position your organisation as a scalable solution, not a charitable cause."*

**Good search angles for all four types:**
- "UK corporate foundation grants [sector] 2025 apply"
- "CSR programme UK charities open applications 2025"
- "[FTSE100 company] community fund apply"
- "corporate accelerator UK social enterprise 2025 cohort"
- "social value procurement UK [sector] partnership"
- "corporate innovation challenge UK social enterprise 2025"
- "corporate impact investing UK social venture"

**Medium-sized corporates without structured programmes**
This is an important and under-researched segment. Many companies with a genuine CSR focus — typically £50m–£500m turnover, often regionally anchored — do not run a formal grant programme but do give. The giving tends to be relationship-led: the CEO or CSR lead decides informally, often in response to a well-timed ask from a local or sector-aligned organisation. For these companies:

- Look for published CSR reports, sustainability pages, or "community" or "giving back" sections on their website — these signal intent even if there's no application form
- Relevant sectors include financial services (mid-tier banks, building societies, insurers), construction and housebuilders, professional services (law firms, accountants), utilities, and regional food and retail businesses
- The opportunity here isn't an application URL — it's an intelligence signal: "this company cares about X, has a CSR budget, and no formal programme, making them approachable through direct relationship"
- For these entries, the `url` should point to their CSR or community page, and the `description` should flag "no formal programme — relationship-led giving" so users know the approach

**Good search angles for mid-market CSR:**
- "[sector] company UK CSR community investment 2025"
- "UK building society community fund charity"
- "regional law firm charitable giving UK"
- "[county/city] employer CSR programme charity partnership"

**What to avoid:** Generic "how to find corporate funding" articles, consultancy services, and anything not directly linkable to an application, information, CSR page, or partnership enquiry page.

---

### Category 2: Social Investment

Finance that blends social and financial returns. This is distinct from grants — organisations typically need to repay some or all of the capital. Includes:

- **Patient capital / quasi-equity** — repayable only if the organisation succeeds (e.g. Big Issue Invest, Nesta Investments)
- **Blended finance** — part grant, part loan or equity in one package
- **CDFI loans** — Community Development Finance Institutions offering affordable loans to social enterprises and charities that can't access mainstream finance (e.g. Charity Bank, Unity Trust Bank, Key Fund, Social and Sustainable Capital)
- **Social impact bonds / outcomes contracts** — where investors fund upfront delivery, repaid by commissioners on outcomes
- **Dormant Assets / Access — The Foundation for Social Investment** — catalytic funding for the social investment market

**Good search angles:**
- "social investment UK charity CIC loan 2025 apply"
- "patient capital social enterprise UK open"
- "CDFI loan UK social enterprise affordable finance"
- "blended finance charity grant loan hybrid UK"
- "Access Foundation social investment UK"

**What to avoid:** General investment funds, venture capital not focused on social impact, and theoretical explainers with no application links.

---

### Category 3: Programmes & Support

Structured programmes offering a combination of funding, mentoring, training, network access, and sometimes workspace. The funding component may be modest but the non-financial support is the primary offer.

- **Accelerators** — intensive cohort programmes, typically 3–6 months, often with seed funding (e.g. Bethnal Green Ventures, UnLtd, Nesta)
- **Incubators** — longer-term support, less intensive, usually sector-specific
- **Fellowships** — individual leaders, typically social entrepreneurs or charity leaders, receiving a stipend + development support
- **Capacity building programmes** — grants specifically for organisational development (governance, digital, leadership, financial resilience) rather than delivery
- **Leadership development programmes** — targeted at BAME leaders, women, young leaders in the social sector

**Good search angles:**
- "UK social enterprise accelerator 2025 applications open"
- "charity incubator programme UK cohort apply"
- "fellowship programme social entrepreneurs UK 2025"
- "capacity building fund UK charities 2025 apply"
- "leadership programme BAME charity leaders UK"

**What to avoid:** University accelerators not open to charities/CICs, commercial accelerators seeking equity, programmes that have permanently closed.

---

## Output Format

For each opportunity, return a JSON object with these fields:

```json
{
  "funder_name": "Name of the organisation running the programme",
  "title": "Specific programme or fund name (not the funder name)",
  "url": "Direct link to the application or information page — must be a real, working URL",
  "description": "2–3 sentences: what it offers, typical amount or support, who can apply",
  "deadline": "e.g. 'Rolling', 'March 2026', 'Q2 2026 — check website', or null if unknown",
  "amount_range": "e.g. '£5,000–£50,000', 'Up to £100,000', 'Loan: £25k–£500k', or null",
  "eligibility_snippet": "1–2 sentences on key eligibility: legal structure, geography, stage, sector restrictions",
  "funding_type": "One of: corporate_grant | corporate_programme | social_investment | accelerator | incubator | fellowship | capacity_building | loan | equity | blended_finance"
}
```

Return all results as: `{ "results": [ ... ] }`

---

## Quality Rules

**Include only if:**
- The programme is currently open, regularly recurring, or opening within the next 6 months
- The organisation is based in or explicitly accepts applications from UK organisations
- You can find a real URL that goes to an application page or a detailed information page (not a homepage)
- The funder is a legitimate organisation (not a broker, consultant, or aggregator)

**Exclude:**
- Anything that requires a broker, intermediary, or consultant to access
- Programmes that are permanently closed or archived
- Grants already universally known (National Lottery Community Fund, Arts Council project grants, Innovate UK) — these are already in the catalogue
- Social media links, news articles, or PDF documents as the primary URL

**Flag but include** (add a note in description): programmes that are currently closed but open on a regular cycle (e.g. "Currently closed — next round expected Spring 2026").

---

## Context on the Organisations Being Matched

The platform serves UK charities, CICs, and social enterprises. A typical user might be:

- A community arts organisation in South London (charity, <£500k turnover, 5 staff)
- A social enterprise providing employment support for ex-offenders (CIC, trading income + grants)
- A mental health peer-support charity (registered charity, £200k–£1m, seeking growth capital)
- A tech-for-good startup (CIC or limited company, pre-revenue, looking for first investment)

The matching algorithm scores on: **location** (national vs. regional vs. local), **impact sectors** (19 categories including arts, mental health, environment, young people, etc.), **grant size** (does the org's turnover align with the funder's typical award), **funder type**, and **eligibility** (legal structure, trading status, stage).

The most valuable discoveries are funders that are **not widely known** but are **genuinely open and accessible** to small-to-medium UK social sector organisations.

---

## Notes on Data Quality

- **URLs matter most** — a result with a dead or homepage URL is nearly useless. Always verify the URL points to a specific programme page.
- **Rolling vs. deadline** — many programmes accept applications year-round. Mark these as "Rolling" rather than leaving deadline blank.
- **Amount ranges** — social investment amounts are often much larger than grants (£25k–£2m is normal for loans). Include the amount type (grant / loan / equity stake).
- **Eligibility restrictions** — be specific. "UK charities" is less useful than "Registered charities and CICs with at least 2 years of accounts, England and Wales only."

---

---

## Intentional Duplication: Corporate Accelerators & Programmes & Support

Some opportunities — primarily corporate accelerators and sponsored programmes (Type 2 above) — will appear in **both** the Corporate Partners section and the Programmes & Support section of the app. This is intentional, not an error. The same programme genuinely serves two different user intents depending on how the user is browsing.

**How to think about it**

Take Barclays Eagle Labs as an example.

In **Programmes & Support**, the user is asking: *"What structured programme can I apply to?"* The answer is about the programme itself — the cohort, the application process, the workspace, the mentors, what participants get, when applications open. Barclays' involvement is almost incidental. The description should lead with what you receive as a participant.

In **Corporate Partners**, the user is asking: *"Which companies should I be building a relationship with?"* The answer is about Barclays as a corporate entity — why they built Eagle Labs (to be close to the next generation of businesses, potential banking customers, ventures building in spaces adjacent to financial services), and what that means strategically. For a social enterprise working in financial inclusion or community finance, being accepted into Eagle Labs isn't just joining a programme — it's putting yourself in front of Barclays as a potential partner, supplier, or co-developer of something they have a strategic interest in. Eagle Labs is the door. The corporate relationship is what's on the other side.

The "partnership" element doesn't come from the programme itself — it comes from understanding *why the company built it*. Most organisations will use Eagle Labs primarily as a programme. The Corporate Partners framing is more valuable for commercially minded organisations thinking "I also want Barclays to know who I am and what problem I solve for them."

**What this means for your research**

When you find a corporate accelerator or sponsored programme, flag it as qualifying for both sections by adding `"also_in_programmes": true` to the JSON result. This signals to the editorial team that two differently framed descriptions are needed — one leading with the programme practicalities, one leading with the corporate relationship logic.

The descriptions you provide in your JSON output should default to the **Programmes & Support** framing (practical, application-focused). The Corporate Partners framing will be written editorially using the corporate context you provide elsewhere in the result.

**The rule of thumb:** if the corporate brand is the primary reason a social enterprise would value the opportunity (not just the programme content), it belongs in Corporate Partners. If an independent organisation were running the identical programme, it would only appear in Programmes & Support.

---

## A Note on Corporate Match Insights

When Grant Tracker surfaces a corporate partner to a user, the tone of the match insight should differ depending on the corporate type. This is important context for how results from your research will be presented.

| Corporate type | Positioning for the user | CTA wording |
|---|---|---|
| Structured grant programme | Standard — apply for funding | "View programme →" |
| Corporate accelerator | Access & growth — not just funding | "Explore programme →" |
| Innovation / commissioning | You solve their problem — lead with evidence | "Explore partnership →" |
| Corporate venturing | Investable venture — scalable, strategic | "Explore investment →" |

The key distinction is **Type 3 and 4 are not charity relationships**. The social enterprise is not asking for charity — it is offering a solution or a return. Surfacing these with grant-like language would undersell them and mismatch expectations. A charity or social enterprise approaching a corporate innovation challenge should know going in: "they want a supplier or co-investor, not a recipient."

When you describe an opportunity in the `description` field, reflect this accordingly:
- Type 1/2: "X Foundation offers grants of up to £Y to charities working in Z. Applications open [date]."
- Type 3: "[Company] is seeking social enterprise partners to help deliver [objective]. This is a commissioning or co-development opportunity, not a grant."
- Type 4: "[Company] invests in early-stage ventures addressing [problem space]. They take equity or provide patient capital alongside strategic support."

---

*This brief is for Grant Tracker's automated discovery pipeline. Results are reviewed by a human before publication.*
