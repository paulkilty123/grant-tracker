// Week on week: the block at the top of the Monday report that turns counts
// into something that can move. A raw count never says whether the week was
// good; the same count beside last week's, and three ratios, does.
//
// Pure. The route gathers the inputs (site stats for two windows, events and
// organisations for 14 days) and this decides nothing about where they came
// from, so a fixture can predict every number before the real data is seen.

export interface WeekInputs {
  /** Sessions on the site, and how many of them reached /signup. */
  visitors: number
  signupVisitors: number
  /** Organisations created in the window. */
  signups: number
  /** Of those signups, how many ran a search (results_shown) within the window. */
  signupsWhoSearched: number
  /** Any organisation that saw results in the window, and how many of those added to the pipeline. */
  searchers: number
  searchersWhoAddedToPipeline: number
}

export interface CompareRow { label: string; thisWeek: number; lastWeek: number; delta: number }
export interface RatioRow  { label: string; thisWeek: number | null; lastWeek: number | null; num: number; den: number }
export interface WeekComparison { counts: CompareRow[]; ratios: RatioRow[] }

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((100 * num) / den) : null)

export function compareWeeks(cur: WeekInputs, prev: WeekInputs): WeekComparison {
  const count = (label: string, a: number, b: number): CompareRow => ({ label, thisWeek: a, lastWeek: b, delta: a - b })
  const ratio = (label: string, num: keyof WeekInputs, den: keyof WeekInputs): RatioRow => ({
    label,
    thisWeek: pct(cur[num], cur[den]),
    lastWeek: pct(prev[num], prev[den]),
    num: cur[num],
    den: cur[den],
  })
  return {
    counts: [
      count('Visitors', cur.visitors, prev.visitors),
      count('Reached the signup page', cur.signupVisitors, prev.signupVisitors),
      count('Signed up', cur.signups, prev.signups),
      count('Ran a search', cur.searchers, prev.searchers),
      count('Added to pipeline', cur.searchersWhoAddedToPipeline, prev.searchersWhoAddedToPipeline),
    ],
    ratios: [
      ratio('Visitors who reached signup', 'signupVisitors', 'visitors'),
      ratio('Signups who ran a search', 'signupsWhoSearched', 'signups'),
      ratio('Searchers who added to pipeline', 'searchersWhoAddedToPipeline', 'searchers'),
    ],
  }
}

/** Derive the event-side inputs for one window from rows the route already holds. */
export function weekInputsFromEvents(
  orgs: { id: string; created_at: string }[],
  events: { org_id: string; event_type: string; created_at: string }[],
  site: { visitors: number; signupVisitors: number } | null,
  windowStart: Date,
  windowEnd: Date,
): WeekInputs {
  const inWindow = (iso: string) => { const t = Date.parse(iso); return t >= windowStart.getTime() && t < windowEnd.getTime() }
  const newOrgs = new Set(orgs.filter(o => inWindow(o.created_at)).map(o => o.id))
  const searched = new Set<string>()
  const piped = new Set<string>()
  for (const e of events) {
    if (!inWindow(e.created_at)) continue
    if (e.event_type === 'results_shown') searched.add(e.org_id)
    if (e.event_type === 'pipeline_added') piped.add(e.org_id)
  }
  let signupsWhoSearched = 0
  newOrgs.forEach(id => { if (searched.has(id)) signupsWhoSearched++ })
  let searchersWhoAddedToPipeline = 0
  searched.forEach(id => { if (piped.has(id)) searchersWhoAddedToPipeline++ })
  return {
    visitors: site?.visitors ?? 0,
    signupVisitors: site?.signupVisitors ?? 0,
    signups: newOrgs.size,
    signupsWhoSearched,
    searchers: searched.size,
    searchersWhoAddedToPipeline,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtPct = (p: number | null) => (p === null ? 'n/a' : `${p}%`)
const fmtDelta = (d: number) => (d === 0 ? '' : d > 0 ? `+${d}` : `${d}`)

export function renderWeekComparisonHtml(c: WeekComparison, siteMissing?: string): string {
  const td = 'padding:6px 10px;border-bottom:1px solid #e6e2d8;font-size:13px'
  const num = td + ';text-align:right;font-variant-numeric:tabular-nums'
  const th = 'padding:6px 10px;border-bottom:2px solid #1D3C3E;font-size:12px;text-align:left;color:#5F5E5A'
  const thn = th + ';text-align:right'
  const deltaStyle = (d: number) => (d > 0 ? 'color:#3B6D11' : d < 0 ? 'color:#B4472A' : 'color:#8A8986')
  const note = siteMissing
    ? `<p style="margin:0 0 8px;font-size:12px;color:#B4472A">Visitor numbers not read: ${esc(siteMissing)}. Rows that need them show zero.</p>`
    : ''
  return `
    <h3 style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#1D3C3E;margin:0 0 8px">This week against last</h3>
    ${note}
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;width:100%;max-width:560px">
      <tr><th style="${th}"></th><th style="${thn}">This week</th><th style="${thn}">Last week</th><th style="${thn}">Change</th></tr>
      ${c.counts.map(r => `<tr><td style="${td}">${esc(r.label)}</td><td style="${num}">${r.thisWeek}</td><td style="${num}">${r.lastWeek}</td><td style="${num};${deltaStyle(r.delta)}">${fmtDelta(r.delta)}</td></tr>`).join('')}
      ${c.ratios.map(r => {
        const d = r.thisWeek !== null && r.lastWeek !== null ? r.thisWeek - r.lastWeek : 0
        return `<tr><td style="${td}"><strong>${esc(r.label)}</strong> <span style="color:#8A8986">${r.num} of ${r.den}</span></td><td style="${num}"><strong>${fmtPct(r.thisWeek)}</strong></td><td style="${num}">${fmtPct(r.lastWeek)}</td><td style="${num};${deltaStyle(d)}">${d === 0 ? '' : `${fmtDelta(d)} pts`}</td></tr>`
      }).join('')}
    </table>
    <p style="margin:8px 0 20px;font-size:12px;color:#8A8986">A ratio that moves is the thing to look at. Counts move with traffic; ratios move with the product.</p>`
}
