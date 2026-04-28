import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

// Surface grants activated since the "Confirm & Publish" save bug was fixed
// so the admin can scan + re-review anything that may have lost manual edits.
// Window: last 21 days of first_seen_at (rough proxy for activation date —
// scraped_grants has no audit trail for activation).
const WINDOW_DAYS = 21

interface Row {
  id: string
  title: string | null
  funder: string | null
  apply_url: string | null
  first_seen_at: string | null
  eligible_structures: string[] | null
  target_beneficiaries: string[] | null
  impact_sectors: string[] | null
  description: string | null
  is_invite_only: boolean | null
  funder_type: string | null
  funding_type: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function arrSummary(arr: string[] | null, max = 3): string {
  if (!arr || arr.length === 0) return '—'
  const shown = arr.slice(0, max).join(', ')
  return arr.length > max ? `${shown} +${arr.length - max}` : shown
}

function truncate(s: string | null, n = 80): string {
  if (!s) return '—'
  const trimmed = s.trim()
  if (trimmed.length <= n) return trimmed
  return trimmed.slice(0, n).trim() + '…'
}

export default async function ReviewSweepPanel() {
  const supabase = await createClient()
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, apply_url, first_seen_at, eligible_structures, target_beneficiaries, impact_sectors, description, is_invite_only, funder_type, funding_type')
    .eq('is_active', true)
    .gte('first_seen_at', since)
    .order('first_seen_at', { ascending: false })
    .limit(150)

  if (error) {
    return (
      <div className="bg-coral-pale border border-coral-mid rounded-xl px-5 py-4 mb-7 text-sm text-coral-deep">
        Couldn’t load review sweep: {error.message}
      </div>
    )
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-card mb-7" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
      <div className="px-5 pt-5 pb-3 border-b border-warm/40">
        <h3 className="font-display text-base font-bold text-charcoal">Recently activated — review sweep</h3>
        <p className="text-xs text-mid mt-1 max-w-2xl leading-relaxed">
          {rows.length} active grants first seen in the last {WINDOW_DAYS} days. The earlier &ldquo;Confirm &amp; Publish&rdquo; bug
          dropped edits to <strong>eligible structures, beneficiaries, sectors, description</strong> and <strong>invite-only</strong> on this batch.
          Scan the inline values; click <em>Edit</em> on anything that looks wrong and re-save (the fix is now live).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-warm bg-warm/20">
              <th className="text-left px-4 py-2 font-semibold text-mid uppercase tracking-wider">Grant / Funder</th>
              <th className="text-left px-3 py-2 font-semibold text-mid uppercase tracking-wider">First seen</th>
              <th className="text-left px-3 py-2 font-semibold text-mid uppercase tracking-wider">Eligible structures</th>
              <th className="text-left px-3 py-2 font-semibold text-mid uppercase tracking-wider">Beneficiaries</th>
              <th className="text-left px-3 py-2 font-semibold text-mid uppercase tracking-wider">Sectors</th>
              <th className="text-left px-3 py-2 font-semibold text-mid uppercase tracking-wider">Description</th>
              <th className="text-center px-2 py-2 font-semibold text-mid uppercase tracking-wider">Invite</th>
              <th className="text-right px-3 py-2 font-semibold text-mid uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm/40">
            {rows.map(r => {
              const flags: string[] = []
              if (!r.eligible_structures || r.eligible_structures.length === 0) flags.push('no-structures')
              if (!r.target_beneficiaries || r.target_beneficiaries.length === 0) flags.push('no-beneficiaries')
              if (!r.impact_sectors || r.impact_sectors.length === 0) flags.push('no-sectors')
              if (!r.description || r.description.trim().length === 0) flags.push('no-description')
              const flagged = flags.length > 0
              return (
                <tr key={r.id} className={flagged ? 'bg-amber-50/40' : 'hover:bg-warm/20 transition-colors'}>
                  <td className="px-4 py-2.5 align-top">
                    <p className="font-medium text-charcoal leading-tight">{r.title ?? '(no title)'}</p>
                    <p className="text-[11px] text-mid mt-0.5">{r.funder ?? '—'}</p>
                    {r.apply_url && (
                      <a href={r.apply_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-forest underline mt-1 inline-block break-all">
                        {r.apply_url.replace(/^https?:\/\//, '').slice(0, 50)}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-mid whitespace-nowrap">{fmtDate(r.first_seen_at)}</td>
                  <td className="px-3 py-2.5 align-top text-charcoal max-w-[220px]">{arrSummary(r.eligible_structures)}</td>
                  <td className="px-3 py-2.5 align-top text-charcoal max-w-[180px]">{arrSummary(r.target_beneficiaries)}</td>
                  <td className="px-3 py-2.5 align-top text-charcoal max-w-[180px]">{arrSummary(r.impact_sectors)}</td>
                  <td className="px-3 py-2.5 align-top text-mid max-w-[260px] leading-snug">{truncate(r.description, 110)}</td>
                  <td className="px-2 py-2.5 align-top text-center">
                    {r.is_invite_only ? <span className="text-coral-deep font-semibold">YES</span> : <span className="text-light">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/admin/urls?focus=${r.id}`}
                      className="rounded-full bg-forest px-3 py-1 text-[11px] font-semibold text-white hover:bg-sage transition-colors no-underline"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
