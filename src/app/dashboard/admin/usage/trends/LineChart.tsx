'use client'
// One series over time as a thin line, with a crosshair tooltip. One measure
// per chart on purpose: two measures of different scale get two charts, never
// two axes. Text wears ink tokens; only the mark carries the series colour.

import { useId, useState } from 'react'

export interface Point { x: string; y: number | null }

interface Props {
  title: string
  points: Point[]
  /** Suffix for values, e.g. '%'. */
  unit?: string
  /** Fixed top of the y scale, e.g. 100 for a percentage. Otherwise fits the data. */
  yMax?: number
  colour?: string
  height?: number
}

const INK = '#2C2C2A', MUTED = '#8A8986', GRID = '#F0EBE0', GROTESK = 'var(--font-space-grotesk)'
const W = 640, PAD = { l: 40, r: 12, t: 12, b: 26 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / p
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return step * p
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function LineChart({ title, points, unit = '', yMax, colour = '#3B6D11', height = 200 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const H = height
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const ys = points.map(p => p.y).filter((y): y is number => y !== null)
  const top = yMax ?? niceMax(Math.max(0, ...ys))
  const n = points.length
  const x = (i: number) => PAD.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1))
  const y = (v: number) => PAD.t + ih - (v / top) * ih
  const ticks = [0, top / 2, top]

  // Break the line where a value is null (a week with no denominator).
  const segments: string[] = []
  let cur: string[] = []
  points.forEach((p, i) => {
    if (p.y === null) { if (cur.length) segments.push(cur.join(' ')); cur = []; return }
    cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`)
  })
  if (cur.length) segments.push(cur.join(' '))

  const labelEvery = Math.max(1, Math.ceil(n / 6))
  const hp = hover !== null ? points[hover] : null
  const last = [...points].reverse().find(p => p.y !== null)

  return (
    <figure style={{ margin: 0, background: '#fff', border: '1px solid #E8E0D1', borderRadius: 12, padding: '14px 16px 10px' }}>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 600, color: INK }}>{title}</span>
        <span style={{ fontFamily: GROTESK, fontSize: 20, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>
          {hp ? (hp.y === null ? 'n/a' : `${hp.y}${unit}`) : last ? `${last.y}${unit}` : ''}
          <span style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginLeft: 8 }}>{hp ? shortDate(hp.x) : 'latest'}</span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-labelledby={id}
        style={{ display: 'block', overflow: 'visible' }}
        onPointerMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.round(((px - PAD.l) / iw) * (n - 1))
          setHover(Math.max(0, Math.min(n - 1, i)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title id={id}>{title}</title>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={MUTED} fontFamily="inherit">{Math.round(t)}{unit}</text>
          </g>
        ))}
        {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={p.x} x={x(i)} y={H - 8} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize={11} fill={MUTED} fontFamily="inherit">{shortDate(p.x)}</text>
        ))}
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hp && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={PAD.t + ih} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
            {hp.y !== null && <circle cx={x(hover!)} cy={y(hp.y)} r={5} fill={colour} stroke="#fff" strokeWidth={2} />}
          </g>
        )}
      </svg>
    </figure>
  )
}
