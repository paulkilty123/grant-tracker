import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Check, X as XIcon, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MCP_RESOURCE_URL, MCP_BRAND_NAME } from '@/lib/mcp-brand'
import { tierForOrgFlags } from '@/lib/mcp-entitlement'
import { getConnectionState } from './connection-state'
import { CopyLink } from './CopyLink'

export const dynamic = 'force-dynamic'

const UI   = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

const DEEP  = '#1D3C3E'
const CREAM = '#F6F1E7'
const MUTED = '#5F5E5A'
const PLACE = '#74736E'
const HAIR  = 'rgba(29,60,62,0.10)'
const GHOST = 'rgba(29,60,62,0.24)'
const WARM  = '#F1EDE3'
const GREEN = '#1B6B3D'          // 5.58 — the "checked" tick, and only that
const DANGER = '#993C1D'         // 6.03 — the "cannot" crosses, and only those

/**
 * The three flow dots and the four step circles use the homepage accents in the
 * homepage order. The circles are 44px with a 19px BOLD --deep numeral, and the
 * size is a contrast requirement rather than a preference: at 19px bold the
 * numeral is WCAG large text so the floor drops to 3:1 and --deep clears all
 * four (3.70 / 4.37 / 7.71 / 6.41). At any smaller size terracotta fails.
 */
const ACCENTS = ['#D67558', '#4EAAB4', '#EBCE78', '#9BCA9D'] as const

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 16, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '26px 34px 4px' }}>
      <h2 style={{ fontFamily: UI, fontSize: 22, fontWeight: 600, letterSpacing: '-0.022em', color: DEEP, margin: '0 0 6px' }}>{title}</h2>
      {children && <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.6, color: MUTED, margin: 0, maxWidth: '72ch' }}>{children}</p>}
    </div>
  )
}

function Foot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '0 34px 28px' }}>
      <p style={{ fontFamily: BODY, fontSize: 14, lineHeight: 1.65, color: MUTED, margin: 0, paddingTop: 20, borderTop: `1px solid ${HAIR}` }}>
        {children}
      </p>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 600, color: DEEP, background: WARM, borderRadius: 7, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/** A single worked exchange. Illustrative — see the caption under the grid. */
function Example({ kind, plan, ask, tick, say, resultTitle, resultMeta, stage }: {
  kind: string; plan: string; ask: string; tick: string
  say: string; resultTitle: string; resultMeta?: string; stage?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 13 }}>
        <span style={{ fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: PLACE }}>{kind}</span>
        {/* Plan-gated early and visibly: nobody should follow four steps and
            then find the thing they wanted needs a different plan. */}
        <span style={{ fontFamily: UI, fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: '#fff', border: `1px solid ${HAIR}`, color: DEEP, whiteSpace: 'nowrap' }}>{plan}</span>
      </div>
      <div style={{ background: DEEP, color: CREAM, borderRadius: 15, borderBottomRightRadius: 5, padding: '12px 15px', fontFamily: BODY, fontSize: 14.5, lineHeight: 1.5, marginBottom: 10 }}>
        {ask}
      </div>
      <div style={{ background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 15, borderBottomLeftRadius: 5, padding: '14px 15px', alignSelf: 'flex-start', width: '100%' }}>
        {/* The tick is the visible difference between an answer and a guess,
            and the last FAQ tells users to distrust an answer without it. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: GREEN, marginBottom: 9 }}>
          <Check size={12} strokeWidth={3} /> {tick}
        </span>
        <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: DEEP, margin: 0 }}>{say}</p>
        <span style={{ display: 'block', borderTop: `1px solid ${HAIR}`, marginTop: 12, paddingTop: 12, fontFamily: BODY, fontSize: 13.5, color: MUTED }}>
          <b style={{ display: 'block', fontFamily: UI, fontSize: 14, color: DEEP, fontWeight: 600, marginBottom: 3, letterSpacing: '-0.012em' }}>{resultTitle}</b>
          {resultMeta}
          {stage && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: UI, fontSize: 11.5, fontWeight: 600, background: '#E7F0DC', color: DEEP, borderRadius: 999, padding: '4px 11px' }}>
              <Check size={10} strokeWidth={3} /> {stage}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 18, padding: '18px 0', borderBottom: `1px solid ${HAIR}`, alignItems: 'start' }}>
      <span style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ACCENTS[n - 1] }}>
        <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 19, color: DEEP, lineHeight: 1 }}>{n}</span>
      </span>
      <div>
        <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: DEEP, margin: '1px 0 7px', letterSpacing: '-0.018em' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.6, color: MUTED, margin: '0 0 9px' }}>{children}</p>
}

function TrustItem({ can, children }: { can: boolean; children: React.ReactNode }) {
  const Icon = can ? Check : XIcon
  return (
    <li style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
      <span style={{ color: can ? GREEN : DANGER, flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
        <Icon size={14} strokeWidth={3} />
      </span>
      <span style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: MUTED }}>{children}</span>
    </li>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 0', borderBottom: `1px solid ${HAIR}` }}>
      <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: DEEP, margin: '0 0 5px', letterSpacing: '-0.014em' }}>{q}</h3>
      <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>{children}</p>
    </div>
  )
}

export default async function ConnectPage() {
  const cookieStore = await cookies()
  void cookieStore
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('id, apply_access, companion_access')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const tier = tierForOrgFlags((org ?? {}) as { apply_access?: boolean | null; companion_access?: boolean | null })
  const planLabel = tier === 'companion' ? 'Adviser plan' : tier === 'apply' ? 'Apply plan' : 'Match plan'

  // undefined = we could not tell, and then no chip is shown at all. An
  // unreliable "Connected" badge is worse than none.
  const connection = await getConnectionState(user.id)
  const connectedAt = connection?.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  /* The URL comes from MCP_RESOURCE_URL and is never written out here. A
     literal would be one more place to forget on a domain move, which is the
     whole reason mcp-brand.ts exists. */
  const url = MCP_RESOURCE_URL

  return (
    <div style={{ padding: '40px 48px 80px' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 31, letterSpacing: '-0.025em', color: DEEP, margin: '0 0 5px' }}>
          Connect to Claude
        </h1>
        <p style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.55, color: MUTED, margin: 0, maxWidth: '68ch' }}>
          Use {MCP_BRAND_NAME} from inside Claude — ask about funding in your own words and get answers from the live catalogue.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Hero ── */}
        <Card>
          <div style={{ padding: '38px 40px 34px' }}>
            <h2 style={{ fontFamily: UI, fontSize: 40, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.032em', color: DEEP, margin: '0 0 15px', maxWidth: '19ch' }}>
              Ask in plain English. Claude checks {MCP_BRAND_NAME}.
            </h2>
            <p style={{ fontFamily: BODY, fontSize: 17, lineHeight: 1.6, color: MUTED, margin: '0 0 26px', maxWidth: '60ch' }}>
              Claude on its own doesn&rsquo;t know which UK funds are open, who they&rsquo;ll fund or when they close — and an
              assistant guessing at deadlines is worse than no answer. Connecting {MCP_BRAND_NAME} means it looks the answer
              up instead. <b style={{ color: DEEP, fontWeight: 600 }}>Takes about a minute.</b>
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <CopyLink url={url} />
              {connectedAt ? (
                <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: '#E3F0E4', color: GREEN }}>
                  Connected
                </span>
              ) : connection === null ? (
                <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 999, background: WARM, color: DEEP }}>
                  {planLabel}
                </span>
              ) : null}
            </div>
            {connectedAt && (
              <p style={{ fontFamily: BODY, fontSize: 13.5, color: PLACE, margin: '12px 0 0' }}>
                Connected on {connectedAt} · {planLabel}
              </p>
            )}

            {/* The three-node model sits inside the hero rather than in a card
                of its own, so the page proper starts at the examples instead
                of explaining the same thing twice. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: 14, alignItems: 'stretch', borderTop: `1px solid ${HAIR}`, marginTop: 30, paddingTop: 28 }}
              className="connect-flow">
              {[
                { who: 'You',    t: 'Ask in your own words',        d: 'No filters, no fields. The kind of question you’d put to a colleague.' },
                { who: 'Claude', t: `Looks it up in ${MCP_BRAND_NAME}`, d: 'Turns your sentence into a search of the live catalogue.' },
                { who: 'You',    t: 'Get something you can act on', d: 'Real opportunities with eligibility, amounts and closing dates.' },
              ].map((n, i) => (
                <div key={n.t} style={{ display: 'contents' }}>
                  <span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: PLACE, marginBottom: 11 }}>
                      <i style={{ display: 'block', width: 26, height: 26, borderRadius: 999, flexShrink: 0, background: ACCENTS[i] }} />
                      {n.who}
                    </span>
                    <span style={{ display: 'block', fontFamily: UI, fontWeight: 600, fontSize: 17, color: DEEP, marginBottom: 6, letterSpacing: '-0.018em' }}>{n.t}</span>
                    <span style={{ display: 'block', fontFamily: BODY, fontSize: 14.5, lineHeight: 1.55, color: MUTED }}>{n.d}</span>
                  </span>
                  {i < 2 && (
                    <span className="connect-arrow" style={{ display: 'flex', alignItems: 'center', color: PLACE }}>
                      <ArrowRight size={22} strokeWidth={1.8} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Examples ── */}
        <Card>
          <SectionHead title="What that looks like">
            Three things people ask. The first two work on any plan. The third writes to your own pipeline, so it needs
            Apply or above.
          </SectionHead>
          <div style={{ padding: '20px 34px 4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }} className="connect-examples">
              <Example
                kind="Finding something" plan="Every plan"
                ask="What&rsquo;s open for a youth arts charity in Leeds?"
                tick={`Checked ${MCP_BRAND_NAME}`}
                say="Six open opportunities you&rsquo;re eligible for. The nearest closes in nine days:"
                resultTitle="Youth Social Action Fund"
                resultMeta="Paul Hamlyn Foundation · £15k – £500k · closes 9 Sep"
              />
              <Example
                kind="Sizing a funder up" plan="Every plan"
                ask="What does The Fore fund, and would we be eligible?"
                tick={`Checked ${MCP_BRAND_NAME}`}
                say="Early-stage organisations under £500k turnover — unrestricted grants up to £30k. You qualify, but they only open three times a year."
                resultTitle="Next round opens 6 October"
                resultMeta="Applications close within 48 hours of opening"
              />
              <Example
                kind="Keeping track" plan="Apply and above"
                ask="Add that one to my pipeline and mark it as applying."
                tick={`Saved to ${MCP_BRAND_NAME}`}
                say="Added and moved to Applying. It&rsquo;s on your Deadlines page too — 9 Sep, fifteen days off."
                resultTitle="Youth Social Action Fund"
                stage="Applying"
              />
            </div>
          </div>
          {/* On a page whose pitch is real records rather than recollection,
              presenting invented figures as real would undercut the argument. */}
          <Foot>
            <b style={{ color: DEEP }}>These are illustrations, not live data.</b> The figures are made up to show the shape
            of an answer — what you get back depends on your own profile and plan.
          </Foot>
        </Card>

        {/* ── How to connect ── */}
        <Card>
          <SectionHead title="How to connect">
            Four steps, about a minute. You&rsquo;ll need a Claude account — any Claude plan will do.
          </SectionHead>
          <div style={{ padding: '14px 34px 4px' }}>
            <Step n={1} title="Copy your connection link">
              <P>
                This is the address Claude will talk to. It&rsquo;s the same for everyone at your organisation — it isn&rsquo;t
                a password, and there&rsquo;s no key to look after.
              </P>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: DEEP, background: WARM, borderRadius: 10, padding: '9px 14px', wordBreak: 'break-all' }}>
                  {url}
                </span>
                <CopyLink url={url} variant="small" />
              </div>
            </Step>
            {/* Steps 2 and 3 describe Claude's own interface, which Anthropic
                changes. If a release moves these, the fix is here — nothing
                else on the page depends on them. */}
            <Step n={2} title="In Claude, open your connectors">
              <P>Go to <Kbd>Customize</Kbd> then <Kbd>Connectors</Kbd>.</P>
              <P>
                On a Team or Enterprise plan an owner adds it once for everybody, under <Kbd>Organization settings</Kbd> then{' '}
                <Kbd>Connectors</Kbd>. Everyone else then finds it in their own Connectors list and clicks Connect.
              </P>
            </Step>
            <Step n={3} title="Add a custom connector and paste the link">
              <P>
                Click <Kbd>+</Kbd>, choose <Kbd>Add custom connector</Kbd>, paste the link from step 1 and click <Kbd>Add</Kbd>.
                Leave the advanced settings alone — {MCP_BRAND_NAME} fills them in for you.
              </P>
            </Step>
            <Step n={4} title={`Sign in to ${MCP_BRAND_NAME} and approve`}>
              <P>
                A {MCP_BRAND_NAME} sign-in window opens. Sign in as you normally would and approve the connection.
                That&rsquo;s it — Claude can now look things up for you.
              </P>
              <P>
                You&rsquo;re signing in to {MCP_BRAND_NAME} yourself, in a {MCP_BRAND_NAME} window. Claude never sees your{' '}
                {MCP_BRAND_NAME} password.
              </P>
            </Step>
          </div>
          <Foot>
            <b style={{ color: DEEP }}>Where it works.</b> Claude on the web, desktop and mobile. Claude&rsquo;s own free tier
            allows one custom connector; paid Claude plans allow more. The same link also works in ChatGPT, Gemini and any
            other assistant that supports custom connectors — {MCP_BRAND_NAME} uses an open standard, not a private one.
          </Foot>
        </Card>

        {/* ── Trust ── */}
        <Card>
          <SectionHead title="What Claude can and cannot see">
            Worth reading once. A connection is a door, and you should know how wide it opens.
          </SectionHead>
          <div style={{ padding: '20px 34px 4px' }}>
            {/* "Cannot" goes second so it is what you finish on — it is the
                column that earns the connection. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }} className="connect-two">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: UI, fontWeight: 600, fontSize: 16, color: DEEP, margin: '0 0 14px' }}>
                  <span style={{ color: GREEN, display: 'inline-flex' }}><Check size={17} strokeWidth={2.6} /></span>
                  It can see
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  <TrustItem can><b style={{ color: DEEP }}>The funding catalogue</b> — every opportunity, with its eligibility rules and exclusions, on every plan.</TrustItem>
                  <TrustItem can><b style={{ color: DEEP }}>Your pipeline</b>, on Apply and above — and it can add to it or move things along.</TrustItem>
                </ul>
              </div>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: UI, fontWeight: 600, fontSize: 16, color: DEEP, margin: '0 0 14px' }}>
                  <span style={{ color: DANGER, display: 'inline-flex' }}><XIcon size={17} strokeWidth={2.6} /></span>
                  It cannot
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  <TrustItem can={false}><b style={{ color: DEEP }}>Touch another organisation&rsquo;s data.</b> Ever. The connection is scoped to the account you signed in with.</TrustItem>
                  <TrustItem can={false}><b style={{ color: DEEP }}>Change anything beyond your pipeline.</b> Pipeline items are the only thing it can write — never your profile, your material or your account settings.</TrustItem>
                  <TrustItem can={false}><b style={{ color: DEEP }}>See your {MCP_BRAND_NAME} password.</b> You sign in through {MCP_BRAND_NAME}&rsquo; own window, and Claude only ever holds a credential you can revoke.</TrustItem>
                </ul>
              </div>
            </div>
          </div>
          {/* There is no Disconnect button on this page, because disconnecting
              genuinely lives in Claude. A button here that could not do it
              would be a lie, so this says where it is instead. */}
          <Foot>
            <b style={{ color: DEEP }}>Disconnecting takes one click, in Claude.</b> Remove the connector there and access stops
            immediately — the next request is refused and the connection cannot quietly renew itself. There is nothing to undo
            on the {MCP_BRAND_NAME} side.
          </Foot>
        </Card>

        {/* ── FAQ ── */}
        <Card>
          <SectionHead title="If something goes wrong" />
          <div style={{ padding: '8px 34px 22px' }}>
            <Faq q="The sign-in window never appears, or it loops">
              Allow pop-ups for Claude and try again. The sign-in has to open in its own window to work.
            </Faq>
            <Faq q="Claude says it needs authorisation">
              Your connection has expired or been revoked. Open Connectors in Claude and reconnect — it takes a few seconds
              and nothing is lost.
            </Faq>
            <Faq q="It says you&rsquo;ve made too many requests">
              There&rsquo;s a fair-use limit on each connection. Wait for the reset time in the message and carry on.
            </Faq>
            {/* The honest one, and the most useful thing on the page. */}
            <div style={{ padding: '16px 0 0' }}>
              <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: DEEP, margin: '0 0 5px', letterSpacing: '-0.014em' }}>
                Claude answers but doesn&rsquo;t say it checked {MCP_BRAND_NAME}
              </h3>
              <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>
                Then it hasn&rsquo;t — it&rsquo;s answering from its own knowledge. Say &ldquo;check {MCP_BRAND_NAME}&rdquo; and
                ask again, and treat the first answer with caution, especially any deadline in it.
              </p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
