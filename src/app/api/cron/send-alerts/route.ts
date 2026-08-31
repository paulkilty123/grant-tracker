// Vercel Cron handler — called every Monday at 8am
// Vercel sends Authorization: Bearer <CRON_SECRET> automatically when CRON_SECRET is set
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  getOrgsWithAlertsEnabled, getUnsentAlerts, markAlertsSent,
  alertAllowlist, isAllowedRecipient,
  ALERT_MAX_GRANTS_PER_EMAIL, ALERT_LOOKBACK_DAYS,
} from '@/lib/alerts'
import type { AlertGrant } from '@/lib/alerts'
import { recordRun } from '@/lib/admin/cron-runs'
import { EMAIL_FROM, EMAIL_APP_URL } from '@/lib/mcp-brand'
import { unsubscribeUrl } from '@/lib/alerts-unsubscribe'

const FROM_EMAIL = EMAIL_FROM
const APP_URL    = EMAIL_APP_URL

export const dynamic = 'force-dynamic'


function buildEmailHtml(orgName: string, grants: AlertGrant[], unsubUrl: string): string {
  const scoreColour = (s: number) =>
    s >= 80 ? '#4a7c59' : s >= 65 ? '#c9963a' : '#6b6b6b'

  const grantCards = grants.map(({ grant, score, reason }) => `
    <div style="background:#ffffff;border:1px solid #e8ddd0;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;">
          <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#1a3c2e;">${grant.title}</p>
          <p style="margin:0;font-size:13px;color:#6b6b6b;">${grant.funder}</p>
        </div>
        <div style="background:${scoreColour(score)}22;border-radius:20px;padding:4px 10px;margin-left:12px;flex-shrink:0;">
          <span style="font-size:12px;font-weight:700;color:${scoreColour(score)};">${score}% match</span>
        </div>
      </div>
      <p style="margin:8px 0;font-size:13px;color:#2d2d2d;line-height:1.5;">${grant.description}</p>
      <p style="margin:8px 0;font-size:12px;color:#4a7c59;background:#f0f7f2;border-radius:8px;padding:8px 12px;">● ${reason}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
        <span style="font-size:18px;font-weight:700;color:#c9963a;">
          ${grant.amountMin && grant.amountMax
            ? `£${grant.amountMin.toLocaleString()} – £${grant.amountMax.toLocaleString()}`
            : grant.amountMax
            ? `Up to £${grant.amountMax.toLocaleString()}`
            : 'Amount varies'}
        </span>
        ${grant.applyUrl ? `<a href="${grant.applyUrl}" style="background:#1a3c2e;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;">View grant →</a>` : ''}
      </div>
    </div>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#f7f4ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a3c2e;">New matching grants for ${orgName}</h1>
        <p style="margin:0;font-size:14px;color:#6b6b6b;">We found ${grants.length} grant${grants.length === 1 ? '' : 's'} that match your profile</p>
      </div>
      ${grantCards}
      <div style="text-align:center;margin:32px 0;">
        <a href="${APP_URL}/dashboard/search" style="background:#1a3c2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
          View all matching grants →
        </a>
      </div>
      <!-- Both links must land somewhere that can actually honour them. The
           "manage" link used to point at /dashboard/profile, which had no
           alert settings on it at all, so the email promised a control that
           did not exist. It now carries the anchor of the card that does. -->
      <div style="border-top:1px solid #e8ddd0;padding-top:20px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9b9b9b;">
          You're receiving this because alerts are on for ${orgName}.<br>
          <a href="${APP_URL}/dashboard/profile#card-alerts" style="color:#4a7c59;">Manage alert settings</a>
          &nbsp;·&nbsp;
          <a href="${unsubUrl}" style="color:#9b9b9b;">Unsubscribe</a>
        </p>
      </div>
    </div>
  </body></html>`
}

export async function GET(req: NextRequest) {
  // Vercel sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Two guards that exist because of what this job's first run would do ───
  //
  // Nothing has ever been sent from here: sent_grant_alerts is empty and
  // 'send-alerts' has never appeared in cron_runs. Meanwhile 34 of 41 orgs
  // have alerts_enabled, none of whom chose it — the onboarding wizard set it.
  // So an unscoped first invocation is not a test, it is a launch to 34
  // inboxes that have never heard from us.
  //
  //   ?org=<uuid>  restrict to one organisation. The first real send.
  //   ?dry=1       resolve recipients and matches, send nothing, report.
  //
  // Neither is a debug flag to remove later. A broadcast job with no way to
  // aim it is the thing that goes wrong at 3am.
  const onlyOrgId = req.nextUrl.searchParams.get('org')
  const dryRun    = req.nextUrl.searchParams.get('dry') === '1'

  let httpStatus = 200
  const payload = await recordRun('send-alerts', async () => {
    // The allowlist is checked BEFORE the mailer, deliberately. "There is
    // nobody I am permitted to email" is a more fundamental refusal than "I
    // have no mailer configured", and checking the key first hid this guard
    // behind an unrelated 500 in every environment without Resend.
    const allowlist = alertAllowlist()
    if (!dryRun && allowlist.length === 0) {
      httpStatus = 409
      return {
        error: 'ALERT_RECIPIENT_ALLOWLIST is empty, so there is nobody this job ' +
               'is permitted to email. Set it to a comma-separated list of ' +
               'addresses to authorise recipients. Nothing was sent.',
      }
    }

    if (!dryRun && !process.env.RESEND_API_KEY) {
      httpStatus = 500
      return { error: 'RESEND_API_KEY not configured — add it to your environment variables' }
    }

    const resend = dryRun ? null : new Resend(process.env.RESEND_API_KEY!)

    try {
      const allOrgs = await getOrgsWithAlertsEnabled()
      const orgs = onlyOrgId ? allOrgs.filter(o => o.id === onlyOrgId) : allOrgs

      if (onlyOrgId && orgs.length === 0) {
        httpStatus = 404
        return {
          error: `No org ${onlyOrgId} with alerts_enabled. It either does not exist, ` +
                 `has alerts off, or its owner has no email on the auth record.`,
        }
      }

      // Reported separately and precisely: sentTo is written only after Resend
      // has accepted the message. Everything else lands in one of the other
      // buckets. "Attempted" is not an outcome anyone can act on.
      const sentTo: { org: string; to: string; grants: number }[] = []
      const blocked: { org: string; to: string }[] = []
      const skipped: { org: string; reason: string }[] = []
      const failed:  { org: string; to: string; error: string }[] = []
      const wouldSend: unknown[] = []

      for (const org of orgs) {
        const minScore = org.alert_min_score ?? 70

        if (!dryRun && !isAllowedRecipient(org.owner_email)) {
          blocked.push({ org: org.name, to: org.owner_email })
          continue
        }

        const grants = await getUnsentAlerts(org, minScore)

        if (grants.length === 0) {
          skipped.push({ org: org.name, reason: `No new matching grants at or above ${minScore}%` })
          continue
        }

        if (dryRun || !resend) {
          wouldSend.push({
            org: org.name, to: org.owner_email, count: grants.length, minScore,
            allowed: isAllowedRecipient(org.owner_email),
            grants: grants.map(g => ({ title: g.grant.title, score: g.score })),
          })
          continue
        }

        const unsubUrl = unsubscribeUrl(APP_URL, org.id)
        const { error } = await resend.emails.send({
          from:    FROM_EMAIL,
          to:      org.owner_email,
          subject: `${grants.length} new grant${grants.length === 1 ? '' : 's'} matching ${org.name}`,
          html:    buildEmailHtml(org.name, grants, unsubUrl),
          // RFC 8058. Gmail and Outlook render their own unsubscribe control
          // from these, which is the one a person actually reaches for, and
          // its absence is a spam signal in its own right on a bulk send.
          headers: {
            'List-Unsubscribe':      `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        if (error) {
          failed.push({ org: org.name, to: org.owner_email, error: error.message })
          continue
        }

        await markAlertsSent(org.id, grants.map(g => g.grant.id))
        sentTo.push({ org: org.name, to: org.owner_email, grants: grants.length })
      }

      return {
        success: true,
        mode: dryRun ? 'dry-run' : onlyOrgId ? 'single-org' : 'broadcast',
        limits: {
          maxGrantsPerEmail: ALERT_MAX_GRANTS_PER_EMAIL,
          lookbackDays:      ALERT_LOOKBACK_DAYS,
          allowlistSize:     allowlist.length,
        },
        orgsEligible:  allOrgs.length,
        orgsConsidered: orgs.length,
        // The number that matters. Not "processed", not "attempted".
        sentCount: sentTo.length,
        sentTo,
        blocked,
        skipped,
        failed,
        ...(dryRun ? { wouldSend } : {}),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Alert job failed'
      httpStatus = 500
      return { error: message }
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}
