# MCP pass — handover, 10 Aug 2026

Written to close a long session. The next two pieces (landing-page deploy, then
phase 7) each start fresh from here.

Canonical build brief: `docs/shoots-mcp-build-brief.md`. This note carries only
what the repo does not.

---

## Where the build is

`main` is at `083c462`. Phases 1 to 6 are merged, deployed and verified live.

| Phase | State |
|---|---|
| 1 brand/origin env config | merged, live |
| 2 (amended) protocol-era observation + RFC 9207 `iss` | merged, live |
| 3 issuer binding + retired-origin 308s | merged, live, inert until flip |
| 4a three-way tier routing + `get_pipeline` | merged, live |
| 4b tier-aware limits + 75/month free quota | merged, live |
| 4c free result shaping + provider id cap | merged, live |
| 5 upgrade copy + one-note rule | merged, live |
| 6 in-flow account creation | merged, live |
| 7 smoke test | not started, gated on the flip |

**Phase 2 proper (the 2026-07-28 spec migration) is deferred, not cancelled.**
Trigger is data, not a date:

```sql
select payload->>'protocol_era', count(*)
from events where event_type = 'mcp_request_received' group by 1;
```

Migrate when `modern` appears, or when `@modelcontextprotocol/server` v2 has
soaked. It is a package migration onto a three-package v2 line, not a version
bump; `mcp-handler` 2.x moved with it.

---

## Open: three phase-6 verification gaps

Everything else in phase 6 is verified live — the signup form renders logged
out with the exact legal copy and an unticked box, the consent screen echoes
the address in its own panel, the Approve button is deep-filled, and all three
`marketing_list` directions were tested against production and the probe rows
removed.

These three were **not** closed:

1. A real signup POST through the form, using a `.invalid` fixture address.
2. Approve clicked to complete an actual OAuth grant.
3. The per-IP limiter driven to refusal (six attempts, sixth bounces).

**Why they are still open.** All three need a logged-out browser context.
Chrome's extension does not attach to incognito, so a private window cannot be
driven from a session. Invoking the server actions over HTTP instead does not
work either: the actions are client-wrapped, so no action ID appears in the
page HTML, and it is not in the shared JS chunks (checked, 413KB, none found).
The remaining route is signing the live session out in the controlled window —
Paul agreed to that, but the app has **no logout route**; sign-out is a
client-side `supabase.auth.signOut()` inside the dashboard UI, and the control
was not found in the account page's accessibility tree before context ran out.

**To close them next session:** sign out through the dashboard UI (Sidebar or
TopBar carry the handler), then walk the flow. Use a fixture address in the
`mcp-tier-fixture-*@mcp-fixtures.invalid` namespace and tear down with
`npx tsx scripts/mcp-test-fixtures.ts --destroy` plus a delete from
`user_marketing_consent`. Note the limiter is 5/hour per IP and **fails
closed**, so burning it blocks signup from that IP for an hour.

---

## Next task: landing-page deploy

**Scope as given:** v67 becomes the app's front page, gated on the cutover env
so granttracker.co.uk is unchanged until the flip.

Not started, and not yet investigated — the location and form of "v67" was
never established in this session. First step is finding it before assuming
anything about it.

The gating pattern already exists and should be reused rather than reinvented:
`src/lib/mcp-brand.ts` reads origins and brand from env with production
defaults, so an unset environment is a no-op. `MCP_RETIRED_HOSTS` in
`src/lib/mcp-retired-origin.ts` is the closest analogue — empty by default,
inert until the flip sets it.

---

## Flip checklist

The cutover is **August, pre-submission**, once the landing page lands. Not
September; an earlier note in the brief said September and was corrected.

At flip, in one change:

- `MCP_PUBLIC_ORIGIN=https://www.shootsfunding.co.uk` (www-canonical, apex 308s)
- `MCP_APP_ORIGIN=https://shootsfunding.co.uk`
- `MCP_BRAND_NAME=Shoots`, `MCP_SERVER_SLUG` as decided
- `MCP_RETIRED_HOSTS=www.granttracker.co.uk,granttracker.co.uk`
- `MCP_CONTACT_EMAIL` **only once mail on the new domain works** — it is a
  separate var precisely so it can lag
- whatever env var gates the landing page

Consequences to expect, all intended:

- Every OAuth registration and token dies at the flip (issuer binding). Paul is
  the only connected user; he reconnects. No migration shim by design.
- granttracker's MCP surfaces begin 308ing to shootsfunding.
- **Do not point a reviewer or test client at the shootsfunding endpoint before
  the flip.** It answers today but declares granttracker's identity, which is
  an RFC 9728 resource mismatch.

**On the September/Stripe list, not before:** set `MCP_PRICING_URL` when a
pricing page exists (there is no `/pricing` route today, which is why upgrade
copy points at the app root); restore the "7-day free trial" mention once
Stripe can deliver it; tighten `oauth_clients.issuer` / `oauth_tokens.issuer`
to NOT NULL once no nulls remain.

---

## Things that cost time this session, so they do not again

- **A readiness probe must be false before the thing lands.** Got this wrong
  three times: waiting on HTTP 200 (Vercel's placeholder returns 200), on a
  fingerprint that shipped two phases earlier, and on a 404 that middleware
  turns into a 307 before routing. Each passed instantly and sent the next step
  at the wrong build. Pick a string introduced by the deploy under test and
  confirm it currently fails.
- **Vercel "sensitive" env vars cannot be pulled.** `UPSTASH_REDIS_REST_URL`
  and `_TOKEN` return empty on CLI 54 and `[SENSITIVE]` on 58. Get them from the
  Upstash console. The Protection Bypass secret is in project settings, not env,
  so `vercel env ls` never shows it.
- **`vercel deploy` from the CLI does not register.** Two attempts returned a
  URL, said Building, then never appeared in `vercel ls`; both showed
  `status UNKNOWN` and served Vercel's instant-preview placeholder. Deploys
  triggered by git push work fine. Cause unknown; crons and `.vercelignore` were
  ruled out. **Phase 7's reviewer journey needs working previews**, so this
  wants solving first.
- **Use a git worktree.** The branch moved underneath this session three times
  before `~/dev/gt-mcp-wt` fixed it.
- **Two sessions share `main`.** Branches only, pull before merging, Paul
  sequences the slots, flag before any merge.

---

## Fixtures

`scripts/mcp-test-fixtures.ts` creates disposable free and apply tier users
(`.invalid` addresses, gitignored token file, `--destroy` teardown).
`scripts/mcp-verify-tiers.ts` asserts `tools/list` per tier over HTTP.
`scripts/mcp-verify-quota.ts` drives the search quota to its boundary and takes
a Vercel bypass secret from `VERCEL_BYPASS`.

There is no companion-tier fixture: the only companion org is Paul's, so
Adviser-tier end-to-end belongs to phase 7 against his real connector.
