# Campaigns and the document layer

Grant Tracker · design note · 10 July 2026 · sequenced after first-user onboarding · companion to the Adviser v1 design specification (§5 goal lifecycle) and build-spec §13/§14

**Status:** agreed design direction, not a build order. **Origin:** a cohort member (Jen) asked to upload a tailored case for support for a specific fundraising priority and use it to drive focused funding discovery, and separately asked for team logins. This note captures the architecture her request implies, so it lands as designed evolution rather than accretion.

## 1. The organising principle: one object chain

The app is not a set of sections. It is one object chain viewed from different angles: profile (who you are) → goal (what you are raising) → purposes (what for, each with its own documents and campaign lens) → pipeline (where each pursuit stands) → applications (the work) → outcomes (what happened) → accumulated context (what the adviser has learned). Every feature is a lens on this chain. The standing test for any future feature: which link does it enrich, and which lenses see the enrichment? A feature that does not connect to the chain is a wart.

This principle is the answer to the observed drift toward separate sections. It should be treated as a design rule alongside the accent rule and the copy rules.

## 2. Campaigns are purposes with depth, not parallel goals

The one-active-goal principle (Adviser spec §5) stands unchanged: the adviser's value is reasoning across the whole funding picture, and parallel goals fragment the arithmetic, the concentration logic, and the question of which briefing is home. A focused fundraising priority is a purpose given depth, and the product may call that depth a campaign. A campaign adds three things to a purpose:

- **An attached document.** The tailored case for support (or project document) lives on the purpose. See §3.
- **A focused lens.** Discovery, assessment and candidate ranking scoped to that purpose's themes, amounts and funding character: "find funding for this". The scoped view runs on the same engines with a purpose filter, not a separate matcher.
- **A face.** Per-purpose progress already exists on the plan page; the campaign lens elevates it to a view a user can open and work inside: its candidates, its pipeline items (via the existing purpose reference on pipeline items), its document, its progress.

One strategy, many campaigns inside it, one arithmetic. The user who asks for a second goal is still offered a purpose, exactly as the steering rule says; the purpose is now rich enough that the offer satisfies.

## 3. The document layer: two document types, one pipeline

- **Org strategy document → goal-level context.** Feeds the adviser's grounding and org-wide matching. Extraction lands as staged facts in `org_facts` for the user to confirm, each carrying provenance ("from your strategy document, June 2026"). The `groundedOrgFacts` contract strengthens: the adviser can cite where an org fact came from.
- **Case for support / project document → purpose-level context.** Feeds that purpose's focused discovery, and downstream becomes the source material the application scaffolding maps into funder frameworks in the Apply tier. One upload, three payoffs: matching, advising, applying.

The non-negotiable discipline: extraction is staged and confirmed, never silent. Documents are messy; a mis-extracted figure corrupting matching would be the tag problem reborn. Extracted facts carry source provenance like every other fact in the system, and confirmation is a user action, not a default.

## 4. Fusion with the semantic-similarity workstream

The approved semantic-similarity experiment (thematic affinity via embedded funder descriptions, evaluated against the Devi benchmark) is the foundation this layer stands on. An embedded case for support matched against embedded funder descriptions is that experiment with dramatically better input than profile tags: the document contains the beneficiary detail, outcomes language and delivery framing that tags compress away. Sequencing follows from this: the experiment proves the mechanism on profile and mission text first; the document layer then upgrades its input.

## 5. The Projects convergence question

Projects predates the goal architecture and currently floats beside it. Jen's request landed "in the project section" because to a user, the project is the fundraising priority; the product should agree. The convergence decision, to be taken deliberately: a Project becomes the rich form of a purpose, or links one-to-one with a purpose. This carries migration implications (existing projects, existing match flows) and is explicitly a designed decision, not a drift. Until it is taken, no new feature should deepen the separation.

## 6. Related signal: team access

The same cohort message asked for colleague logins (prospect-research staff). Multi-user-per-org is a commercial signal arriving slightly early: shared logins would poison per-user analytics, capture attribution and the future seat-pricing option. Near-term: confirm what the existing users model supports and give a proper answer rather than defaulting to credential sharing. Strategic note for the pricing file: team seats are a natural Apply/Adviser-tier dimension.

## 7. Sequencing

Nothing in this note precedes first-user onboarding. The Jack board is unaffected.

- Semantic-similarity experiment (already approved) runs first and is the foundation.
- Case-for-support upload on a purpose is the first user-facing piece; the requesting cohort member is the natural pilot.
- The campaign lens follows alongside the Apply-tier work it feeds; the Projects convergence decision is taken before the lens ships.
- Org strategy upload follows the same pipeline once the purpose-level version has proven the staged-extraction discipline.

---

*Grant Tracker · campaigns and the document layer · internal design note*
