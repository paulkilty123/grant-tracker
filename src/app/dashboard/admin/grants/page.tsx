// The catalogue — one searchable list over EVERY grant, in every state.
//
// The Review Inbox only ever shows the review queue, so a published or archived
// row is invisible to it by design. That left no way to find a specific grant at
// all: looking for four named funds meant querying the database by hand.
//
// Grant Manager nominally had search, but it was server-side on only two tabs
// and INERT on Needs Review, Tag Review, Captured, Needs Enrichment, Tag Audit
// and URL Issues — the box rendered, you typed in it, and the loader ignored it.
// It also searched title and funder only, so a URL fragment found nothing.
//
// This page is the counterpart to the Inbox: the Inbox is the queue of things
// that need a decision, this is how you find anything, whatever its state.
//
// Auth comes from src/app/dashboard/admin/layout.tsx (requireAdmin).

import Link from 'next/link'
import { deriveReviewReasons, publishReadiness, type ReviewRow } from '@/lib/admin/review-reasons'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review', 'published', 'archived', 'rejected', 'between_rounds_scheduled'] as const
const TYPES  = ['grant', 'programme', 'investment', 'in_kind'] as const

const COLS = [
  'id', 'title', 'funder', 'apply_url', 'funding_index_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score', 'location_tag', 'funding_type',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  // Required by deriveReviewReasons for the page-verdict reasons. Without it
  // readStamp returns null, no reason is raised, and the gate silently stops
  // blocking on funds the funder's own page says are closed.
  'field_evidence',
].join(', ')

const display = { fontFamily: 'var(--font-space-grotesk)' } as const

type SP = { q?: string; state?: string; type?: string; visible?: string; page?: string }

/** A view tab. A link, not a button, so the URL stays shareable and the back
 *  button works — the same reason the search is a GET form. */
function ViewTab({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <a href={`/dashboard/admin/grants${href}`} style={{
      ...display, fontSize: 12, fontWeight: 500, textDecoration: 'none',
      background: active ? 'var(--green-deep)' : 'var(--bg-pill-neutral)',
      color: active ? 'var(--green-pale-2)' : 'var(--color-text-secondary)',
      border: '0.5px solid transparent', borderRadius: 999,
      padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
      {label}
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.72, fontSize: 11.5 }}>
        {n.toLocaleString('en-GB')}
      </span>
    </a>
  )
}

export default async function CataloguePage({ searchParams }: { searchParams: SP }) {
  const q       = (searchParams.q ?? '').trim()
  const state   = searchParams.state ?? ''
  const type    = searchParams.type ?? ''
  const visible = searchParams.visible ?? ''
  const page    = Math.max(1, Number(searchParams.page ?? '1') || 1)

  const db = getAdminDb()

  // count: 'exact' so the page can state the true total. Grant Manager capped
  // every tab with a bare .limit() and said nothing when it truncated, so
  // "showing 500" and "there are 500" were indistinguishable.
  let query = db.from('scraped_grants').select(COLS, { count: 'exact' })

  if (q) {
    // Description included deliberately: searching a fund by a phrase from its
    // own summary is the obvious thing to try, and title+funder alone fails it.
    // commas and parens break PostgREST's or() grammar, so they are stripped.
    const safe = q.replace(/[,()*]/g, ' ').trim()
    if (safe) query = query.or(`title.ilike.%${safe}%,funder.ilike.%${safe}%,description.ilike.%${safe}%`)
  }
  if (state)   query = query.eq('pipeline_state', state)
  if (type)    query = query.eq('funding_type', type)
  if (visible === 'live')   query = query.eq('is_active', true)
  if (visible === 'hidden') query = query.eq('is_active', false)

  // Counts for the view tabs. Built with the same search and filters so a tab's
  // number always describes what clicking it would actually show — a count that
  // ignored the active search would send you to an empty page.
  const countFor = async (vis: 'live' | 'hidden' | null) => {
    let c = db.from('scraped_grants').select('id', { count: 'exact', head: true })
    if (q) {
      const safe = q.replace(/[,()*]/g, ' ').trim()
      if (safe) c = c.or(`title.ilike.%${safe}%,funder.ilike.%${safe}%,description.ilike.%${safe}%`)
    }
    if (state) c = c.eq('pipeline_state', state)
    if (type)  c = c.eq('funding_type', type)
    if (vis)   c = c.eq('is_active', vis === 'live')
    const { count } = await c
    return count ?? 0
  }
  const [allCount, liveCount, hiddenCount] = await Promise.all([
    countFor(null), countFor('live'), countFor('hidden'),
  ])

  const from = (page - 1) * PAGE_SIZE
  const { data, error, count } = await query
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    return (
      <main style={{ padding: '30px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <h1 style={{ ...display, fontSize: 25, fontWeight: 500, margin: '0 0 12px' }}>Catalogue</h1>
        <div style={{ background: 'var(--coral-pale)', color: 'var(--coral-deep)', borderRadius: 'var(--radius-card)', padding: '14px 18px', fontSize: 14 }}>
          <strong style={{ ...display }}>Could not load the catalogue.</strong>
          <div style={{ marginTop: 4 }}>{error.message}</div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>This is a read failure, not an empty catalogue.</div>
        </div>
      </main>
    )
  }

  const rows = (data ?? []) as unknown as Array<ReviewRow & {
    title: string; funder: string | null; apply_url: string | null
    pipeline_state: string; funding_type: string | null
  }>
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams()
    const merged = { q, state, type, visible, page: String(page), ...over }
    for (const [k, v] of Object.entries(merged)) if (v && v !== '1') p.set(k, String(v))
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <main style={{ padding: '30px 24px 80px', maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ ...display, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 5px' }}>
        Catalogue
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 20px', maxWidth: '70ch' }}>
        Every grant, whatever state it is in. Search by title, funder or anything in the description.
        The Review queue shows only what needs a decision, so anything already published or archived
        lives here.
      </p>

      {/* Whether users can see it, chosen first. This was a third dropdown
          among three, which made the single most important fact about a row —
          is anyone looking at this — the easiest one to miss. Counts honour the
          active search, so switching view keeps your query. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginBottom: 12 }}>
        <span style={{
          ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginRight: 2,
        }}>Show</span>
        <ViewTab href={qs({ visible: '', page: '' })}       active={!visible}                 label="Everything"    n={allCount} />
        <ViewTab href={qs({ visible: 'live', page: '' })}   active={visible === 'live'}       label="Live to users" n={liveCount} />
        <ViewTab href={qs({ visible: 'hidden', page: '' })} active={visible === 'hidden'}     label="Hidden"        n={hiddenCount} />
      </div>

      {/* GET form, so the URL carries the search and a result is linkable and
          survives a refresh. */}
      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {/* Carries the current view through a new search, so searching does not
            silently drop you back to Everything. */}
        {visible && <input type="hidden" name="visible" value={visible} />}
        <input
          type="search" name="q" defaultValue={q}
          placeholder="Search title, funder or description"
          style={{
            flex: '1 1 300px', minWidth: 0, fontSize: 14, padding: '9px 13px',
            borderRadius: 'var(--radius-input)', border: '0.5px solid var(--border-subtle)',
            background: '#fff', color: 'var(--color-text-primary)', fontFamily: 'inherit',
          }}
        />
        <Select name="state"   value={state}   label="Any state"      options={STATES.map(s => [s, s.replace(/_/g, ' ')])} />
        <Select name="type"    value={type}    label="Any type"       options={TYPES.map(t => [t, t.replace(/_/g, '-')])} />
        <button type="submit" style={{
          ...display, fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--radius-input)',
          padding: '9px 18px', cursor: 'pointer', border: '0.5px solid transparent',
          background: 'var(--green-deep)', color: 'var(--green-pale-2)',
        }}>Search</button>
        {(q || state || type || visible) && (
          <a href="/dashboard/admin/grants" style={{ ...display, fontSize: 12.5, color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
            Clear
          </a>
        )}
      </form>

      <div style={{
        ...display, fontSize: 12.5, color: 'var(--color-text-secondary)',
        paddingBottom: 10, borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 4,
      }}>
        {total === 0
          ? 'Nothing matches.'
          : `${total.toLocaleString('en-GB')} ${total === 1 ? 'grant' : 'grants'}${q ? ` matching “${q}”` : ''}` +
            (pages > 1 ? ` — showing ${from + 1} to ${Math.min(from + PAGE_SIZE, total)}` : '')}
      </div>

      <div>
        {rows.map(r => {
          const reasons = deriveReviewReasons(r)
          const readiness = publishReadiness(reasons)
          return (
            <Link
              key={r.id}
              href={`/dashboard/admin/grants/${r.id}`}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center',
                padding: '11px 4px', borderBottom: '0.5px solid var(--border-light)',
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ ...display, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  {r.funder}
                  {r.funding_type ? ` · ${r.funding_type.replace(/_/g, '-')}` : ''}
                  {/* Visibility belongs in the text, not only in a right-aligned
                      pill. Two near-identically titled rows — one live, one long
                      archived — are told apart ONLY by their state, and on a
                      narrow window the pills scroll out of view, so the single
                      distinguishing fact was the first thing lost. */}
                  {!r.is_active && (
                    <span style={{ color: 'var(--coral-deep)' }}>
                      {' · '}{r.pipeline_state === 'archived' ? 'archived, not shown to users' : 'hidden from users'}
                    </span>
                  )}
                  {reasons.length > 0 ? ` · ${reasons.length} ${reasons.length === 1 ? 'thing' : 'things'} to check` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                {readiness >= 2 && (
                  <Pill bg="var(--coral-pale)" ink="var(--coral-deep)">needs work</Pill>
                )}
                {r.is_active
                  ? <Pill bg="var(--green-pale-1)" ink="var(--green-text-deep)">live</Pill>
                  : <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-secondary)">hidden</Pill>}
                <Pill bg="var(--cream-1)" ink="var(--color-text-tertiary)">{r.pipeline_state.replace(/_/g, ' ')}</Pill>
              </div>
            </Link>
          )
        })}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          {page > 1 && <a href={qs({ page: String(page - 1) })} style={pageBtn}>← Previous</a>}
          <span style={{ ...display, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            Page {page} of {pages}
          </span>
          {page < pages && <a href={qs({ page: String(page + 1) })} style={pageBtn}>Next →</a>}
        </div>
      )}
    </main>
  )
}

function Select({ name, value, label, options }: {
  name: string; value: string; label: string; options: Array<readonly [string, string]>
}) {
  return (
    <select
      name={name} defaultValue={value}
      style={{
        ...display, fontSize: 12.5, padding: '9px 11px', borderRadius: 'var(--radius-input)',
        border: '0.5px solid var(--border-subtle)', background: '#fff',
        color: 'var(--color-text-primary)', cursor: 'pointer',
      }}
    >
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Pill({ children, bg, ink }: { children: React.ReactNode; bg: string; ink: string }) {
  return (
    <span style={{
      ...display, fontSize: 10.5, fontWeight: 500, borderRadius: 8,
      padding: '3px 8px', background: bg, color: ink, whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

const pageBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 500,
  borderRadius: 'var(--radius-input)', padding: '7px 14px',
  border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-primary)', textDecoration: 'none',
}
