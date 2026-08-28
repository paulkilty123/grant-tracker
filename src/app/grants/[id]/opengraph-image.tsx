import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { MCP_BRAND_NAME } from '@/lib/mcp-brand'

// Per-opportunity share card.
//
// generateMetadata sets twitter.card = 'summary_large_image'. Before this
// existed, openGraph carried no `images` at all, so the page promised a large
// card and supplied nothing: every share of an opportunity rendered as a bare
// link. Either supply the image or drop to 'summary'; never promise and send
// nothing.
//
// Node runtime, not edge, because it reads the row through the same server
// Supabase client the page uses.
export const alt = `A UK funding opportunity on ${MCP_BRAND_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const DEEP  = '#1D3C3E'
const CREAM = '#F6F1E7'
const GOLD  = '#EBCE78'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortMoney(n: number | null): string | null {
  if (n === null || n === undefined) return null
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
  if (n >= 1_000)     return `£${Math.round(n / 1000)}k`
  return `£${n}`
}

function humanDate(s: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`
}

export default async function Image({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id)
  const supabase = await createClient()

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const column = UUID_RE.test(id) ? 'id' : 'external_id'
  const { data: row } = await supabase
    .from('scraped_grants')
    .select('title, funder, amount_min, amount_max, deadline, is_rolling')
    .eq(column, id)
    .maybeSingle()

  const title  = row?.title  ? String(row.title)  : 'Funding opportunity'
  const funder = row?.funder ? String(row.funder) : MCP_BRAND_NAME

  const lo = shortMoney((row?.amount_min ?? null) as number | null)
  const hi = shortMoney((row?.amount_max ?? null) as number | null)
  const amount = lo && hi ? `${lo} – ${hi}` : hi ? `Up to ${hi}` : lo ? `From ${lo}` : null

  const deadline = row?.is_rolling
    ? 'Rolling deadline'
    : humanDate(row?.deadline ? String(row.deadline) : null)

  const facts = [amount, deadline].filter(Boolean) as string[]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', background: DEEP, color: CREAM,
          padding: '68px 76px', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(246,241,231,0.6)' }}>
            {funder}
          </div>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 700, lineHeight: 1.12, marginTop: 20, maxWidth: 1000 }}>
            {title.length > 96 ? `${title.slice(0, 93)}…` : title}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {facts.map(f => (
              <div
                key={f}
                style={{
                  display: 'flex', background: GOLD, color: DEEP, fontSize: 30, fontWeight: 700,
                  padding: '14px 26px', borderRadius: 999,
                }}
              >
                {f}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, color: CREAM }}>
            {MCP_BRAND_NAME.toLowerCase()}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
