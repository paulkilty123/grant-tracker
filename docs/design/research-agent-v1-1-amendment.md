# Research agent v1.1: the choreography pass

Grant Tracker · amendment spec · 14 July 2026 · amends `research-agent-v1-spec.md` after Paul's first live sessions · mockups: thread scope and working state; research note and expanded pins (14 July session)

**Origin:** two live research sessions on the preview (Reprezent test org). Verdict on v1: the reasoning clears the benchmark (Claude-with-MCP quality, in app); the choreography does not. Findings: plan-state framing intrudes on independent questions; tool-result cards render before or alongside prose and can contradict it; the pin affordance is invisible and pins are unexpandable; two labels ("Ask about scope", "Brief") mean nothing to a new user. This pass fixes delivery, not capability. **Ship gate for anything user-facing remains: this pass done, evals green, Paul's re-walkthrough.**

## 1. Threads are standalone only, for now

- Remove plan-state grounding from research threads entirely: no goal, gap, mix or purpose framing in research-turn steering. The thread answers the question asked, fresh eyes.
- The new-thread dialog keeps only the label field. No scope choice ships in v1.1.
- Design note, recorded: the plan-linked mode (thread scoped to a purpose, findings tracked against it, plan framing enabled) is designed and mocked, and returns when the strategy agent exists to give it a real object to link to. Do not delete the `focus_purpose_id` column; it stays dormant.

## 2. Compose-then-render replaces streaming cards

- Nothing renders from tool results directly. During a research turn the user sees a working state inside the adviser's reply bubble: a checklist of honest steps as they complete ("Checked N catalogue records · M candidates", "Researched [funder] live · [what was confirmed]", "Writing up what's worth your time…"). Steps derive from real tool activity, never invented.
- The reply then renders once, as a composed research note: (a) the adviser's read, 2–4 sentences; (b) SHORTLIST · IN ORDER, ranked cards; (c) weaker matches collapsed into one row ("Also matched, weaker fit: N [description] · why they don't fit") that expands on tap. No unranked card dumps.
- Reload reconstruction renders the same composed note (extend the shared slimmer mapping to carry the note structure).

## 3. The verdict governs the cards

- Each shortlist card's body text is the adviser's per-fund verdict authored in the turn, never a template line. The mail-merge reason strings ("Arts & Culture aligns with X's work") are retired from research cards.
- Ranking, inclusion in the shortlist, and demotion to the collapsed row are the adviser's judgment for this question, not raw match order. A fund the prose demotes can never render as a full shortlist card: structural consistency, same principle as the tool-gate fixes.
- Provenance chrome unchanged: verified funds carry the check and date; unverified or researched-live facts carry the amber treatment inline in the verdict. Urgency register must be consistent: one shared arithmetic for deadline urgency wherever the same date is described (conversation, card, funder profile). The current contradiction ("urgent, nine days" vs "meaningful lead time" on the same deadline) is the regression case.
- Caveat chips: when a verdict contains a check-before-committing caveat, the card may carry one extra chip whose label is generated from the caveat in plain words ("Does radio count?", "Check we qualify"), which sends that question as the next turn. No caveat, no chip. Never a generic label; if generation can't produce a clean short label, omit the chip.

## 4. Rename: Brief becomes Funder profile

- User-facing only, shallow rename as with Companion to Adviser: the chip reads "Funder profile", the artefact is "the funder profile" in all copy, pin type label "profile". Internal identifiers (`brief.ts`, `agent_thread_briefs`) stay.
- Section headings inside the artefact stay as built (what they fund, fit against your purpose, how to approach) with per-claim provenance tags.

## 5. The research log (pins grown up)

- Panel renamed "Research log". Every pin is typed: profile, finding, or decision, with a one-line meta (type · date · status such as in pipeline / flagged for verification).
- Pins expand in place: a profile pin opens to its sections inside the panel with an "Open full profile" link; a finding shows its body and source kind. Collapsed by default.
- The pin affordance becomes a visible icon on every shortlist card (top corner), replacing the buried text link. Adviser may suggest a pin in prose; it never pins silently (unchanged rule).

## 6. Data fixes riding along

- Sweep all BFI rows for amount-parse artefacts: a £1 minimum is live again (UK Global Screen Fund Festival Launch Support, £1–£15k). Same treatment as the F6 audit: fix clear artefacts against source, log ambiguous ones.
- Verify the ACE Supporting Grassroots Music record against source (deadline 23 July, scope, amounts): it is currently unverified, headlined a session, and its deadline drives urgent advice.

## 7. Evals

- Extend the research eval set: (a) prose-card consistency: a fund the reply's prose demotes must not render as a full shortlist card; (b) urgency-register consistency: the same deadline described in two authored surfaces must carry the same urgency; (c) working-state honesty: steps shown must correspond to tools actually called; (d) caveat-chip discipline: no chip without a caveat, labels plain-language.
- All existing suites and the four v1 research evals stay green. Standing deploy gate unchanged.

---

*Grant Tracker · research agent v1.1 amendment · internal*
