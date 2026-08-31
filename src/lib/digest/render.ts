import type { DigestModel } from './build'
import { countdown, esc, humanDayDate, plural } from './text'

/* ═══════════════════════════════════════════════════════════════════════════
   Email HTML. Tables and inline styles throughout.

   No flexbox, no grid, no SVG — Outlook renders with Word's engine. The
   countdown tile is a table cell rather than a div for the same reason, and
   because a "6 days" that exists only as an image is invisible to the reader
   who most needs it.

   Rounded corners square off in Outlook and buttons lose their pill. That is
   accepted: a rectangular button that works beats a rounded image that gets
   blocked.
   ═══════════════════════════════════════════════════════════════════════════ */

const UI   = "'Space Grotesk',Helvetica,Arial,sans-serif"
const BODY = "'Plus Jakarta Sans',Helvetica,Arial,sans-serif"

const C = {
  page:    '#EFE9DD',
  card:    '#FFFFFF',
  tile:    '#F1EDE3',
  deep:    '#1D3C3E',
  onDeep:  '#F6F1E7',
  body:    '#5F5E5A',
  muted:   '#74736E',
  hair:    'rgba(29,60,62,.10)',
  urgent:  '#D67558',
  gold:    '#EBCE78',
  danger:  '#B94040',
}

/** Bulletproof button: a table cell carrying the background, not a styled <a>. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${C.deep};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:9px 18px;font-family:${UI};font-size:13px;font-weight:600;color:${C.onDeep};text-decoration:none;">${esc(label)}</a>
    </td>
  </tr></table>`
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 6px;font-family:${UI};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};">${esc(text)}</p>`
}

/**
 * A row title that is also a link.
 *
 * Every named opportunity in this email goes to its page on Shoots. The first
 * version rendered titles as plain text with only a "See all your matches"
 * link at the foot of the section, so the reader could see ten funds and click
 * none of them — an email about specific opportunities where the opportunities
 * were not reachable.
 *
 * Styling is deliberately identical to the plain title: the fix is that it is
 * clickable, not that it announces itself.
 */
function titleLink(href: string | null, text: string, size: number): string {
  const style = `font-family:${UI};font-size:${size}px;font-weight:600;letter-spacing:-.2px;color:${C.deep};text-decoration:none;`
  return href
    ? `<a href="${esc(href)}" style="${style}">${esc(text)}</a>`
    : `<span style="${style}">${esc(text)}</span>`
}

function textLink(href: string, label: string): string {
  return `<a href="${esc(href)}" style="font-family:${UI};font-size:14px;font-weight:600;color:${C.deep};text-decoration:underline;">${esc(label)} &rarr;</a>`
}

/**
 * The header.
 *
 * The mark is an image and "shoots" is LIVE TEXT beside it, so the brand still
 * reads when images are blocked — which is a large minority of readers. The
 * logo must be a hosted PNG at 2x with explicit width and height: Outlook does
 * not render SVG and data URIs are blocked in most clients.
 */
function header(origin: string, now: Date): string {
  return `<tr><td style="padding:8px 6px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="left">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:9px;line-height:0;">
            <img src="${origin}/email/shoots-mark@2x.png" width="24" height="24" alt="Shoots" style="display:block;border:0;">
          </td>
          <td valign="middle" style="font-family:${UI};font-size:21px;font-weight:700;letter-spacing:-.5px;color:${C.deep};">shoots</td>
        </tr></table>
      </td>
      <td align="right" style="font-family:${UI};font-size:12.5px;font-weight:500;color:${C.muted};">${esc(humanDayDate(now))}</td>
    </tr></table>
  </td></tr>`
}

/** A closing row: countdown tile on the left, the ask on the right. */
function closingRow(r: DigestModel['closing'][number], origin: string): string {
  const { n, unit } = countdown(r.days)
  const tileBg = r.days <= 7 ? C.urgent : C.gold
  const href = r.url ?? `${origin}/dashboard/deadlines`
  return `<tr><td style="background:${C.card};padding:0 30px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tile};border-radius:14px;">
      <tr>
        <td width="66" valign="top" style="padding:16px 0 16px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${tileBg};border-radius:10px;">
            <tr><td align="center" style="padding:9px 12px;font-family:${UI};font-size:19px;font-weight:700;color:${C.deep};line-height:1;">${esc(n)}</td></tr>
            <tr><td align="center" style="padding:0 12px 9px;font-family:${UI};font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:${C.deep};">${esc(unit)}</td></tr>
          </table>
        </td>
        <td valign="top" style="padding:16px 16px 16px 14px;">
          <p style="margin:0 0 3px;">${titleLink(href, r.name, 16)}</p>
          ${r.funder ? `<p style="margin:0 0 6px;font-family:${BODY};font-size:13.5px;line-height:1.5;color:${C.body};">${esc(r.funder)}</p>` : ''}
          <p style="margin:0 0 12px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.status)}</p>
          ${button(href, r.kind === 'saved' ? 'Decide on this' : 'Open in Shoots')}
        </td>
      </tr>
    </table>
  </td></tr>`
}

function progressRow(r: DigestModel['inProgress'][number], origin: string): string {
  return `<tr><td style="padding:0 0 14px;">
    <p style="margin:0 0 3px;">${titleLink(r.url ?? `${origin}/dashboard/pipeline`, r.name, 15.5)}</p>
    <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${r.stalled ? C.danger : C.body};">${esc(r.status)}</p>
  </td></tr>`
}

function matchRow(r: DigestModel['matches'][number], last: boolean): string {
  return `<tr><td style="padding:0 0 16px;${last ? '' : `border-bottom:1px solid ${C.hair};`}">
    <p style="margin:0 0 3px;">${titleLink(r.url, r.title, 15.5)}</p>
    ${r.meta ? `<p style="margin:0 0 6px;font-family:${BODY};font-size:13.5px;line-height:1.5;color:${C.body};">${esc(r.meta)}</p>` : ''}
    <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>
  </td></tr>`
}

/** Three parts, always in this order: verdict, the funder's rule, what would change it. */
function nearMissRow(r: DigestModel['nearMisses'][number]): string {
  return `<tr><td style="padding:0 0 14px;">
    <p style="margin:0 0 3px;">${titleLink(r.url, r.title, 15.5)}</p>
    <p style="margin:0 0 4px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};"><b style="color:${C.deep};">${esc(r.verdict)}</b> ${esc(r.rule)}</p>
    <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.condition)}</p>
  </td></tr>`
}

function cardOpen(rounded: 'top' | 'none'): string {
  const radius = rounded === 'top' ? 'border-radius:16px 16px 0 0;' : ''
  return `<tr><td style="background:${C.card};${radius}padding:30px 30px 0;">`
}

export interface RenderOptions {
  origin: string
  unsubscribeUrl: string
  now?: Date
}

export function renderDigest(m: DigestModel, opts: RenderOptions): string {
  const { origin, unsubscribeUrl } = opts
  const now = opts.now ?? new Date()
  const rows: string[] = []

  rows.push(header(origin, now))

  /* ── Lead section. The label is the identity, in the same place every week.
        No hero headline: the subject already named the consequential item, and
        a variable hero means the email has to be re-learned each Tuesday. ── */
  const leadLabel = m.mode === 'week_one' ? 'Your first matches' : 'Upcoming deadlines'
  rows.push(`${cardOpen('top')}
    ${sectionLabel(leadLabel)}
    <p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.55;color:${C.deep};">${esc(m.lead)}</p>
  </td></tr>`)

  /* ── 1. Closing soon ─────────────────────────────────────────────────── */
  if (m.closing.length) {
    m.closing.forEach(r => rows.push(closingRow(r, origin)))
    if (m.closingOverflow > 0) {
      rows.push(`<tr><td style="background:${C.card};padding:0 30px 8px;">
        ${textLink(`${origin}/dashboard/deadlines`, `and ${plural(m.closingOverflow, 'more')} closing this month`)}
      </td></tr>`)
    }
  }

  /* ── The reassurance line. Not filler: an exception report is only
        trustworthy if it says what it checked. ─────────────────────────── */
  if (m.reassurance && m.mode !== 'week_one') {
    rows.push(`<tr><td style="background:${C.card};padding:${m.closing.length ? '4px' : '0'} 30px 0;">
      <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.muted};">${esc(m.reassurance)}</p>
    </td></tr>`)
  }

  /* ── 2. Also in progress ─────────────────────────────────────────────── */
  if (m.inProgress.length) {
    rows.push(`<tr><td style="background:${C.card};padding:26px 30px 0;">
      ${sectionLabel('Also in progress')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${m.inProgress.map(r => progressRow(r, origin)).join('')}
        ${m.inProgressOverflow > 0 ? `<tr><td>${textLink(`${origin}/dashboard/pipeline`, `and ${plural(m.inProgressOverflow, 'more')} in progress`)}</td></tr>` : ''}
      </table>
    </td></tr>`)
  }

  /* ── 3. Matches. Last, because it is the weakest retention hook — except
        in week one, where it is the only thing there is. ───────────────── */
  if (m.matches.length) {
    // The label follows the data. Week one is "your first matches" because the
    // whole list arrives at once and calling that "new" would be a lie; the
    // same honesty applies when the rows are simply ones we have not shown
    // this reader before, which is not the same as recently added.
    const label =
      m.matchLabel === 'first'        ? null
      : m.matchLabel === 'new'        ? 'New matches'
      :                                 'Matches worth a look'
    const seeAll = m.mode === 'week_one'
      ? `See all ${plural(m.matchTotal, 'match', 'matches')}`
      : 'See all your matches'
    rows.push(`<tr><td style="background:${C.card};padding:${m.mode === 'week_one' ? '0' : '26px'} 30px 0;">
      ${label ? sectionLabel(label) : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${m.matches.map((r, i) => matchRow(r, i === m.matches.length - 1)).join('')}
        ${m.matchesOverflow > 0 ? `<tr><td style="padding:0 0 12px;">${textLink(`${origin}/dashboard/search`, m.matchLabel === 'new'
          ? `and ${plural(m.matchesOverflow, 'more new match', 'more new matches')}`
          : `and ${plural(m.matchesOverflow, 'more match', 'more matches')}`)}</td></tr>` : ''}
        <tr><td style="padding:6px 0 0;">${textLink(`${origin}/dashboard/search`, seeAll)}</td></tr>
      </table>
    </td></tr>`)
  }

  /* ── Week one: say what changes, and give it a button. ────────────────── */
  if (m.mode === 'week_one') {
    rows.push(`<tr><td style="background:${C.card};padding:24px 30px 0;">
      <p style="margin:0 0 12px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">
        Add one of these to your pipeline. Next Tuesday this email leads with your deadlines instead of your matches. That is the version worth having.
      </p>
      ${button(`${origin}/dashboard/search`, 'Add your first grant')}
    </td></tr>`)
  }

  /* ── 6. Near misses ──────────────────────────────────────────────────── */
  if (m.nearMisses.length) {
    rows.push(`<tr><td style="background:${C.card};padding:26px 30px 0;">
      ${sectionLabel('Just outside your profile')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${m.nearMisses.map(nearMissRow).join('')}
      </table>
    </td></tr>`)
  }

  /* ── 7. Profile prompt. One per email, never a list. ──────────────────── */
  if (m.prompt) {
    rows.push(`<tr><td style="background:${C.card};padding:26px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tile};border-radius:14px;">
        <tr><td style="padding:18px;">
          <p style="margin:0 0 5px;font-family:${UI};font-size:15.5px;font-weight:600;letter-spacing:-.2px;color:${C.deep};">${esc(m.prompt.title)}</p>
          <p style="margin:0 0 13px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(m.prompt.body)}</p>
          ${button(m.prompt.href, m.prompt.cta)}
        </td></tr>
      </table>
    </td></tr>`)
  }

  rows.push(`<tr><td style="background:${C.card};border-radius:0 0 16px 16px;padding:30px;"></td></tr>`)

  /* ── Footer. Catalogue growth is reassurance, not news, so it never leads.
        No product-news slot: the moment the digest has one, every week needs
        news, and the deadline that costs money gets scrolled past. ─────── */
  rows.push(`<tr><td style="padding:22px 30px 0;">
    <p style="margin:0 0 12px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">
      <b style="color:${C.deep};">Anything missing, or wrong?</b> Tell us about a funder we do not list, or a match that made no sense.
      <a href="${origin}/dashboard/feedback" style="color:${C.deep};font-weight:600;">Both take a minute</a>, and both change what you get next week.
    </p>
    <p style="margin:0 0 10px;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">
      <b style="color:${C.deep};">${m.catalogue.live.toLocaleString()} opportunities live</b> &mdash; ${m.catalogue.addedRecently} added in the last month.
    </p>
    <p style="margin:0 0 10px;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">
      You get this every Tuesday because you have a Shoots account. We only send it when there is something in it.
    </p>
    <p style="margin:0;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">
      <a href="${origin}/dashboard/profile#card-alerts" style="color:${C.deep};font-weight:600;text-decoration:underline;">Email preferences</a> &nbsp;&middot;&nbsp;
      <a href="${esc(unsubscribeUrl)}" style="color:${C.deep};font-weight:600;text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>`)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(m.subject)}</title>
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:20px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
${rows.join('\n')}
</table>
</td></tr>
</table>
</body>
</html>`
}
