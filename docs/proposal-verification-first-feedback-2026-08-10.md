# Proposal — verify the flag, don't queue it

10 August 2026. **Proposal only. Nothing built.** Branch
`docs/verification-first-feedback-proposal`.

Written after Paul used the triage screen shipped earlier today and said, in
effect: this is another review process that eats my time, and what I actually
want is a verification process that recommends the fix.

He is right. This sets out what to build instead.

---

## 1. What is wrong with what we shipped

The triage screen captures feedback properly and records decisions properly. The
problem is where it puts the work.

For every flag, the admin currently has to:

1. read what the user said
2. open the funder's page and find the relevant statement
3. decide whether our record or the user is right
4. pick one of three classes
5. work out which field to change and to what
6. type the new value
7. write a note

Steps 2, 3 and 5 are the valuable ones, and they are also the automatable ones.
**I did exactly that work twice this afternoon, by hand, in about two minutes
each:**

- **A B Charitable Trust** — user said "only charities under £1.5m turnover".
  Fetched `/apply`, `/how-we-fund` and the programme page: no income threshold
  stated anywhere, and none in our stored text either. But the programme page
  *does* state a deadline of 23 October 2026 that our record was missing.
  Outcome: correct the deadline, leave `max_org_income` null.
- **The Julia Rausing Trust** — user said "Invite-only". Their grants page states
  in bold *"The Trust does not accept unsolicited applications."* Outcome: set
  `is_invite_only = true`.

Neither needed judgement Paul could not verify in five seconds from a quote. Both
took a human several minutes to reach.

**The classification step earns nothing.** Paul's third triaged flag, on Fix the
Digital Divide Fund, reads:

> "Cant find the Fix the Digital Divide Fund on the page, looks like they have
> new grants that come and go and this was one of them a while back but isnt
> listed"

He classified it `match_precision` because none of the three classes fit. It is
actually a dead row that should be archived. The taxonomy was built around the
model of the problem, not around what he does about it.

**And nothing is readable afterwards.** The triage list only shows untriaged
flags, and `reviewer_note` is rendered nowhere else, so all three notes he has
written are invisible outside SQL. That is a straightforward omission and is
addressed in §6 regardless of whether the rest of this is built.

---

## 2. The shape it should be

A flag is a **claim about a funder**. Claims can be checked. So check it, and
bring Paul a recommendation with its evidence.

```
user flags a grant, with a reason
        ↓
re-read the funder's page, asking the SPECIFIC question the user raised
        ↓
verdict + quote + a proposed field change
        ↓
Paul: Approve · Reject · Edit
```

What he sees per flag:

```
Funding opportunity: Migrants and Refugees          A B Charitable Trust
User said        "only charities under £1.5m turnover"           Mustard Tree
We checked       abcharitabletrust.org.uk/apply · 10 Aug 2026
Verdict          NOT FOUND — no income or turnover limit is stated on the
                 apply, how-we-fund or programme pages
Also found       the programme page states a deadline of 23 October 2026,
                 which our record does not have
Proposed         deadline → 2026-10-23        (leave max_org_income unset)
                 [ Approve ]  [ Reject ]  [ Edit ]
```

One decision, with the evidence already on screen. No classifying, no field
hunting, no separate browser tab.

---

## 3. Verdicts, and what each proposes

| Verdict | Meaning | Proposed action |
|---|---|---|
| **confirmed** | The page states what the user said | Write the field, citing the quote |
| **contradicted** | The page says the opposite | Write nothing. Record that our row was right — this is matcher signal |
| **not found** | The page does not address it | Write nothing, mark the row check-required. **Never** read absence as "no limit exists" |
| **no longer listed** | The fund is not on the funder's site any more | Propose archiving the row |
| **unreadable** | Could not fetch the page | Route to Fix the link, not to a guess |

Two of these do not exist in today's taxonomy and both came up within an hour of
Paul starting: **no longer listed** (Fix the Digital Divide) and **unreadable**
(juliarausingtrust.org returned 401 to a plain fetch and needed a real browser).

Classification stops being a question he answers. `triage_class` is derived from
the verdict and still stored, so the labelled set he wanted still accumulates —
he just is not the one producing it by hand.

---

## 4. What it reuses

Almost everything. This is a new caller of existing parts, not a new stack.

- **Page fetching** — `enrich-grant`'s fetch, including the reader proxy
  (`READER_PROXY_URL`) for the roughly 16 hosts that refuse plain fetches. Julia
  Rausing is one of them, which is why WebFetch got a 401 and the browser did not.
- **The write** — `mergeGrantUpdate` at `user_verified` trust (70), which already
  outranks enrichment and does not pin. Built and tested today.
- **Citations** — `mergeGrantUpdate` already accepts a per-field `citations` map
  stamped into `field_provenance`. A verified correction can carry the sentence
  it came from, so "why does this row say 23 October?" is answerable forever.
- **Keying** — `resolveFlagGrant`, id-only, already tested against the two
  "Stronger Communities Fund" rows.
- **Recording** — `match_feedback.reviewed_at / resolution / triage_class /
  reviewer_note`, migrations 051 and 052, already applied.
- **The pin surfacing** — a proposal against a frozen field must still say so
  before Paul approves it.

Nothing built today is wasted. What changes is that the human step moves from
*investigate and decide* to *approve or reject*.

---

## 5. Cost

Per flag: one page fetch, one Haiku 4.5 call. The prompt is small because the
question is narrow — the user's claim plus the relevant page text, not a whole
re-enrichment.

- input ~4,000 tokens × $1/1M = $0.0040
- output ~500 tokens × $5/1M = $0.0025
- ≈ **$0.0065, about £0.005 per flag**

| Population | Cost |
|---|---|
| The 36 with a stated reason | **about £0.19** |
| All 403 negative flags | **about £2.10** |
| Ongoing, at the current ~156 flags/quarter | **under £1/quarter** |

Cost is not a consideration here. Accuracy and Paul's time are.

**Effort to build:** roughly half a day for the verification pass and the
recommendation screen, on top of what exists.

**Break-even, honestly:** doing the 36 by hand with me helping is maybe two
hours. So this does not pay back on the current backlog alone. It pays back
because flags keep arriving at ~156 a quarter, because the same machinery
answers "is this fund still open?" for the 560 undated rows in the staleness
audit, and because it stops Paul being the bottleneck on every single one.

---

## 6. Ship first, regardless: make notes readable

Independent of the above, and much smaller. Right now Paul has written three
notes and can read none of them back.

- A **Triaged** toggle on the feedback screen: the same cards, read-only, showing
  verdict, class, resolution and his note.
- A **feedback block on the grant's own catalogue page**: "2 users flagged this",
  with their words and his notes, so the context is where the decision is made.

This is worth doing whether or not the verification pass is built, and it should
go first.

---

## 7. Failure modes, and how it degrades

- **The model says "confirmed" and is wrong.** Mitigated by never auto-applying:
  every write needs Paul's click. A verdict without a supporting quote from the
  page is not shown as confirmed. The standing rule from the amount audit —
  extractors ran about a third wrong on hard cases — applies here too.
- **Absence read as evidence.** "Not found" must never become "there is no
  limit". It proposes leaving the field null and marking the row check-required,
  which is what the eligibility engine already does for unresolved income gates.
- **The page changed since the user flagged it.** The verdict carries its fetch
  date, so a stale check is visible rather than silent.
- **Bot-walled or dead pages.** Explicit `unreadable` verdict routing to Fix the
  link. It never guesses from a failed fetch.
- **Bulk approve.** Tempting for the obvious ones, and risky: it is how a wrong
  extraction reaches 30 rows at once. If built at all, restrict it to
  `contradicted` and `not found`, which write nothing.

---

## 8. What this deliberately does not do

- It does not re-enrich the whole row. It answers one question.
- It does not act on tag-only flags. 355 negative flags carry no stated reason,
  so there is no claim to verify. They stay out.
- It does not touch `funder_brief`. The Julia Rausing brief still reads "Open to
  organisations of all sizes" for a funder that accepts no applications, which is
  a re-read job, not a field correction.
- It does not resolve duplicate rows. A B Charitable Trust has two live rows
  describing substantially the same money from different sources. Separate piece
  of work.

---

## 9. Decisions

1. **Build the verification pass, or keep hand-triage for the 36 and revisit?**
   Honest answer: hand-triage clears the backlog sooner; verification is worth it
   for everything that comes after.
2. **Ship the read path (§6) first?** I would, either way.
3. **Is deriving `triage_class` from the verdict acceptable**, or do you want to
   keep classifying by hand to build the labelled set you mentioned?
4. **Bulk approve for the write-nothing verdicts** — useful, or too loose?
5. **Should `no longer listed` propose archiving automatically**, or only ever
   flag for your decision? It is the one verdict that removes a fund from view.
