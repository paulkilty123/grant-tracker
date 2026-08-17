# Trial value-integrity — defending the agent tier against extract-and-leave

**Status:** decision note, 14 June 2026. Captured before the week-2 trial-mechanism build so the requirement is on record, not retrofitted.
**Reads with:** `functional-boundary.html` (free/paid line + no-dark-patterns rules), `tier-customer-map.html` (Companion tier), `goal-agent/build-spec.md` (the reasoning core + Phase-5 proactive layer that make value recurring). Delivery-plan v2 week 2 owns the trial mechanism itself.

---

## The risk

Two versions of the same worry. (1) A user takes the 14-day trial, lets the agent build a funding plan/goal, screenshots it, and leaves without paying. (2) A monthly subscriber extracts a month's insight, then cancels. In both, the fear is that the agent's value is a one-off deliverable that can be lifted and walked away with.

## The principle: it's a value-shape problem, not a trial-mechanics problem

The vulnerability exists in exact proportion to how much of the agent's value is a **one-time artefact** (an extractable plan) versus an **ongoing service** (continuous reasoning, vigilance, adaptation). If a user can extract the full value in 14 days and leave genuinely satisfied, the product has been mis-built as a *plan generator* — and no trial length, export-withholding, or cancellation friction fixes that. It only annoys the users who would have stayed.

The defence is not lock-in. It is two properties the product must actually have:

- **Perishability.** A funding plan is a snapshot of a moving system — catalogue churn (rows added/retired weekly), open/closed rounds, deadlines, the org's own pipeline, the funder landscape. A plan extracted in June is materially stale by September. The cheap, extractable thing decays; the expensive, recurring thing (deadline vigilance, "a funder that fits just opened", concentration drift, decline-and-re-plan) is about the future and cannot be extracted.
- **Accrual.** The org model gets richer with every correction, save and logged outcome. Leaving resets it to zero; a returning user starts cold. This accrued context *is* the switching-cost moat (built through use, not bolted on).

The test to keep asking through the build: **"what does month three of the agent do that month one couldn't?"** Crisp answers → extraction is self-limiting. No answers → that's the gap to close, and it's the same gap that makes the tier worth a recurring price at all.

## Build requirements (for the trial mechanism + proactive layer)

1. **The trial demonstrates the loop, not just the artefact.** Within 14 days the user must *experience the recurring behaviours*, not only receive a plan: at least one proactive, high-signal nudge; at least one visible re-prioritisation when something changes; the "what I've learned about you" growing. The conversion moment is "here's the plan, *and* here's the thing I caught that you'd have missed", not "here's your plan."
2. **The plan is a living workspace, not a generated document.** Frame and build it as a dashboard that stays current with reasoning attached, not a strategy doc you produce and hand over. (See boundary below — this is about framing the *service*, never about withholding the user's *data*.)
3. **Make recurring value legible at the expiry moment.** The trial-expiry summary should make the ongoing value explicit and honest (what the agent watched, caught, surfaced; what it will keep doing) — one clear offer, then quiet. No nagging.
4. **Outcome capture is the retention flywheel.** The agent gets better at this org over time (and, later, at orgs like it via the brain). "It compounds; leaving forfeits the compounding" is a real pitch only if outcome capture is live from day one (it is, per build-spec §5.6).
5. **Lean on the Apply tier / builder for structural stickiness.** Applications are perpetual and the org's reusable content compounds with each one — far harder to extract-and-leave than a strategy. The strongest structural answer to "the plan is a one-off" is the builder, already the lead demand signal in the tier map.
6. **Annual billing as the default offer.** ~82% of nonprofit SaaS is subscription because boards want predictable annual costs — annual billing matches how the buyer wants to pay and removes the month-to-month churn vector without friction or lock-in.

## What this explicitly rejects

- **No withholding or crippling the export; no blurred/locked plan output.** The functional boundary rejects bait-and-blur twice, and trust is the *input* to the compounding moat (Philomina won't move her pipeline in until she trusts permanence). The user's own data — pipeline, org context, saved opportunities — stays theirs and exportable. What they pay for is the live service, not custody of their data. A static export of "what the agent thought on day 14" is fine to hand over; it is stale the moment they leave.
- **No deliberately incomplete trial to force conversion.** Inverts load-reduction; conversion-by-friction converts worse than conversion-by-felt-value.

## Timing calibration

At GA the binding risk is too *little* adoption, not too much extraction (north star: 30-40 paying orgs by Dec). So: build the product so value is genuinely recurring — wanted regardless — but do **not** spend build time on anti-extraction machinery now. The healthy metric is "does the median engaged org find the ongoing value worth it", not "can we stop the extractor". Some always extract; that is normal SaaS. For the most fragile orgs, trial-then-stay-on-free is the model working — free serves them as mission, the paying heartland is elsewhere.
