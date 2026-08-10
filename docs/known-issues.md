# Known issues

Standing problems that are understood, reproduced, and deliberately not fixed
yet. Each entry states the mechanism, the blast radius, and the intended fix, so
picking one up does not mean re-deriving it.

---

## Grant Manager pins every field on screen, not the ones you changed

**Status:** open. Logged 2026-08-10. Not scheduled.

**Mechanism.** `src/app/api/admin/update-grant/route.ts:18` (and
`promote-grant/route.ts:18`) resolve an admin session to:

```ts
return { source: `admin:${auth.user.email}`, pinned: true }
```

Grant Manager submits its whole form state on save, so every tracked field on
screen is written, whether or not the admin looked at it. `mergeGrantUpdate`
then stamps each one `admin:<email>` at trust 100 and `pinned: true`.

Two consequences, both from `src/lib/grant-merge.ts`:

- A pinned field can only ever be rewritten by another `admin:` source
  (`:185-190`). Nothing automated can touch it again: not enrichment, not the
  classifier, not a URL re-read, not the new `user_verified` accept path.
- Even an explicit `pinned: false` does not help, because an `admin:` source
  overriding a non-admin value auto-pins regardless (`:203-209`).

**Blast radius.** Measured 2026-07-26 and unchanged: 54% of active rows carry at
least one pinned field, and 53 rows have `deadline` pinned to NULL — frozen empty
because the form's date box happened to be empty when something unrelated was
saved. CLA Charitable Trust's round closes and its deadline cannot be populated
by anything. The signature is several fields stamped in the same second, which is
a form save rather than a per-field decision.

It also blocks the feedback triage path directly: five of the thirteen grants
Charlotte flagged on 2026-08-07 already carry `location_tag` pins from
`admin:paulkilty1@gmail.com` and `admin:match_feedback_review_2026-06-14`, the
latter being the residue of a previous manual feedback review. A correction
accepted against a pinned field is rejected by the merger, not written.

**Intended fix.** The form should send only fields whose value actually changed,
so a save records the decisions the admin made rather than everything that was on
screen. That is a Grant Manager change, not a merge-logic change: the merger is
behaving correctly given what it is handed. `mergeGrantUpdate` already returns an
`idempotent` decision for unchanged values, so the safest version is to diff
client-side against the loaded row and submit the delta.

A second, smaller improvement: an explicit unpin affordance in Grant Manager, so
an accidental pin can be cleared without a hand-written SQL update.

**Why not now.** It is a behaviour change to the main catalogue-editing surface,
it wants its own testing, and the immediate feedback-triage work routes around it
by surfacing pinned fields in the triage UI and offering a deliberate admin
override. Fixing the form does not retire the existing 54% of pins; that is a
separate cleanup with its own judgement calls about which pins were real
decisions.

**Do not** resolve this by lowering `admin` trust or removing the auto-pin. Both
exist so a deliberate human correction cannot be silently clobbered by an AI run,
which is a property worth keeping. The bug is that the form declares far more
decisions than the human actually made.
