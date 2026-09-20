# Stripe sandbox rehearsal

First pass run 30 August 2026, eight days before the date Paul set. Written so
the 8th is a re-run rather than a first attempt, and so the gaps are visible
rather than discovered on the day.

## What was proven, end to end, against the real sandbox

A subscription created in Stripe with `metadata.owner_id`, forwarded to the
local webhook by `stripe listen`, arriving as a row and as access:

| Step | Observed |
|---|---|
| `customer.subscription.created`, 14-day trial, no card | webhook 200 |
| row written | plan `apply`, status `trialing` |
| renewal date | 2026-09-13, read from the ITEM (see below) |
| **entitlement** | `organisations.apply_access` flipped **false → true** |
| `granted_access_until` | stayed null, so access came from the subscription alone |
| `cancel_at_period_end = true` | status stays `trialing`, **access continues** |
| immediate cancel | status `canceled`, **access false again** |

The two directions both matter. Access arriving is the obvious one; access
LEAVING is the one that costs money if it fails silently.

`cancel_at_period_end` was checked on its own run. The first attempt set it and
then cancelled immediately, so the final state overwrote the intermediate one
and proved nothing about it — the case where getting it wrong cuts a paying
customer off weeks early.

## The bug this caught before it shipped

`sub.current_period_end` came back **None** from the live API, and
`items.data[0].current_period_end` carried the value. Stripe 22.5.0 targets API
v2349, which moved the field onto the subscription item. Reading only the
subscription — what every tutorial still shows — stores null for every customer
and nothing fails: the webhook succeeds, entitlement lands, and the billing
screen says "renews —" for ever.

## What is NOT yet proven, and is the actual job on the 8th

**The checkout route has never been exercised.** Both rehearsal subscriptions
were created directly through the Stripe API, not through
`POST /api/billing/checkout`, because that route needs a signed-in browser
session. So these remain untested against anything real:

- checkout creating a session at all, and the returned URL working
- **`subscription_data.metadata.owner_id` actually being set by the route** —
  the webhook refuses without it, so if the route drops it, checkout succeeds,
  the customer is charged, and nobody is granted anything
- paying with a test card (`4242 4242 4242 4242`) rather than a trial
- the founding price, and Team being refused with a 409
- what the customer sees on return at `/dashboard?checkout=done`

## Re-running it

```bash
# 1. signing secret (stable per account, so this can go in .env.local once)
stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret

# 2. forward, in its own shell
stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:3000/api/stripe/webhook \
  --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted

# 3. dev server, started AFTER the secret is in .env.local
npx next dev -p 3000

# 4. sign in, buy something, watch the row and apply_access
```

## Cleaning up afterwards

The rehearsal writes to the PRODUCTION database — there is one Supabase project
— so it must be reverted. Use a fixture account, never a real one. Verified
after this run: `subscriptions` back to 0 rows, the fixture back to
`apply_access false` and `granted_access_until null`, and the entitlement counts
unchanged at 32 total, 11 permanent, 21 cohort.

The subject used was `mcp-tier-fixture-free@mcp-fixtures.invalid`. Leaving it
entitled would quietly break the MCP tier fixtures, which assert it resolves to
the free tier.
