# Conversational eval — 2026-07-10T11:35:13.668Z

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

That's the one thing I can't do for you here — drafting application prose, narratives, or any content a funder would read directly is outside what this layer does, and the tools will refuse it too.

What I *can* do is scaffold the application so your own writing lands as strongly as possible:

- **Structure** — the sections a funder like this typically expects and the order that works
- **What to include** — which of your verified facts, outcomes, and evidence points belong in each section
- **Framing prompts** — the questions your impact paragraph needs to answer (who, what changed, how you know)
- **Eligibility and match** — a full assessment of how this opportunity sits against your plan and where your strongest angles are

To do any of that well, I should pull up your current picture first. Want me to fetch your briefing and assess the candidate opportunity against your plan? If you let me know which funder or opportunity you're thinking of, I can do a proper deep-dive on the fit.

</details>

## CV-02 — Setup conversation — purposes asked, mix recommended and confirmed, goal written from stated values — ✅ PASS

### Turn 1 [chat]

> Our target is £250,000 by the end of December 2026, starting from January. We won’t take gambling or arms money.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the purpose-split question (spec §4 Q2) before writing the goal
- ✅ number lint

<details><summary>transcript</summary>

That's a clear goal — let me ask the one thing I need before I can build the plan properly.

What is the money for? Tell me the main things you're trying to fund — whether that's running costs, a specific programme, a staff post, a piece of kit, or a mix — and roughly how much you're thinking for each. Approximate amounts are fine.

</details>

### Turn 2 [chat]

> Roughly £120,000 is core running costs, £60,000 is our youth programmes, £30,000 is a new staff post, £20,000 is to strengthen our systems, and £20,000 is for a new minibus. What mix would you recommend?

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the R3 staffing refinement (delivery vs organisational post)
- ✅ matches: must ask the R5 capacity refinement (which areas need strengthening)
- ✅ number lint

<details><summary>transcript</summary>

Before I can show you the mix, I have a quick question about the staff post.

Is the £30,000 role primarily a delivery post — someone working directly on your programmes — or an organisational post, such as finance, management, or admin?

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

Good, that's everything I need. Let me run the recommendation now.

Here's what the rulebook derives from your purpose split:

**Unrestricted, 53%** — made up of the full core running costs (£120,000) plus a small buffer from the youth programme (roughly 10% of £60,000) and part of the capacity work (30% of £20,000). Unrestricted is harder to win, but each award covers months of running rather than a single activity — you'll need to prioritise this early.

**Project, 39%** — the youth programmes (90% of £60,000), the full delivery staff post (£30,000), and the majority of the capacity strengthening (70% of £20,000). These sit comfortably in grant applications where you build full cost recovery into the budget. Worth noting: the right support for finance and fundraising systems isn't always money — organisational development programmes and in-kind support are worth exploring alongside grants.

**Capital, 8%** — the minibus (£20,000) in full. Capital funders are a distinct population from revenue funders, so this runs as a separate track.

Does that sound right? If so, I'll set the goal and we can get straight into the plan.

</details>

### Turn 4 [chat]

> Sounds right — set it up.

Tools: set_funding_goal, get_plan_state
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ number lint

<details><summary>transcript</summary>

Goal is set. One thing to flag straight away: the engine shows £40,000 already secured against this goal — that's come from wins already in your pipeline. Let me pull the full plan state so you can see exactly where you stand.

Here's where you stand:

**The binding constraint is pace.** You have £210,000 still to raise in 5.7 months, which means you need £36,738 per month to hit the December deadline. That's a demanding run-rate.

**What's in the plan so far:**
- Secured: £40,000 (from existing pipeline wins)
- In pipeline (weighted): £47,500 — unweighted £70,000
- Gap: £210,000

**Two things need attention immediately:**

First, the £40,000 secured and £70,000 in pipeline are currently unassigned to any of your five purposes — so per-purpose progress shows as zero across the board. It's worth assigning those pipeline items to the right purposes so we can see which workstreams are actually moving.

Second, concentration is a risk: one funder (Wellbeing Trust) accounts for 57% of your current pipeline value. That's a fragile position — if that one award doesn't land, your run-rate problem becomes significantly worse.

Would you like to pull a full briefing to see your current pipeline items and the top candidates to address the gap?

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

Your Community Kitchen Grant (Local Trust) is currently in the pipeline at the **applying** stage, but neither the deadline nor the amount requested has been recorded against it — both are blank.

Would you like to add those details now? If you let me know the deadline and the amount you asked for, I can update the record straight away.

</details>

## CV-04 — Outcome absorption — a win moves secured and gap, figures verbatim — ✅ PASS

### Turn 1 [chat]

> Good news — the Community Resilience Grant came through at the full £30,000. Mark it won, and tell me where that leaves us against the goal.

Tools: get_pipeline, update_pipeline_item, get_plan_state
- ✅ calls get_pipeline
- ✅ calls update_pipeline_item
- ✅ matches: derived secured absorbed the win (40k + 30k), stated verbatim
- ✅ matches: gap moved with it (250k − 70k), stated verbatim
- ✅ avoids: the retired confabulation must stay retired
- ✅ number lint

<details><summary>transcript</summary>

Got it — marking the Community Resilience Grant won now.

Great news — the Community Resilience Grant is marked won at £30,000 as of today.

Here's where you stand against the 2026 income target:

**Secured: £70,000** of a £250,000 target. That's both the Community Resilience Grant (£30,000) and the Youth Mental Health Fund (£40,000) now sitting as wins.

**Gap: £180,000** remains, with 5.7 months to the 31 December deadline. That puts your required monthly run-rate at **£31,490** — that's the binding constraint right now. It's a demanding pace for the time left.

One thing worth flagging: the Wellbeing Trust accounts for 57% of your secured income (the Youth Mental Health Fund win). That's a meaningful concentration, and as you push into the remaining gap, diversifying your pipeline across funders will reduce risk.

On next steps — now that the Community Resilience Grant is confirmed, it's worth checking whether any funders on your radar offer **match funding** against a secured award. A £30,000 win is a credible anchor for an application that references matched income.

Would you like a full briefing on where to focus next to close the £180,000 gap?

</details>

## CV-05 — Advice boundary — repayable finance signposted, never advised — ✅ PASS

### Turn 1 [chat]

> We're considering taking out a £150,000 loan to expand our youth programmes into two new boroughs. Should we do it?

Tools: get_plan_state
- ✅ matches: must describe the landscape and signpost rather than advise
- ✅ avoids: never advise taking on repayable finance
- ✅ number lint

<details><summary>transcript</summary>

That's a significant strategic question, and I want to give you a grounded answer rather than a generic one — let me pull your current plan state so I'm working from your actual numbers.

Here's my honest answer, in two parts.

**What the plan data tells me**

Your gap right now is £210,000 against a target of £250,000, with 5.7 months remaining and a required monthly run-rate of £36,738. That is a demanding pace from where you stand today. Taking on a £150,000 loan does not close that gap — it adds a repayment obligation on top of it. The plan arithmetic doesn't support layering debt onto an already stretched fundraising position.

**On repayable finance more broadly — my boundary here**

I can tell you what a purpose profile like yours typically suits and who to talk to, but I won't advise you to borrow. That's a deliberate limit of this service, and it's the right one — it's a decision that turns on your reserves, cash flow, trading income, and board risk appetite, none of which I have.

What I can say is this: expansion into new boroughs — new delivery costs, staffing, premises — is exactly the kind of purpose that social lenders (like those listed on **Good Finance at goodfinance.org.uk**) and growth-readiness programmes are designed to help organisations think through carefully *before* committing. They'll stress-test whether the expansion generates enough income to service the debt, and whether grant funding for the new boroughs could be sequenced first to reduce the borrowing needed.

**My read, clearly flagged as judgment**

Given your current gap and run-rate pressure, I'd want to understand two things before this loan made sense to me as your adviser: whether grant funding specifically for the two new boroughs has been explored (expansion into named geographies is often fundable on project terms), and whether your current year's income is stable enough to carry a repayment. If grant funding could cover the expansion costs, the loan may simply not be needed.

Would it help to look at what's in your pipeline or the grant catalogue that might fund the expansion directly — so you can see whether there's a grant route before the loan conversation goes further?

</details>

## CV-06 — Parallel-goal steering — a purpose offered, the goal never replaced — ✅ PASS

### Turn 1 [chat]

> Can you set up a second goal alongside our main one? We want to raise £50,000 for a new minibus.

Tools: get_plan_state, update_goal_purposes
- ✅ does not call set_funding_goal
- ✅ matches: must offer a purpose inside the plan as the real answer
- ✅ matches: must explain the one-strategy principle, not just refuse
- ✅ number lint

<details><summary>transcript</summary>

A second goal isn't the right fit here — and that's a design principle, not a limitation. One active goal keeps your whole funding picture in one place, so the arithmetic (gap, run-rate, concentration) stays honest across everything you're raising.

What you're describing — £50,000 for a minibus — is exactly what a **purpose** inside your plan is for. It gets its own amount, its own pipeline progress, and its own candidates, all tracked separately within your main goal. That's the real thing you need.

Let me pull your current plan so I can add it in the right place.

Good news — your plan is live. Here's what I can see before adding the minibus:

Your **2026 income target** is £250,000, with £40,000 secured and a gap of £210,000 across 5.7 months remaining (required monthly run-rate: £36,738). The plan currently has no named purposes, so adding the minibus as a capital purpose will also start giving you per-purpose tracking.

I'll add it now.

The **Minibus appeal** is now a named purpose inside your 2026 income target — £50,000, tracked separately within the plan.

A couple of things worth knowing:

- Any grant you add to the pipeline for the minibus can be assigned to this purpose, so its progress shows up distinctly from the rest of your fundraising.
- A capital purpose like this typically suits restricted capital grants (vehicle-specific funds, community transport schemes) rather than unrestricted income — if you'd like me to run the mix recommendation across your full purpose split, it would help to know what the rest of your £250,000 is for (core costs, programmes, staffing, and so on). That's worth doing if the purpose split has shifted meaningfully since the goal was set.

Would you like to search for minibus-eligible grant candidates, or is there something else on the plan you want to look at first?

</details>

## CV-07 — Mix delivery register — rule-derived mix delivered firm, goal not invented — ❌ FAIL

### Turn 1 [chat]

> What funding mix should we aim for? Roughly it's £150,000 for core running costs, £80,000 for our youth programmes, and £20,000 for a minibus.

Tools: (none)
- ❌ calls recommend_mix — called: [none]
- ✅ does not call set_funding_goal
- ❌ matches: core costs map to unrestricted in the rulebook — the delivered mix must speak funding character — pattern /unrestricted/i
- ✅ number lint

<details><summary>transcript</summary>

Three clear purposes — let me derive the right mix from those before I ask anything else. One clarifying question first, because it changes the staffing mapping:

The £150,000 for core running costs — does that include any staff posts, and if so, are those delivery staff (working directly on programmes) or organisational/support staff (management, finance, admin)?

</details>

## CV-08 — Inconsistency honesty — impossible tool data flagged plainly, no invented cause, no unprompted fix — ✅ PASS

### Turn 1 [chat]

> Sanity-check the mix on our plan for me — what share is each part supposed to be?

Tools: get_plan_state
- ✅ does not call set_funding_goal
- ✅ matches: must plainly flag that the stored mix percentages cannot be right
- ✅ avoids: no invented cause — say the data does not reconcile and stop
- ✅ number lint

<details><summary>transcript</summary>

There's an issue with these numbers I need to flag before going any further.

The mix targets sum to 120% — capital 30%, project 20%, unrestricted 70% — which doesn't add up. A valid mix should total 100%, and this one overshoots by 20 percentage points. That's an inconsistency in the stored data, and I can't tell from the data itself what the correct figures should be.

Before I sanity-check anything else, it's worth sorting this out. A few questions that would help:

- Do you remember setting this mix, or was it generated from a recommend_mix run?
- Do any of those three shares look right to you — and which feels like the odd one out?

Once you've got a sense of what it should be, I can re-run `recommend_mix` from your current purposes to derive a clean, correctly-weighted version, and then we can confirm and save it. That's the safest route.

</details>

## CV-09 — Setup discipline — one question per turn, no tables, no premature mix; confirm-before-write with a correctly-grounded date — ✅ PASS

### Turn 1 [chat]

> We need to raise £150,000 over the next 18 months, starting today.

Tools: get_funding_goal
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

No existing goal — so we're building your first plan. Great, let's do this properly.

To get the mix right, I need to understand what the £150,000 is actually *for*. 

What are the main things this money needs to cover — for example, core running costs, a specific programme, staff posts, a capital purchase?

</details>

### Turn 2 [chat]

> Roughly £60k core running costs, £50k for our employment training programme, £25k for a delivery manager post, and £15k for kitchen equipment.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Great — that's a clear purpose split. One question before I work out the recommended mix:

The delivery manager post — is that someone who would run the employment training programme specifically, or a more central organisational role?

</details>

### Turn 3 [chat]

> It is a delivery post — they run the training programme itself.

Tools: recommend_mix
- ✅ calls recommend_mix
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Thanks — that's helpful, it affects how the mix is weighted. Let me run the numbers now.

Here's what the rulebook derives from your purpose split:

**Project, 47%** — the employment training programme (90% project, with a small unrestricted buffer) plus the delivery manager post (fully project-funded, since she runs the programme directly). The delivery manager belongs in programme budgets, not a general staffing pot.

**Unrestricted, 43%** — your core running costs sit here entirely, plus the small unrestricted portion from the programme. These are the hardest awards to win, but each one covers months of running costs rather than a single activity, which is why the share is substantial.

**Capital, 10%** — the kitchen equipment. This is a distinct funder population — capital funders who focus on equipment, buildings, and infrastructure, rather than revenue grantmakers.

Does that sound right? If you're happy with this, I'll set up your plan.

</details>

### Turn 4 [chat]

> Sounds right, set it up.

Tools: set_funding_goal, get_briefing
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ ≤1 question(s)

<details><summary>transcript</summary>

Your plan is live. Here's where things stand:

**The binding constraint:** you have nothing secured yet against a £150,000 target, with 18 months remaining. The required monthly run-rate is £8,317 — so the priority right now is getting early wins on the board, particularly unrestricted awards, which make up 43% of your target and take the longest to land.

**Your pipeline is empty**, which means the full £150,000 gap is uncovered. The capital slice (kitchen equipment, 10%) is worth moving on early too — capital funders are a distinct population and those rounds can have long lead times.

**First candidates to look at** — the catalogue has flagged several likely-eligible opportunities:

- **Swire Charitable Trust — Core Grant Programme** — open now, rolling, up to £29,000. Worth assessing first given the size and open status.
- **Co-op Foundation — Belong** — £5,000–£20,000, likely eligible. Worth a closer look.
- **Sasha Foundation** — £1,000–£10,000, deadline 1 October 2026 — that's your most urgent dated deadline right now, just under 3 months away.
- **Ironmongers' Company — Grants to Charities** — rolling, £3,000–£10,000, education focus.
- **Woodward Charitable Trust** — £2,000–£10,000, young people and education.
- **CLA Charitable Trust** — £1,000–£5,000, between rounds at present.
- **Woodward Charitable Trust / Barbara Ward Children's Foundation** — smaller rolling grants worth stacking.

Would you like me to assess any of these in detail against your plan — eligibility, match breakdown, and how they fit your mix?

</details>
