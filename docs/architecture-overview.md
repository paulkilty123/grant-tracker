# Grant Tracker — Architecture One-Pager

**What it is:** A Next.js + Supabase web app that maintains a curated catalogue of UK funding opportunities, scores how well each matches an organisation's profile, and gives users a CRM to track applications. Also exposes an MCP server so AI assistants can query the catalogue. TypeScript monolith, deployed on Vercel. Built solo with Claude Code.

## Stack
- **App:** Next.js 14 (App Router) — React UI + server route handlers, one TypeScript codebase. Tailwind CSS.
- **DB + auth:** Supabase — managed Postgres 17, GoTrue auth, row-level security (RLS).
- **Hosting:** Vercel, auto-deploy from GitHub `main`.
- **AI:** Anthropic Claude API. **Email:** Resend. **Rate-limiting:** Upstash Redis (MCP).

> Architecture shape: **thin backend.** The browser mostly talks straight to Supabase; **RLS in Postgres** is the security boundary (each user sees only their org's rows). AI calls, admin jobs, and crons go through Next.js API routes with a server-only service-role key.

## Core data model
- `scraped_grants` (~600 opportunities) + `grants_with_funder` (view, main read surface)
- `organisations` (one per user — the matching input) · `pipeline_items` (the CRM/kanban)
- `grant_interactions`, `events`, `mcp_query_log`, builder/projects tables
- All user data isolated by RLS on `org_id → organisations.owner_id = auth.uid()`

## How it works — four engines
1. **Ingest** — scrapers pull from funders' sites (`crawl.ts`), plus 360Giving import + manual add. New rows land **inactive** ("Needs Review") → human approves → published (`pipeline_state` lifecycle). Runs on cron.
2. **Classify & enrich** — Claude tags each grant (~19 sectors, funding type, eligibility) and writes a funder brief. *Most data quality lives here.*
3. **Match** — `matching.ts` scores grant vs. org profile across ~6 dimensions (location, themes, beneficiaries, size, funder type, eligibility) → 0–100. Runs **client-side** in the browser.
4. **Serve** — dashboard, Find Funding search, pipeline, deadlines.

## Where Claude is used
- **Onboarding auto-fill** (read a website URL → pre-fill the profile)
- **Catalogue enrichment + classification**
- **Search ranking** — cheap DB catalogue lookup first (instant, ~free), then an AI ranking pass (Haiku, ~1¢/search)
- **Application builder** (paid tier). Cheap model (Haiku) for ranking; stronger models for enrichment.

## MCP server (distinctive)
Read-only Model Context Protocol server — AI assistants connect and query the live catalogue. Full **OAuth 2.0 + Dynamic Client Registration + PKCE**, 5 read-only tools, Upstash rate limiting. Submitted to Anthropic's connector directory.

## Auth / infra / ops
- Supabase Auth, email confirmation on, delivered via Resend (SPF/DKIM/DMARC live).
- Multi-tenant via RLS; admin gated by email allowlist; paid features gated by an entitlement check.
- Push to `main` → Vercel deploys (~1 min). Cron jobs: scrape (2×/week), classify/enrich (daily), deadline checks (daily), URL validation (weekly). *On Vercel Pro since 2026-08-04 (team plan; the personal account still reads Hobby). Sub-daily crons are permitted, but every entry in `vercel.json` is still the daily-or-weekly Hobby-era schedule — nothing has been re-cadenced.*

## Tiers
Free (discovery, matching, bookmarks) · paid **Apply** (pipeline, deadlines, builder) · future Companion. Entitlement boundary currently being built (pipeline/deadlines are RLS-enforced today).

## Where the hard parts are
- **Data quality** is the core challenge: reliable scraping, deadline parsing, accurate AI tagging. Match quality is bound by tag quality more than the algorithm.
- **Thin-backend/RLS** model is elegant but puts security correctness in RLS policies, and runs some logic (matching) client-side — worth discussing trade-offs.
- **Solo + Claude Code-built** — consistent and well-documented, single architectural hand; natural next step is test coverage + hardening as it scales.
