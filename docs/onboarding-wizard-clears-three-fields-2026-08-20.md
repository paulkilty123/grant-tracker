# Onboarding wizard silently clears three profile fields it never collects

**Found:** 20 August 2026, while checking whether it was safe to click through the wizard for a design review.
**Not a Band A defect** — this predates the rebrand and is untouched by it. Filed separately so it doesn't get bundled into design work.
**Severity:** low blast radius, silent failure, changes match results.

---

## The failure

Re-running `/onboarding/wizard` on an account that already has an organisation clears three fields:

```
funder_type_preferences      → []
funding_subtype_preferences  → []
years_trading                → null
```

Nothing in the wizard asks about any of them. They are written as literals in the save payload and are not read back when the wizard prefills, so an existing value cannot survive a second pass.

The user sees a normal completion screen. Their matches then rank differently, with nothing to indicate why.

---

## Why it happens

`src/app/onboarding/wizard/page.tsx`

**Save payload — lines 930, 932, 935.** Three literals:

```ts
funder_type_preferences:      [],
funding_subtype_preferences:  [],
years_trading:                null,
```

**Prefill — the `setState` block at lines 671–699.** Reads fourteen fields back off the existing org: `name`, `legal_structure`, `primary_location`, `annual_income_band`, `geographic_reach`, `mission`, `impact_sectors`, `beneficiary_groups`, `min_grant_target`, `max_grant_target`, `spend_restriction_preferences`, `funding_type_preferences`, `niche_tags`, `excluded_niche_tags`.

The three fields above are **not** among them. So on the update branch (line 943, `updateOrganisation(orgId, payload)`) they are overwritten with the literals rather than round-tripped.

Note the near-miss that makes this easy to skim past: `funding_type_preferences` **is** prefilled and preserved. `funding_subtype_preferences` is not. One character apart.

---

## Why it matters

Two of the three are user-entered, and all three are read by ranking.

| Field | Set by the user where | Read where |
|---|---|---|
| `funder_type_preferences` | `dashboard/profile/page.tsx:1621` | `matching.ts:1458` (scores `+15` on a preferred funder type, and writes a "preferred funder type" reason string) · `api/ai-search/route.ts:35` (fed into the ranking prompt) |
| `years_trading` | `dashboard/profile/page.tsx:1022` | `agent/tools/repository.ts` |
| `funding_subtype_preferences` | not user-settable today | `matching.ts:1500` (boosts a matching sub-type toward the score ceiling) |

So a user who sets their preferred funder types in the profile editor, then walks the wizard again, loses them and gets different results.

---

## Reproduction

1. Sign in as a user who already has an organisation.
2. `/dashboard/profile` → set one or more preferred funder types, and years operating. Save.
3. Go to `/onboarding/wizard` **without** `?new=1` — e.g. the CTA on `/onboarding/welcome`.
4. Advance through to the end and complete.
5. Re-check the profile. Both fields are empty.

---

## How users reach the update branch

`?new=1` is the safe path — line 670, `const org = isNewOrg ? null : await getOrganisationByOwner(user.id)` — which forces the `createOrganisation` branch and touches nothing existing. Only one link sets it:

- `dashboard/profile/page.tsx:629` → `/onboarding/wizard?new=1` ✅ correct, this is "add another organisation"

Every other entry point lands on the update branch:

- `onboarding/welcome/page.tsx:79` → `/onboarding/wizard`
- `dashboard/page.tsx:495` → `/onboarding/wizard`
- `dashboard/page.tsx:544` → `/onboarding/wizard`
- `onboarding/start/page.tsx:5` → redirects to `/onboarding/wizard`

The dashboard links are the realistic route in: someone who skipped or part-finished onboarding is prompted back into it from the dashboard, and by then may well have filled in the profile editor.

---

## Suggested fix

**Preferred: delete the three lines from the payload.** The wizard collects no input for any of them, so it has no business asserting a value. On the create branch the columns take their database defaults; on the update branch existing values are left alone. Smallest change, and it removes the class of bug rather than one instance — any field the wizard doesn't ask about shouldn't appear in its payload at all.

Worth a quick check for the same shape elsewhere in the payload while you're in there: a literal written for something the flow never asked.

**Alternative: add the three to the prefill** at 671–699 so they round-trip. Works, but keeps the wizard authoritative over fields it doesn't own, so the next field added to the profile editor can reintroduce this.

**Verify after:** set both user-facing fields, complete the wizard on an existing org, confirm both survive. Worth a regression test — the update branch overwriting a field the wizard never asked about is exactly the kind of thing that reappears.

---

## Unrelated, found alongside

`onboarding/wizard/page.tsx:577` — the card shell is `flex-1 flex items-start justify-center`. Top-aligned, which made sense when `entry` was a full-page hero and the card only appeared on the longer steps. Now that `entry` is a card, the shortest step in the flow floats high with a large void beneath it. `welcome/page.tsx:61` already centres (`alignItems: 'center'`), so the two pages disagree at exactly the seam the user crosses.

Don't just swap `items-start` for `items-center` — centring a flex child taller than the viewport clips the top and makes it unscrollable, and `sectors` at 19 chips is tall. Drop `items-start` and give the inner `max-w-[720px]` block `my-auto`: auto margins centre when there's room and collapse when there isn't.

`welcome/page.tsx` also still carries the comment `/* Hero — matches wizard step 'entry' positioning */` above a hand-tuned `paddingTop: 146`. Both are stale now that entry is a card — the comment is false and the number is arbitrary, so someone will preserve it believing it's load-bearing.
