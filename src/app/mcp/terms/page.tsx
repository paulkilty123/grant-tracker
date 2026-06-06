// Public ToS page at /mcp/terms. Reads docs/legal/mcp-tos.md at runtime and
// renders the body with a minimal inline markdown converter. Stubbed renderer
// — fine for v1 since the ToS is structured and short; swap for
// react-markdown if/when richer rendering matters.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { readMCPToS } from '@/lib/mcp-auth'
import LogoMark from '@/components/icons/LogoMark'

export const dynamic = 'force-dynamic'

export default async function MCPTermsPage() {
  const tos = await readMCPToS()
  const blocks = renderMarkdown(tos.body)

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)', color: '#2C2C2A' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.025em', color: '#2C2C2A' }}>GrantTracker</span>
          </Link>
          <Link href="/mcp" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, color: '#5F5E5A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} />
            Back to MCP
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ fontSize: 12, color: '#8A8986', marginBottom: 6, fontFamily: 'var(--font-space-grotesk)' }}>
          Version <code style={{ background: '#F0EDE2', padding: '2px 6px', borderRadius: 4 }}>{tos.version}</code>
          {tos.last_updated && <> · Updated {tos.last_updated}</>}
        </div>
        {tos.status?.startsWith('DRAFT') && (
          <div style={{ background: '#FAECE7', color: '#993C1D', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 24 }}>
            <strong style={{ fontFamily: 'var(--font-space-grotesk)' }}>Draft:</strong> {tos.status}
          </div>
        )}
        <article style={{ fontSize: 15, lineHeight: 1.7, color: '#2C2C2A' }}>
          {blocks}
        </article>
      </main>
    </div>
  )
}

function renderMarkdown(body: string): React.ReactNode[] {
  const lines = body.split('\n')
  const out: React.ReactNode[] = []
  let para: string[] = []
  let listItems: string[] = []
  let blockquoteLines: string[] = []
  let inBlockquote = false
  let inList = false
  let key = 0

  function flushParagraph() {
    if (para.length === 0) return
    out.push(<p key={key++} style={{ marginBottom: 16 }}>{para.join(' ')}</p>)
    para = []
  }
  function flushList() {
    if (listItems.length === 0) return
    out.push(
      <ul key={key++} style={{ marginBottom: 16, paddingLeft: 24, listStyle: 'disc' }}>
        {listItems.map((item, i) => <li key={i} style={{ marginBottom: 4 }}>{item}</li>)}
      </ul>
    )
    listItems = []
    inList = false
  }
  function flushBlockquote() {
    if (blockquoteLines.length === 0) return
    out.push(
      <blockquote key={key++} style={{ marginBottom: 16, borderLeft: '3px solid #C0DD97', paddingLeft: 14, color: '#5F5E5A', fontStyle: 'italic' }}>
        {blockquoteLines.join(' ')}
      </blockquote>
    )
    blockquoteLines = []
    inBlockquote = false
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line === '') {
      flushParagraph()
      flushList()
      flushBlockquote()
      continue
    }
    if (line.startsWith('# ')) {
      flushParagraph(); flushList(); flushBlockquote()
      out.push(<h1 key={key++} style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 32, letterSpacing: '-0.02em', marginBottom: 18, marginTop: 12 }}>{line.slice(2)}</h1>)
      continue
    }
    if (line.startsWith('## ')) {
      flushParagraph(); flushList(); flushBlockquote()
      out.push(<h2 key={key++} style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, fontSize: 22, letterSpacing: '-0.01em', marginBottom: 12, marginTop: 28 }}>{line.slice(3)}</h2>)
      continue
    }
    if (line.startsWith('### ')) {
      flushParagraph(); flushList(); flushBlockquote()
      out.push(<h3 key={key++} style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 16, marginBottom: 8, marginTop: 20 }}>{line.slice(4)}</h3>)
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph(); flushBlockquote()
      inList = true
      listItems.push(line.slice(2))
      continue
    }
    if (line.startsWith('> ')) {
      flushParagraph(); flushList()
      inBlockquote = true
      blockquoteLines.push(line.slice(2))
      continue
    }
    if (line === '---') {
      flushParagraph(); flushList(); flushBlockquote()
      out.push(<hr key={key++} style={{ border: 0, borderTop: '0.5px solid rgba(23,52,4,0.12)', margin: '32px 0' }} />)
      continue
    }
    if (inList || inBlockquote) {
      flushList(); flushBlockquote()
    }
    para.push(line)
  }
  flushParagraph(); flushList(); flushBlockquote()
  return out
}
