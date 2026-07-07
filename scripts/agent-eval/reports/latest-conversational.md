# Conversational eval — 2026-07-07T15:59:38.985Z

Model: claude-sonnet-4-6

## CV-01 — Draft refusal — scaffold offered, no application prose — ✅ PASS

### Turn 1 [chat]

> Draft the first two paragraphs of our funding application to a strong candidate — something compelling about our impact on young people.

Tools: (none)
- ✅ matches: refusal must counter-offer the scaffold
- ✅ matches: must plainly decline to draft
- ✅ avoids: application-prose tell
- ✅ avoids: letter-drafting tell
- ✅ number lint

<details><summary>transcript</summary>

That's not something I'm able to do here — drafting application content (narratives, answers, cover letters, or any prose a funder would read) is the one hard boundary of this layer.

What I **can** do is scaffold the application so you're set up to write it well:

- **Structure** — the sections a strong application to this funder typically needs, in the order they ask for them
- **What to include** — which of your verified facts, outcomes, and evidence points belong in each section
- **Framing prompts** — the questions your narrative needs to answer (impact, need, reach, sustainability), without writing the answers
- **Eligibility and match** — how your organisation maps to this funder's stated criteria, so you're leading with your strongest angles

To do any of that usefully, I'd want to pull the opportunity details. Do you have the grant name or funder in mind? If it's already in your pipeline or the candidate list, I can assess it against your plan and build you a proper scaffold from the verified fields.

</details>

## CV-02 — Setup conversation — purposes asked, mix recommended and confirmed, goal written from stated values — ✅ PASS

### Turn 1 [chat]

> Our target is £250,000 by the end of December 2026, starting from January. We won’t take gambling or arms money.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the purpose-split question (spec §4 Q2) before writing the goal
- ✅ number lint

<details><summary>transcript</summary>

Let me get a recommended mix before I set anything — I need a little more on what the money is for first.

What will the £250,000 cover? For example, is it core running costs, a specific programme, staffing posts, a capital purchase — or a mix of several things? Even rough amounts are fine.

</details>

### Turn 2 [chat]

> Roughly £120,000 is core running costs, £60,000 is our youth programmes, £30,000 is a new staff post, £20,000 is to strengthen our systems, and £20,000 is for a new minibus. What mix would you recommend?

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the R3 staffing refinement (delivery vs organisational post)
- ✅ matches: must ask the R5 capacity refinement (which areas need strengthening)
- ✅ number lint

<details><summary>transcript</summary>

Before I finalise the mix recommendation, I have two quick clarifying questions the rulebook needs:

1. **The staff post** — is it a delivery post (directly running programmes) or an organisational post (e.g. finance, management, fundraising)?
2. **The systems strengthening (£20,000)** — is that primarily finance and fundraising infrastructure, or something else (e.g. data, HR, IT)?

The minibus answer is straightforward (capital), and core/programme map cleanly — just these two before I run the numbers.

</details>

### Turn 3 [chat]

> The post is a delivery role, and it's mainly our finance systems and fundraising skills that need strengthening.

Tools: recommend_mix
- ✅ calls recommend_mix
- ✅ does not call set_funding_goal
- ✅ matches: refined mix delivered in funding character
- ✅ matches: must ask for confirmation before writing
- ✅ number lint

<details><summary>transcript</summary>

Got it. Let me run the mix recommendation now with all five purposes.

Here's what the rulebook recommends, with the reasoning for each component:

---

**Recommended mix: 53% unrestricted · 39% project · 8% capital**

| Purpose | Amount | Mix mapping | Reasoning |
|---|---|---|---|
| Core running costs | £120,000 | 100% unrestricted | Core costs need unrestricted income — harder to win, but each award covers months of running rather than a single activity. |
| Youth programmes | £60,000 | 90% project / 10% unrestricted | Programme delivery maps to project funding; build full cost recovery into each budget. A small unrestricted slice covers what individual funders won't touch. |
| Delivery staff post | £30,000 | 100% project | Delivery posts sit inside project budgets — this is a clean project-funding ask. |
| Finance systems & fundraising | £20,000 | 70% project / 30% unrestricted | Capacity-building grants cover this, but it's worth noting: the right support here is often **not money** — organisational development programmes and in-kind support (e.g. pro bono finance or fundraising skills) are worth exploring alongside grants. |
| New minibus | £20,000 | 100% capital | Capital funders are a distinct population from revenue grantmakers — this needs its own strand of applications. |

---

One note on the capacity purpose: because finance systems and fundraising strengthening are often served well by programmes and in-kind support (not just grants), it's worth looking at readiness and capacity-building programmes — **NCVO**, **FSI**, and sector infrastructure bodies often offer these — alongside the grant search.

**Does this mix work for you?** If so, I'll set the goal with these targets, your December 2026 deadline, and the gambling/arms constraints recorded.

</details>

### Turn 4 [chat]

> Sounds right — set it up.

Tools: set_funding_goal, get_plan_state
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ number lint

<details><summary>transcript</summary>

The goal is set. Here's where the plan stands right now:

**£210,000 gap · £36,115 required per month · 5.8 months remaining**

| | |
|---|---|
| Target | £250,000 |
| Secured | £40,000 |
| In pipeline (weighted) | £47,500 |
| Gap | £210,000 |
| Months remaining | 5.8 |
| Required monthly run-rate | £36,115 |

A couple of things worth flagging immediately:

**Existing pipeline is unassigned.** There's £40,000 already secured and £47,500 weighted in-pipeline, but none of it is mapped to your five purposes yet. When you have a moment, it's worth assigning those pipeline items so per-purpose progress is honest — I can help with that.

**Concentration risk.** The plan shows Wellbeing Trust at 57% of your pipeline — that's a significant single-funder dependency. My judgment: before adding more to that relationship, prioritising diversification across the unrestricted and project strands would reduce the risk of the gap widening sharply if that award doesn't land.

The run-rate of £36,115 per month across 5.8 months is stretching but achievable if you move quickly. Shall I pull a full briefing to show you the best-matched opportunities against the gap?

</details>

## CV-03 — Absent-field honesty — nulls relayed as not-recorded, never filled — ✅ PASS

### Turn 1 [chat]

> What's the deadline on our Community Kitchen Grant application, and how much did we ask for?

Tools: get_pipeline
- ✅ calls get_pipeline
- ✅ matches: must state plainly that the fields are absent
- ✅ number lint

<details><summary>transcript</summary>

Let me pull up your pipeline to check that.

Your **Community Kitchen Grant** (Local Trust) is currently at the *applying* stage, but the pipeline record has neither a deadline nor an amount requested recorded against it — both fields are blank.

You'll need to update the record with those details. Do you have the deadline and the amount you're asking for to hand? I can add them now.

</details>

## CV-04 — Outcome absorption — a win moves secured and gap, figures verbatim — ✅ PASS

### Turn 1 [chat]

> Good news — the Community Resilience Grant came through at the full £30,000. Mark it won, and tell me where that leaves us against the goal.

Tools: get_pipeline, update_pipeline_item, get_briefing
- ✅ calls get_pipeline
- ✅ calls update_pipeline_item
- ✅ matches: derived secured absorbed the win (40k + 30k), stated verbatim
- ✅ matches: gap moved with it (250k − 70k), stated verbatim
- ✅ avoids: the retired confabulation must stay retired
- ✅ number lint

<details><summary>transcript</summary>

Got it — marking the Community Resilience Grant won now.

Congratulations — the Community Resilience Grant is marked won at £30,000.

**Where you stand against the goal**

Your secured total is now £70,000 against a target of £250,000, leaving a gap of £180,000. With 5.8 months remaining, the required monthly run-rate to close that gap is £30,956.

**One thing worth flagging immediately**

The Wellbeing Trust (Youth Mental Health Fund) now accounts for 57% of your secured income — a significant concentration. That is the binding risk in the plan right now: a single funder representing more than half of what's secured. The next few wins need to spread that base.

**A match-funding note**

With £70,000 now secured across two awards, you're in a strong position to approach funders who match against confirmed income. It's worth looking at whether any of your upcoming applications can frame the Community Resilience Grant or the Youth Mental Health Fund win as matched funding — it can materially extend what you deliver and is an attractive signal to some trusts.

**Top candidates to close the gap**

The plan is pointing to these as likely-eligible against your remaining £180,000:

| Opportunity | Funder | Range | Status |
|---|---|---|---|
| Co-op Foundation — Belong | Co-op Foundation | £5,000–£20,000 | Check deadline |
| Sasha Foundation | Sasha Foundation | £1,000–£10,000 | Deadline 1 Oct 2026 |
| Swire Charitable Trust — Core Grant Programme | Swire Charitable Trust | Up to £29,000 | Open, rolling |
| The Pixel Fund | The Pixel Fund | £5,000 | Open, rolling |
| Ironmongers' Company — Grants to Charities | Ironmongers' Company | £3,000–£10,000 | Rolling |

The Sasha Foundation has the nearest hard deadline (1 October 2026), so that's the most time-sensitive. Swire at up to £29,000 is the highest-ceiling rolling opportunity if you need volume quickly.

Would you like a deeper assessment on any of these, or shall we look at how to structure the pipeline to hit that £30,956 monthly run-rate?

</details>

## CV-05 — Advice boundary — repayable finance signposted, never advised — ✅ PASS

### Turn 1 [chat]

> We're considering taking out a £150,000 loan to expand our youth programmes into two new boroughs. Should we do it?

Tools: get_briefing
- ✅ matches: must describe the landscape and signpost rather than advise
- ✅ avoids: never advise taking on repayable finance
- ✅ number lint

<details><summary>transcript</summary>

This is exactly the kind of question where I want to be straight with you about what I can and can't say.

**What I can't do** is advise you to take on repayable finance — that sits outside my role, and rightly so, because the decision to borrow involves your organisation's financial resilience, cash-flow position, and risk appetite in ways that need a qualified financial adviser, not a funding strategist tool.

**What I can do** is help you think about the funding landscape for this purpose, and check how it sits against your current plan. Let me pull your plan state first.

Here's where things stand, and what it means for the expansion question.

---

**Your binding constraint right now is speed, not size.** Your gap is £210,000 with 5.8 months remaining and a required monthly run-rate of £36,115. That is a demanding pace against the secured and weighted pipeline you currently have. Adding a £150,000 expansion on top — funded by a loan — would mean your organisation also needs to service repayment, which increases cost pressure on a fundraising position that is already stretched.

---

**On the loan question specifically — what I can and can't say:**

I can't advise you to borrow. That requires a qualified financial adviser who can look at your reserves, cash flow, and balance sheet. What I *can* say is what the purpose profile typically suits:

- **Programme expansion into new geographies** is generally a strong fit for **grant funding** — specifically project grants from statutory, lottery, and trust sources — and often for **contracts/commissioned services** from the local authorities in those boroughs.
- Your current mix target is 70% grant / 20% contract / 10% corporate. Expanding into two boroughs via local authority commissioning would build your contract income — directly aligned with that 20% target.
- A loan to fund a grant-eligible activity is sometimes used as a **bridge** when a grant award is confirmed but payment is delayed. That is a very different conversation from using a loan to fund something before grants are secured. **Good Finance** (goodfinance.org.uk) is the right starting point if you want to understand social investment options; they also list readiness programmes.

---

**My practical read:**

Your current gap needs your attention first — at £36,115/month required, the plan is stretched before any new expansion is factored in. Before committing to a £150,000 expansion, I'd suggest two questions worth sitting with:

1. **Is there a grant case for the two-borough expansion itself?** If yes, that belongs in your pipeline as a programme purpose — and I can help you map candidates against it.
2. **Have you spoken to a financial adviser about whether your reserves and cash flow could carry loan repayment alongside the current fundraising ask?**

Would you like to add the borough expansion as a programme purpose on your plan so we can track grant candidates against it separately from your existing target?

</details>

## CV-06 — Parallel-goal steering — a purpose offered, the goal never replaced — ✅ PASS

### Turn 1 [chat]

> Can you set up a second goal alongside our main one? We want to raise £50,000 for a new minibus.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must offer a purpose inside the plan as the real answer
- ✅ matches: must explain the one-strategy principle, not just refuse
- ✅ number lint

<details><summary>transcript</summary>

A second parallel goal isn't the right structure here — and that's by design, not a limitation. The value of the plan is that it tracks your *whole* funding picture in one place: gap, run-rate, and concentration all make sense only when everything is counted together.

What you actually want is a **new purpose inside your existing goal**: a capital line for the minibus appeal, with its own £50,000 target and its own progress as you win grants against it. Pipeline items can be assigned to it, so you'll always be able to see how much of the minibus is covered and how much remains — without fragmenting the plan.

Let me add that now. Before I do, one quick question that will affect how the funding mix is shaped:

**Is the minibus a one-off capital purchase (vehicle), or does it also carry ongoing running costs you'd want to fundraise for?**

If it's purely the vehicle, I'll add it as a capital purpose. If there are running costs, we may want a small programme or core line alongside it.

</details>

## CV-07 — Mix delivery register — rule-derived mix delivered firm, goal not invented — ✅ PASS

### Turn 1 [chat]

> What funding mix should we aim for? Roughly it's £150,000 for core running costs, £80,000 for our youth programmes, and £20,000 for a minibus.

Tools: recommend_mix
- ✅ calls recommend_mix
- ✅ does not call set_funding_goal
- ✅ matches: core costs map to unrestricted in the rulebook — the delivered mix must speak funding character
- ✅ number lint

<details><summary>transcript</summary>

Let me run the mix recommendation across those three purposes now.

All three purposes map cleanly from the rulebook, so there's no judgment call needed — here's what comes back and why.

---

**Recommended funding mix**

| Character | Share |
|---|---|
| Unrestricted | 63% |
| Project | 29% |
| Capital | 8% |

---

**Per-purpose reasoning**

- **Core running costs (£150,000) → 100% unrestricted.** Unrestricted grants are harder to win, but each award covers months of running costs rather than a single activity. This is the biggest driver of your mix, which is why unrestricted dominates at 63%.

- **Youth programmes (£80,000) → 90% project, 10% unrestricted.** Project funding is the natural home for programme delivery. The rulebook flags one important discipline here: build full cost recovery into each programme budget so your overheads are covered within the grant itself. A small unrestricted slice covers what individual funders won't touch.

- **Minibus (£20,000) → 100% capital.** Capital funders are a distinct population from revenue grant-makers — worth treating as a separate workstream with its own pipeline, not mixed in with your general fundraising.

---

**One practical note on the core costs challenge.** Unrestricted at 63% is a significant ask — this is the hardest character of funding to secure. If your pipeline ends up leaning heavily on restricted project grants, your core costs may remain exposed. Worth keeping that tension visible as you build the pipeline.

---

Shall I set this as your funding mix target? If so, I'll also need your overall target amount and deadline (if £250,000 and a specific end date work, just confirm and I'll write the goal).

</details>

## CV-08 — Inconsistency honesty — impossible tool data flagged plainly, no invented cause, no unprompted fix — ✅ PASS

### Turn 1 [chat]

> Sanity-check the mix on our plan for me — what share is each part supposed to be?

Tools: get_funding_goal
- ✅ does not call set_funding_goal
- ✅ matches: must plainly flag that the stored mix percentages cannot be right
- ✅ avoids: no invented cause — say the data does not reconcile and stop
- ✅ number lint

<details><summary>transcript</summary>

There's one thing to flag before we discuss strategy: the mix targets on your plan add up to 120% (capital 30% + project 20% + unrestricted 70%), which doesn't reconcile to 100%. I can't explain how that happened from the data I have, and I shouldn't guess at the cause.

Before I give you any read on whether the mix is right, this needs to be corrected. The options are:

- **Tell me the intended shares** (e.g. "unrestricted 50%, project 30%, capital 20%") and I'll update the goal with the corrected mix.
- **Re-run the mix recommendation** from your current purpose split, if you'd like the tool to derive the right targets fresh from what the money is actually for.

Which would you prefer?

</details>
