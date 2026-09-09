import type { DigestModel } from './build'
import { esc, humanDayDate, plural, spell } from './text'
import { FUNDING_TYPE_COLOUR, type FundingTypeKey } from '@/lib/funding-type-colours'
import { UI, BODY, C } from '@/lib/email/tokens'

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

/* Palette and type stack live in `@/lib/email/tokens` now that a second email
   is built from them. They were declared here until 2026-09-05. */

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

function tileCell(days: number, bg?: string): string {
  const t = bg ? { ...tile(days), bg } : tile(days)
  if (days >= 999) {
    // No deadline: rolling, or open until further notice. The sentinel the
    // builder uses to sort these last was rendering as "999 days" (seen on a
    // Digital Candle in-kind row, 7 Sept). Say the true thing instead.
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:10px;">
      <tr><td align="center" style="padding:11px 10px;font-family:${UI};font-size:12px;font-weight:700;letter-spacing:.6px;color:${C.deep};line-height:1;">OPEN</td></tr>
    </table>`
  }
  if (t.today) {
    // Anything closing today is called out, never shown as an equal to one 80
    // days away. The word replaces the numeral rather than sitting under a "0".
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:10px;">
      <tr><td align="center" style="padding:11px;font-family:${UI};font-size:13.5px;font-weight:700;letter-spacing:.6px;color:${C.deep};line-height:1;">TODAY</td></tr>
    </table>`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:10px;">
    <tr><td align="center" style="padding:11px 14px 2px;font-family:${UI};font-size:24px;font-weight:700;color:${C.deep};line-height:1;">${days}</td></tr>
    <tr><td align="center" style="padding:0 14px 11px;font-family:${UI};font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:${C.deep};">${days === 1 ? 'day' : 'days'}</td></tr>
  </table>`
}

/**
 * Bulletproof primary button: a table cell carrying the background, plus a
 * VML roundrect for Outlook's Word engine, which ignores border-radius and was
 * drawing the pill as a rectangle. The VML width is an estimate from the
 * label length; Outlook ignores the table version entirely via the
 * conditional, so the two never both render. `inverse` is the pale-on-deep
 * variant used inside the deep week-one card.
 */
function button(href: string, label: string, inverse = false): string {
  const fill = inverse ? C.onDeep : C.deep
  const text = inverse ? C.deep : C.onDeep
  const vmlWidth = Math.round(36 + label.length * 7.4)
  return `<!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:36px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="50%" stroke="f" fillcolor="${fill}">
      <w:anchorlock/>
      <center style="color:${text};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;">${esc(label)}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${fill};border-radius:999px;">
      <a href="${esc(href)}" style="display:inline-block;padding:9px 18px;font-family:${UI};font-size:13px;font-weight:600;color:${text};text-decoration:none;">${esc(label)}</a>
    </td>
  </tr></table>
    <!--<![endif]-->`
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
function sectionLabel(text: string, gap = 16): string {
  // 20px sentence case (design review, 7 Sept 2026). The 11.5px uppercase
  // label was smaller than the item titles it introduced, so sections did not
  // read as sections. 8px under it where a supporting line follows, 16 where
  // items follow directly.
  return `<p style="margin:0 0 ${gap}px;font-family:${UI};font-size:20px;font-weight:600;letter-spacing:-.4px;color:${C.deep};">${esc(text)}</p>`
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
function tileCard(days: number, inner: string, first: boolean, tileBg?: string): string {
  return `<tr><td class="gutter" style="background:${C.page};padding:${first ? '0' : '10px'} 30px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
      <tr>
        <td class="tile" width="78" valign="top" style="padding:18px 0 18px 18px;">${tileCell(days, tileBg)}</td>
        <td valign="top" style="padding:18px 18px 18px 14px;">${inner}</td>
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

/** Gold "New" chip, in front of the type pill on "New this week" rows only. */
const newChip = () =>
  `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#EBCE78;color:${C.deep};font-family:${UI};font-size:11px;font-weight:700;letter-spacing:.3px;white-space:nowrap;">New</span>&nbsp;`

/** The type pill followed by the rest of the meta line. */
const typedMeta = (type: FundingTypeKey, t: string, isNew = false) =>
  `<p style="margin:0 0 6px;font-family:${BODY};font-size:13px;line-height:1.9;color:${C.body};">${isNew ? newChip() : ''}${typePill(type)}${t ? `&nbsp;&nbsp;${esc(t)}` : ''}</p>`

const metaLine = (t: string) =>
  t ? `<p style="margin:0 0 6px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.body};">${esc(t)}</p>` : ''

const textLink = (href: string, label: string) =>
  `<p style="margin:0;font-family:${UI};font-size:13.5px;font-weight:600;">
     <a href="${esc(href)}" style="color:${C.deep};text-decoration:underline;">${esc(label)}</a>
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
  rows.push(`<tr><td class="gutter" style="background:${C.page};padding:30px 30px 0;">
    ${sectionLabel(m.mode === 'week_one' ? (m.matches.length ? 'Your first matches' : 'Getting started') : 'Upcoming deadlines', 8)}
    <p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.55;color:${C.deep};">${esc(m.lead)}</p>
  </td></tr>`)

  /* ── 1. Closing soon ─────────────────────────────────────────────────── */
  m.closing.forEach((r, i) => {
    const href = r.url ?? `${origin}/dashboard/deadlines`
    // Meta on one line: funder, close date, the status prefix and the bold
    // status word (design review, 7 Sept). The prefix loses its own trailing
    // separator and capital so it reads as one sentence of fragments.
    const prefix = r.statusPrefix.replace(/[\s·]+$/, '').replace(/^Added/, 'added')
    const bits = [r.funder, `closes ${r.deadlineLabel}`, prefix].filter((x): x is string => !!x).map(esc).join(' &middot; ')
    rows.push(tileCard(r.days, `
      <p style="margin:0 0 4px;">${nameLink(href, r.name, 18)}</p>
      <p style="margin:0 0 12px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.body};">${bits}${r.statusStrong ? ` &middot; <b style="color:${C.deep};">${esc(r.statusStrong)}</b>` : ''}</p>
      ${button(href, r.kind === 'saved' ? 'Decide on this' : 'Open in Shoots')}
    `, i === 0))
  })

  if (m.closingOverflow > 0) {
    rows.push(`<tr><td class="gutter" style="background:${C.page};padding:12px 30px 0;">
      ${textLink(`${origin}/dashboard/deadlines`, `and ${m.closingOverflow} more closing this month`)}
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
    // Paul's section mockup, 7 Sept: a hairline-ruled list, title over flag,
    // the flag in grey with only the variable part in the danger colour. The
    // last row carries the closing rule, whatever the row count.
    const last = m.inProgress.length - 1
    const flag = (r: { stalled: boolean; stageLabel: string }) => {
      const m2 = r.stalled ? r.stageLabel.match(/^(No movement (?:since|in) )(.+)$/) : null
      return m2
        ? `${esc(m2[1])}<span style="color:${C.danger};">${esc(m2[2])}</span>`
        : esc(r.stageLabel)
    }
    const lines = m.inProgress.map((r, i) => `
        <tr><td style="border-top:1px solid ${C.rule};${i === last ? `border-bottom:1px solid ${C.rule};` : ''}padding:12px 0;">
          <p style="margin:0 0 3px;">${nameLink(r.url, r.name, 15)}</p>
          <p style="margin:0;font-family:${BODY};font-size:12.5px;line-height:1.5;color:${C.body};">${flag(r)}</p>
        </td></tr>`).join('')
    // "Also" only when something came before it.
    rows.push(ruledSection(`${sectionLabel(m.closing.length ? 'Also in progress' : 'In progress', 10)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}
      </table>
      ${m.inProgressOverflow > 0 ? `<p style="margin:12px 0 0;font-family:${BODY};font-size:13px;line-height:1.6;color:${C.body};"><a href="${origin}/dashboard/pipeline" style="color:${C.deep};text-decoration:underline;">${m.inProgressOverflow} more in progress</a></p>` : ''}`))
  }

  /* ── New this week. Present ONLY when it has rows: an empty section that
        announces there is nothing new teaches the reader to skip it, and the
        catalogue publishes nothing at all in a normal week more often than
        not. Nothing here says "no new funding" — it simply is not there. ── */
  // OFF for the 8 September send (Paul, 7 Sept). At the 65 floor the section
  // still surfaced the Army Benevolent Fund for three arts charities and
  // castles for Tibet Watch, because the matcher treats a funder's named
  // beneficiary group as a warning rather than a cap. The builder still
  // computes the rows so they stay deduped out of the ranked list; the
  // renderer simply does not draw them until the matcher is fixed.
  const SHOW_NEW_THIS_WEEK = false
  if (SHOW_NEW_THIS_WEEK && m.newThisWeek.length) {
    const body = m.newThisWeek.map(r => `
      <p style="margin:0 0 3px;">${nameLink(r.url, r.title, 16)}</p>
      ${typedMeta(r.type, r.meta, true)}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>`).join('')
    rows.push(ruledSection(`${sectionLabel('New this week', 8)}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.body};">Added to the catalogue in the last seven days, and matched to you.</p>
      ${body}`))
  }

  /* ── 3. Matches ──────────────────────────────────────────────────────── */
  if (m.matches.length) {
    const seeAll = `See all ${m.matchTotal <= 10 ? spell(m.matchTotal) : m.matchTotal} ${m.matchTotal === 1 ? 'match' : 'matches'}`

    if (m.mode === 'week_one') {
      // Week one is deadline-sorted, so its rows carry countdown tiles like the
      // closing section does. It is the only state where matches lead, and
      // showing them without the dates would hide the reason for the order.
      // Gold tiles throughout week one: same component as the full state's
      // tiles, so one colour, and the terracotta urgency tier is not invoked
      // on a list the reader has not yet committed to.
      m.matches.forEach((r, i) => {
        rows.push(tileCard(r.days ?? 999, `
          <p style="margin:0 0 4px;">${nameLink(r.url, r.title, 16.5)}</p>
          ${typedMeta(r.type, r.meta)}
          <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.55;color:${C.body};">${esc(r.blurb)}</p>
        `, i === 0, '#EBCE78'))
      })
      // The point of this email, as a deep card directly under the matches,
      // with "See all" beneath it. It was sitting mid-scroll behind the
      // near-miss section.
      rows.push(`<tr><td class="gutter" style="background:${C.page};padding:20px 30px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.deep};border-radius:14px;">
          <tr><td style="padding:20px 22px;">
            <p style="margin:0 0 14px;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.onDeep};">
              Add one of these to your pipeline. Next Tuesday this email leads with your deadlines instead of your matches, and that is the version worth having.
            </p>
            ${button(`${origin}/dashboard/search`, 'Add your first grant', true)}
          </td></tr>
        </table>
      </td></tr>`)
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
      ${sectionLabel('Just outside your profile', 8)}
      <p style="margin:0 0 16px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.body};">${esc(intro)}</p>
      ${body}`))
  }

  /* ── 5. Profile prompt. Mint card, outline button — quieter than a deadline. */
  const profileGap = m.mode === 'week_one' && !m.matches.length
  if (m.prompt) {
    // In the profile-gap state the prompt is the only action, so it gets the
    // filled primary. Everywhere else it stays quieter than a deadline.
    rows.push(ruledSection(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-family:${UI};font-size:15.5px;font-weight:600;letter-spacing:-.2px;color:${C.deep};">${esc(m.prompt.title)}</p>
          <p style="margin:0 0 14px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">${esc(m.prompt.body)}</p>
          ${profileGap ? button(m.prompt.href, m.prompt.cta) : ghostButton(m.prompt.href, m.prompt.cta)}
        </td></tr>
      </table>`))
  }

  /* ── Profile gap: what is waiting. Without this the only evidence a
        catalogue existed was 12.5px grey in the footer, and the state read as
        a dead end. The count is the same provenance link the footer carries. */
  const freshLine = m.catalogue.addedRecently >= 10 ? `, and ${m.catalogue.addedRecently} were added in the last two weeks` : ''
  if (profileGap) {
    rows.push(ruledSection(`
      ${sectionLabel('What is waiting', 8)}
      <p style="margin:0 0 14px;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.deep};">
        <a href="${origin}/dashboard/search?entry=live" style="color:${C.deep};font-weight:600;text-decoration:underline;">${m.catalogue.live.toLocaleString()} opportunities are live</a> across grants, programmes, investment and in-kind support${freshLine}. You can search all of them now, with or without a full profile.
      </p>
      ${ghostButton(`${origin}/dashboard/search?entry=live`, 'Browse the catalogue')}`))
  }

  /* ── 6. Feedback.
        On its own tinted ground, because as plain grey text at the foot it read
        as the boilerplate every email ends with and got skipped. It is an ask,
        and the two things it asks for — a missing funder, a bad match — are the
        two cheapest sources of catalogue and scorer improvement there are. The
        mint card is the same one the profile prompt uses, so it reads as
        something addressed to the reader rather than a legal footer. ── */
  // Not in the profile-gap state: asking someone with no matches to report a
  // bad match is an odd second ask, and two mint cards with identical outlined
  // pills gave the prompt and this equal weight.
  if (!profileGap) {
    rows.push(`<tr><td class="gutter" style="background:${C.page};padding:26px 30px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 6px;font-family:${UI};font-size:15px;font-weight:600;letter-spacing:-.2px;color:${C.deep};">Seen a funder we are missing, or something that looks wrong?</p>
        <p style="margin:0 0 14px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">
          Funders you send us get checked and added. Matches you flag help us pick better ones for you.
        </p>
        ${ghostButton(`${origin}/dashboard/feedback`, 'Tell us')}
      </td></tr>
    </table>
  </td></tr>`)
  }

  /* ── Footer. Catalogue growth is reassurance, not news, so it never leads. */
  // The count is a link: it lets somebody go and look. The "added" clause is
  // suppressed below ten and never rendered at zero; "2 added in the last two
  // weeks" is worse than silence. The profile-gap state already carries the
  // count in its body, so its footer is the two links only.
  rows.push(`<tr><td class="gutter" style="padding:${profileGap ? '30px' : '22px'} 30px 0;">
    ${profileGap ? '' : `<p style="margin:0 0 10px;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">
      <a href="${origin}/dashboard/search?entry=live" style="color:${C.deep};font-weight:600;text-decoration:underline;">${m.catalogue.live.toLocaleString()} opportunities live</a>${m.catalogue.addedRecently >= 10 ? ` &mdash; ${m.catalogue.addedRecently} added in the last two weeks.` : '.'}
    </p>`}
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
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
<style>
  /* The email was rendering at a fixed 600px, so a 375px phone zoomed out to
     fit and every size in it shrank by a third. The table is fluid now; this
     buys back the gutters, which were taking 60px of a 375px screen. */
  @media only screen and (max-width: 600px) {
    .gutter { padding-left: 18px !important; padding-right: 18px !important; }
    .tile   { width: 66px !important; }
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
