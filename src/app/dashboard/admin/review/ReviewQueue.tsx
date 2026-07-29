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
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import type { ReviewReason, FieldDiff } from '@/lib/admin/review-reasons'

export type QueueItem = {
  /** Brief is a stub (or absent) — drives the "Needs enrichment" view. */
  needsEnrichment?: boolean
  id: string
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
  diffs: FieldDiff[]
  brief: {
    source: string | null
    whoCanApply: string | null
    typicalAward: string | null
    whatTheyFund: string | null
    citations: Record<string, { snippet: string; confidence: string } | null>
  } | null
  values: {
    amountMin: number | null
    amountMax: number | null
    deadline: string | null
    isRolling: boolean
    structures: string[]
    sectors: string[]
  }
}

const SEV_STYLE: Record<string, { bg: string; ink: string; edge: string }> = {
  critical: { bg: 'var(--coral-pale)', ink: 'var(--coral-deep)', edge: 'var(--coral-saturated)' },
  check:    { bg: 'var(--amber-pale)', ink: 'var(--amber-deep)', edge: 'var(--amber-saturated)' },
  changed:  { bg: 'var(--blue-pale)',  ink: 'var(--blue-deep)',  edge: 'var(--blue-saturated)' },
}

const display = { fontFamily: 'var(--font-space-grotesk)' } as const
const gbp = (n: number | null) => (n === null ? '—' : `£${n.toLocaleString('en-GB')}`)

export function ReviewQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter()
  const toast = useToast()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string | null>(null)
  // Which rows to show, by whether users can currently see them.
  //   'hidden' is what the old Grant Manager called Needs Review: rows not yet
  //   in front of anyone, where a decision is genuinely pending.
  //   'live' is the opposite and the more urgent half — those are in front of
  //   users right now, so anything wrong with them is wrong in public.
  const [view, setView] = useState<'all' | 'live' | 'hidden' | 'unenriched'>('all')

  const live = useMemo(() => items.filter(i => !done.has(i.id)), [items, done])

  // 'unenriched' cuts across live/hidden: a published row with a stub brief is
  // the case that had no home before — it is not awaiting review, so it never
  // appeared here, and the only way to enrich it was the old Grant Manager.
  const byView =
    view === 'all'        ? live
    : view === 'unenriched' ? live.filter(i => i.needsEnrichment)
    : live.filter(i => (view === 'live' ? i.isActive : !i.isActive))

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

  const shown = filter ? byView.filter(i => i.reasons.some(r => r.code === filter)) : byView
  const liveToUsers = live.filter(i => i.isActive).length
  const notLiveCount = live.length - liveToUsers
  const unenrichedCount = live.filter(i => i.needsEnrichment).length
  const attentionCount = shown.filter(i => i.gateOutcome === 'attention').length

  /** Single place every write goes through, so a failure can never look like success. */
  const patch = useCallback(async (
    id: string,
    fields: Record<string, unknown>,
    what: string,
  ): Promise<boolean> => {
    const res = await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(`${what} failed: ${j.error ?? `HTTP ${res.status}`}`)
      return false
    }
    const j = await res.json().catch(() => ({})) as { rejected?: { field: string; reason: string }[] }
    // A write the trust ladder refused is NOT a success. The old screen counted
    // it as one and the row simply did not change, with nothing said.
    if (j.rejected?.length) {
      const pinnedFields = j.rejected.filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinnedFields.length) {
        toast.error(`${what}: ${pinnedFields.join(', ')} is pinned to an earlier admin decision and was not changed.`)
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
    const ok = await patch(item.id, { is_active: true, pipeline_state: 'published' }, 'Publishing')
    setBusyId(null)
    if (!ok) return
    setDone(d => new Set(d).add(item.id))
    toast.success(`Published ${item.title}`)
    router.refresh()
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
      const j = await res.json().catch(() => ({})) as { rejected?: { field: string; reason: string }[] }
      const pinned = (j.rejected ?? []).filter(r => r.reason === 'pinned').map(r => r.field)
      if (pinned.length) {
        toast.error(`${label} ran, but ${pinned.join(', ')} is pinned to an earlier decision and did not change.`)
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

  const reject = useCallback(async (item: QueueItem) => {
    const reason = window.prompt(
      `Why is "${item.title}" not right for the catalogue?\n\nThis is recorded, so a future pass knows not to re-add it.`,
    )
    if (!reason || !reason.trim()) return
    setBusyId(item.id)
    const ok = await patch(item.id, {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason: reason.trim(),
    }, 'Rejecting')
    setBusyId(null)
    if (!ok) return
    setDone(d => new Set(d).add(item.id))
    toast.success('Rejected, with the reason recorded')
    router.refresh()
  }, [patch, router, toast])

  return (
    <main style={{ padding: '30px 24px 80px', maxWidth: 1180, margin: '0 auto' }}>

      <h1 style={{ ...display, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 5px' }}>
        Review queue
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 22px', maxWidth: '70ch' }}>
        Start at the top. Those are the ones closest to finished, so a few minutes here clears real
        rows. Each one tells you what it needs and carries the button that does it, so you never
        have to work out the next step yourself.
      </p>

      {/* The honest count. The old screen's header asserted these were not
          visible to users while its query never filtered on that. */}
      {/* Hidden only when you are looking at rows nobody can see — telling you
          how many are visible while you filter to the invisible ones is noise. */}
      {liveToUsers > 0 && view !== 'hidden' && (
        <div style={{
          display: 'flex', gap: 11, alignItems: 'flex-start',
          background: 'var(--coral-pale)', color: 'var(--coral-deep)',
          borderRadius: 'var(--radius-card)', padding: '13px 16px',
          marginBottom: 22, fontSize: 13, lineHeight: 1.45,
        }}>
          <span style={{ ...display, fontWeight: 700 }}>!</span>
          <span>
            <strong style={{ ...display, fontWeight: 700 }}>
              {liveToUsers} of these {live.length} are already visible to users.
            </strong>{' '}
            Publishing confirms what people can see rather than revealing it for the first time.
            {attentionCount > 0 && (
              <>
                {' '}
                <strong style={{ ...display, fontWeight: 700 }}>
                  {attentionCount} of them state something a user could be misled by.
                </strong>{' '}
                Those are listed first. Nothing has been taken down automatically, because
                most were flagged for showing a fund to fewer organisations than it accepts,
                and hiding it entirely would be the bigger error.
              </>
            )}
          </span>
        </div>
      )}

      {/* Whether users can see it, chosen first — it changes what the reason
          counts below even mean. "Not live yet" is the old Needs Review. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center',
        paddingBottom: 12, marginBottom: 10,
      }}>
        <span style={{
          ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginRight: 2,
        }}>Show</span>
        <Chip active={view === 'all'}    onClick={() => { setView('all'); setFilter(null) }}    label="Everything"   n={live.length} />
        <Chip active={view === 'live'}   onClick={() => { setView('live'); setFilter(null) }}   label="Live to users" n={liveToUsers} />
        <Chip active={view === 'hidden'} onClick={() => { setView('hidden'); setFilter(null) }} label="Not live yet"  n={notLiveCount} />
        {/* Cuts across the other three. A published row with a stub brief is not
            "awaiting review", so it never appeared in this queue at all and the
            only way to enrich it was the old Grant Manager. Use "Re-read the
            page" on these — it runs enrich then classify, in that order. */}
        <Chip active={view === 'unenriched'} onClick={() => { setView('unenriched'); setFilter(null) }} label="Needs enrichment" n={unenrichedCount} />
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center',
        paddingBottom: 12, borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 16,
      }}>
        <span style={{
          ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginRight: 2,
        }}>Why held</span>
        <Chip active={filter === null} onClick={() => setFilter(null)} label="All" n={byView.length} />
        {counts.map(([code, { label, n }]) => (
          <Chip key={code} active={filter === code} onClick={() => setFilter(code)} label={label} n={n} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          {live.length === 0
            ? 'Nothing waiting. The queue is genuinely empty.'
            : 'No rows match that filter.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {shown.map((item, i) => (
            <Fragment key={item.id}>
              {/* Band headings, drawn where the list changes character rather
                  than as a count in a corner. The first band is live and wrong;
                  everything after it is invisible to users, so the cost of
                  leaving it is a delay rather than a person misled. */}
              {i === 0 && item.gateOutcome === 'attention' && (
                <BandHeading
                  label="Live to users, and wrong"
                  detail="People can see these now. Fixing one changes what they see today."
                />
              )}
              {i > 0 && shown[i - 1].gateOutcome === 'attention' && item.gateOutcome !== 'attention' && (
                <BandHeading
                  label="Not visible to users"
                  detail="Nobody can see these yet, so nothing here is misleading anyone. Closest to finished first."
                />
              )}
              <Row
                item={item}
                open={openId === item.id}
                busy={busyId === item.id}
                onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                busyLabel={busyLabel}
                onPublish={() => publish(item)}
                onReject={() => reject(item)}
                onRevert={(d) => revertField(item, d)}
                onReRead={() => reRead(item)}
                onReClassify={() => reClassify(item)}
                onFixLink={() => fixLink(item)}
              />
            </Fragment>
          ))}
        </div>
      )}
    </main>
  )
}

/**
 * Divides the list where its character changes.
 *
 * The queue used to be one undifferentiated run sorted by how nearly finished
 * each row was, which quietly equated "quick to close" with "worth doing".
 * A row nobody can see is a delay; a row everybody can see that states
 * something wrong is a person being misled. Those deserve to look different.
 */
function BandHeading({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 9,
      marginTop: 6, marginBottom: 1, paddingBottom: 7,
      borderBottom: '0.5px solid var(--border-subtle)',
    }}>
      <span style={{
        ...display, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
      }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        {detail}
      </span>
    </div>
  )
}

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
      <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.72, fontSize: 11.5 }}>{n}</span>
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
  // 141 of 172 rows in this queue are already live, so "Publish" is the wrong
  // word for most of them. It is a confirmation, not a reveal.
  const keep = item.isActive ? 'Looks right, keep it live' : 'Looks right, publish it'
  const reread = 'Re-read the page' as const

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
  if (item.diffs.length > 0) return {
    line: 'A re-read changed the tagging. Keep the change, or put the old value back.',
    primary: 'publish', label: keep,
  }
  return { line: 'Nothing looks wrong with this one. Give it a glance and keep it.', primary: 'publish', label: keep }
}

function Row({
  item, open, busy, busyLabel, onToggle, onPublish, onReject, onRevert,
  onReRead, onReClassify, onFixLink,
}: {
  item: QueueItem
  open: boolean
  busy: boolean
  busyLabel: string | null
  onToggle: () => void
  onPublish: () => void
  onReject: () => void
  onRevert: (d: FieldDiff) => void
  onReRead: () => void
  onReClassify: () => void
  onFixLink: () => void
}) {
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
  const otherReasons = item.reasons.filter(r => r.code !== 'tags_changed')
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

        {otherReasons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 13 }}>
          <button onClick={run} disabled={busy} style={primaryBtn}>
            {busy ? `${busyLabel ?? 'Working'}…` : ask.label}
          </button>
          {ask.primary !== 'reread' && (
            <button onClick={onReRead} disabled={busy} style={secondaryBtn}>Re-read the page</button>
          )}
          {ask.primary !== 'fixlink' && (
            <button onClick={onFixLink} disabled={busy} style={secondaryBtn}>Fix the link</button>
          )}
          {item.applyUrl && (
            <a href={item.applyUrl} target="_blank" rel="noopener noreferrer" style={secondaryBtn}>
              Open funder page
            </a>
          )}
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
          <button onClick={onReject} disabled={busy} style={dangerBtn}>Reject</button>
        </div>

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

            {item.brief && (
              <div>
                <SectionLabel>Evidence from the funder page</SectionLabel>
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
const dangerBtn: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
  borderRadius: 'var(--radius-input)', padding: '8px 16px', cursor: 'pointer',
  border: '0.5px solid transparent', background: 'transparent', color: 'var(--coral-deep)',
}
