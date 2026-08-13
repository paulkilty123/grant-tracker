// Public MCP landing page at /mcp. Lightweight intro + path to key issuance.
// Production design polish to come; v1 ships functional.

import Link from 'next/link'
import { ArrowRight, Plug, BookOpen, FileText } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'
// This page is the resource_documentation / service_documentation URL advertised
// in both OAuth discovery documents, so its brand and endpoint have to track the
// same env the protocol surface reads — not a second hardcoded copy.
import { MCP_BRAND_NAME, MCP_RESOURCE_URL, MCP_CONTACT_EMAIL } from '@/lib/mcp-brand'

export default function MCPLandingPage() {
  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: '#2C2C2A' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', color: '#2C2C2A' }}>{MCP_BRAND_NAME}</span>
          </Link>
          <Link href="/mcp/terms" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
            Terms
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px 48px' }}>
        <span style={{ display: 'inline-block', fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 11, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#F1F7E4', padding: '4px 10px', borderRadius: 999, marginBottom: 18 }}>
          MCP server
        </span>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 18 }}>
          UK funding discovery, inside your AI agent.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: '#5F5E5A', marginBottom: 28 }}>
          {MCP_BRAND_NAME}&apos;s catalogue of UK grants, programmes, social investment, and in-kind support, made available to Claude, ChatGPT, Gemini, and any other MCP-compatible agent.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
          <Link
            href="#connect"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none', boxShadow: '0 2px 8px rgba(132,204,22,0.25)' }}
          >
            How to connect
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/mcp/terms"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, border: '1px solid #2C2C2A', background: 'transparent', color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none' }}
          >
            Read the terms
          </Link>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 40 }}>
          <Feature icon={<Plug size={18} />} title="One-click connect" body="Add as a custom connector in your AI client and sign in with OAuth 2.0 — nothing to paste or manage." />
          <Feature icon={<BookOpen size={18} />} title="Five tools" body="search_funding_and_support, get_opportunity_detail, get_provider_intelligence, get_taxonomy, health_check." />
          <Feature icon={<FileText size={18} />} title="UK-specialised" body="Eligibility-aware scoring across the four funding types — grants, programmes, investment, in-kind." />
        </div>

        {/* ── Connect ───────────────────────────────────────────────────── */}
        <section id="connect" style={{ borderTop: '0.5px solid rgba(23,52,4,0.08)', paddingTop: 32, marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 14 }}>Connect</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#5F5E5A', marginBottom: 10 }}>
            <strong style={{ color: '#2C2C2A' }}>In Claude, ChatGPT, Gemini, or any MCP-compatible client:</strong> add a custom connector pointing at the remote MCP server URL below, then sign in to {MCP_BRAND_NAME} and authorise access. Authentication uses OAuth 2.0 with Dynamic Client Registration and PKCE — you don&apos;t paste a client ID or secret; the client registers itself.
          </p>
          <pre style={{ background: '#F1F7E4', border: '0.5px solid rgba(23,52,4,0.12)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#173404', overflowX: 'auto', margin: '0 0 12px' }}>{MCP_RESOURCE_URL}</pre>
          {/* Was "The server is read-only", which stopped being true when the
              Apply and Adviser tiers gained pipeline and goal writes over this
              same connection. Wording kept identical to the consent screen and
              the privacy policy: three surfaces describing one grant in three
              different ways is how the original inaccuracy survived. */}
          <p style={{ fontSize: 13, color: '#8A8986', lineHeight: 1.6 }}>Transport: Streamable HTTP (JSON-RPC). Authentication is OAuth 2.0. On the free plan the connection reads only. On the Apply and Adviser plans it can also write to your own pipeline and goals, and never to another organisation&apos;s data.</p>
        </section>

        {/* ── Disconnecting ─────────────────────────────────────────────────
            The consent screen links here for revocation, so this section is
            load-bearing: it is the answer to "how do I revoke this?". Every
            claim below was verified against production in the phase 7 smoke
            test (revoked credential refused on the next call, refresh token
            dead at the same moment, reconnect clean). Do not soften it into a
            promise the server does not keep. */}
        <section id="disconnecting" style={{ borderTop: '0.5px solid rgba(23,52,4,0.08)', paddingTop: 32, marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 14 }}>Disconnecting</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#5F5E5A', marginBottom: 10 }}>
            Remove or disconnect the connector in your AI client to revoke its access. There is
            nothing to undo on our side.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#5F5E5A' }}>
            Revocation is enforced immediately. The next request made with that credential is
            refused, and its refresh token stops working at the same moment, so the client cannot
            quietly renew itself. Access tokens are short-lived regardless. Reconnecting starts a
            fresh authorisation and issues new credentials.
          </p>
        </section>

        {/* ── Tools ─────────────────────────────────────────────────────────
            The connector exposes 15 tools, not the 5 this page used to list.
            tools/list is tier-gated, so what a given connection sees depends on
            the plan behind it: 5 free, 8 on Apply, 15 on Adviser. Grouped that
            way here so the page matches both the directory submission and what
            a reviewer actually gets. Keep in step with TOOL_GROUPS ordering in
            the route if tools are added. */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 6 }}>Tools</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5F5E5A', marginBottom: 18 }}>
            Fifteen tools. Which ones a connection sees depends on the plan behind it: five on the free plan, eight on Apply, all fifteen on Adviser. The server advertises only the tools your plan includes, so an agent is never offered something it cannot call.
          </p>
          {[
            {
              plan: 'Every plan, including free',
              note: 'Read-only. Complete eligibility criteria and exclusions on every result, on every plan.',
              tools: [
                ['search_funding_and_support', `Search the catalogue by sector, region, beneficiary group, organisation structure, amount, deadline and funding type. Returns ranked opportunities, each with the funder’s own application link plus a ${MCP_BRAND_NAME} link for full details and eligibility.`],
                ['get_opportunity_detail', 'Full detail for a single opportunity: eligibility, amounts, deadline and application process.'],
                ['get_provider_intelligence', 'A funder’s profile — priorities, what they fund, who can apply, and their currently open opportunities.'],
                ['get_taxonomy', `${MCP_BRAND_NAME}’s controlled vocabularies (sectors, regions, structures, funding types, beneficiary groups) for translating a free-text need into precise filters.`],
                ['health_check', 'Server status, version, and catalogue freshness.'],
              ],
            },
            {
              plan: 'Apply plan and above',
              note: 'Adds your own pipeline. These write, and only ever to your organisation’s own data.',
              tools: [
                ['get_pipeline', 'Your pipeline items with their ids, stages, amounts, deadlines and outcomes.'],
                ['add_to_pipeline', 'Record an opportunity in your pipeline so it can be tracked and counted against your goal.'],
                ['update_pipeline_item', 'Update an item’s stage, amount, deadline or outcome. Moving to won or declined records the result.'],
              ],
            },
            {
              plan: 'Adviser plan',
              note: 'Adds funding-goal planning. The arithmetic is deterministic, not generated.',
              tools: [
                ['get_briefing', 'Where you stand and what to do next: plan state, catalogue changes and candidate opportunities in one call.'],
                ['get_plan_state', 'The plan arithmetic against your goal — secured, in pipeline weighted and unweighted, gap, run rate, concentration.'],
                ['get_funding_goal', 'Your active funding goal: target, secured to date, period and funding-mix targets.'],
                ['set_funding_goal', 'Set the funding goal once you have stated a target and a deadline. Initial setup happens in the app.'],
                ['update_goal_purposes', 'Add, edit or retire purpose lines on the active goal without replacing it.'],
                ['recommend_mix', 'Derive the recommended funding mix from your purpose split using a published rulebook.'],
                ['assess_opportunity_against_plan', 'One opportunity’s eligibility verdict and match breakdown, read against your plan.'],
              ],
            },
          ].map(group => (
            <div key={group.plan} style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 15, color: '#173404', marginBottom: 2 }}>{group.plan}</div>
              <p style={{ fontSize: 13, color: '#8A8986', lineHeight: 1.6, margin: '0 0 12px' }}>{group.note}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
                {group.tools.map(([name, desc]) => (
                  <li key={name} style={{ fontSize: 14, lineHeight: 1.6, color: '#5F5E5A' }}>
                    <code style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 13, color: '#173404', background: '#F1F7E4', padding: '2px 7px', borderRadius: 6 }}>{name}</code>
                    <span style={{ display: 'block', marginTop: 4 }}>{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ── Example prompts ───────────────────────────────────────────────
            Required by the directory submission form. Each exercises a
            different tool group, and each names the plan it needs so a reviewer
            on the free plan is not left wondering why the third one does
            nothing. Written as a user would actually type them. */}
        <section style={{ borderTop: '0.5px solid rgba(23,52,4,0.08)', paddingTop: 32, marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 14 }}>Example prompts</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
            {[
              ['“What funding is available for a youth arts charity in Leeds?”', 'search_funding_and_support', 'Any plan'],
              ['“What does The Fore fund, and who is eligible to apply?”', 'get_provider_intelligence', 'Any plan'],
              ['“Is that one worth applying for? Add it to my pipeline and mark it as applying.”', 'assess_opportunity_against_plan, add_to_pipeline, update_pipeline_item', 'Apply plan and above'],
              ['“How far off my funding goal am I, and what should I go after next?”', 'get_briefing, get_plan_state', 'Adviser plan'],
            ].map(([prompt, tools, plan]) => (
              <li key={prompt} style={{ fontSize: 14, lineHeight: 1.6, color: '#5F5E5A' }}>
                <span style={{ display: 'block', color: '#2C2C2A' }}>{prompt}</span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: '#8A8986' }}>
                  <code style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, color: '#173404', background: '#F1F7E4', padding: '2px 6px', borderRadius: 6 }}>{tools}</code>
                  <span style={{ marginLeft: 8 }}>{plan}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Troubleshooting ───────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 14 }}>Troubleshooting</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {[
              ['Can’t connect, or the sign-in loops', `Allow pop-ups and complete the ${MCP_BRAND_NAME} sign-in. The connector handles credentials via OAuth, so no manual key is needed.`],
              ['Authorization required (401)', 'Re-authenticate the connector — your token may have expired or been revoked.'],
              ['Rate limited (429)', 'Limits are per credential. Wait for the reset time shown in each response’s rate_limit_status field.'],
              ['No results', 'The catalogue is UK-only and curated (~600 live opportunities). Broaden your filters, or call get_taxonomy for valid values. Zero-result responses include a diagnostic with suggested looser filters.'],
              ['A link looks unverified, or a result is missing', 'Opportunity URLs are re-validated weekly; rows that fail are hidden by default. Set exclude_unverified_urls to false to include them.'],
              // MCP_CONTACT_EMAIL is a separate var precisely so it can lag the
              // domain move until mail works on the new domain.
              ['Still stuck', `Email ${MCP_CONTACT_EMAIL} — we aim to reply within 2 business days.`],
            ].map(([q, a]) => (
              <li key={q} style={{ fontSize: 14, lineHeight: 1.6, color: '#5F5E5A' }}>
                <strong style={{ color: '#2C2C2A' }}>{q}</strong>
                <span style={{ display: 'block', marginTop: 2 }}>{a}</span>
              </li>
            ))}
          </ul>
        </section>

        <div style={{ borderTop: '0.5px solid rgba(23,52,4,0.08)', paddingTop: 24, fontSize: 13, color: '#8A8986', lineHeight: 1.6 }}>
          The MCP never changes your organisation profile, writes or stores application content, deletes anything, or reaches another organisation&apos;s data. Deadline alerts, the application builder, and the full matching view live in the <Link href="/" style={{ color: '#3B6D11', fontWeight: 600, textDecoration: 'none' }}>{MCP_BRAND_NAME} web app</Link>.
        </div>
      </main>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid rgba(23,52,4,0.10)', borderRadius: 12, padding: 18, boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
      <div style={{ color: '#3B6D11', marginBottom: 8 }}>{icon}</div>
      <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 14, color: '#2C2C2A', marginBottom: 4 }}>
        {title}
      </p>
      <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  )
}
