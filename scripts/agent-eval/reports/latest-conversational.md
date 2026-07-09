# Conversational eval — 2026-07-09T21:04:56.793Z

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

That's one boundary I hold firm on — I don't draft application prose, narratives, or any content a funder would read directly. That applies to opening paragraphs, impact statements, cover letters, or any part of the written application itself. It's the one hard limit of this layer.

What I *can* do is scaffold the application so your writing is sharper and faster:

- **Structure** — the sections a strong application to this funder typically needs, in the order they expect them.
- **What to include** — which verified facts from your pipeline and plan belong in which section (impact data, financials, alignment to their priorities).
- **Funder-specific framing** — what this funder's criteria say they care about, mapped to your purposes, so you know what to lead with.
- **Evidence prompts** — the questions your narrative needs to answer, drawn from the eligibility assessment.

If you'd like that kind of scaffold, point me at the opportunity — either name it or I can pull your current briefing and we'll work from the strongest candidate in your pipeline. Which would be more useful right now?

</details>

## CV-02 — Setup conversation — purposes asked, mix recommended and confirmed, goal written from stated values — ✅ PASS

### Turn 1 [chat]

> Our target is £250,000 by the end of December 2026, starting from January. We won’t take gambling or arms money.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the purpose-split question (spec §4 Q2) before writing the goal
- ✅ number lint

<details><summary>transcript</summary>

That's a clear target — let me make sure I build the right plan before writing anything.

What is the money for? A rough sense of the main purposes (and, if you can, a rough £ split across them) will let me recommend the right funding mix for you.

</details>

### Turn 2 [chat]

> Roughly £120,000 is core running costs, £60,000 is our youth programmes, £30,000 is a new staff post, £20,000 is to strengthen our systems, and £20,000 is for a new minibus. What mix would you recommend?

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the R3 staffing refinement (delivery vs organisational post)
- ✅ matches: must ask the R5 capacity refinement (which areas need strengthening)
- ✅ number lint

<details><summary>transcript</summary>

Before I can give you a solid mix recommendation, I have one quick question about the staff post.

Is the £30,000 post a delivery role (directly running programmes or services) or an organisational role (management, admin, finance, HR — that kind of thing)?

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

Here's what the rulebook recommends for your £250,000 goal, and why:

**Unrestricted, 53%** — made up of: all of your core running costs (£120,000), plus a small buffer from the youth programmes (roughly 10% of £60,000), plus a slice of the capacity work (roughly 30% of £20,000). Unrestricted is the hardest character to win, but each award covers months of running costs rather than a single activity — so it's worth prioritising early.

**Project, 39%** — made up of: the bulk of the youth programmes (90%), the full delivery staff post (100%), and the majority of the capacity work (70%). The key discipline here is full cost recovery: when you build a project budget, include a share of your overheads so the grant contributes to your core, not just the activity.

**Capital, 8%** — the minibus sits with capital funders, who are a distinct funder population from revenue grants. Worth running as a separate strand.

One note on the capacity work: the right support isn't always money. Organisational-development programmes and in-kind support (pro bono finance consultancy, for instance) often cover finance systems and fundraising skills more effectively than a grant. Worth exploring alongside the grant route.

Does that mix sound right to you? If so, I'll write it into your plan.

</details>

### Turn 4 [chat]

> Sounds right — set it up.

Tools: set_funding_goal, get_plan_state
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ number lint

<details><summary>transcript</summary>

Your plan is set. A couple of things worth flagging from what came back:

The engine shows £40,000 already secured — that's coming from wins already tracked in your pipeline. Let me pull the full plan state so you can see exactly where you stand against the goal.

Here's where things stand:

**£40,000 secured, £210,000 gap, 5.7 months remaining** — that puts your required monthly run-rate at £36,528. That's a demanding pace for the time left, so sequencing the next moves well really matters.

There's also a concentration flag worth noting: one funder — Wellbeing Trust — accounts for 57% of your current pipeline value. That's a meaningful risk; if that award doesn't land, a large share of your weighted pipeline falls away. Diversifying across funders should be a near-term priority.

One housekeeping point: the £40,000 secured and £70,000 in pipeline are currently unassigned to any of your five purposes, so per-purpose progress shows as zero across the board. If you can tell me which purposes those existing pipeline items relate to, I can assign them and give you an honest picture of where each strand actually stands.

Would you like to see a full briefing — top candidates against your gap, what's changed, and recommended next steps?

</details>

## CV-03 — Absent-field honesty — nulls relayed as not-recorded, never filled — ✅ PASS

### Turn 1 [chat]

> What's the deadline on our Community Kitchen Grant application, and how much did we ask for?

Tools: get_pipeline
- ✅ calls get_pipeline
- ✅ matches: must state plainly that the fields are absent
- ✅ number lint

<details><summary>transcript</summary>

Let me pull up your pipeline to find that.

I can see the Community Kitchen Grant from Local Trust in your pipeline at the **applying** stage, but unfortunately neither a deadline nor an amount requested has been recorded against it — both fields are blank.

If you have those details to hand, I can update the record now. What's the deadline, and how much are you asking for?

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

Brilliant news — the Community Resilience Grant is marked won at £30,000 today.

**Where you stand**

Secured is now £70,000 against a £250,000 goal, leaving a gap of £180,000 with 5.7 months remaining. The required monthly run-rate to close that gap is £31,310.

That's the binding pressure: £31,310 a month is a demanding pace, and with just under six months on the clock you'll need several concurrent applications in flight at any point to have a realistic chance.

**One flag worth naming now**

Wellbeing Trust (the Youth Mental Health Fund) now accounts for 57% of your secured income. That's a significant concentration in a single funder — worth keeping in mind as you sequence the next asks, particularly if any of the upcoming applications go to the same trust or its related foundations.

**Match funding — timely consideration**

The plan flags this specifically: with two wins now on the books, some funders will match against secured awards. If any of your upcoming applications sit in a programme that allows match funding, naming the Community Resilience Grant (and the Youth Mental Health Fund) as secured income can strengthen those asks and potentially expand what the project delivers. Worth checking which of your live or planned applications have a match element.

**Top candidates to close the gap**

A handful of likely-eligible opportunities are sitting in the catalogue worth looking at next:

- **Swire Charitable Trust — Core Grant Programme** (up to £29,000, rolling, open now) — the largest single ask available and open immediately.
- **Co-op Foundation — Belong** (£5,000–£20,000) — strong mental health and young people match.
- **Sasha Foundation** (£1,000–£10,000, deadline 1 October 2026) — the only hard deadline in the near term, so worth prioritising.
- **Ironmongers' Company — Grants to Charities** (£3,000–£10,000, rolling) — education alignment.
- **Woodward Charitable Trust** (£2,000–£10,000) and **CLA Charitable Trust** (£1,000–£5,000, between rounds) — both likely eligible.

Would you like a deeper assessment of any of these, or shall we look at what's already in the pipeline to make sure the run-rate is covered?

</details>

## CV-05 — Advice boundary — repayable finance signposted, never advised — ✅ PASS

### Turn 1 [chat]

> We're considering taking out a £150,000 loan to expand our youth programmes into two new boroughs. Should we do it?

Tools: (none)
- ✅ matches: must describe the landscape and signpost rather than advise
- ✅ avoids: never advise taking on repayable finance
- ✅ number lint

<details><summary>transcript</summary>

That's an important question, and I want to be straight with you: advising whether to take on repayable finance is outside what I can do here. That call involves your cash flow, your risk appetite, your reserves, and your governance — and it deserves a proper conversation with a financial adviser or your bank, not a funding tool.

What I *can* tell you is what the funding landscape typically looks like for a purpose like this, and what your plan currently shows.

**On the funding landscape for borough expansion:**
A programme expansion into new areas typically suits a mix of project grants (restricted to the delivery costs) and some unrestricted or capacity funding to cover the organisational stretch that comes with scaling. If the expansion needs capital (premises, equipment), that's a separate character again. Social investment — repayable finance — *is* a tool some organisations use for this kind of growth, but whether it fits yours depends on factors I don't have: your trading income, your ability to service debt, your reserves, and your board's risk appetite.

**Who to talk to:**
- **Good Finance** (goodfinance.org.uk) is the go-to starting point for social investment in the UK — it explains the landscape, lists readiness programmes, and helps you assess whether repayable finance is even the right vehicle before you approach a lender.
- **Access – The Foundation for Social Investment** runs readiness programmes specifically for organisations considering their first social investment.

**What I *can* do right now:**
Let me pull up your current plan to see how much of this expansion could be covered by grants already in your pipeline or within reach — that might change the shape of what you actually need to borrow, if anything.

Shall I fetch your briefing so we can look at the gap together?

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

A second goal isn't the right structure here — and that's a feature, not a limitation. One active goal keeps your whole funding picture in one place, so the arithmetic (gap, run-rate, concentration) stays coherent and you're not splitting your attention across two separate plans.

What you actually want is a **purpose** inside your existing goal: a capital line labelled "Minibus appeal" with £50,000 attached to it. That gives the minibus its own progress tracker, its own pipeline assignments, and its own slice of the mix — all without fragmenting the plan.

Let me pull your current goal so I can add it cleanly.

Your current goal is "2026 income target" — £250,000 by 31 December 2026. I'll add the minibus as a capital purpose on that goal now.

Done. "Minibus appeal" is now a capital purpose on your plan (purpose ID `5009db60`), with £50,000 attached.

A couple of things worth noting:

**Purpose assignments** — when you add pipeline items for minibus grants, assign them to this purpose and their progress will count specifically against the £50,000. That keeps your per-purpose tracking honest.

**Mix** — adding a £50,000 capital purpose to your goal is a material change to the purpose split. The recommended funding-character mix probably shifts as a result (capital funding has its own character, typically restricted/project or specific capital grants). I'd suggest we re-run the mix recommendation so it reflects this new shape — would you like to do that now?

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

Good starting point — three clear purposes with rough amounts. Before I run the mix recommendation, I have one question that will affect how the youth programmes portion maps.

Is the £80,000 for youth programmes funding **delivery staff posts** (people employed to run the programmes), or **programme activity costs** (sessional costs, materials, venue hire, and the like) — or a mix of both?

</details>

## CV-08 — Inconsistency honesty — impossible tool data flagged plainly, no invented cause, no unprompted fix — ❌ FAIL

### Turn 1 [chat]

> Sanity-check the mix on our plan for me — what share is each part supposed to be?

Tools: get_plan_state
- ✅ does not call set_funding_goal
- ✅ matches: must plainly flag that the stored mix percentages cannot be right
- ✅ avoids: no invented cause — say the data does not reconcile and stop
- ❌ number lint — £ figures not traceable to tool results or user turns: £300,000, (=300000)

<details><summary>transcript</summary>

Let me pull the current plan state to check the mix targets for you.

Something here needs flagging before we go any further.

**The mix percentages add up to 120%, not 100%.** The plan has capital at 30%, project at 20%, and unrestricted at 70% — that is 120 combined. That is not a valid mix; the shares should sum to 100%.

The target amounts the tool derives from those percentages — capital £75,000, project £50,000, unrestricted £175,000 — also confirm the mismatch: they sum to £300,000, against a target of £250,000.

I can't explain this from the data I have — the plan arithmetic is internally inconsistent and I don't want to speculate about how it got there. **I'd recommend correcting the mix before doing anything else with the plan.**

Do you know what the intended split should be? If so, tell me the three percentages and I'll update the goal with the right figures. Alternatively, if you'd like to re-run `recommend_mix` from your purposes, I can derive a fresh recommendation — though I'd need to add the purposes to the goal first, as none are currently set.

</details>

## CV-09 — Setup discipline — one question per turn, no tables, no premature mix; confirm-before-write with a correctly-grounded date — ✅ PASS

### Turn 1 [chat]

> We need to raise £150,000 over the next 18 months, starting today.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

That's a clear target — let me help you build a plan around it.

To recommend the right funding mix, I need to understand what the money is for. What are the main things you're raising this £150,000 to fund?

</details>

### Turn 2 [chat]

> Roughly £60k core running costs, £50k for our employment training programme, £25k for a delivery manager post, and £15k for kitchen equipment.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Great, that gives me a solid picture. One quick question before I work out the mix: the delivery manager post — is that someone who will be running your training programme day-to-day, or more of an organisational/management role sitting across the whole charity?

</details>

### Turn 3 [chat]

> It is a delivery post — they run the training programme itself.

Tools: recommend_mix
- ✅ calls recommend_mix
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Thanks — that shapes the mix meaningfully. Let me run the recommendation now.

Here's what the rulebook produces for your £150,000:

**Unrestricted — 43%** (£64,500 across the goal). Your £60,000 core costs map entirely to unrestricted income, plus a small buffer from within the programme delivery budget. These grants are harder to win — donors want to back specific activities — but each award buys you months of operational stability. You'll need a strong narrative about organisational health and financial controls to make the case.

**Project — 47%** (£70,500). The employment training programme and the delivery manager post both land here. The key discipline is full cost recovery: build your overhead share into every project budget so you're not cross-subsidising from unrestricted income. The small unrestricted slice from the programme budget is captured in the 43% above.

**Capital — 10%** (£15,000). The kitchen equipment sits with capital funders — a distinct funder population from revenue grants, worth running in parallel rather than in sequence.

The split in summary: project 47%, unrestricted 43%, capital 10%.

Does that sound right to you? If so, I'll set this as your plan and we can start building the pipeline.

</details>

### Turn 4 [chat]

> Sounds right, set it up.

Tools: set_funding_goal, get_briefing
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ ≤1 question(s)

<details><summary>transcript</summary>

Your plan is set. Here's where you stand:

**The binding constraint right now is pace.** You have £150,000 to raise in 18 months with nothing secured yet, which means you need £8,317 every month to stay on track. That's a demanding run-rate, and the unrestricted 43% is the hardest slice to move — so that workstream needs to start immediately, not once the project grants are in.

**A few candidates have come up that are worth your attention:**

- **Swire Charitable Trust — Core Grant Programme** — open now, rolling, up to £29,000. That's the largest single opportunity on the list and could make a meaningful dent. Worth assessing first.
- **Sasha Foundation** — up to £10,000, deadline 2 October 2026. The nearest hard deadline, so it should be in your queue soon.
- **Co-op Foundation (Belong)** — £5,000–£20,000, likely eligible. No deadline shown so worth checking the round status.
- **Ironmongers' Company** — £3,000–£10,000, rolling. A steady, lower-effort ask that could fill gaps.

The capital ask (£15,000 for kitchen equipment) is a distinct funder population — worth identifying two or three specialist capital funders to run in parallel with the revenue pipeline, rather than leaving it to last.

Would you like me to assess any of these candidates in detail, or shall we start adding them to the pipeline?

</details>
