import type { DigestModel } from './build'
import { esc, humanDayDate, plural, spell } from './text'
import { FUNDING_TYPE_COLOUR, type FundingTypeKey } from '@/lib/funding-type-colours'

/* ═══════════════════════════════════════════════════════════════════════════
   Email HTML — "ground D".

   Tables and inline styles throughout. No flexbox, no grid, no SVG: Outlook
   renders with Word's engine. The countdown tile is a table cell, because a
   "10 days" that exists only as an image is invisible to the reader who most
   needs it.

   GROUND AND CARD (spec §1b). The email is not beige. Page and panel are both
   #FFFFFF with no visible panel edge — the cards carry the structure — and the
   card fill is pale mint #EDF6F1.

   A FILL, NOT A BORDER, and that is why the hairline this file used to draw is
   gone: a background colour is the most reliable thing in HTML email and a 1px
   border is among the least, because Outlook thins and drops them. If a border
   ever returns it returns in ADDITION to the fill, never instead of it.
   ═══════════════════════════════════════════════════════════════════════════ */

const UI   = "'Space Grotesk',Helvetica,Arial,sans-serif"
const BODY = "'Plus Jakarta Sans',Helvetica,Arial,sans-serif"

const C = {
  page:   '#FFFFFF',
  card:   '#EDF6F1',
  deep:   '#1D3C3E',
  onDeep: '#F6F1E7',
  body:   '#5F5E5A',
  muted:  '#73726F',
  rule:   'rgba(29,60,62,.10)',
  danger: '#B94040',
}

/**
 * Countdown tile tiers (spec §1b).
 *
 * The numeral is 22px bold, which is WCAG large text, so the 3:1 floor applies
 * and terracotta clears it at 3.70. DO NOT shrink the numeral below 19px bold:
 * terracotta fails at normal-text sizes, and it fails on exactly the rows that
 * matter most.
 */
function tile(days: number): { bg: string; today: boolean } {
  if (days <= 0)  return { bg: '#D67558', today: true }
  if (days <= 14) return { bg: '#D67558', today: false }
  if (days <= 28) return { bg: '#EBCE78', today: false }
  return { bg: '#9BCA9D', today: false }
}

function tileCell(days: number): string {
  const t = tile(days)
  if (t.today) {
    // Anything closing today is called out, never shown as an equal to one 80
    // days away. The word replaces the numeral rather than sitting under a "0".
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:10px;">
      <tr><td align="center" style="padding:11px;font-family:${UI};font-size:13.5px;font-weight:700;letter-spacing:.6px;color:${C.deep};line-height:1;">TODAY</td></tr>
    </table>`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:10px;">
    <tr><td align="center" style="padding:10px 13px 2px;font-family:${UI};font-size:22px;font-weight:700;color:${C.deep};line-height:1;">${days}</td></tr>
    <tr><td align="center" style="padding:0 13px 10px;font-family:${UI};font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:${C.deep};">${days === 1 ? 'day' : 'days'}</td></tr>
  </table>`
}

/** Bulletproof primary button: a table cell carrying the background. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${C.deep};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:9px 18px;font-family:${UI};font-size:13px;font-weight:600;color:${C.onDeep};text-decoration:none;">${esc(label)}</a>
    </td>
  </tr></table>`
}

/** Outline button. The profile prompt is quieter than a deadline. */
function ghostButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border:1.5px solid ${C.deep};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:8px 16px;font-family:${UI};font-size:13px;font-weight:600;color:${C.deep};text-decoration:none;">${esc(label)}</a>
    </td>
  </tr></table>`
}

/**
 * Every item name is a link, and every one is UNDERLINED.
 *
 * The link colour equals the heading colour deliberately, which makes the
 * underline the affordance rather than the colour. That is the accessible
 * version, and it is also the one that survives a client stripping colour.
 */
function nameLink(href: string | null, text: string, size: number): string {
  const font = `font-family:${UI};font-size:${size}px;font-weight:600;letter-spacing:-.2px;line-height:1.3;`
  return href
    ? `<a href="${esc(href)}" style="${font}color:${C.deep};text-decoration:underline;">${esc(text)}</a>`
    : `<span style="${font}color:${C.deep};">${esc(text)}</span>`
}

/**
 * A section label.
 *
 * Deep rather than muted grey, and that is a deliberate change from the
 * artboards. At 11px in #73726F on white these were caption-coloured and read
 * as furniture — they are the only thing telling a reader which part of the
 * email they are in, and they were the quietest text on the page. Deep at 11.5
 * takes the contrast from about 4.9:1 to 11.9:1.
 *
 * They do not compete with the row titles despite sharing a colour: those are
 * 15 to 17px, sentence case and underlined. Uppercase at 11.5 with 1.6px
 * tracking stays subordinate on shape alone.
 */
function sectionLabel(text: string, gap = 12): string {
  return `<p style="margin:0 0 ${gap}px;font-family:${UI};font-size:11.5px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.deep};">${esc(text)}</p>`
}

/** A section opens with one hairline rule above its label. One value, always. */
function ruledSection(inner: string): string {
  return `<tr><td class="gutter" style="background:${C.page};padding:26px 30px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-top:1px solid ${C.rule};padding-top:24px;">${inner}</td>
    </tr></table>
  </td></tr>`
}

/** The mint card, used by closing rows and — in week one — by match rows. */
function tileCard(days: number, inner: string, first: boolean): string {
  return `<tr><td class="gutter" style="background:${C.page};padding:${first ? '0' : '10px'} 30px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
      <tr>
        <td class="tile" width="70" valign="top" style="padding:16px 0 16px 16px;">${tileCell(days)}</td>
        <td valign="top" style="padding:16px 16px 16px 14px;">${inner}</td>
      </tr>
    </table>
  </td></tr>`
}

/**
 * The funding type, as a pill.
 *
 * Half of ACC's match list is in-kind — pro bono consultancy, volunteer
 * placements, materials donations — and before this it looked identical to a
 * £10k grant. A word in the meta line said so; a pill says it at a glance,
 * which is the point of putting it there at all.
 *
 * Colours are the app's own FUNDING_TYPE_COLOUR tokens, so the email and Find
 * Funding teach the same thing. TINT background with the FG on it, never the
 * saturated rail: those are for the countdown tiles, which are the one signal
 * that has to shout, and four rails competing with them would flatten the
 * urgency the tiles exist to carry.
 *
 * Outlook renders the Word engine, which drops inline-block and its padding.
 * The pill degrades there to coloured text on a tinted ground — still the
 * right colour, still legible, just square and tight.
 */
function typePill(type: FundingTypeKey): string {
  const c = FUNDING_TYPE_COLOUR[type] ?? FUNDING_TYPE_COLOUR.grant
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${c.tint};color:${c.fg};font-family:${UI};font-size:11px;font-weight:700;letter-spacing:.3px;white-space:nowrap;">${esc(c.label)}</span>`
}

/** The type pill followed by the rest of the meta line. */
const typedMeta = (type: FundingTypeKey, t: string) =>
  `<p style="margin:0 0 6px;font-family:${BODY};font-size:13px;line-height:1.9;color:${C.body};">${typePill(type)}${t ? `&nbsp;&nbsp;${esc(t)}` : ''}</p>`

const metaLine = (t: string) =>
  t ? `<p style="margin:0 0 6px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.body};">${esc(t)}</p>` : ''

const textLink = (href: string, label: string) =>
  `<p style="margin:0;font-family:${UI};font-size:13.5px;font-weight:600;">
     <a href="${esc(href)}" style="color:${C.deep};text-decoration:underline;">${esc(label)} &rarr;</a>
   </p>`

export interface RenderOptions {
  origin: string
  unsubscribeUrl: string
  now?: Date
}

export function renderDigest(m: DigestModel, opts: RenderOptions): string {
  const { origin, unsubscribeUrl } = opts
  const now = opts.now ?? new Date()
  const rows: string[] = []

  /* ── Header. ONE image for the whole lockup, with alt text.
        Space Grotesk does not load in Outlook or the Gmail app, so a live-text
        wordmark renders Helvetica — which is not the logo. A logo is the one
        element where the typeface IS the content, so it is the one element
        that should be an image. ── */
  rows.push(`<tr><td style="padding:8px 6px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="left" style="line-height:0;">
        <!-- height:auto derives the height from the width, so no client can
             stretch it by honouring one attribute and not the other. The
             height attribute stays for Outlook, which ignores the style. -->
        <img src="${origin}/email/shoots-logo@2x.png" width="146" height="43" alt="Shoots"
             style="display:block;width:146px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;">
      </td>
      <td align="right" style="font-family:${UI};font-size:12.5px;font-weight:500;color:${C.muted};">${esc(humanDayDate(now))}</td>
    </tr></table>
  </td></tr>`)

  /* ── Lead. The label is the identity, same place every week. No hero
        headline — the subject already named the consequential item, and a
        variable hero means the email is re-learned every send. ── */
  rows.push(`<tr><td class="gutter" style="background:${C.page};border-radius:16px 16px 0 0;padding:30px 30px 0;">
    ${sectionLabel(m.mode === 'week_one' ? 'Your first matches' : 'Upcoming deadlines', 6)}
    <p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.55;color:${C.deep};">${esc(m.lead)}</p>
  </td></tr>`)

  /* ── 1. Closing soon ─────────────────────────────────────────────────── */
  m.closing.forEach((r, i) => {
    const href = r.url ?? `${origin}/dashboard/deadlines`
    rows.push(tileCard(r.days, `
      <p style="margin:0 0 4px;">${nameLink(href, r.name, 17)}</p>
      ${metaLine([r.funder, `closes ${r.deadlineLabel}`].filter(Boolean).join(' · '))}
      <p style="margin:0 0 12px;font-family:${BODY};font-size:13.5px;line-height:1.5;color:${C.body};">${esc(r.statusPrefix)}${r.statusStrong ? `<b style="color:${C.deep};">${esc(r.statusStrong)}</b>` : ''}</p>
      ${button(href, r.kind === 'saved' ? 'Decide on this' : 'Open in Shoots')}
    `, i === 0))
  })

  if (m.closingOverflow > 0) {
    rows.push(`<tr><td class="gutter" style="background:${C.page};padding:12px 30px 0;">
      ${textLink(`${origin}/dashboard/deadlines`, `and ${plural(m.closingOverflow, 'more')} closing this month`)}
    </td></tr>`)
  }

  /* ── The reassurance line. Not filler: an exception report is only
        trustworthy if it says what it checked. ─────────────────────────── */
  if (m.reassurance && m.mode !== 'week_one') {
    rows.push(`<tr><td class="gutter" style="background:${C.page};padding:14px 30px 0;">
      <p style="margin:0;font-family:${BODY};font-size:13px;line-height:1.55;color:${C.body};">${esc(m.reassurance)}</p>
    </td></tr>`)
  }

  /* ── 2. Also in progress. One line each: name left, stage right. ─────── */
  if (m.inProgress.length) {
    const lines = m.inProgress.map((r, i) => {
      const gap = i === m.inProgress.length - 1 ? '0' : '7px'
      return `<tr>
        <td valign="top" style="padding:0 10px ${gap} 0;">${nameLink(r.url, r.name, 15)}</td>
        <td align="right" valign="top" style="padding:0 0 ${gap};font-family:${BODY};font-size:13px;line-height:1.6;color:${r.stalled ? C.danger : C.body};white-space:nowrap;">${esc(r.stageLabel)}</td>
      </tr>`
    }).join('')
    rows.push(ruledSection(`${sectionLabel('Also in progress')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}</table>
      ${m.inProgressOverflow > 0 ? `<div style="margin-top:12px;">${textLink(`${origin}/dashboard/pipeline`, `and ${plural(m.inProgressOverflow, 'more')} in progress`)}</div>` : ''}`))
  }

  /* ── New this week. Present ONLY when it has rows: an empty section that
        announces there is nothing new teaches the reader to skip it, and the
        catalogue publishes nothing at all in a normal week more often than
        not. Nothing here says "no new funding" — it simply is not there. ── */
  if (m.newThisWeek.length) {
    const body = m.newThisWeek.map(r => `
      <p style="margin:0 0 3px;">${nameLink(r.url, r.title, 16)}</p>
      ${typedMeta(r.type, r.meta)}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>`).join('')
    rows.push(ruledSection(`${sectionLabel('New this week')}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.body};">Added to the catalogue in the last seven days, and open to you.</p>
      ${body}`))
  }

  /* ── 3. Matches ──────────────────────────────────────────────────────── */
  if (m.matches.length) {
    const seeAll = `See all ${m.matchTotal <= 10 ? spell(m.matchTotal) : m.matchTotal} ${m.matchTotal === 1 ? 'match' : 'matches'}`

    if (m.mode === 'week_one') {
      // Week one is deadline-sorted, so its rows carry countdown tiles like the
      // closing section does. It is the only state where matches lead, and
      // showing them without the dates would hide the reason for the order.
      m.matches.forEach((r, i) => {
        rows.push(tileCard(r.days ?? 999, `
          <p style="margin:0 0 4px;">${nameLink(r.url, r.title, 16.5)}</p>
          ${typedMeta(r.type, r.meta)}
          <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>
        `, i === 0))
      })
      rows.push(`<tr><td class="gutter" style="background:${C.page};padding:16px 30px 0;">
        ${textLink(`${origin}/dashboard/search`, seeAll)}
      </td></tr>`)
    } else {
      const label = m.matchLabel === 'new' ? 'New matches' : 'Matches worth a look'
      const body = m.matches.map(r => `
        <p style="margin:0 0 3px;">${nameLink(r.url, r.title, 16)}</p>
        ${typedMeta(r.type, r.meta)}
        <p style="margin:0 0 16px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>`).join('')
      rows.push(ruledSection(`${sectionLabel(label)}${body}${textLink(`${origin}/dashboard/search`, seeAll)}`))
    }
  }

  /* ── Week one: say what changes, and give it a button. ────────────────── */
  if (m.mode === 'week_one') {
    rows.push(ruledSection(`
      <p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.6;color:${C.deep};">
        Add one of these to your pipeline. Next Tuesday this email leads with your deadlines instead of your matches &mdash; that is the version worth having.
      </p>
      ${button(`${origin}/dashboard/search`, 'Add your first grant')}`))
  }

  /* ── 4. Just outside your profile ────────────────────────────────────── */
  if (m.nearMisses.length) {
    const n = m.nearMisses.length
    const word = spell(n).replace(/^./, c => c.toUpperCase())
    // "We ruled it out and here is why" is a weaker claim than "this is nearly
    // relevant", and the section only carries rows that clear the second one.
    const intro = `${word} that fell just outside, and why. ${n === 1 ? 'This is' : 'These are'} close enough that you may know something we do not.`
    const body = m.nearMisses.map((r, i) => `
        <p style="margin:0 0 5px;">${nameLink(r.url, r.title, 15.5)}</p>
        ${typedMeta(r.type, r.meta)}
        <p style="margin:0 0 5px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};"><b style="color:${C.deep};">${esc(r.verdict)}</b> ${esc(r.rule)}</p>
        <p style="margin:0 0 ${i === n - 1 ? '0' : '16px'};font-family:${BODY};font-size:13px;line-height:1.55;color:${C.body};">${esc(r.condition)}</p>`).join('')
    rows.push(ruledSection(`
      ${sectionLabel('Just outside your profile', 6)}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.body};">${esc(intro)}</p>
      ${body}`))
  }

  /* ── 5. Profile prompt. Mint card, outline button — quieter than a deadline. */
  if (m.prompt) {
    rows.push(ruledSection(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-family:${UI};font-size:15.5px;font-weight:600;letter-spacing:-.2px;color:${C.deep};">${esc(m.prompt.title)}</p>
          <p style="margin:0 0 14px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">${esc(m.prompt.body)}</p>
          ${ghostButton(m.prompt.href, m.prompt.cta)}
        </td></tr>
      </table>`))
  }

  /* ── 6. Feedback.
        On its own tinted ground, because as plain grey text at the foot it read
        as the boilerplate every email ends with and got skipped. It is an ask,
        and the two things it asks for — a missing funder, a bad match — are the
        two cheapest sources of catalogue and scorer improvement there are. The
        mint card is the same one the profile prompt uses, so it reads as
        something addressed to the reader rather than a legal footer. ── */
  rows.push(`<tr><td class="gutter" style="background:${C.page};border-radius:0 0 16px 16px;padding:26px 30px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 6px;font-family:${UI};font-size:15px;font-weight:600;letter-spacing:-.2px;color:${C.deep};">Seen a funder we are missing, or a match that made no sense?</p>
        <p style="margin:0 0 14px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">
          Funder suggestions go into the catalogue for everyone, and bad matches change how yours are picked.
        </p>
        ${ghostButton(`${origin}/dashboard/feedback`, 'Tell us')}
      </td></tr>
    </table>
  </td></tr>`)

  /* ── Footer. Catalogue growth is reassurance, not news, so it never leads. */
  rows.push(`<tr><td class="gutter" style="padding:22px 30px 0;">
    <!-- The count is a link. The line already asserts the catalogue is alive;
         this is what lets somebody go and look, which is the only reason the
         assertion is interesting. ?entry=live opens Latest Grants — everything
         added in the last 60 days, newest first. -->
    <p style="margin:0 0 10px;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">
      <a href="${origin}/dashboard/search?entry=live" style="color:${C.deep};font-weight:600;text-decoration:underline;">${m.catalogue.live.toLocaleString()} opportunities live</a>
      &mdash; ${m.catalogue.addedRecently} added in the last two weeks.
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
<style>
  /* The email was rendering at a fixed 600px, so a 375px phone zoomed out to
     fit and every size in it shrank by a third. The table is fluid now; this
     buys back the gutters, which were taking 60px of a 375px screen. */
  @media only screen and (max-width: 600px) {
    .gutter { padding-left: 18px !important; padding-right: 18px !important; }
    .tile   { width: 58px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:20px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
${rows.join('\n')}
</table>
</td></tr>
</table>
</body>
</html>`
}
