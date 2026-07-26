// Public MCP landing page at /mcp. Lightweight intro + path to key issuance.
// Production design polish to come; v1 ships functional.

import Link from 'next/link'
import { ArrowRight, Plug, BookOpen, FileText } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'

export default function MCPLandingPage() {
  return (
    <div style={{ background: 'var(--surface-page)', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: 'var(--text-body)' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid color-mix(in srgb, var(--deep) 8%, transparent)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', color: 'var(--text-body)' }}>{brand.name}</span>
          </Link>
          <Link href="/mcp/terms" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
            Terms
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 32px 48px' }}>
        <span style={{ display: 'inline-block', fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 11, color: 'var(--state-success)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--state-success-pale)', padding: '4px 10px', borderRadius: 999, marginBottom: 18 }}>
          MCP server
        </span>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 18 }}>
          UK funding discovery, inside your AI agent.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-muted)', marginBottom: 28 }}>
          {brand.name}&apos;s catalogue of UK grants, programmes, social investment, and in-kind support, made available to Claude, ChatGPT, Gemini, and any other MCP-compatible agent.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
          <Link
            href="#connect"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, background: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */, color: 'var(--deep)', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none', boxShadow: '0 2px 8px rgba(132,204,22,0.25)' }}
          >
            How to connect
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/mcp/terms"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 10, border: '1px solid var(--text-body)', background: 'transparent', color: 'var(--text-body)', fontFamily: 'var(--font-space-grotesk)', textDecoration: 'none' }}
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
        <section id="connect" style={{ borderTop: '0.5px solid color-mix(in srgb, var(--deep) 8%, transparent)', paddingTop: 32, marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 14 }}>Connect</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)', marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-body)' }}>In Claude, ChatGPT, Gemini, or any MCP-compatible client:</strong> add a custom connector pointing at the remote MCP server URL below, then sign in to {brand.name} and authorise access. Authentication uses OAuth 2.0 with Dynamic Client Registration and PKCE — you don&apos;t paste a client ID or secret; the client registers itself.
          </p>
          <pre style={{ background: 'var(--state-success-pale)', border: '0.5px solid color-mix(in srgb, var(--deep) 12%, transparent)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--deep)', overflowX: 'auto', margin: '0 0 12px' }}>{`${brand.siteUrl}/api/mcp/v1/mcp`}</pre>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.6 }}>Transport: Streamable HTTP (JSON-RPC). Authentication is OAuth 2.0. The server is read-only.</p>
        </section>

        {/* ── Tools ─────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 14 }}>Tools</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {[
              ['search_funding_and_support', `Search the catalogue by sector, region, beneficiary group, organisation structure, amount, deadline and funding type. Returns ranked opportunities, each with the funder’s own application link plus a ${brand.name} link for full details and eligibility.`],
              ['get_opportunity_detail', 'Full detail for a single opportunity: eligibility, amounts, deadline and application process.'],
              ['get_provider_intelligence', 'A funder’s profile — priorities, what they fund, who can apply, and their currently open opportunities.'],
              ['get_taxonomy', `${brand.name}’s controlled vocabularies (sectors, regions, structures, funding types, beneficiary groups) for translating a free-text need into precise filters.`],
              ['health_check', 'Server status, version, and catalogue freshness.'],
            ].map(([name, desc]) => (
              <li key={name} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                <code style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 13, color: 'var(--deep)', background: 'var(--state-success-pale)', padding: '2px 7px', borderRadius: 6 }}>{name}</code>
                <span style={{ display: 'block', marginTop: 4 }}>{desc}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Troubleshooting ───────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 14 }}>Troubleshooting</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {[
              ['Can’t connect, or the sign-in loops', `Allow pop-ups and complete the ${brand.name} sign-in. The connector handles credentials via OAuth, so no manual key is needed.`],
              ['Authorization required (401)', 'Re-authenticate the connector — your token may have expired or been revoked.'],
              ['Rate limited (429)', 'Limits are per credential. Wait for the reset time shown in each response’s rate_limit_status field.'],
              ['No results', 'The catalogue is UK-only and curated (~600 live opportunities). Broaden your filters, or call get_taxonomy for valid values. Zero-result responses include a diagnostic with suggested looser filters.'],
              ['A link looks unverified, or a result is missing', 'Opportunity URLs are re-validated weekly; rows that fail are hidden by default. Set exclude_unverified_urls to false to include them.'],
              ['Still stuck', `Email ${brand.email.hello} — we aim to reply within 2 business days.`],
            ].map(([q, a]) => (
              <li key={q} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-body)' }}>{q}</strong>
                <span style={{ display: 'block', marginTop: 2 }}>{a}</span>
              </li>
            ))}
          </ul>
        </section>

        <div style={{ borderTop: '0.5px solid color-mix(in srgb, var(--deep) 8%, transparent)', paddingTop: 24, fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
          The MCP is read-only. Saving opportunities, deadline alerts, pipeline tracking, and personalised matching against your organisation&apos;s profile all happen in the <Link href="/" style={{ color: 'var(--state-success)', fontWeight: 600, textDecoration: 'none' }}>{brand.name} web app</Link>.
        </div>
      </main>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid color-mix(in srgb, var(--deep) 10%, transparent)', borderRadius: 12, padding: 18, boxShadow: '0 2px 16px color-mix(in srgb, var(--text-body) 4%, transparent)' }}>
      <div style={{ color: 'var(--state-success)', marginBottom: 8 }}>{icon}</div>
      <p style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 14, color: 'var(--text-body)', marginBottom: 4 }}>
        {title}
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  )
}
