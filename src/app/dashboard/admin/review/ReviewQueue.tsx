'use client'

// The Inbox list.
//
// ── The pinning rule, which is the whole point of rebuilding this ────────────
// /api/admin/update-grant stamps `pinned: true` on EVERY field in the payload
// whenever an admin session calls it (route.ts:57 — an admin session cannot be
// downgraded). The old Grant Manager sent its entire form state on save, so
// fields nobody had looked at were recorded as human decisions and frozen at
// trust 100 against all future AI correction. 54% of the live catalogue carries
// at least one such pin, and it blocked 78 corrections in one afternoon.
//
// So this component NEVER sends a field the reviewer did not deliberately set:
//
//   Accept   — writes NO tracked field at all. Accepting a machine suggestion is
//              not a decision about the value, it is a confirmation that the
//              machine was right. The value keeps its ai_classifier provenance
//              and stays improvable. Only is_active and pipeline_state are sent,
//              and neither is tracked, so it pins nothing.
//   Revert   — writes that ONE field. This IS a human overruling the machine,
//              so pinning it is correct.
//   Reject   — writes pipeline_state + rejection_reason. Neither is tracked.
//
// The result: reviewing a row no longer degrades the machine's ability to
// improve it. That is what makes the review queue shrink over time instead of
// calcifying.

import { Fragment, useMemo, useState, useCallback } from 'react'
import { Check, RefreshCw, Link2, ExternalLink, Eye, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import GrantDetailModal from '@/components/GrantDetailModal'
import type { ReviewReason, FieldDiff } from '@/lib/admin/review-reasons'
import type { EvidenceSummary } from '@/lib/admin/evidence-summary'
// Type-only, so the merger's server dependencies are erased at build and this
// stays a client component.
import type { MergeRejection } from '@/lib/grant-merge'
import {
  SECTIONS, sectionOf, evidenceRank, EVIDENCE_RANK_LABEL,
  arrivalOrigin, isNewArrival, ORIGIN_LABEL, NEW_ARRIVAL_DAYS,
  rootCauseOf, explainedBy, isIncomplete,
  type SectionId,
} from '@/lib/admin/review-sections'

export type QueueItem = {
  /** Brief is a stub (or absent) — drives the "Needs enrichment" view. */
  needsEnrichment?: boolean
  /** ISO timestamp the auto-publish gate published this, if it did, within 7 days. */
  autoPublishedAt?: string | null
  /** True when the gate's decision exposed it, rather than confirming what was already live. */
  autoPublishNewlyVisible?: boolean
  id: string
  /** What the public grant API keys on. Null for catalogue-seeded rows, where id is used. */
  externalId: string | null
  title: string
  funder: string
  applyUrl: string | null
  /** Other live rows on this exact apply_url. >0 means the link cannot identify this row. */
  linkSharedWith: number
  isActive: boolean
  pipelineState: string
  reasons: ReviewReason[]
  /** 0 = one click from done, 3 = cannot be judged until the page is read. */
  readiness: number
  /**
   * What the auto-publish gate decided.
   *   'attention' — visible to users AND carrying a reason they could be
   *                 misled by. Nothing is retracted automatically, so these
   *                 need a human first.
   *   'hold'      — carrying such a reason but not visible.
   *   'publish'   — nothing blocking; the gate can take this one itself.
   */
  gateOutcome: 'publish' | 'hold' | 'attention'
  /** Reason codes that actually block publication, resolved on the server. */
  blockingCodes: string[]
  /** When this row first entered the catalogue. Drives the arrivals view. */
  firstSeenAt: string | null
  /** Raw source string — mapped to an origin for display, never shown raw. */
  source: string | null
  diffs: FieldDiff[]
  brief: {
    source: string | null
    whoCanApply: string | null
    typicalAward: string | null
    whatTheyFund: string | null
    citations: Record<string, { snippet: string; confidence: string } | null>
  } | null
  /** What the funder's page said when the engine last read it. Null means no
   *  page has ever been read for this row, which is a different thing from a
   *  page that was read and said nothing. */
  evidence: EvidenceSummary | null
  values: {
    amountMin: number | null
    amountMax: number | null
    deadline: string | null
    isRolling: boolean
    structures: string[]
    sectors: string[]
    /** Which of the four Find Funding tabs this row lands in. */
    fundingType: string | null
  }
}

const SEV_STYLE: Record<string, { bg: string; ink: string; edge: string }> = {
  critical: { bg: 'var(--coral-pale)', ink: 'var(--coral-deep)', edge: 'var(--coral-saturated)' },
  check:    { bg: 'var(--amber-pale)', ink: 'var(--amber-deep)', edge: 'var(--amber-saturated)' },
  changed:  { bg: 'var(--blue-pale)',  ink: 'var(--blue-deep)',  edge: 'var(--blue-saturated)' },
}

/**
 * The four tabs on Find Funding, and the only values the classifier may set
 * (VALID_FUNDING_TYPES in lib/classify.ts). Duplicated as a label map rather
 * than imported because that module pulls the whole taxonomy and this is a
 * client component.
 */
const FUNDING_TYPES: { value: string; label: string }[] = [
  { value: 'grant',      label: 'Grant' },
  { value: 'programme',  label: 'Programme' },
  { value: 'investment', label: 'Investment' },
  { value: 'in_kind',    label: 'In-kind' },
]

/**
 * The four funding-type colours, straight from the design system.
 *
 * They were already defined and this screen was not using them — every pill
 * rendered the same neutral grey, so the one axis with an agreed palette looked
 * identical to metadata. Duplicated as literals rather than imported because
 * the tokens live in a CSS file and this needs them as values.
 */
const TYPE_TONE: Record<string, { bg: string; ink: string }> = {
  grant:      { bg: '#F1F7E4', ink: '#3B6D11' },
  programme:  { bg: '#FAECE7', ink: '#993C1D' },
  investment: { bg: '#E6F1FB', ink: '#0C447C' },
  in_kind:    { bg: '#FAEEDA', ink: '#854F0B' },
}

/**
 * Evidence strength as a scale, not a label.
 *
 * This is the axis the sections are sorted on, so the colour has to run in the
 * same direction as the sort: safest reads calm, "the page is about a different
 * fund" reads like the problem it is. Without it the sort order is legible only
 * by reading every pill.
 */
const EVIDENCE_TONE: Record<0 | 1 | 2 | 3, { bg: string; ink: string }> = {
  0: { bg: 'var(--green-pale-2, #F1F7E4)', ink: 'var(--green-deep, #173404)' },
  1: { bg: 'var(--bg-pill-neutral)',       ink: 'var(--color-text-tertiary)' },
  2: { bg: 'var(--amber-pale)',            ink: 'var(--amber-deep)' },
  3: { bg: 'var(--coral-pale)',            ink: 'var(--coral-deep)' },
}

/**
 * Everything the screen can show, as ONE axis.
 *
 * The five sections are the primary navigation; the three under Views are cuts
 * across them. There is no second selector — the old SHOW row let you pick a
 * view and a section at once and get a screen that contradicted its own heading.
 */
type NavId = SectionId | 'liveandwrong' | 'new' | 'unenriched' | 'autopublished'

const NAV_META: Record<NavId, { label: string; detail: string }> = {
  liveandwrong: { label: 'Live and wrong',
    detail: 'People can see these now. Everything else on this screen is invisible, so its cost is delay rather than harm.' },
  ready:      { label: 'Ready to publish',      detail: 'Nothing blocking. Publishing one changes what users can find today.' },
  link:       { label: 'Link needs fixing',     detail: 'A link that goes nowhere, or a page describing a different fund. A homepage is not a problem and is not here.' },
  reading:    { label: 'Needs reading',         detail: 'Nothing has read the funder’s page, so no judgement is possible yet.' },
  judgement:  { label: 'Needs your judgement',  detail: 'The page was read and what it says is genuinely arguable.' },
  untruthful: { label: 'Nothing truthful to show', detail: 'No funder, or the page says the fund is gone.' },
  new:        { label: 'New this week',         detail: `What has arrived in the last ${NEW_ARRIVAL_DAYS} days, newest first. These also appear under whatever they need.` },
  unenriched: { label: 'Needs enrichment',      detail: 'A stub brief or none at all, whether or not the row is live.' },
  autopublished: { label: 'Published without you', detail: 'What the gate did on its own. A receipt, not a task.' },
}

const display = { fontFamily: 'var(--font-space-grotesk)' } as const
const gbp = (n: number | null) => (n === null ? '—' : `£${n.toLocaleString('en-GB')}`)

/**
 * What the funder's page actually said.
 *
 * Placed ABOVE the brief citations deliberately. Everything else on this screen
 * is derived from data we already held; this is the only block sourced from
 * outside, and a reviewer should meet it before they meet our own inferences.
 *
 * Three states, and the screen must never merge them:
 *   never read       no page has been fetched for this row
 *   read and silent  the page was fetched and does not address the field
 *   contradicted     the page says something else, and here is the sentence
 *
 * Deliberately no accent colour. The accent budget on this page belongs to the
 * actions, and a panel that shouts on every row stops meaning anything.
 */
function EvidencePanel({ evidence }: { evidence: EvidenceSummary | null }) {
  const display = { fontFamily: 'var(--font-space-grotesk)' }

  if (!evidence) {
    return (
      <div style={{
        background: 'var(--cream)', borderRadius: 'var(--radius-input)',
        padding: '10px 13px', fontSize: 12.5, color: 'var(--mid)', marginBottom: 9,
      }}>
        No page has been read for this row yet. Everything below is derived from what we already hold.
      </div>
    )
  }

  const when = evidence.checkedAt
    ? new Date(evidence.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null

  const tone: Record<string, { bg: string; fg: string; label: string }> = {
    contradicted: { bg: 'var(--coral-pale)',   fg: 'var(--coral-deep)',      label: 'page disagrees' },
    silent:       { bg: 'var(--amber-pale)',   fg: 'var(--amber-deep)',      label: 'page silent' },
    confirmed:    { bg: 'var(--green-pale-1)', fg: 'var(--green-text-deep)', label: 'confirmed' },
  }

  return (
    <div style={{
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)',
      padding: '11px 13px', marginBottom: 11,
    }}>
      {evidence.readUrl && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 9, wordBreak: 'break-all' }}>
          {when ? `Read ${when} · ` : ''}{evidence.readUrl}
          {evidence.outcome && evidence.outcome !== 'verified' ? ` · ${evidence.outcome}` : ''}
        </div>
      )}

      {evidence.lines.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--mid)' }}>
          The page was read but stated none of the fields we check.
        </div>
      )}

      {evidence.lines.map(line => (
        <div key={line.field} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ ...display, fontSize: 12.5, fontWeight: 500 }}>{line.label}</span>
            <span style={{
              ...display, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px',
              background: tone[line.verdict].bg, color: tone[line.verdict].fg,
            }}>{tone[line.verdict].label}</span>
            {/* Named only where it changes what a user is told. A silent amount
                is a gap; a silent deadline is rendered to users as "Rolling". */}
            {line.asserted && line.verdict !== 'confirmed' && (
              <span style={{ fontSize: 11.5, color: 'var(--coral-deep)' }}>
                we state this anyway
              </span>
            )}
          </div>
          {line.quote && (
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--mid)', marginTop: 3 }}>
              <q>{line.quote}</q>
            </div>
          )}
          {line.proposed !== undefined && (
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
              the page supports: {typeof line.proposed === 'object' ? JSON.stringify(line.proposed) : String(line.proposed)}
            </div>
          )}
          {line.sourceUrl && line.sourceUrl !== evidence.readUrl && (
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, wordBreak: 'break-all' }}>
              from {line.sourceUrl}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ReviewQueue({ items, gateWindowStart }: { items: QueueItem[]; gateWindowStart?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  /**
   * Fields a job proposed and the merger refused, per row.
   *
   * Held in state rather than announced in a toast because a refusal is an
   * unresolved decision, not an event: something better was computed, something
   * older won, and until a person picks one the row is quietly out of date. A
   * message that disappears leaves the screen showing the old value with no
   * account of why.
   */
  const [refusals, setRefusals] = useState<Record<string, MergeRejection[]>>({})
  const [filter, setFilter] = useState<string | null>(null)
  // Which rows to show, by whether users can currently see them.
  //   'hidden' is what the old Grant Manager called Needs Review: rows not yet
  //   in front of anyone, where a decision is genuinely pending.
  //   'live' is the opposite and the more urgent half — those are in front of
  //   users right now, so anything wrong with them is wrong in public.
  //   'autopublished' is the odd one out: not work, but the record of what the
  //   gate did without asking. Those rows are published and live, so they are
  //   in none of the queue states and disappear from every other view here.
  /**
   * ONE ANSWER PER QUESTION, PER SCREEN.
   *
   * The list used to carry two competing mental models at once — five sections
   * AND eighteen reason chips — over four rows of controls and two blocks of
   * prose, before a single grant appeared. Sections are now the navigation and
   * everything else is subordinate to them: reason codes moved behind Filters,
   * the SHOW row is gone, and the prose is gone.
   *
   * `nav` is the single source of what is on screen. There is no second axis.
   */
  const [nav, setNav] = useState<NavId>('ready')
  /** The reason-code filter, now behind a Filters disclosure rather than a row
   *  of eighteen chips competing with the sections for the same job. */
  const [filtersOpen, setFiltersOpen] = useState(false)
  /** Navigating always clears the selection: acting on rows you can no longer
   *  see is the kind of thing a bulk button should make impossible. */
  const go = useCallback((id: NavId) => { setNav(id); setSelected(new Set()) }, [])
  /** Bulk selection, per section. Cleared whenever the view or filters change. */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** How each section is ordered. Evidence strength is the default because it
   *  answers "what can I safely accept"; newest-first answers "what just
   *  arrived", which is a different question and now has its own section. */
  const [sortBy, setSortBy] = useState<'evidence' | 'newest'>('evidence')
  /** Funding type as a FILTER, never as a grouping — as a grouping it gives one
   *  pile of grants and four piles anyone would clear in a minute. */
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const liveAll = useMemo(() => items.filter(i => !done.has(i.id)), [items, done])

  // Search exists because the queue had no way to reach a NAMED row. Every
  // filter here is by category — which view, which reason — so arriving with
  // "fix the Card Factory row" meant going to Catalogue, searching, and coming
  // back. Applied before every count below, so a chip's number always describes
  // what clicking it would actually show, the same rule Catalogue follows.
  const [q, setQ] = useState('')
  const live = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return liveAll
    return liveAll.filter(i => `${i.title} ${i.funder}`.toLowerCase().includes(needle))
  }, [liveAll, q])

  // Gate-published rows are a receipt, not a task, so they are held out of the
  // working views entirely. Counting them under "Everything" would inflate the
  // queue with rows that need nothing.
  const pending = useMemo(() => live.filter(i => !i.autoPublishedAt), [live])
  const autoPub = useMemo(
    () => live.filter(i => i.autoPublishedAt)
      // Newly-exposed first: those are the ones where the gate changed what a
      // user can see, rather than catching admin state up to what was already live.
      .sort((a, b) =>
        Number(b.autoPublishNewlyVisible) - Number(a.autoPublishNewlyVisible) ||
        String(b.autoPublishedAt).localeCompare(String(a.autoPublishedAt))),
    [live],
  )

  /** The not-live pool. "Not live yet" is no longer a filter you pick — it is
   *  the heading its sections sit under, so this is simply what the sections
   *  are built from. */
  const byView = useMemo(() => pending.filter(i => !i.isActive), [pending])

  const counts = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    for (const i of byView) {
      for (const r of i.reasons) {
        const cur = m.get(r.code) ?? { label: r.label.replace(/\d+/g, 'N'), n: 0 }
        cur.n++
        m.set(r.code, cur)
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n)
  }, [byView])

  // Funding type filters every view. Applied before the sections are built so a
  // section count always describes what is actually under it.
  const byViewTyped = typeFilter ? byView.filter(i => i.values.fundingType === typeFilter) : byView

  const shown = filter ? byViewTyped.filter(i => i.reasons.some(r => r.code === filter)) : byViewTyped

  /**
   * The five sections, in order, each sorted safest-evidence-first.
   *
   * Only built for the primary view. The other views are lists of a different
   * kind — a receipt, or a cross-cutting filter — and sections would be a
   * grouping over rows that do not share a shape.
   */
  const byNewest = (a: QueueItem, b: QueueItem) =>
    String(b.firstSeenAt ?? '').localeCompare(String(a.firstSeenAt ?? ''))
  const bySafest = (a: QueueItem, b: QueueItem) =>
    evidenceRank(a.evidence) - evidenceRank(b.evidence) || a.title.localeCompare(b.title)

  const sectioned = useMemo(() => {
    const bucket = new Map<SectionId, QueueItem[]>()
    for (const s of SECTIONS) bucket.set(s.id, [])
    for (const item of shown) {
      bucket.get(sectionOf(item.blockingCodes, item.reasons.map(r => r.code)))!.push(item)
    }
    const cmp = sortBy === 'newest' ? byNewest : bySafest
    for (const sec of SECTIONS) bucket.get(sec.id)!.sort(cmp)
    return bucket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sortBy])

  /**
   * What has ARRIVED, as opposed to what is wrong.
   *
   * Every other cut on this screen is by defect, which shows the backlog and
   * hides the intake — Paul, 2026-08-17: "I can see the backlog but not the
   * intake." This is the only view of the flow: how many funds are coming in,
   * from where, and how fast they clear.
   *
   * Deliberately CROSS-CUTTING rather than exclusive. A new arrival stays in
   * whatever action section it belongs to as well, because removing it would
   * quietly shrink "ready to publish" and hide publishable work behind a
   * recency filter. The heading says so, so the same row appearing twice reads
   * as two answers to two questions rather than a duplicate.
   */
  const newArrivals = useMemo(
    () => shown.filter(i => isNewArrival(i.firstSeenAt)).sort(byNewest),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown],
  )

  /** Live to users AND carrying something they could be misled by. Pinned above
   *  the sections rather than demoted to a chip: these are the only rows on the
   *  screen where somebody is being misled right now. */
  const liveAndWrong = useMemo(
    () => {
      const rows = pending.filter(i => i.gateOutcome === 'attention')
      const typed = typeFilter ? rows.filter(i => i.values.fundingType === typeFilter) : rows
      return typed.sort((a, b) => evidenceRank(a.evidence) - evidenceRank(b.evidence) || a.title.localeCompare(b.title))
    },
    [pending, typeFilter],
  )

  const sectionCounts = useMemo(() => {
    const out = {} as Record<SectionId, number>
    for (const s of SECTIONS) out[s.id] = sectioned.get(s.id)?.length ?? 0
    return out
  }, [sectioned])



  const liveToUsers = pending.filter(i => i.isActive).length
  const notLiveCount = pending.length - liveToUsers
  const unenrichedCount = pending.filter(i => i.needsEnrichment).length
  const autoPubCount = autoPub.length


  /** Single place every write goes through, so a failure can never look like success. */
  const patch = useCallback(async (
    id: string,
    fields: Record<string, unknown>,
    what: string,
    /**
     * Fields that MUST come back in the server's `applied` list for this write
     * to count as done.
     *
     * HTTP 200 only means the request was understood. mergeGrantUpdate returns
     * early without writing when nothing is actually changing, so a caller that
     * checks only `res.ok` will report success for a write that never landed.
     * Any action a person would treat as final — Reject above all — must assert
     * what the server says it wrote, not that it answered.
     */
    expect?: string[],
  ): Promise<boolean> => {
    let res: Response
    try {
      res = await fetch('/api/admin/update-grant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fields }),
      })
    } catch (err) {
      // A dropped connection used to reject the promise and reach nobody: the
      // click simply did nothing. Offline is a failure, and it must say so.
      toast.error(`${what} failed: could not reach the server. Nothing changed.`)
      console.error(`[review] ${what} network error:`, err)
      return false
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(`${what} failed: ${j.error ?? `HTTP ${res.status}`}`)
      return false
    }
    const j = await res.json().catch(() => ({})) as {
      applied?: string[]
      rejected?: { field: string; reason: string }[]
    }
    // A write the trust ladder refused is NOT a success. The old screen counted
    // it as one and the row simply did not change, with nothing said.
    if (j.rejected?.length) {
      const pinnedFields = j.rejected.filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinnedFields.length) {
        toast.error(`${what}: ${pinnedFields.join(', ')} is pinned to an earlier admin decision and was not changed.`)
        return false
      }
    }
    if (expect?.length) {
      const applied = j.applied ?? []
      const missing = expect.filter(f => !applied.includes(f))
      if (missing.length) {
        toast.error(`${what} did not take: the server did not write ${missing.join(', ')}. Nothing changed — try again.`)
        console.error(`[review] ${what} expected ${expect.join(', ')}, server applied`, applied)
        return false
      }
    }
    return true
  }, [toast])

  const publish = useCallback(async (item: QueueItem) => {
    setBusyId(item.id)
    // is_active makes it visible; pipeline_state is what takes it OUT of the queue.
    //
    // Sending only is_active was a bug: the queue selects on pipeline_state, so
    // the row stayed in 'tagged_awaiting_review', disappeared from the list only
    // because setDone hides it client-side, and came straight back on the next
    // refresh. The queue could never shrink no matter how much reviewing got done.
    //
    // Neither field is in TRACKED_FIELDS, so this still pins nothing — the whole
    // point of Accept remains intact.
    //
    // Asserted for the same reason Reject is: this is the other action a person
    // treats as final, and "Published X" over a row that never moved is the
    // same lie in the opposite direction.
    const ok = await patch(
      item.id,
      { is_active: true, pipeline_state: 'published' },
      'Publishing',
      ['is_active', 'pipeline_state'],
    )
    setBusyId(null)
    if (!ok) return false
    setDone(d => new Set(d).add(item.id))
    toast.success(`Published ${item.title}`)
    router.refresh()
    return true
  }, [patch, router, toast])

  const revertField = useCallback(async (item: QueueItem, diff: FieldDiff) => {
    setBusyId(item.id)
    // A deliberate override of the machine, so this one field is written and
    // pinned. That is the correct use of a pin.
    const ok = await patch(item.id, { [diff.field]: diff.before }, `Reverting ${diff.field}`)
    setBusyId(null)
    if (!ok) return
    toast.success(`${diff.field} reverted`)
    router.refresh()
  }, [patch, router, toast])

  /**
   * Set the funding type by hand.
   *
   * There was no way to do this anywhere in the product. A government grant
   * classified as a programme because its page said "commission" could only be
   * corrected by someone with database access, which is not a review workflow.
   *
   * Writes the ONE field, so update-grant pins it. That is the correct use of a
   * pin under this file's rule: the reviewer is overruling the classifier, and
   * without the pin ai_classifier (trust 60) would be free to set it back on
   * the next re-tag and quietly undo them.
   */
  const setFundingType = useCallback(async (item: QueueItem, next: string) => {
    setBusyId(item.id)
    const ok = await patch(item.id, { funding_type: next }, 'Changing the funding type')
    setBusyId(null)
    if (!ok) return
    const label = FUNDING_TYPES.find(t => t.value === next)?.label ?? next
    toast.success(`Funding type set to ${label}`)
    router.refresh()
  }, [patch, router, toast])

  // ── Repair actions ────────────────────────────────────────────────────────
  // The first version of this page offered only Publish and Reject. For the
  // rows at the top of the queue — page unreadable, no eligibility, no deadline
  // — neither is a sane answer: publishing ships a grant nobody can match
  // against, rejecting throws away a real fund. The actual remedy is almost
  // always "read the page again", and for a bad apply_url, "fix the link first".
  // Without these the queue diagnosed problems and offered no treatment.

  const runJob = useCallback(async (
    id: string,
    url: string,
    body: Record<string, unknown>,
    label: string,
  ): Promise<boolean> => {
    setBusyId(id)
    setBusyLabel(label)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(`${label} failed: ${j.error ?? `HTTP ${res.status}`}`)
        return false
      }
      // enrich-grant reports fields the trust ladder refused. Surfacing that is
      // the difference between "nothing happened" and "nothing happened because
      // an earlier admin decision is pinned".
      //
      // Two things were wrong with the first version of this, and both showed up
      // on Movement for Good Awards. It reported only `pinned`, so a
      // `lower_trust` refusal — the commoner kind — passed in total silence. And
      // it reported through a toast, which is gone in four seconds and carries no
      // remedy, so the screen went back to showing the old value with nothing to
      // explain it. Refusals are now held in state and rendered on the row until
      // they are dealt with.
      const j = await res.json().catch(() => ({})) as { rejected?: MergeRejection[] }
      // `idempotent` is not a refusal — the value already matched. Only these two
      // mean something was proposed and something else won.
      const blocked = (j.rejected ?? []).filter(r => r.reason === 'pinned' || r.reason === 'lower_trust')
      if (blocked.length) {
        setRefusals(prev => ({ ...prev, [id]: blocked }))
        toast.error(`${label} ran, but ${blocked.length === 1 ? '1 field was' : `${blocked.length} fields were`} not saved. See the row for what held them.`)
      } else {
        // A clean re-run clears an earlier refusal, so the notice cannot outlive
        // the problem it describes.
        setRefusals(prev => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      return true
    } catch (err) {
      toast.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      setBusyId(null)
      setBusyLabel(null)
    }
  }, [toast])

  const classify = useCallback((id: string, label: string) => runJob(id, '/api/admin/classify-grants', {
    grant_ids:      [id],
    include_review: true,
    force:          true,
    // Automated re-tag: an empty array from the model must not wipe good tags.
    preserve_empty: true,
  }, label), [runJob])

  // Re-read = enrich THEN classify, mirroring the automated chain.
  //
  // The first version called enrich-grant alone. But enrich-grant never writes
  // impact_sectors, target_beneficiaries or eligible_structures — tagging is a
  // separate classifier pass. So on a row whose whole question was "a re-read
  // changed the tagging", pressing the button rewrote the brief and left the
  // tags untouched: the one field being asked about was the one field it could
  // not move. The button promised something it structurally could not deliver.
  const reRead = useCallback(async (item: QueueItem) => {
    if (!await runJob(item.id, '/api/admin/enrich-grant', { grantId: item.id }, 'Reading the page')) return
    // The brief is already saved at this point. A classifier failure must not be
    // reported as though the whole re-read failed.
    if (!await classify(item.id, 'Re-tagging from what it says')) {
      toast.error('The page was re-read and the summary updated, but re-tagging failed. Try Re-tag on its own.')
      router.refresh()
      return
    }
    toast.success('Page re-read and tags refreshed')
    router.refresh()
  }, [runJob, classify, router, toast])

  const reClassify = useCallback(async (item: QueueItem) => {
    if (!await classify(item.id, 'Re-tagging')) return
    toast.success('Re-tagged')
    router.refresh()
  }, [classify, router, toast])

  const fixLink = useCallback(async (item: QueueItem) => {
    const next = window.prompt(
      `Application link for "${item.title}"\n\nThe page could not be read, which is usually a wrong or moved URL. Paste the correct one and it will be re-read straight away.`,
      item.applyUrl ?? '',
    )
    if (!next || !next.trim() || next.trim() === item.applyUrl) return

    setBusyId(item.id)
    setBusyLabel('Saving the link')
    // apply_url IS tracked, so this pins — correctly. A URL you typed is a real
    // decision, unlike the tag values Publish deliberately leaves alone.
    const saved = await patch(item.id, {
      apply_url: next.trim(),
      url_status: 'unchecked',
      url_last_checked: null,
      url_quality_score: null,
      url_quality_issues: [],
    }, 'Saving the link')
    setBusyId(null)
    setBusyLabel(null)
    if (!saved) return
    toast.success('Link saved — re-reading')
    await reRead(item)
  }, [patch, reRead, toast])

  /**
   * Take the value the merger refused, on this admin's authority.
   *
   * Goes through the ordinary admin PATCH, so `update-grant` stamps
   * `admin:<email>` and the merger auto-pins it. Pinning is right here and
   * mostly wrong elsewhere: a person reading a named refusal and choosing the
   * proposed value over the stored one IS the deliberate decision pinning exists
   * to record, unlike a form save that writes every field on screen whether or
   * not anyone looked at it.
   */
  const override = useCallback(async (id: string, r: MergeRejection) => {
    setBusyId(id)
    const ok = await patch(id, { [r.field]: r.attempted }, `Overriding ${r.field}`, [r.field])
    setBusyId(null)
    if (!ok) return
    setRefusals(prev => {
      const remaining = (prev[id] ?? []).filter(x => x.field !== r.field)
      const next = { ...prev }
      if (remaining.length) next[id] = remaining
      else delete next[id]
      return next
    })
    toast.success(`${r.field} set to the proposed value, and pinned to you.`)
    router.refresh()
  }, [patch, router, toast])


  /**
   * Reject — the emergency brake, so it may never fail quietly.
   *
   * Every exit from this function now says something. It used to have two
   * silent ones: `if (!reason || !reason.trim()) return` swallowed both a
   * cancelled prompt and an empty reason, and a write that did not land looked
   * identical to one that did. Measured 2026-08-13: Movement for Good Awards
   * was rejected in this UI and stayed `is_active = true`,
   * `pipeline_state = 'published'`, `rejection_reason = null` — public for a
   * further day, with nothing on screen to say the brake had not engaged.
   *
   * A control someone reaches for when something is wrong in public must
   * report its own outcome, both ways.
   */
  const reject = useCallback(async (item: QueueItem) => {
    const reason = window.prompt(
      `Why is "${item.title}" not right for the catalogue?\n\nThis is recorded, so a future pass knows not to re-add it.`,
    )
    // Cancel and empty-reason are different intentions and get different words.
    // Neither may pass without one.
    if (reason === null) {
      toast.info(`Reject cancelled. "${item.title}" is unchanged and still live.`)
      return
    }
    if (!reason.trim()) {
      toast.error('Reject needs a reason, so a future pass knows not to re-add it. Nothing changed.')
      return
    }
    setBusyId(item.id)
    // `expect` is the whole point here: pipeline_state is what actually takes
    // the row out of circulation, so the confirmation below is only allowed to
    // appear once the server confirms it wrote that field.
    const ok = await patch(item.id, {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason: reason.trim(),
    }, 'Rejecting', ['is_active', 'pipeline_state'])
    setBusyId(null)
    if (!ok) return   // patch has already said why
    setDone(d => new Set(d).add(item.id))
    toast.success(`Rejected. "${item.title}" is no longer visible to users, and the reason is recorded.`)
    router.refresh()
  }, [patch, router, toast])

  /**
   * Act on a selected group.
   *
   * Sequential, not parallel: every one of these actions writes through
   * `patch`, which asserts what the server says it applied, and firing thirty
   * of them at once would interleave the busy state and the toasts into
   * something nobody could read. A group of thirty is a few seconds either way.
   *
   * Reports what LANDED, not what was attempted. A bulk action that says
   * "published 30" when the trust ladder refused nine of them is the exact
   * failure the single-row path was rebuilt to stop, and doing it thirty at a
   * time would make it thirty times harder to notice.
   */
  const bulk = useCallback(async (ids: string[], action: 'publish' | 'reread' | 'reject') => {
    const rows = ids
      .map(id => pending.find(i => i.id === id))
      .filter((i): i is QueueItem => Boolean(i))
    let ok = 0
    for (const item of rows) {
      const done = action === 'publish' ? await publish(item)
        : action === 'reject' ? await reject(item)
        : await reRead(item)
      if (done !== false) ok++
    }
    setSelected(new Set())
    const verb = action === 'publish' ? 'published' : action === 'reject' ? 'rejected' : 're-read'
    if (ok === rows.length) toast.success(`${ok} ${verb}.`)
    else toast.error(`${ok} of ${rows.length} ${verb}. The rest did not take — see the messages above.`)
  }, [pending, publish, reject, reRead, toast])

  const rows: QueueItem[] =
    nav === 'liveandwrong' ? liveAndWrong
    : nav === 'new'          ? newArrivals
    : nav === 'unenriched'   ? pending.filter(i => i.needsEnrichment)
    : nav === 'autopublished'? autoPub
    : (sectioned.get(nav) ?? [])

  const navMeta = NAV_META[nav]
  const ids = rows.map(r => r.id)
  const allPicked = ids.length > 0 && ids.every(id => selected.has(id))
  const picked = ids.filter(id => selected.has(id))

  return (
    <main style={{ padding: '30px 24px 80px', maxWidth: 1280, margin: '0 auto' }}>

      <h1 style={{ ...display, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
        Review queue
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 240px) 1fr', gap: 26, alignItems: 'start' }}>

        {/* ── The rail. Sections ARE the navigation. ────────────────────── */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 18 }}>
          <RailItem id="liveandwrong" nav={nav} onGo={go} n={liveAndWrong.length} tone="alert" />

          <div>
            <RailHeading>Not live yet — {byView.length}</RailHeading>
            {SECTIONS.map(sec => (
              <RailItem key={sec.id} id={sec.id} nav={nav} onGo={go} n={sectionCounts[sec.id] ?? 0} />
            ))}
          </div>

          <div>
            <RailHeading>Views</RailHeading>
            <RailItem id="new"           nav={nav} onGo={go} n={newArrivals.length} />
            <RailItem id="unenriched"    nav={nav} onGo={go} n={unenrichedCount} />
            <RailItem id="autopublished" nav={nav} onGo={go} n={autoPubCount} />
          </div>
        </nav>

        {/* ── The body. One section at a time. ──────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...display, fontSize: 17, fontWeight: 500, margin: '0 0 3px' }}>
            {navMeta.label} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{rows.length}</span>
          </h2>
          {/* One short line. Not a paragraph. */}
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 14px', maxWidth: '76ch' }}>
            {navMeta.detail}
          </p>

          {/* Section toolbar: everything that acts on THIS list, and nothing that
              navigates away from it. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            paddingBottom: 12, borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 14,
          }}>
            {rows.length > 0 && (
              <label style={{ ...display, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                <input type="checkbox" checked={allPicked}
                       onChange={() => setSelected(prev => {
                         const next = new Set(prev)
                         if (allPicked) ids.forEach(id => next.delete(id))
                         else ids.forEach(id => next.add(id))
                         return next
                       })} />
                Select all
              </label>
            )}
            {picked.length > 0 && (
              <>
                <span style={{ ...display, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{picked.length} selected</span>
                {nav === 'ready' && <button style={{ ...primaryBtn, ...btnRow }} disabled={busyId !== null} onClick={() => bulk(picked, 'publish')}><Check size={14} strokeWidth={2.5} />Publish {picked.length}</button>}
                {(nav === 'reading' || nav === 'link') && <button style={{ ...secondaryBtn, ...btnRow }} disabled={busyId !== null} onClick={() => bulk(picked, 'reread')}><RefreshCw size={14} strokeWidth={2.25} />Re-read {picked.length}</button>}
                {nav === 'untruthful' && <button style={{ ...dangerBtn, ...btnRow }} disabled={busyId !== null} onClick={() => bulk(picked, 'reject')}><X size={14} strokeWidth={2.5} />Reject {picked.length}</button>}
                <button style={ghostBtn} onClick={() => setSelected(new Set())}>Clear</button>
              </>
            )}

            <span style={{ flex: '1 1 auto' }} />

            <Chip active={sortBy === 'evidence'} onClick={() => setSortBy('evidence')} label="Safest first" n={-1} />
            <Chip active={sortBy === 'newest'}   onClick={() => setSortBy('newest')}   label="Newest first" n={-1} />
            <button
              onClick={() => setFiltersOpen(o => !o)}
              style={{
                ...display, fontSize: 12, fontWeight: 500, cursor: 'pointer', borderRadius: 999,
                padding: '5px 12px', border: '0.5px solid var(--border-subtle)',
                background: (filter || typeFilter) ? 'var(--green-deep)' : 'transparent',
                color: (filter || typeFilter) ? 'var(--green-pale-2)' : 'var(--color-text-secondary)',
              }}
            >Filters{(filter || typeFilter) ? ' · on' : ''}</button>
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setFilter(null) }}
              placeholder="Find a title or funder"
              aria-label="Search the queue by title or funder"
              style={{
                ...display, fontSize: 13, padding: '5px 10px', minWidth: 170,
                border: '0.5px solid var(--border-subtle)', borderRadius: 8,
                background: 'var(--color-surface)', color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {/* The eighteen reason chips, behind a disclosure. They answer a
              different question from the sections and were competing with them
              for the same space. */}
          {filtersOpen && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center',
              paddingBottom: 14, borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 14,
            }}>
              <span style={{ ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Type</span>
              <Chip active={typeFilter === null} onClick={() => { setTypeFilter(null); setSelected(new Set()) }} label="All" n={-1} />
              {FUNDING_TYPES.map(t => (
                <Chip key={t.value} active={typeFilter === t.value}
                      onClick={() => { setTypeFilter(t.value); setSelected(new Set()) }}
                      label={t.label} n={byView.filter(i => i.values.fundingType === t.value).length} />
              ))}
              <span style={{ width: '100%', height: 0 }} />
              <span style={{ ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Reason</span>
              <Chip active={filter === null} onClick={() => setFilter(null)} label="Any" n={-1} />
              {counts.map(([code, { label, n }]) => (
                <Chip key={code} active={filter === code} onClick={() => setFilter(code)} label={label} n={n} />
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
              {q.trim() !== '' ? `Nothing here matches “${q.trim()}”.` : 'Nothing here.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {rows.map(item => (
                <Row key={item.id} item={item} open={openId === item.id} busy={busyId === item.id}
                     selected={selected.has(item.id)}
                     onSelect={(next) => setSelected(prev => {
                       const s2 = new Set(prev)
                       if (next) s2.add(item.id); else s2.delete(item.id)
                       return s2
                     })}
                     onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                     busyLabel={busyLabel} onPublish={() => publish(item)} onReject={() => reject(item)}
                     onRevert={(d) => revertField(item, d)} onSetFundingType={(t) => setFundingType(item, t)}
                     onReRead={() => reRead(item)} onReClassify={() => reClassify(item)}
                     onFixLink={() => fixLink(item)} rejections={refusals[item.id] ?? []}
                     onOverride={(r) => override(item.id, r)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}


/** `n` below zero renders no tally: a sort chip is a mode, not a count, and a
 *  number beside one would read as "how many are sorted". */
function Chip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...display, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: active ? 'var(--green-deep)' : 'var(--bg-pill-neutral)',
        color: active ? 'var(--green-pale-2)' : 'var(--color-text-secondary)',
        border: '0.5px solid transparent', borderRadius: 999,
        padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 7,
      }}
    >
      {label}
      {n >= 0 && (
        <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.72, fontSize: 11.5 }}>{n}</span>
      )}
    </button>
  )
}

// Plain English for the field names. The reviewer is deciding about eligibility,
// not about a column called eligible_structures.
const FIELD_LABEL: Record<string, string> = {
  eligible_structures:  'Eligibility',
  impact_sectors:       'Sectors',
  target_beneficiaries: 'Who it helps',
  amount_min:           'Smallest award',
  amount_max:           'Largest award',
  deadline:             'Deadline',
  funder_brief:         'Summary',
}
const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, ' ')

type Ask = { line: string; primary: 'publish' | 'reread' | 'fixlink'; label: string }

/**
 * The one sentence that tells the reviewer what they are being asked, and the
 * single button that answers it.
 *
 * This exists because the first two versions of this page listed what was WRONG
 * with a row and left the reviewer to work out what to DO about it. "Page
 * unreadable · Link not verified · No amount" is a diagnosis, and a diagnosis is
 * not an instruction. Every row now names its own next action.
 */
function askFor(item: QueueItem): Ask {
  const has = (c: string) => item.reasons.some(r => r.code === c)
  const codes = item.reasons.map(r => r.code)

  // NOTHING BLOCKING AND NOTHING MISSING — SO OFFER THE BUTTON THE SECTION IS
  // NAMED AFTER. "Ready to publish" used to show "Re-read the page" as its green
  // primary action, because askFor ranked absences above the absence of any
  // problem at all. The whole point of the section is the publish button.
  if (item.blockingCodes.length === 0 && !isIncomplete(codes)) {
    return {
      line: item.isActive
        ? 'Nothing on this row is blocking and nothing is missing. Keeping it live needs no further reading.'
        : 'Nothing on this row is blocking and nothing is missing. It can go live as it stands.',
      primary: 'publish',
      label: item.isActive ? 'Looks right, keep it live' : 'Publish it',
    }
  }
  // 141 of 172 rows in this queue are already live, so "Publish" is the wrong
  // word for most of them. It is a confirmation, not a reveal.
  const keep = item.isActive ? 'Looks right, keep it live' : 'Looks right, publish it'
  const reread = 'Re-read the page' as const

  // FIRST, because it is the funder's own words and it outranks everything
  // derived from our own data. This queue used to offer "Looks right, publish
  // it" on a fund whose page said applications were closed, because a tagging
  // diff was ranked above the verification engine's verdict. The primary action
  // is never publish here: a fund nobody can apply for should not be offered to
  // a user, whatever else about the row looks tidy.
  if (has('page_says_delisted')) return {
    line: 'The funder\'s page no longer lists this fund. Re-read to confirm, then reject it, or set it between rounds if it is expected back.',
    primary: 'reread', label: reread,
  }
  if (has('page_says_not_funding')) return {
    line: 'The page this link goes to does not describe funding at all. Fix the link if it points at the wrong page, otherwise reject the row.',
    primary: 'fixlink', label: 'Fix the link',
  }
  if (has('page_says_round_closed')) return {
    line: 'The funder\'s page says this round has closed, quoting a date it states in full. Set it between rounds so we are told when it reopens, or reject it.',
    primary: 'reread', label: reread,
  }

  if (has('no_current_timing')) return {
    line: 'The only date we hold has passed, and there is no current one, so the card tells a user nothing true about when to apply. A re-read picks up the next round.',
    primary: 'reread', label: reread,
  }

  if (has('link_dead')) return {
    line: 'The application link is dead, so anyone who clicks through lands on nothing. Fix the link, or reject the row.',
    primary: 'fixlink', label: 'Fix the link',
  }
  if (has('page_unreadable') || has('no_brief')) return {
    line: 'The funder page could not be read, so everything below was written from memory rather than from the page itself.',
    primary: 'reread', label: reread,
  }
  if (has('quarantined')) return {
    line: 'An earlier check quarantined this row. It needs a fresh read before anything on it can be trusted.',
    primary: 'reread', label: reread,
  }
  if (has('eligibility_missing')) return {
    line: 'No eligibility is recorded, so this fund currently matches nobody. A re-read usually fills it in.',
    primary: 'reread', label: reread,
  }
  if (has('deadline_passed')) return {
    line: 'The deadline has passed. Re-read to pick up the next round, or reject it if the fund has closed for good.',
    primary: 'reread', label: reread,
  }
  if (has('amount_pot_suspected')) return {
    line: 'The amount may be the whole fund rather than what one applicant can ask for. Check the page, then keep or re-read.',
    primary: 'reread', label: reread,
  }
  // Amounts are gap-fill only: enrich-grant writes one when the stored value is
  // NULL and otherwise raises this flag instead of overwriting. So a re-read
  // will NOT correct the figure, and the line has to say so or it sends you
  // round a loop that cannot change anything.
  if (has('amount_under_stated')) return {
    line: 'The page names a larger amount than the one stored. A re-read will not change it, because a stored amount is never overwritten automatically. Edit the figure by hand if the page is right, otherwise keep the row.',
    primary: 'publish', label: keep,
  }
  if (has('no_amount') || has('no_deadline') || has('amount_zero') ||
      has('sectors_missing') || has('amount_ungrounded') || has('amount_inverted')) return {
    line: 'Key details are missing or look wrong, so this will match poorly. A re-read is the usual fix.',
    primary: 'reread', label: reread,
  }
  if (has('beneficiaries_generic_only')) return {
    line: 'Only generic beneficiaries are tagged, which makes the match vague. A re-read often sharpens it.',
    primary: 'reread', label: reread,
  }
  if (has('link_unverified')) return {
    line: 'The link has not been checked lately. Open it to confirm it still works, then keep the row.',
    primary: 'publish', label: keep,
  }
  // Informational, but it must not reach the "nothing looks wrong" fallback while
  // a "Date already past" chip is on screen. The deadline is right; the prose is
  // stale, and saying so is the difference between a warning and a contradiction.
  if (has('stale_dates')) return {
    line: 'The deadline on this row is current, but the write-up still quotes an older date. Keep it, or re-read to tidy the wording.',
    primary: 'publish', label: keep,
  }
  if (item.diffs.length > 0) return {
    line: 'A re-read changed the tagging. Keep the change, or put the old value back.',
    primary: 'publish', label: keep,
  }
  return { line: 'Nothing looks wrong with this one. Give it a glance and keep it.', primary: 'publish', label: keep }
}

/**
 * What a job proposed, what stopped it, and the one button that resolves it.
 *
 * The failure this replaces: a re-read on Movement for Good Awards computed the
 * right draw dates, had the write refused, and said nothing. The screen kept
 * showing the old value and there was no way to tell a refusal from a no-op.
 *
 * Deliberately states the trust numbers. "Held by ai_enrich:v2" alone does not
 * tell you whether the thing holding it is better evidence than the thing being
 * refused; 60 against 25 does.
 */
function RefusalNotice({
  rejections, busy, onOverride,
}: {
  rejections: MergeRejection[]
  busy: boolean
  onOverride: (r: MergeRejection) => void
}) {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return 'nothing'
    if (typeof v === 'object') return '(too large to show)'
    return String(v)
  }
  return (
    <div style={{
      background: 'var(--coral-pale)', color: 'var(--coral-deep)',
      border: '0.5px solid rgba(153,60,29,0.25)', borderRadius: 'var(--radius-card)',
      padding: '10px 12px', marginTop: 10, fontSize: 12.5,
    }}>
      <strong style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12 }}>
        {rejections.length === 1 ? 'One field was not saved' : `${rejections.length} fields were not saved`}
      </strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rejections.map(r => {
          // An omitted value cannot be replayed, so the override is withheld
          // rather than offered and then failing.
          //
          // The test is "did compactValue keep this verbatim", NOT "is this a
          // scalar". A short array of primitives survives intact, and
          // eligible_structures is exactly that — the field most worth
          // overriding, since a narrowed structure list is what hides a fund
          // from the organisations that can apply. Excluding every array would
          // have withheld the button from the case it matters most for.
          // compactValue's replacement marker is a plain object, never an array,
          // so Array.isArray is a sound discriminator.
          const replayable =
            r.attempted === null || Array.isArray(r.attempted) || typeof r.attempted !== 'object'
          return (
            <li key={r.field}>
              <code>{r.field}</code> stayed as it was. Proposed <strong>{fmt(r.attempted)}</strong>.
              {r.blockedBy ? (
                <> Held by <code>{r.blockedBy.source}</code> (trust {r.blockedBy.trust}) since{' '}
                  {r.blockedBy.set_at.slice(0, 10)}
                  {r.blockedBy.pinned ? ', pinned' : ''}; this write had trust {r.attemptedTrust}.</>
              ) : (
                <> Refused as {r.reason}.</>
              )}
              {replayable && (
                <button
                  onClick={() => onOverride(r)}
                  disabled={busy}
                  style={{
                    marginLeft: 8, borderRadius: 6, border: 'none', cursor: busy ? 'default' : 'pointer',
                    background: 'var(--coral-deep)', color: '#fff',
                    fontFamily: 'var(--font-space-grotesk)', fontSize: 11, padding: '3px 9px',
                  }}
                >
                  Use the proposed value
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Row({
  item, open, busy, busyLabel, onToggle, onPublish, onReject, onRevert, onSetFundingType,
  onReRead, onReClassify, onFixLink, rejections, onOverride, selected, onSelect,
}: {
  item: QueueItem
  /** Undefined outside the sectioned view, where bulk select does not apply. */
  selected?: boolean
  onSelect?: (next: boolean) => void
  open: boolean
  busy: boolean
  busyLabel: string | null
  onToggle: () => void
  onPublish: () => void
  onReject: () => void
  onRevert: (d: FieldDiff) => void
  onSetFundingType: (fundingType: string) => void
  onReRead: () => void
  onReClassify: () => void
  onFixLink: () => void
  rejections: MergeRejection[]
  onOverride: (r: MergeRejection) => void
}) {
  const [preview, setPreview] = useState(false)
  const worst = item.reasons.reduce<string>((acc, r) => {
    if (acc === 'critical' || r.severity === 'critical') return 'critical'
    if (acc === 'check' || r.severity === 'check') return 'check'
    return 'changed'
  }, 'changed')
  const sev = SEV_STYLE[worst] ?? SEV_STYLE.changed

  const ask = askFor(item)
  const run = ask.primary === 'publish' ? onPublish : ask.primary === 'fixlink' ? onFixLink : onReRead
  // The ask line already explains the headline problem, and the diff is shown in
  // full below it, so repeating both as chips is noise.
  /**
   * ONE CAUSE ON THE CARD, THE CONSEQUENCES BEHIND DETAILS.
   *
   * Charity Bank rendered seven chips — never read, never enriched, link
   * unverified, no amount, no deadline, no eligibility, no sectors — which is
   * one fact and six things true only because of it. The ask line above already
   * states the cause and offers the button that resolves it, so repeating the
   * six is noise sitting between the reviewer and the decision.
   *
   * They are collapsed, never dropped: a count remains, and opening the row
   * shows them in full.
   */
  const rootCause = rootCauseOf(item.reasons.map(r => r.code))
  const collapsedCodes = new Set(explainedBy(rootCause, item.reasons.map(r => r.code)))
  const allReasons = item.reasons.filter(r => r.code !== 'tags_changed')
  const otherReasons = allReasons.filter(r => !collapsedCodes.has(r.code))
  const collapsedCount = allReasons.length - otherReasons.length
  const shownDiffs = item.diffs.slice(0, 2)
  const moreDiffs = item.diffs.length - shownDiffs.length

  return (
    <article style={{
      background: '#fff', border: '0.5px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: '4px 1fr',
    }}>
      <div style={{ background: sev.edge }} />
      <div style={{ padding: '14px 17px', minWidth: 0 }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9 }}>
            {/* Only rendered in the sectioned view. Grouping without a way to act
                on a group is just tidier scrolling. */}
            {onSelect && (
              <input
                type="checkbox"
                checked={selected === true}
                onChange={e => onSelect(e.target.checked)}
                aria-label={`Select ${item.title}`}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
            )}
            <div style={{ minWidth: 0 }}>
            {/* Straight through to the full record. The queue deliberately shows
                only what is needed to decide; everything else lives on detail. */}
            <a
              href={`/dashboard/admin/grants/${item.id}`}
              style={{ ...display, fontWeight: 500, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--color-text-primary)', textDecoration: 'none' }}
            >
              {item.title}
            </a>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 12.5 }}>{item.funder}</div>
            </div>
          </div>
          {/* Where it came from and when. Every other pill on this card says
              what is wrong with the row; these two say where it came from,
              which is the only intake signal on the screen. */}
          {item.firstSeenAt && (
            <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-tertiary)">
              {ORIGIN_LABEL[arrivalOrigin(item.source)]} ·{' '}
              {new Date(item.firstSeenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Pill>
          )}
          {/* The sort axis, named. Without it the order looks arbitrary and the
              "accept down to a line and stop where you get uneasy" reading —
              which is the whole point of sorting by evidence — is invisible. */}
          <Pill
            bg={EVIDENCE_TONE[evidenceRank(item.evidence)].bg}
            ink={EVIDENCE_TONE[evidenceRank(item.evidence)].ink}
          >
            {EVIDENCE_RANK_LABEL[evidenceRank(item.evidence)]}
          </Pill>
          {/* Funding type as a LABEL on the card, so the tab a row lands in is
              visible without grouping the screen by it. */}
          {item.values.fundingType && (
            <Pill
              bg={(TYPE_TONE[item.values.fundingType] ?? TYPE_TONE.grant).bg}
              ink={(TYPE_TONE[item.values.fundingType] ?? TYPE_TONE.grant).ink}
            >
              {FUNDING_TYPES.find(t => t.value === item.values.fundingType)?.label ?? item.values.fundingType}
            </Pill>
          )}
          {item.autoPublishedAt && (
            <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-secondary)">
              Gate published {new Date(item.autoPublishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Pill>
          )}
          {item.isActive
            ? <Pill bg="var(--coral-pale)" ink="var(--coral-deep)">Live to users</Pill>
            : <Pill bg="var(--bg-pill-neutral)" ink="var(--color-text-secondary)">Not live</Pill>}
        </div>

        {/* What you are being asked. */}
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-primary)', margin: '11px 0 0', maxWidth: '78ch' }}>
          {ask.line}
        </p>

        {/* What this row actually is. Essential when the funder link points at a
            page covering several of our rows: it is the only thing on screen that
            distinguishes "JRCT — Rights & Justice" from "JRCT — Sustainable
            Future", and without it a correct tag change reads as a wrong one. */}
        {item.brief?.whatTheyFund && (
          <p style={{
            fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-text-secondary)',
            margin: '8px 0 0', maxWidth: '84ch',
          }}>
            {item.brief.whatTheyFund}
          </p>
        )}

        {/* The evidence for that ask, on the face of the card. "a re-read changed
            1 field" told the reviewer nothing without saying which field. */}
        {shownDiffs.length > 0 && (
          <div style={{
            marginTop: 10, border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-input)', overflow: 'hidden',
          }}>
            {shownDiffs.map((d, i) => (
              <div key={d.field} style={{
                display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center',
                padding: '9px 12px', background: 'var(--cream-1)',
                borderTop: i === 0 ? undefined : '0.5px solid var(--border-light)',
              }}>
                <span style={{ ...display, fontSize: 11.5, fontWeight: 500, minWidth: 92, color: 'var(--color-text-secondary)' }}>
                  {fieldLabel(d.field)}
                </span>
                <span style={{ fontSize: 12.5, flex: '1 1 220px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {d.removed.length > 0 && (
                    <span style={{ color: 'var(--coral-deep)' }}>
                      took away <b style={{ fontWeight: 600 }}>{d.removed.join(', ')}</b>
                    </span>
                  )}
                  {d.added.length > 0 && (
                    <span style={{ color: 'var(--blue-deep)' }}>
                      added <b style={{ fontWeight: 600 }}>{d.added.join(', ')}</b>
                    </span>
                  )}
                </span>
                <button onClick={() => onRevert(d)} disabled={busy} style={miniBtn}>
                  Put it back
                </button>
              </div>
            ))}
            {moreDiffs > 0 && (
              <div style={{
                padding: '7px 12px', fontSize: 11.5, color: 'var(--color-text-tertiary)',
                background: 'var(--cream-1)', borderTop: '0.5px solid var(--border-light)',
              }}>
                and {moreDiffs} more {moreDiffs === 1 ? 'change' : 'changes'} — open the details to see them
              </div>
            )}
          </div>
        )}

        {(otherReasons.length > 0 || collapsedCount > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'baseline' }}>
            {collapsedCount > 0 && (
              <button
                onClick={onToggle}
                style={{
                  ...display, fontSize: 11.5, padding: '3px 9px', cursor: 'pointer',
                  borderRadius: 'var(--radius-badge, 8px)', border: '0.5px solid var(--border-subtle)',
                  background: 'transparent', color: 'var(--color-text-tertiary)',
                }}
              >
                {collapsedCount} more {collapsedCount === 1 ? 'follows' : 'follow'} from this
              </button>
            )}
            {otherReasons.map(r => {
              const s = SEV_STYLE[r.severity] ?? SEV_STYLE.changed
              return (
                <span key={r.code} style={{
                  fontSize: 11.5, borderRadius: 'var(--radius-badge, 8px)', padding: '3px 9px',
                  background: s.bg, color: s.ink, display: 'inline-flex', gap: 6, alignItems: 'baseline',
                }}>
                  <b style={{ ...display, fontWeight: 700, fontSize: 10.5 }}>{r.label}</b>
                  <span style={{ opacity: 0.9 }}>{r.detail}</span>
                </span>
              )
            })}
          </div>
        )}

        {/* Always visible. The previous version put every action behind an
            un-signposted click on the title, so the page read as a list of
            problems with no way to act on any of them. */}
        {/* FIVE IDENTICAL WHITE BUTTONS ASKED THE READER TO PARSE FIVE LABELS.
            Two of them CHANGE the row and two only OPEN something to look at,
            which is the distinction that decides whether a click is safe. They
            are now separated by weight — solid outline for the two that act,
            quiet ghost for the two that show — with an icon each so the shape is
            recognisable before the word is read. A thin rule marks the seam. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 13 }}>
          <button onClick={run} disabled={busy} style={{ ...primaryBtn, ...btnRow }}>
            {ask.primary === 'publish' ? <Check size={14} strokeWidth={2.5} />
              : ask.primary === 'fixlink' ? <Link2 size={14} strokeWidth={2.5} />
              : <RefreshCw size={14} strokeWidth={2.5} />}
            {busy ? `${busyLabel ?? 'Working'}…` : ask.label}
          </button>
          {ask.primary !== 'reread' && (
            <button onClick={onReRead} disabled={busy} style={{ ...secondaryBtn, ...btnRow }}>
              <RefreshCw size={14} strokeWidth={2.25} />Re-read the page
            </button>
          )}
          {ask.primary !== 'fixlink' && (
            <button onClick={onFixLink} disabled={busy} style={{ ...secondaryBtn, ...btnRow }}>
              <Link2 size={14} strokeWidth={2.25} />Fix the link
            </button>
          )}
          <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)', margin: '0 2px' }} />
          {item.applyUrl && (
            <a href={item.applyUrl} target="_blank" rel="noopener noreferrer" style={{ ...lookBtn, ...btnRow }}>
              <ExternalLink size={14} strokeWidth={2.25} />Open funder page
            </a>
          )}
          {/* The genuine user-facing component against the genuine public API,
              the same way the Grant detail page does it. Deciding "is this good
              enough to show someone" without being able to see what they get
              meant leaving the queue for the detail page on every row. */}
          <button onClick={() => setPreview(true)} disabled={busy} style={{ ...lookBtn, ...btnRow }}>
            <Eye size={14} strokeWidth={2.25} />See what a user sees
          </button>
          {item.linkSharedWith > 0 && (
            <span style={{
              fontSize: 11.5, lineHeight: 1.4, color: 'var(--amber-deep)', background: 'var(--amber-pale)',
              borderRadius: 'var(--radius-badge, 8px)', padding: '5px 10px', maxWidth: '46ch',
            }}>
              That page also covers {item.linkSharedWith} other {item.linkSharedWith === 1 ? 'fund' : 'funds'} we
              list, so it will not show you this one on its own. Judge it against the summary below,
              not the page as a whole.
            </span>
          )}
          <span style={{ flex: '1 1 auto' }} />
          <button onClick={onToggle} style={ghostBtn} aria-expanded={open}>
            {open ? 'Hide details' : 'Details'} {open ? '⌃' : '⌄'}
          </button>
          <button onClick={onReject} disabled={busy} style={{ ...dangerBtn, ...btnRow }}>
            <X size={14} strokeWidth={2.5} />Reject
          </button>
        </div>

        {/* Outside `open`, on purpose. A refused write means the row is showing
            a value the machine has already disagreed with, which is not a detail
            to go looking for. */}
        {rejections.length > 0 && (
          <RefusalNotice rejections={rejections} busy={busy} onOverride={onOverride} />
        )}

        {open && (
          <div style={{
            marginTop: 14, borderTop: '0.5px solid var(--border-light)', paddingTop: 14,
            display: 'grid', gap: 14,
          }}>
            {item.diffs.length > 0 && (
              <div>
                <SectionLabel>Every change from the last re-read</SectionLabel>
                <div style={{ border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', overflow: 'hidden' }}>
                  {item.diffs.map((d, i) => (
                    <div key={d.field} style={{
                      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 12, alignItems: 'center',
                      padding: '9px 12px', background: '#fff',
                      borderTop: i === 0 ? undefined : '0.5px solid var(--border-light)',
                    }}>
                      <span style={{ ...display, fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{fieldLabel(d.field)}</span>
                      <div style={{ fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {d.removed.length > 0 && (
                          <span style={{ color: 'var(--coral-deep)', fontWeight: 600 }}>
                            took away: {d.removed.join(', ')}
                          </span>
                        )}
                        {d.added.length > 0 && (
                          <span style={{ color: 'var(--blue-deep)', fontWeight: 500 }}>
                            added: {d.added.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onRevert(d)}
                        disabled={busy}
                        style={miniBtn}
                      >
                        Put it back
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', margin: '7px 0 0' }}>
                  Keeping these accepts them as they stand and writes nothing, so they can still be
                  improved automatically later. Putting one back is recorded as your decision and
                  will not be overwritten.
                </p>
              </div>
            )}

            {/* What a page ACTUALLY said, above everything derived from our own
                data. Rendered outside the `item.brief` guard because a row with
                no brief can still have been read. */}
            <div>
              <SectionLabel>Checked against the funder page</SectionLabel>
              <EvidencePanel evidence={item.evidence} />
            </div>

            {item.brief && (
              <div>
                {/* Renamed from "Evidence from the funder page": these snippets
                    come from the enrichment brief, not from a verification read,
                    and two blocks both called evidence on the one screen that
                    now distinguishes them was the wrong word in the wrong place. */}
                <SectionLabel>From the funder brief</SectionLabel>
                {item.brief.source === 'knowledge_fallback' && (
                  <p style={{
                    fontSize: 12.5, background: 'var(--coral-pale)', color: 'var(--coral-deep)',
                    borderRadius: 'var(--radius-input)', padding: '9px 12px', margin: '0 0 9px',
                  }}>
                    The funder&rsquo;s page could not be read, so this was written from memory.
                    Amounts and dates were deliberately dropped.
                  </p>
                )}
                {item.brief.source === 'desk_research' && (
                  <p style={{
                    fontSize: 12.5, background: 'var(--cream)', color: 'var(--mid)',
                    borderRadius: 'var(--radius-input)', padding: '9px 12px', margin: '0 0 9px',
                  }}>
                    Desk research, not a full enrichment. Priorities, typical award, exclusions
                    and decision timeline are still missing. Re-enrich to complete it.
                  </p>
                )}
                {(['who_can_apply', 'typical_award', 'eligible_structures'] as const).map(k => {
                  const c = item.brief?.citations[k]
                  if (!c) return null
                  return (
                    <div key={k} style={{
                      background: 'var(--cream-1)', borderRadius: 'var(--radius-input)',
                      padding: '11px 13px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 7,
                    }}>
                      <div style={{ ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
                        {k.replace(/_/g, ' ')}
                      </div>
                      <q>{c.snippet}</q>
                      <div style={{ marginTop: 7, fontSize: 11 }}>
                        <span style={{
                          ...display, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                          textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px',
                          background: c.confidence === 'high' ? 'var(--green-pale-1)' : c.confidence === 'low' ? 'var(--coral-pale)' : 'var(--amber-pale)',
                          color: c.confidence === 'high' ? 'var(--green-text-deep)' : c.confidence === 'low' ? 'var(--coral-deep)' : 'var(--amber-deep)',
                        }}>{c.confidence} confidence</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div>
              <SectionLabel>What is recorded now</SectionLabel>
              <div style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
                <Val k="Amount">{gbp(item.values.amountMin)} to {gbp(item.values.amountMax)}</Val>
                <Val k="Deadline">{item.values.deadline ?? (item.values.isRolling ? 'Rolling' : 'none')}</Val>
                <Val k="Eligibility">{item.values.structures.join(', ') || 'none'}</Val>
                <Val k="Sectors">{item.values.sectors.join(', ') || 'none'}</Val>
                <Val k="Funding type">
                  <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong style={{ ...display, fontSize: 12 }}>
                      {FUNDING_TYPES.find(t => t.value === item.values.fundingType)?.label
                        ?? item.values.fundingType ?? 'none'}
                    </strong>
                    {FUNDING_TYPES.filter(t => t.value !== item.values.fundingType).map(t => (
                      <button
                        key={t.value}
                        onClick={() => onSetFundingType(t.value)}
                        disabled={busy}
                        style={miniBtn}
                        title={`Record this as ${t.label} and pin it`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </span>
                </Val>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button onClick={onReClassify} disabled={busy} style={secondaryBtn}>
                Re-tag from the text already stored
              </button>
              <span style={{ ...display, fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
                Faster than a re-read, but it cannot find anything the stored page does not already say.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Keyed on external_id first: grants-normalise sets id = external_id ?? id,
          so a scraper row fetched by its UUID would 404 against the public API. */}
      {preview && (
        <GrantDetailModal
          grantId={item.externalId ?? item.id}
          onClose={() => setPreview(false)}
        />
      )}
    </article>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 8px',
    }}>{children}</div>
  )
}

function Val({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 96 }}>{k}</code>
      <span>{children}</span>
    </div>
  )
}

function Pill({ children, bg, ink, mono }: { children: React.ReactNode; bg: string; ink: string; mono?: boolean }) {
  return (
    <span style={{
      ...(mono ? {} : display), fontSize: mono ? 10.5 : 11, fontWeight: 500,
      borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap', background: bg, color: ink,
    }}>{children}</span>
  )
}

const miniBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 11.5, fontWeight: 500,
  borderRadius: 8, border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-secondary)', padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
}
const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'var(--green-lime)', color: 'var(--green-deep)',
}
const secondaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid var(--border-subtle)', background: '#fff',
  color: 'var(--color-text-primary)', textDecoration: 'none',
}
const ghostBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 500,
  borderRadius: 'var(--radius-input)', padding: '8px 12px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'transparent',
  color: 'var(--color-text-secondary)',
}
/** Icon and label on one baseline. Applied to every action button so the icon
 *  never shifts the text off centre. */
const btnRow: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1,
}
/**
 * The "just show me" variant.
 *
 * Opening the funder's page and previewing what a user sees change nothing, and
 * rendering them in the same solid outline as Re-read and Fix the link made all
 * four look equally consequential. Quieter, so the two buttons that WRITE stand
 * out from the two that only look.
 */
const lookBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 500,
  borderRadius: 'var(--radius-input)', padding: '8px 13px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'var(--bg-pill-neutral)',
  color: 'var(--color-text-secondary)', textDecoration: 'none',
}
const dangerBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'transparent', color: 'var(--coral-deep)',
}


function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
      padding: '0 0 6px 10px',
    }}>{children}</div>
  )
}

/** One rail entry: name, count, and the one line that says what it is. */
function RailItem({ id, nav, onGo, n, tone }: {
  id: NavId; nav: NavId; onGo: (id: NavId) => void; n: number; tone?: 'alert'
}) {
  const active = nav === id
  const alert = tone === 'alert' && n > 0
  const meta = NAV_META[id]
  return (
    <button
      onClick={() => onGo(id)}
      aria-current={active ? 'page' : undefined}
      style={{
        ...display, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        border: 0, borderRadius: 10, padding: '7px 10px', marginBottom: 2,
        background: active ? 'var(--green-deep)' : 'transparent',
        color: active ? 'var(--green-pale-2)' : alert ? 'var(--coral-deep)' : 'var(--color-text-primary)',
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, fontWeight: 500 }}>
        <span>{meta.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{n}</span>
      </span>
    </button>
  )
}
