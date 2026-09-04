'use client'

import { useState, useRef } from 'react'
import { CARD_LINK } from './card-link'
import { FUNDING_TYPE_COLOUR, TYPE_NEUTRAL } from '@/lib/funding-type-colours'

/**
 * The Matches card, with the funding-type filter.
 *
 * A client component because page.tsx is an async server component and the
 * tabs have to flip synchronously. Every scope is pre-scored and passed in as
 * props, so flipping issues NO network request and there is no loading state
 * to design. Nothing here fetches.
 */

export type MatchRow = {
  id: string
  title: string
  meta: string                 // "funder · amount", already assembled
  score: number
  fundingType: TypeKey
  deadlineLabel: string | null
  deadlineTone: 'urgent' | 'plain' | 'quiet' | null
  isInviteOnly: boolean
}

export type TypeKey = 'grant' | 'programme' | 'investment' | 'in_kind'
export type ScopeKey = 'all' | TypeKey

export type MatchScope = {
  key: ScopeKey
  /** Open rows the org's structure is allowed to apply to. Same definition as Find Funding's tab badges. */
  eligible: number
  /** Of the rows scored against the full profile, those at 50 or above. */
  actionable: number
  tiers: { strong: number; good: number; partial: number; weak: number }
  top: MatchRow[]
}

/**
 * Fixed order, never sorted by count.
 *
 * The chart this replaced sorted by size, which would move the controls
 * between visits and between users. In a control, muscle memory matters more
 * than ranking does.
 */
const TABS: { key: ScopeKey; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'grant',      label: 'Grants' },
  { key: 'programme',  label: 'Programmes' },
  { key: 'investment', label: 'Investment' },
  { key: 'in_kind',    label: 'In-kind' },
]

/**
 * Funding-type palette, validated as a categorical set.
 *
 * The brand accents fail at this job: run as data colours, sage and sky fall
 * under the chroma floor and read as grey, all four sit outside the lightness
 * band, and adjacent pairs fall under the separation floor. These pass on ALL
 * pairs, not just adjacent ones, so the set survives re-sorting. Do not lighten
 * them back toward the pastels — that is exactly what failed.
 *
 * `accelerator` and `blended_finance` are deliberately absent. The pool is
 * filtered by CANONICAL_TYPES before scoring, so they never arrive.
 */
const TYPE: Record<ScopeKey, { label: string; rail: string; tint: string; fg: string }> = {
  all:        TYPE_NEUTRAL,
  // Only the LABEL differs from the shared set: these are tab labels, so they
  // are plural, where a chip on a single row says "Grant". The colours come
  // from one place so this card and Find Funding cannot drift apart — they
  // already had, by ΔE 23.1 on grants alone.
  grant:      { ...FUNDING_TYPE_COLOUR.grant,      label: 'Grants' },
  programme:  { ...FUNDING_TYPE_COLOUR.programme,  label: 'Programmes' },
  investment: { ...FUNDING_TYPE_COLOUR.investment, label: 'Investment' },
  in_kind:    { ...FUNDING_TYPE_COLOUR.in_kind,    label: 'In-kind' },
}

const DEEP        = '#1D3C3E'
const INK_MUTED   = '#5F5E5A'   // 6.49:1 on white
const INK_PLACE   = '#74736E'   // 4.75:1 on white — recedes without failing

export default function MatchesCard({ scopes, totalScored }: { scopes: MatchScope[]; totalScored: number }) {
  /** Always All on load. Remembering last week's choice quietly hides matches. */
  const [active, setActive] = useState<ScopeKey>('all')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})


  const scope = scopes.find(s => s.key === active) ?? scopes[0]
  const hue   = TYPE[active]
  const empty = scope.eligible === 0

  /**
   * The sub-line. Zero tiers are omitted rather than printed as "0 strong",
   * and if one tier holds the whole scope it is dropped too — the headline
   * already said the number, so repeating it is noise.
   */
  const tierParts: string[] = []
  if (scope.tiers.strong  > 0) tierParts.push(`${scope.tiers.strong} strong`)
  if (scope.tiers.good    > 0) tierParts.push(`${scope.tiers.good} good`)
  if (scope.tiers.partial > 0) tierParts.push(`${scope.tiers.partial} worth exploring`)
  const showTiers = tierParts.length > 1

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length
    setActive(TABS[next].key)
    tabRefs.current[TABS[next].key]?.focus()
  }

  const seeAllHref = active === 'all'
    ? '/dashboard/search?actionable=1'
    : `/dashboard/search?actionable=1&fundingType=${active}`

  return (
    /* Height is fixed by the three-row state so flipping never resizes the
       card — otherwise the deadlines card beside it jumps on every click. */
    <div className="card rounded-xl p-6 flex flex-col" style={{ minHeight: 394 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: DEEP }}>Matches</span>
        {!empty && (
          <a href={seeAllHref} style={CARD_LINK}>
            See all {scope.actionable} →
          </a>
        )}
      </div>

      {/* Tabs. Never wraps and never scrolls: below the width the row needs,
          the counts drop out instead. That happens in `.matches-tab-count`'s
          container query in globals.css, against THIS element's width.

          The card is one column of the dashboard grid, so its width does not
          track the window. The previous attempt was a comment claiming the
          count "hides below 1180px" and three class hooks with no rule ever
          written for them, in this file or in either stylesheet, so nothing
          hid and In-kind ran off the right edge. A viewport breakpoint would
          have been the wrong instrument even if it had been written: measured
          2026-08-27, the row needed 510px of a 457px track at a 1400px
          viewport, well above the 1180 the comment named. */}
      <div style={{ containerType: 'inline-size', containerName: 'matches-tabs' }}>
        <div role="tablist" aria-label="Filter matches by funding type" className="matches-tabs" style={{ display: 'flex', gap: 4, margin: '12px 0 0', flexWrap: 'nowrap' }}>
        {TABS.map((t, i) => {
          const on = t.key === active
          const c  = TYPE[t.key]
          const n  = scopes.find(s => s.key === t.key)?.actionable ?? 0
          return (
            <button
              key={t.key}
              ref={el => { tabRefs.current[t.key] = el }}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.key)}
              onKeyDown={e => onKeyDown(e, i)}
              style={{
                fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, fontWeight: 600,
                padding: '5px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5,
                background: on ? c.tint : 'transparent',
                color: on ? c.fg : INK_MUTED,
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              {/* The dot ties each tab to its segment in the bar below, so the
                  bar reads as a legend rather than as decoration. */}
              <span className="matches-tab-dot" style={{ width: 8, height: 8, borderRadius: 2, background: c.rail, display: 'block', flexShrink: 0 }} />
              {t.label}
              {/* A type with nothing in it stays clickable and keeps the
                  ordinary colour: a plain 0 reads as nothing without help, and
                  dimming it further only breaks contrast. */}
              <span className="matches-tab-count" style={{ color: on ? c.fg : INK_PLACE, opacity: on ? 0.66 : 1, fontWeight: 600 }}>{n}</span>
            </button>
          )
        })}
        </div>
      </div>

      {/* The type bar: the old by-funding-type chart, compressed to 10px.
          It earns the space three times over — it is a picture of where the
          funding actually is, it is the legend for the coloured rows below,
          and it is feedback: pick a type and the other three drop back so you
          can see the slice you are looking at.

          Colour goes here because funding type is CATEGORICAL. The four hues
          were validated as a set, every pair separated well clear of the floor,
          so they hold up at any size and in any order. Quality tiers are
          sequential and cannot do this — the best adjacent separations across
          four steps of one ramp came out at 2.62, 2.05 and 1.68, all under 3:1,
          which is exactly why the old quality bar looked washed out. */}
      {(() => {
        const segs = TABS
          .filter(t => t.key !== 'all')
          .map(t => ({ key: t.key as TypeKey, n: scopes.find(s => s.key === t.key)?.actionable ?? 0 }))
          .filter(seg => seg.n > 0)
        // Denominator is the segments' own sum, not the All count: if the two
        // ever disagree the bar still fills its track rather than trailing off.
        const total = segs.reduce((a, b) => a + b.n, 0)
        if (total === 0) return null
        return (
          <div style={{ display: 'flex', gap: 2, height: 10, margin: '11px 0 13px' }}>
            {segs.map(seg => (
              <span
                key={seg.key}
                title={`${seg.n} ${TYPE[seg.key].label.toLowerCase()}`}
                style={{
                  width: `${(seg.n / total) * 100}%`,
                  background: TYPE[seg.key].rail,
                  borderRadius: 2,
                  opacity: active === 'all' || active === seg.key ? 1 : 0.22,
                  transition: 'opacity 150ms ease',
                }}
              />
            ))}
          </div>
        )
      })()}

      {empty ? (
        /* Headline and sub-line are dropped rather than shown as a zero, and
           so is "See all 0", which is a dead promise. The panel stretches to
           hold the card's height. */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 10, marginTop: 10, padding: '22px 20px', border: `1px dashed ${'rgba(29,60,62,0.22)'}`, borderRadius: 14 }}>
          <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 600, color: DEEP, margin: 0 }}>
            Nothing in {hue.label.toLowerCase()} yet
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: INK_MUTED, margin: 0, maxWidth: '42ch' }}>
            Nothing open in {hue.label.toLowerCase()} names your organisation type as eligible right now.
          </p>
          <a href={`/dashboard/search?fundingType=${active}`} style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13.5, fontWeight: 600, color: DEEP, textDecoration: 'none', border: '1.5px solid rgba(29,60,62,0.22)', borderRadius: 999, padding: '8px 18px' }}>
            Browse all {hue.label.toLowerCase()} →
          </a>
        </div>
      ) : (
        <>
          <div className="flex items-baseline flex-wrap" style={{ gap: 8, marginTop: 8 }}>
            {/* The actionable count, never the strong count. 80+ is rare by
                design — to clear it you need near-full marks on five weighted
                components at once — so headlining "1 strong match" prints a
                good result as a bad one. Every hard disqualifier caps below 50,
                so 50+ is the line where eligibility has been cleared: right
                size, right structure, right place, open to organisations. */}
            {/* The ELIGIBLE count, since 2026-09-04. This used to be the
                actionable count (score 50+), and Find Funding one click away
                put "you can apply for" on a structure-only count more than
                twice the size. The phrase now has one definition on both
                screens; the score tiers keep their own words below. */}
            <span style={{ fontSize: 34, fontWeight: 600, color: DEEP, fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {scope.eligible}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: DEEP, fontFamily: 'var(--font-space-grotesk)' }}>
              you can apply for
            </span>
          </div>

          {/* Two lines of room, so a longer scope wrapping doesn't resize the card. */}
          <p style={{ fontSize: 12.2, lineHeight: 1.45, margin: '6px 0 12px', minHeight: 34, color: INK_MUTED }}>
            {scope.actionable > 0 && (
              <span style={{ color: DEEP, fontWeight: 600 }}>{scope.actionable} worth your attention</span>
            )}
            {scope.actionable > 0 && showTiers && <span style={{ color: INK_PLACE }}>: </span>}
            {showTiers && <span>{tierParts.map((t, i) => (
              <span key={t}>
                {i > 0 && <span style={{ color: INK_PLACE }}> · </span>}
                <span style={i === 0 && scope.tiers.strong > 0 ? { color: DEEP, fontWeight: 600 } : undefined}>{t}</span>
              </span>
            ))}</span>}
            {scope.tiers.weak > 0 && (
              <>
                {showTiers && <span style={{ color: INK_PLACE }}> · </span>}
                {/* Not "less relevant" — these are funds the org cannot apply
                    for, not near-misses being neglected. Set a step back so it
                    cannot be misread as loss, but still above the text floor. */}
                <span style={{ color: INK_PLACE }}>{scope.tiers.weak} scored under 50</span>
              </>
            )}
          </p>

          <div className="flex-1 flex flex-col gap-2">
            {scope.top.map((m, i) => {
              const c = TYPE[m.fundingType]
              const isTop = i === 0
              return (
                <a key={m.id} href={`/dashboard/search?grant=${encodeURIComponent(m.id)}`}
                   className="relative flex flex-col justify-center gap-2 rounded-lg pl-5 pr-4 py-4 hover:translate-x-0.5 transition-transform"
                   style={{ background: c.tint, textDecoration: 'none' }}>
                  <div className="absolute top-0 bottom-0 left-0 w-[4px] rounded-l-lg" style={{ background: c.rail }} />
                  <div className="flex items-center gap-3 min-w-0">
                    <p className="flex-1 text-[15px] font-semibold truncate" style={{ fontFamily: 'var(--font-space-grotesk)', color: DEEP }}>
                      {m.title}
                    </p>
                    {/* Neutral, sharing no colour map with the type chip. It used
                        to take the type's colours, so 83% rendered amber and 74%
                        coral because of what KIND of funding they were. */}
                    <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{ background: isTop ? DEEP : 'rgba(255,255,255,0.72)', color: isTop ? '#F6F1E7' : DEEP, fontFamily: 'var(--font-space-grotesk)' }}>
                      {Math.round(m.score)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs min-w-0">
                    {/* The chip drops off when a filter is on: the tab says it,
                        the tint says it, the chip would say it a third time —
                        and removing it is what lets the meta line fit. */}
                    {active === 'all' && (
                      <span className="font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(255,255,255,0.72)', color: c.fg, fontFamily: 'var(--font-space-grotesk)', fontSize: 10 }}>
                        {c.label.replace(/s$/, '')}
                      </span>
                    )}
                    {m.isInviteOnly && (
                      <span className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5" style={{ background: '#F3EDFA', color: '#6B21A8', fontSize: 10, fontWeight: 600 }}>
                        ✉ Invite only
                      </span>
                    )}
                    <span style={{ color: INK_MUTED }} className="truncate min-w-0">
                      {m.meta}
                      {m.deadlineLabel && (
                        <> · <span style={{
                          color: m.deadlineTone === 'urgent' ? '#B4472A' : m.deadlineTone === 'quiet' ? INK_PLACE : INK_MUTED,
                          fontWeight: m.deadlineTone === 'urgent' ? 600 : 400,
                        }}>{m.deadlineLabel}</span></>
                      )}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </>
      )}

      {/* dangerouslySetInnerHTML, not a text child, and single quotes in the
          attribute selector.

          As a text child React HTML-escapes the block on the server — the `"`
          in [aria-selected="true"] became &quot; — and does not escape it on
          the client. Byte-identical CSS, two different strings, hydration
          fails on the whole subtree. Passing it as raw HTML skips the escaping
          path entirely; the single quotes mean the same mistake cannot come
          back if another rule needs an attribute selector. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .matches-tabs button:focus-visible { outline: 2px solid ${DEEP}; outline-offset: 2px; }
        .matches-tabs button:hover { background: #FAF8F2; }
        .matches-tabs button[aria-selected='true']:hover { filter: brightness(0.98); }
        /* Both the dot and the count go below 1180px. Measured: with them the
           row needs more than the 426px track at the lg breakpoint and wraps,
           and it must never wrap and never scroll. Nothing is lost — the bar
           immediately below still carries all four hues. */
        @media (max-width: 1180px) { .matches-tab-count, .matches-tab-dot { display: none; } }
      ` }} />
      <span className="sr-only">{totalScored} opportunities scored in total</span>
    </div>
  )
}
