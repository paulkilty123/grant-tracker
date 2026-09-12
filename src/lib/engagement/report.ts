/**
 * Weekly engagement report: who is about to pay, who is about to leave.
 *
 * Built from the events table (captured since June 2026) and the trial dates
 * on organisations. Pure functions, so the shape is testable with a fixture;
 * the route does the reading and the sending.
 *
 * Deliberately per ORGANISATION, not per person. The value is in trial-risk
 * flags and patterns, not in reading one user's session.
 */

export type OrgRow = {
  id: string
  name: string
  created_at: string
  granted_access_until: string | null
  apply_access: boolean | null
  profile_skipped?: boolean | null
  signup_role?: string | null
  owner_email?: string | null
}

export type EventRow = {
  org_id: string
  event_type: string
  created_at: string
}

/** Demo and test organisations, never reported. Ids, never names. */
export const EXCLUDED_ORG_IDS = new Set([
  '1eaa0592-4600-4a60-86c2-0e0ffabfb551', // Bramble Arts Collective (demo)
  '61cc84b1-0154-4107-a69f-2f8bb21b5e9d', // ACC test
  'f1f9c904-ef5a-4591-8c6d-e7d9a1535133', // IoI test
  '4ef429df-19d0-49b0-9c7b-ccb802b70a6d', // Common Ground Kitchen test
  'cb66226d-1ec0-47e1-945d-4ef2d7ee7896', // OpenAccess Digital test
  '24a916c8-d6d6-4a39-9f68-770ba5d5af8c', // MCP Fixture, Apply tier
  'f5de0ebf-0346-40dd-a0e3-bdc0c3523a6f', // MCP Fixture, Free tier
])

export type Flag = 'engaged' | 'warming' | 'quiet' | 'never_returned' | 'dormant' | 'ended'

export type EngagementRow = {
  orgId: string
  name: string
  ownerEmail: string | null
  signedUp: string          // ISO date
  daysSinceSignup: number
  trialEnds: string | null  // ISO date
  daysLeft: number | null   // negative when ended, null when no end
  activeDays: number        // distinct days with any event in the window
  lastSeen: string | null   // ISO date of last event
  daysSinceSeen: number | null
  searches: number
  saves: number
  dismisses: number
  pipeline: number          // adds + stage changes
  builder: number
  connector: number
  flag: Flag
}

export const WINDOW_DAYS = 28

const day = (iso: string) => iso.slice(0, 10)
const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000)

function bucket(t: string): keyof Pick<EngagementRow, 'searches' | 'saves' | 'dismisses' | 'pipeline' | 'builder' | 'connector'> | null {
  if (t === 'search_executed') return 'searches'
  if (t === 'opportunity_saved') return 'saves'
  if (t === 'opportunity_dismissed') return 'dismisses'
  if (t === 'pipeline_added' || t === 'pipeline_stage_changed') return 'pipeline'
  if (t.startsWith('builder_') || t === 'project_created') return 'builder'
  if (t.startsWith('mcp_')) return 'connector'
  return null
}

/**
 * The flag is the whole point of the report. Rules, in order:
 *  - ended: trial finished and no purchase (apply_access false, or end date past)
 *  - dormant: signed up before the window and nothing at all inside it
 *  - never_returned: nothing since the day they signed up
 *  - engaged: 3+ active days and something in the pipeline, or 5+ active days
 *  - quiet: nothing in the last 7 days and the trial ends within 10
 *  - warming: everything else
 */
export function flagFor(r: Omit<EngagementRow, 'flag'>): Flag {
  if (r.daysLeft !== null && r.daysLeft < 0) return 'ended'
  if (r.activeDays === 0 && r.daysSinceSignup > WINDOW_DAYS) return 'dormant'
  if (r.daysSinceSignup >= 2 && (r.lastSeen === null || r.lastSeen === r.signedUp)) return 'never_returned'
  if ((r.activeDays >= 3 && r.pipeline > 0) || r.activeDays >= 5) return 'engaged'
  if ((r.daysSinceSeen === null || r.daysSinceSeen >= 7) && r.daysLeft !== null && r.daysLeft <= 10) return 'quiet'
  return 'warming'
}

export function summariseEngagement(orgs: OrgRow[], events: EventRow[], now: Date = new Date()): EngagementRow[] {
  const nowIso = now.toISOString()
  const byOrg = new Map<string, EventRow[]>()
  for (const e of events) {
    if (!byOrg.has(e.org_id)) byOrg.set(e.org_id, [])
    byOrg.get(e.org_id)!.push(e)
  }

  const rows: EngagementRow[] = []
  for (const o of orgs) {
    if (EXCLUDED_ORG_IDS.has(o.id)) continue
    const evs = (byOrg.get(o.id) ?? []).filter(e => daysBetween(e.created_at, nowIso) <= WINDOW_DAYS)
    const days = new Set(evs.map(e => day(e.created_at)))
    const last = evs.length ? evs.map(e => e.created_at).sort().at(-1)! : null
    const counts = { searches: 0, saves: 0, dismisses: 0, pipeline: 0, builder: 0, connector: 0 }
    for (const e of evs) { const b = bucket(e.event_type); if (b) counts[b]++ }

    const trialEnds = o.granted_access_until && o.granted_access_until !== 'infinity' ? day(o.granted_access_until) : null
    const base = {
      orgId: o.id,
      name: o.name,
      ownerEmail: o.owner_email ?? null,
      signedUp: day(o.created_at),
      daysSinceSignup: daysBetween(o.created_at, nowIso),
      trialEnds,
      daysLeft: trialEnds ? daysBetween(nowIso, o.granted_access_until!) : null,
      activeDays: days.size,
      lastSeen: last ? day(last) : null,
      daysSinceSeen: last ? daysBetween(last, nowIso) : null,
      ...counts,
    }
    rows.push({ ...base, flag: flagFor(base) })
  }

  const order: Record<Flag, number> = { quiet: 0, never_returned: 1, warming: 2, engaged: 3, dormant: 4, ended: 5 }
  return rows.sort((a, b) => order[a.flag] - order[b.flag] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || a.name.localeCompare(b.name))
}

const FLAG_LABEL: Record<Flag, string> = {
  quiet: 'Quiet, trial ending soon',
  never_returned: 'Never came back',
  warming: 'Warming up',
  engaged: 'Engaged',
  dormant: 'Dormant, nothing in 28 days',
  ended: 'Trial ended',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain HTML, one table per flag, nothing clever. Reads fine as text too. */
export function renderEngagementHtml(rows: EngagementRow[], now: Date = new Date()): { subject: string; html: string } {
  const quiet = rows.filter(r => r.flag === 'quiet').length
  const engaged = rows.filter(r => r.flag === 'engaged').length
  const never = rows.filter(r => r.flag === 'never_returned').length
  const subject = `Engagement this week: ${engaged} engaged, ${quiet} quiet, ${never} never came back`

  const groups = (['quiet', 'never_returned', 'warming', 'engaged', 'dormant', 'ended'] as Flag[])
    .map(f => ({ f, rs: rows.filter(r => r.flag === f) }))
    .filter(g => g.rs.length)

  const td = 'padding:6px 10px;border-bottom:1px solid #e6e2d8;font-size:13px;vertical-align:top'
  const th = 'padding:6px 10px;border-bottom:2px solid #1D3C3E;font-size:12px;text-align:left;color:#5F5E5A'
  const tables = groups.map(g => `
    <h3 style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#1D3C3E;margin:24px 0 8px">${FLAG_LABEL[g.f]} (${g.rs.length})</h3>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;width:100%">
      <tr><th style="${th}">Organisation</th><th style="${th}">Signed up</th><th style="${th}">Trial ends</th><th style="${th}">Active days</th><th style="${th}">Last seen</th><th style="${th}">Saves</th><th style="${th}">Pipeline</th><th style="${th}">Searches</th><th style="${th}">Builder</th></tr>
      ${g.rs.map(r => `<tr>
        <td style="${td}"><strong>${esc(r.name)}</strong>${r.ownerEmail ? `<br><span style="color:#8A8986;font-size:12px">${esc(r.ownerEmail)}</span>` : ''}</td>
        <td style="${td}">${r.signedUp}<br><span style="color:#8A8986;font-size:12px">${r.daysSinceSignup}d ago</span></td>
        <td style="${td}">${r.trialEnds ?? 'no end'}${r.daysLeft !== null ? `<br><span style="color:${r.daysLeft <= 3 ? '#B4472A' : '#8A8986'};font-size:12px">${r.daysLeft < 0 ? `${-r.daysLeft}d ago` : `${r.daysLeft}d left`}</span>` : ''}</td>
        <td style="${td}">${r.activeDays}</td>
        <td style="${td}">${r.lastSeen ?? 'never'}${r.daysSinceSeen !== null ? `<br><span style="color:#8A8986;font-size:12px">${r.daysSinceSeen}d ago</span>` : ''}</td>
        <td style="${td}">${r.saves}${r.dismisses ? ` <span style="color:#8A8986">(${r.dismisses} dismissed)</span>` : ''}</td>
        <td style="${td}">${r.pipeline}</td>
        <td style="${td}">${r.searches}</td>
        <td style="${td}">${r.builder}${r.connector ? ` <span style="color:#8A8986">(+${r.connector} connector)</span>` : ''}</td>
      </tr>`).join('')}
    </table>`).join('')

  const html = `
    <div style="max-width:960px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#2C2C2A">
      <h2 style="font-size:20px;color:#1D3C3E;margin:0 0 4px">Engagement, week to ${now.toISOString().slice(0, 10)}</h2>
      <p style="margin:0 0 8px;font-size:13px;color:#5F5E5A">Last ${WINDOW_DAYS} days of activity per organisation, from the events table. Demo and test organisations are left out. Quiet means nothing in seven days with the trial ending inside ten: those are the ones to write to.</p>
      ${tables}
      <p style="margin:24px 0 0;font-size:12px;color:#8A8986">Engaged: three or more active days with something in the pipeline, or five active days. Never came back: nothing since the day they signed up.</p>
    </div>`
  return { subject, html }
}
