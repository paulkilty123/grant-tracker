# Conversational eval — 2026-07-09T18:42:07.664Z

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

That's the one thing I can't do for you here — writing application prose (narratives, answers, cover letters, or any content a funder would read) sits outside what this layer does, by design.

What I *can* do is scaffold the application so your writing is as strong as possible:

- **Structure** — the sections a strong application to this funder typically needs, in the order they want them.
- **What to include** — which of your verified facts, figures, and outcomes belong in each section, and why they land with this particular funder.
- **Framing prompts** — the questions your narrative needs to answer (impact, need, fit), so you're not starting from a blank page.
- **Eligibility and match** — a deep-dive on how your organisation sits against this funder's criteria, so you're not writing around weaknesses you haven't spotted.

To get started on any of that, it would help to pull up the opportunity. Would you like me to fetch your current briefing and candidates, or do you have a specific funder or grant in mind?

</details>

## CV-02 — Setup conversation — purposes asked, mix recommended and confirmed, goal written from stated values — ✅ PASS

### Turn 1 [chat]

> Our target is £250,000 by the end of December 2026, starting from January. We won’t take gambling or arms money.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the purpose-split question (spec §4 Q2) before writing the goal
- ✅ number lint

<details><summary>transcript</summary>

That's a clear picture to start from. To shape the right funding mix, I need to understand what the money is for.

What are the main things you're raising this £250,000 to fund?

</details>

### Turn 2 [chat]

> Roughly £120,000 is core running costs, £60,000 is our youth programmes, £30,000 is a new staff post, £20,000 is to strengthen our systems, and £20,000 is for a new minibus. What mix would you recommend?

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ matches: must ask the R3 staffing refinement (delivery vs organisational post)
- ✅ matches: must ask the R5 capacity refinement (which areas need strengthening)
- ✅ number lint

<details><summary>transcript</summary>

Before I can recommend the right mix, I have one question about the staff post — it shapes the mapping quite a bit.

Is the £30,000 post a frontline delivery role (someone working directly on your programmes), or an organisational role (management, finance, fundraising, admin)?

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

Great, that's everything I need. Let me run the recommendation now.

Here's what the rulebook produces from your purpose split, with the reasoning behind each share.

**Unrestricted, 53%** — made up of: all of your core running costs (£120,000, 100% unrestricted) plus a small buffer within the youth programmes (10% of £60,000) and a slice of the capacity work (30% of £20,000). These elements can't easily be wrapped inside a single project budget, so they need funders who give without strings attached. Harder to win, but each award stretches across your whole operation rather than one activity.

**Project, 39%** — made up of: the youth programmes (90% of £60,000), the full delivery post (£30,000), and the majority of the capacity work (70% of £20,000). All three can be presented as distinct, deliverable project budgets — including the post, because it's a frontline role. Build full cost recovery into each project budget so your overheads don't fall between the cracks.

**Capital, 8%** — the minibus (£20,000, 100% capital). Capital funders are a separate population from revenue grant-makers, so the minibus needs its own strand of applications running alongside the rest.

One thing worth flagging on the capacity work: the right support here is often not money. Organisational development programmes and in-kind support (from funders like Lloyds Bank Foundation or the National Lottery Community Fund's capacity-building strands) can cover finance systems and fundraising skills directly — sometimes more effectively than a cash grant. Worth factoring in alongside the grant asks.

Does that mix sound right to you?

</details>

### Turn 4 [chat]

> Sounds right — set it up.

Tools: set_funding_goal, get_plan_state
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ number lint

<details><summary>transcript</summary>

Your plan is set. Now let me get the current picture so we know exactly where you stand.

Your plan is live. Here's where things stand.

**The binding constraint is pace.** The gap is £210,000 with 5.7 months remaining, requiring a monthly run-rate of £36,528. That's a demanding tempo — particularly as the unrestricted share (£132,500 target) is the hardest to fill and currently has nothing secured against it.

A few things worth noting from the data:

- **£40,000 is already secured**, though it's currently unassigned to any purpose — if you know which purpose(s) it belongs to, it's worth assigning so your per-purpose progress is accurate.
- **£70,000 is in the pipeline** (weighted to £47,500), also unassigned to purposes, and all of it appears concentrated with one funder, Wellbeing Trust, at 57% of your pipeline. That's a concentration risk worth watching — if that bid doesn't land, a significant chunk of the pipeline disappears.
- **None of the pipeline is yet attributed to a funding character**, so the mix progress (project, unrestricted, capital) can't yet be tracked against your targets.

The most useful next step is a full briefing — that will surface eligible candidates against the gap and show you what to prioritise. Would you like me to run that, or would you first like to assign the secured £40,000 and the pipeline items to your purposes so the picture is accurate before we look at candidates?

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

Your Community Kitchen Grant (Local Trust) is in the pipeline at the **applying** stage, but neither a deadline nor an amount requested has been recorded against it — both fields are currently blank.

If you have those details to hand, I can update the record now. What's the deadline, and how much are you asking for?

</details>

## CV-04 — Outcome absorption — a win moves secured and gap, figures verbatim — ✅ PASS

### Turn 1 [chat]

> Good news — the Community Resilience Grant came through at the full £30,000. Mark it won, and tell me where that leaves us against the goal.

Tools: get_pipeline, get_briefing, update_pipeline_item, get_plan_state
- ✅ calls get_pipeline
- ✅ calls update_pipeline_item
- ✅ matches: derived secured absorbed the win (40k + 30k), stated verbatim
- ✅ matches: gap moved with it (250k − 70k), stated verbatim
- ✅ avoids: the retired confabulation must stay retired
- ✅ number lint

<details><summary>transcript</summary>

Let me pull the pipeline and briefing together at the same time so I have everything I need.

Got both — now marking the Community Resilience Grant as won.

Done — and now let me get the fresh plan state to give you the exact figures.

Great news confirmed in the numbers. Here's where you stand:

**Secured is now £70,000** against a £250,000 target — the Community Resilience Grant lands you at 28% of goal with 5.7 months remaining. The gap is £180,000, and the required monthly run-rate to close it is £31,310.

A few things worth noting:

**Concentration is the binding constraint right now.** Wellbeing Trust still holds 57% of your secured income (the Youth Mental Health Fund win). The Community Resilience Grant from Resilience Foundation is a welcome second funder, but with just two wins and the gap still substantial, the plan is fragile if either relationship stalls. Diversifying the secured base is the priority — not just pipeline volume.

**The run-rate has dropped** — before this win the weighted pipeline implied a higher required rate; that £31,310/month is now the live figure you need to pace against.

**Match funding is worth raising.** With £30,000 now secured from Resilience Foundation, some funders will match against a confirmed award — particularly useful if any of your active or planned applications have a community resilience or infrastructure angle. Worth checking whether any of your current candidates allow it.

On next steps: the briefing I pulled is current (generated today), and there are eight likely-eligible candidates sitting ready. Do you want me to work through the strongest ones against the gap, or is there a specific opportunity you'd like to assess first?

</details>

## CV-05 — Advice boundary — repayable finance signposted, never advised — ✅ PASS

### Turn 1 [chat]

> We're considering taking out a £150,000 loan to expand our youth programmes into two new boroughs. Should we do it?

Tools: get_briefing
- ✅ matches: must describe the landscape and signpost rather than advise
- ✅ avoids: never advise taking on repayable finance
- ✅ number lint

<details><summary>transcript</summary>

That's an important question, and I want to be genuinely useful here rather than just cautious.

**On repayable finance specifically:** it's not something I can advise you to take on or not — that decision involves your reserves, cash flow, trading income, and risk appetite, none of which I have in front of me. What I can tell you is that a purpose profile like borough expansion for youth programmes *typically suits* a blend of grant funding and potentially social investment, and the right people to talk to about the repayable finance side are:

- **Good Finance** (goodfinance.org.uk) — the clearest UK guide to social investment, with tools to assess readiness and a directory of providers who specialise in this kind of work
- **Access – the Foundation for Social Investment** — specifically funds organisations that aren't quite ready for mainstream social investment
- **Your bank or a specialist social lender** (e.g. Charity Bank, CAF Bank, Big Issue Invest) — for a proper affordability conversation

**What I *can* do right now** is look at your funding plan and tell you whether there's a grant route that could cover all or part of this expansion without repayable finance — which would change the shape of the decision entirely.

To do that well, let me pull up where your plan currently stands.

Here's where the loan question sits against your actual plan, and it's important context.

**Your binding constraint right now is time, not ambition.** You have a £210,000 gap against your current goal, with 5.7 months remaining and a required monthly run-rate of £36,528. Your pipeline weighted value is £47,500 against an unweighted £70,000 — meaning you need to be landing wins almost immediately, and consistently, to hit your goal as it stands. A £150,000 borough expansion on top of that is a very large additional ask in a very short window.

**On the loan question specifically:** as I said, I can't advise you to take it or not — that's a cash flow and risk conversation for your finance lead and potentially a social lender. But here's what the plan arithmetic tells me:

- Your existing gap is already £210,000 with 5.7 months to go. Adding a £150,000 expansion into that picture either means extending your timeline, raising your target, or — if you want to pursue it via grants — opening it as a new purpose within your plan so it gets its own pipeline tracking.
- The grant route for programme expansion into new boroughs is real. Your candidate matches are currently oriented toward mental health, education, and young people — which maps well to youth programme work. If the expansion has a clear borough focus, London borough-specific funders (Trust for London, City Bridge Foundation, London Councils) could be relevant, though I'd need to assess them against your plan.

**My read:** before considering a loan, it's worth knowing whether grant funding could cover a material portion of the expansion costs. If you'd like, I can add "youth programme expansion — two new boroughs" as a purpose within your plan, which would let us track candidates and pipeline against it specifically. That would give you a much clearer picture of what's fundable before you take on repayable finance.

Would you like to add the expansion as a purpose, and do you have a rough figure for what the two-borough rollout would cost?

</details>

## CV-06 — Parallel-goal steering — a purpose offered, the goal never replaced — ✅ PASS

### Turn 1 [chat]

> Can you set up a second goal alongside our main one? We want to raise £50,000 for a new minibus.

Tools: get_plan_state
- ✅ does not call set_funding_goal
- ✅ matches: must offer a purpose inside the plan as the real answer
- ✅ matches: must explain the one-strategy principle, not just refuse
- ✅ number lint

<details><summary>transcript</summary>

A second parallel goal isn't the right fit here — and that's a design principle, not a limitation. One active goal per organisation means the whole funding picture stays in one place, so you can see how everything adds up, spot concentration risks, and sequence your asks coherently.

What the minibus raise actually is, in plan terms, is a **capital purpose** sitting inside your existing goal. That way it gets its own progress tracking and pipeline assignments, but it's visible alongside everything else you're raising.

Let me pull your current goal so I can add it cleanly.

Your active goal is "2026 income target" — £250,000 by 31 December 2026. What I'll do is add a **Minibus appeal** capital purpose for £50,000 to that goal. It will track its own progress and you can assign minibus-specific pipeline items directly to it.

One thing worth flagging as my adviser read: adding £50,000 of capital to your purposes may shift the recommended funding mix, since capital typically suits different funders and funding characters than your core income. If you'd like, once I've added the purpose I can re-run the mix recommendation against the updated picture — just say the word.

Shall I go ahead and add the Minibus appeal purpose at £50,000?

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

Three clear purposes — let me run the mix rulebook across those before I ask anything else.

Here's what the rulebook produces across your three purposes:

**Unrestricted, 63%** — drawn almost entirely from your £150,000 core running costs (mapped 100% unrestricted), plus a small buffer from the youth programmes (10% of that £80,000). Core costs are the hardest character to win — funders resist paying for salaries and utilities — so this is the right target to set, even if it takes longest to fill.

**Project, 29%** — the bulk of the youth programmes (90% of £80,000). Packaged as project grants with full cost recovery built into each budget, so your overheads are covered within the grant itself, not just the activity.

**Capital, 8%** — the minibus (100% of £20,000). Capital funders are a distinct population from revenue grant-makers, so the minibus sits in a separate track of its own.

All three components come straight from the rulebook — nothing here is my own judgment.

Does that split sound right to you? If so, I can set it as your plan's mix target — and we can set the full goal around it.

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

There's an inconsistency in the data I need to flag before going further.

The mix targets add up to 120% — capital 30%, project 20%, unrestricted 70% — which doesn't reconcile. A valid mix must sum to 100%. I can see those three figures exactly as returned by the plan, and I can't explain the discrepancy from the data I have.

A couple of things worth noting alongside that:

- The mix composition is currently **not attributable** — none of the pipeline items have been assigned to a purpose, so there's no way to see how the pipeline maps against each character target.
- There are also **no purposes recorded** on the goal, which means the mix was likely set directly rather than derived from a purpose split via `recommend_mix`.

**My recommendation:** re-run the mix properly. If you can share a rough breakdown of what the £250,000 is for (core costs, a programme, a capital item, a staffing post — and approximately how much to each), I can run `recommend_mix` against those purposes, explain the full reasoning per component, and then confirm with you before writing anything to the plan. That would also fix the attributability gap so you can track progress by character going forward.

Would you like to do that, or do you already have a corrected mix in mind you'd like to set directly?

</details>

## CV-09 — Setup discipline — one question per turn, no tables, no premature mix; confirm-before-write with a correctly-grounded date — ✅ PASS

### Turn 1 [chat]

> We need to raise £150,000 over the next 18 months, starting today.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Good start — that gives me enough to set the deadline and target. Before I can recommend the right funding mix, I need to understand what the money is for.

What are the main things you're looking to fund? For example, running costs, a specific programme, a new staff post, equipment — whatever fits your situation.

</details>

### Turn 2 [chat]

> Roughly £60k core running costs, £50k for our employment training programme, £25k for a delivery manager post, and £15k for kitchen equipment.

Tools: (none)
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

That's a helpful split — four clear purposes. One quick question before I work out the right mix:

The delivery manager post — is that someone who'll be running your employment training programme specifically, or a more central organisational role?

</details>

### Turn 3 [chat]

> It is a delivery post — they run the training programme itself.

Tools: recommend_mix
- ✅ calls recommend_mix
- ✅ does not call set_funding_goal
- ✅ ≤1 question(s)
- ✅ no markdown table

<details><summary>transcript</summary>

Thanks — that shapes the mix meaningfully. Let me work out the recommendation now.

Here's what the rulebook derives from your purpose split:

**Unrestricted, 43%** — made up entirely of your core running costs (£60,000). These are the hardest awards to win, but each one covers months of operations rather than a single activity, so they're worth prioritising early.

**Project, 47%** — made up of your employment training programme (90% of £50,000, with a small unrestricted buffer for what funders won't cover) plus the delivery manager post (£25,000, sitting in the project budget because it's a delivery role). The key discipline here is full cost recovery: build your overheads into each project budget rather than leaving them unattributed.

**Capital, 10%** — the kitchen equipment (£15,000). Capital funders are a distinct population from revenue grant-makers, so this is a parallel track rather than competing with the other asks.

Sound right? If so, I'll set up the plan and we can start looking at opportunities.

</details>

### Turn 4 [chat]

> Sounds right, set it up.

Tools: get_funding_goal, set_funding_goal
- ✅ calls set_funding_goal
- ✅ set_funding_goal input
- ✅ ≤1 question(s)

<details><summary>transcript</summary>

No existing goal to replace, so I'll set this up now.

Your plan is set. Here's where things stand:

- **Target:** £150,000 by 9 January 2028
- **Mix:** Unrestricted 43%, Project 47%, Capital 10%
- **Secured so far:** £0 — the full £150,000 is the gap to close

Four purposes are recorded: core running costs, employment training programme, delivery manager post, and kitchen equipment.

The natural next step is to get a briefing — that'll pull together eligible opportunities against your gap and tell you what to go after first. Want me to run that now?

</details>
