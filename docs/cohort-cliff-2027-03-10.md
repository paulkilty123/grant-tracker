# The cohort cliff: 10 March 2027

Two commitments to the founding cohort that nothing in the system currently
keeps. Written down because both were found in conversation and would otherwise
live only there. Neither is due before launch; both are easy to lose.

**Who.** Twenty-one organisations with `granted_access_until = 2027-03-10`.
Eleven more sit at `'infinity'` and are internal (Paul's own, the reviewer demo,
the MCP fixtures) — they are not affected by any of this.

---

## 1. Access ends silently, for the people most owed a warning

On 10 March 2027 the sweeper (`/api/cron/expire-access-grants`, daily 05:30)
does exactly what it should: it revokes twenty-one grants. Nobody is told.

Paul, 31 August 2026:

> That's a second silent ending, and it's aimed at better people than the first.
> These are the people who gave feedback for six months and told their networks
> about it.

It is the same failure the trial emails exist to prevent, and it lands on a
warmer audience. The first they would know is the pipeline going quiet.

**What is needed:** a warning some weeks before `granted_access_until`, and a
note on the day. Same shape as the trial-ending emails, and worth building in
the same pass while that code is warm — the two differ only in which date they
read and what they offer.

**Do not** drive it off a hardcoded 2027-03-10. Read `granted_access_until`, so
a member whose date Paul moves individually (cut short for disengagement,
extended for good feedback — his stated intent) gets the warning that matches
their actual date rather than the cohort's.

---

## 2. The founding rate they were promised is unreachable

The cohort convert in **March**. The public founding window shuts at the **end
of October**. They were promised the founding rate permanently.

The pricing rule handles this correctly and has a passing test for exactly the
March case: `foundingPriceAvailable('granted', …)` ignores the date entirely,
because the promise predates the closing. `'self_serve'` is the only channel the
date bounds.

**The problem is not the check. It is that nothing can reach it.**

`grep "'granted'"` across the app returns nothing outside its own module and
tests. The only checkout route hardcodes `channel: 'self_serve'`, correctly,
because it is the public pricing page. So in March a cohort member has exactly
one road: pricing page → checkout → self-serve → founding refused, window shut →
they are quoted the public price.

Nothing errors. The promise is simply not offered.

**What is needed:** a granted-channel route into checkout — a conversion link,
or an admin action — gated on entitlement rather than on a date. The price
decision is already right; only the road is missing.

**The trap for whoever builds it:** wiring that route to `self_serve` by default
would look correct in October, pass every test, and fail in March. The channel
is the whole point of the distinction.

---

## Why this file exists

Both items were found by asking what happens after launch rather than at it.
Neither shows up in any test, because nothing is wrong today: the sweeper is
right to revoke, the pricing rule is right to refuse a closed offer, and the
checkout route is right to be self-serve. Each piece is correct and the
combination breaks a promise, eighteen months out, silently.
