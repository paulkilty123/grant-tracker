# "Not live yet" as the primary view — proposal

**17 August 2026. Nothing built.** Counts are live, from
`scripts/publish-gate-preview.ts` against the current queue.

Queue today: **131 rows** — 27 would publish, 72 held, 32 live-and-wrong.

---

## 1. The five sections, and what maps into each

The 18 "why held" chips collapse to five. Counts are rows carrying that code;
a row can carry several, so they sum to more than the section totals.

| Section | Codes | Rows |
|---|---|---:|
| **Ready to publish** | no blocking code at all | **27** |
| **Link is dead, or the page isn't about this fund** | `link_dead` 15 · `page_describes_different_fund` 44 | **~59** |
| **Needs reading** | `no_brief` 13 · `never_verified` 5 · `page_unreadable` 4 · `quarantined` 2 | **~24** |
| **Needs your judgement** | `deadline_implausible` 5 · `amount_ungrounded` 4 · `amount_pot_suspected` 2 · `deadline_passed` 2 · `amount_*` · `tags_changed` · `user_flagged` | **~13** |
| **Nothing truthful to show** | `no_funder` 3 · `page_says_delisted` · `page_says_not_funding` · `page_says_round_closed` · `no_current_timing` | **~3** |

**The link section is narrower than the old chips**, per your note.
`link_unverified` is deliberately **excluded**: it means "we have not checked",
not "it is broken", and 57 of its 60 rows were `url_status = 'unchecked'`. A link
landing on a funder's homepage is not a problem and does not appear anywhere.

**Three placements I have made a judgement on** — say if any is wrong:

- `page_unreadable` → **needs reading**, not the link section. A page we cannot
  fetch is usually a bot wall, and the reader proxy clears about sixteen such
  hosts. Filing it as a dead link is the false-dead problem.
- `quarantined` → **needs reading**. The auto-chain stopped; the fix is to clear
  the reason and re-run, not a human decision.
- `deadline_passed` → **needs your judgement**, not "nothing truthful". A past
  date with a live round behind it is a correction; without one it is a removal.
  The abstain rule says that difference needs a person.

## 2. Sort inside each section: evidence strength, safest first

Real now that 647 of 649 live rows have been read. Derived from
`field_evidence`, no new storage:

1. **Page confirms us** — one or more fields with `agrees: true`
2. **Page is silent** — read, every field `agrees: null`
3. **Page contradicts us** — one or more `agrees: false`
4. **Page is about a different fund** — `_page_read.note` is `fixable_link: wrong_fund`

So you can accept down a section and stop where you get uneasy, which is the
point of the axis.

## 3. Funding type

A label on each card, plus a filter chip. Not a section — as a grouping it gives
one pile of grants and four piles you would clear in a minute.

## 4. Bulk select per section

Checkbox per row, select-all per section, one action bar. Without it the sections
are tidier scrolling and nothing else.

## 5. The line at the top

Computed, not written:

> **27 rows are ready to publish. Clearing the link section would make 44 more
> publishable — it is the single biggest blocker on the screen.**

---

## The one thing I will not decide for you

**Where does "live to users, and wrong" go?**

There are **32 of them**, and they are the only rows on this screen where a
person is being misled *right now*. Everything under "not live yet" is invisible,
so its cost is delay rather than harm — your own framing when the bands were
built, and it is still in the code as *"People can see these now. Fixing one
changes what they see today."*

Making "not live yet" the primary view is right for the reason you gave — it is
where catalogue quality gets decided. But done naively it demotes the 32 to a
chip, and the screen would then lead with work that harms nobody while the rows
that do are one click away.

**Three options:**

**A. Live-and-wrong stays pinned above the five sections**, always visible, not a
chip. Not-live is primary in the sense that it owns the body of the screen; the
32 keep a permanent band at the top that shrinks to nothing when empty.
*Recommended — it satisfies "primary view" without burying the only harmful set.*

**B. Two top-level views**, "not live yet" default. Cleaner, but the 32 are then
behind a click and can sit unnoticed, which is how the gate stayed invisible.

**C. Live-and-wrong becomes a sixth section** in the same list, first by sort
order. Simplest to build; risks reading as just another queue when it is not.

I would build A. It is a day's work: the section mapping is a lookup table over
codes we already compute, the sort key is a read of stored evidence, and the bulk
bar is one component. Say which and I will build it.
