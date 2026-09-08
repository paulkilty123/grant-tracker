/**
 * The launch-day email to the waitlist.
 *
 * The acknowledgement promised "one email the morning we open, with a link
 * straight to signup". This is that email. It is written as a note from Paul
 * rather than a marketing send: at this scale a founder's own words convert
 * better, and the reply-to is him, so "I read every reply" is true.
 *
 * Prices are the 5 September decision (list £19 / £35, launch £15 / £25 for
 * twelve months, Team by conversation). If they change, change them here and
 * on the landing page together.
 */
import { esc } from '@/lib/digest/text'
import { UI, BODY, C, logoLockup } from './tokens'

export interface LaunchEmailOptions {
  origin: string
  removalUrl: string
}

export const LAUNCH_EMAIL_SUBJECT = 'Shoots Funding is open'
const PREHEADER = 'Your signup link. 14 days of full access, no card needed.'

const SIGNUP_PATH = '/signup'

export function renderLaunchEmailText(opts: LaunchEmailOptions): string {
  const signup = `${opts.origin}${SIGNUP_PATH}`
  return [
    'Shoots is open',
    '',
    'Hi there,',
    '',
    'The Shoots Funding platform is now open, and you are in a day before',
    'public launch. Thank you for your interest.',
    '',
    'As a fundraiser and social entrepreneur for over 20 years, finding and',
    'managing good-fit funding has always been a challenge. I built Shoots to',
    'fix that for organisations like yours, so you can spend more time',
    'delivering.',
    '',
    `Set up your account: ${signup}`,
    '',
    'Setting up takes about five minutes. Drop in your website and we build',
    'your profile, then you see all the opportunities you are eligible for,',
    'ranked by fit.',
    '',
    'Every new organisation starts with 14 days of full access, no card',
    'needed: search, matches, saved opportunities with deadlines, a pipeline',
    'for your applications, projects, the application builder, and the Claude',
    'connector. That is our Apply plan, and at the end you choose the plan',
    'that suits you.',
    '',
    'Sign up before 31 October and the launch price is yours for 12 months:',
    'Match for £15 a month, or Apply for £25, or £150 and £250 for the year.',
    'After that they are £19 and £35. Cancel any time. Team, for up to five',
    'people or five client organisations, is by conversation: just reply.',
    '',
    'I read every reply to this email. If something looks wrong, or a funder',
    'you know is missing, tell me and I will fix it.',
    '',
    'Paul',
    'Founder, Shoots',
    '',
    `Take me off the list: ${opts.removalUrl}`,
    '',
    'Shoots, funding for UK charities and social enterprises',
    opts.origin.replace(/^https?:\/\//, ''),
  ].join('\n')
}

export function renderLaunchEmail(opts: LaunchEmailOptions): string {
  const { origin, removalUrl } = opts
  const signup = `${origin}${SIGNUP_PATH}`
  const p = (inner: string) =>
    `<p style="margin:0 0 18px;font-family:${BODY};font-size:15.5px;line-height:1.65;color:${C.deep};">${inner}</p>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(LAUNCH_EMAIL_SUBJECT)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
<style>
  @media only screen and (max-width: 600px) {
    .gutter { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(PREHEADER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:20px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td class="gutter" style="padding:8px 6px 20px;line-height:0;">
  ${logoLockup(origin)}
</td></tr>
<tr><td class="gutter" style="background:${C.page};padding:30px 30px 0;">
  <p style="margin:0 0 14px;font-family:${UI};font-size:24px;font-weight:600;letter-spacing:-.4px;color:${C.deep};line-height:1.25;">Shoots is open</p>
  ${p('Hi there,')}
  ${p('The Shoots Funding platform is now open, and you are in a day before public launch. Thank you for your interest.')}
  ${p('As a fundraiser and social entrepreneur for over 20 years, finding and managing good-fit funding has always been a challenge. I built Shoots to fix that for organisations like yours, so you can spend more time delivering.')}
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(signup)}" style="height:40px;v-text-anchor:middle;width:190px;" arcsize="50%" stroke="f" fillcolor="${C.deep}">
    <w:anchorlock/>
    <center style="color:${C.onDeep};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Set up your account</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
    <td style="background:${C.deep};border-radius:999px;">
      <a href="${esc(signup)}" style="display:inline-block;padding:11px 22px;font-family:${UI};font-size:14px;font-weight:600;color:${C.onDeep};text-decoration:none;">Set up your account</a>
    </td>
  </tr></table>
  <!--<![endif]-->
  ${p('Setting up takes about five minutes. Drop in your website and we build your profile, then you see all the opportunities you are eligible for, ranked by fit.')}
  ${p('Every new organisation starts with <b>14 days of full access, no card needed</b>: search, matches, saved opportunities with deadlines, a pipeline for your applications, projects, the application builder, and the Claude connector. That is our Apply plan, and at the end you choose the plan that suits you.')}
  ${p('Sign up before 31 October and the launch price is yours for 12 months: <b>Match for £15 a month, or Apply for £25</b>, or £150 and £250 for the year. After that they are £19 and £35. Cancel any time. Team, for up to five people or five client organisations, is by conversation: just reply.')}
  ${p('I read every reply to this email. If something looks wrong, or a funder you know is missing, tell me and I will fix it.')}
  <p style="margin:0 0 4px;font-family:${BODY};font-size:15.5px;line-height:1.65;color:${C.deep};">Paul</p>
  <p style="margin:0 0 6px;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">Founder, Shoots</p>
</td></tr>
<tr><td class="gutter" style="background:${C.page};padding:22px 30px 30px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.rule};padding-top:18px;">
    <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">You are getting this because you joined the Shoots waitlist. <a href="${esc(removalUrl)}" style="color:${C.deep};font-weight:600;text-decoration:underline;">Take me off the list</a>.</p>
  </td></tr></table>
</td></tr>
<tr><td class="gutter" style="padding:0 30px 0;">
  <p style="margin:0;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">Shoots, funding for UK charities and social enterprises<br><a href="${origin}" style="color:${C.deep};font-weight:600;text-decoration:underline;">${esc(origin.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
