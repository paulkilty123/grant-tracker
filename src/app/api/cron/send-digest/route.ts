import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getOrgsWithAlertsEnabled, alertAllowlist, isAllowedRecipient } from '@/lib/alerts'
import { recordRun } from '@/lib/admin/cron-runs'
import { getAdminDb } from '@/lib/admin/admin-db'
import { EMAIL_FROM, EMAIL_APP_URL } from '@/lib/mcp-brand'
import { unsubscribeUrl } from '@/lib/alerts-unsubscribe'
import { buildDigest, CAPS, CLOSING_WINDOW_DAYS } from '@/lib/digest/build'
import { renderDigest } from '@/lib/digest/render'

export const dynamic = 'force-dynamic'

/**
 * The weekly digest.
 *
 * Consent is the SAME switch as the alert email — `alerts_enabled`, the profile
 * card, the same unsubscribe token. Two independent opt-outs for two emails
 * from one product is how somebody unsubscribes and keeps hearing from us.
 *
 * The guards are the alert job's, deliberately reused rather than reimplemented:
 *   - ALERT_RECIPIENT_ALLOWLIST gates every recipient, EMPTY BY DEFAULT.
 *   - ?org=<uuid> aims a single send.
 *   - ?dry=1 builds and renders, sends nothing.
 *   - the response reports who it actually sent to, not who it attempted.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const onlyOrgId = req.nextUrl.searchParams.get('org')
  const dryRun    = req.nextUrl.searchParams.get('dry') === '1'
  /** Returns the rendered HTML for one org instead of sending. Dry run only. */
  const wantHtml  = req.nextUrl.searchParams.get('html') === '1'

  let httpStatus = 200
  const payload = await recordRun('send-digest', async () => {
    const allowlist = alertAllowlist()
    if (!dryRun && allowlist.length === 0) {
      httpStatus = 409
      return {
        error: 'ALERT_RECIPIENT_ALLOWLIST is empty, so there is nobody this job ' +
               'is permitted to email. Nothing was sent.',
      }
    }
    if (!dryRun && !process.env.RESEND_API_KEY) {
      httpStatus = 500
      return { error: 'RESEND_API_KEY not configured' }
    }

    const resend = dryRun ? null : new Resend(process.env.RESEND_API_KEY!)
    const db = getAdminDb()
    const origin = EMAIL_APP_URL

    try {
      const allOrgs = await getOrgsWithAlertsEnabled()
      const orgs = onlyOrgId ? allOrgs.filter(o => o.id === onlyOrgId) : allOrgs
      if (onlyOrgId && orgs.length === 0) {
        httpStatus = 404
        return { error: `No org ${onlyOrgId} with alerts_enabled.` }
      }

      const sentTo:  { org: string; to: string; mode: string; sections: string[] }[] = []
      const blocked: { org: string; to: string }[] = []
      const skipped: { org: string; reason: string }[] = []
      const failed:  { org: string; to: string; error: string }[] = []
      const previews: unknown[] = []
      let html: string | null = null

      // A month back: long enough to stop an item repeating, short enough that
      // a section can legitimately return.
      const since = new Date(Date.now() - 31 * 86_400_000).toISOString()

      for (const org of orgs) {
        if (!dryRun && !isAllowedRecipient(org.owner_email)) {
          blocked.push({ org: org.name, to: org.owner_email })
          continue
        }

        const { data: recent } = await db
          .from('digest_sent_items')
          .select('section, item_key')
          .eq('org_id', org.id)
          .gte('sent_at', since)

        const model = await buildDigest(org, {
          origin,
          recentlyShown: (recent ?? []) as { section: string; item_key: string }[],
        })

        // The content floor. All eight ladder sources dry means no send — a
        // digest that says "nothing this week" teaches someone the email is
        // ignorable before it has ever been useful.
        if (!model) {
          skipped.push({ org: org.name, reason: 'Nothing on the ladder — no send, by design' })
          continue
        }

        const unsub = unsubscribeUrl(origin, org.id)
        const body = renderDigest(model, { origin, unsubscribeUrl: unsub })

        if (dryRun || !resend) {
          if (wantHtml && !html) html = body
          previews.push({
            org: org.name, to: org.owner_email, mode: model.mode,
            subject: model.subject, preheader: model.preheader, lead: model.lead,
            closing: model.closing.map(r => `${r.days}d ${r.kind}: ${r.name}`),
            inProgress: model.inProgress.map(r => `${r.name} — ${r.status}`),
            matches: model.matches.map(r => `${r.title}: ${r.blurb}`),
            nearMisses: model.nearMisses.map(r => r.title),
            prompt: model.prompt?.title ?? null,
            reassurance: model.reassurance,
            bytes: body.length,
          })
          continue
        }

        const { error } = await resend.emails.send({
          from:    EMAIL_FROM,
          to:      org.owner_email,
          subject: model.subject,
          html:    body,
          headers: {
            'List-Unsubscribe':      `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        if (error) {
          failed.push({ org: org.name, to: org.owner_email, error: error.message })
          continue
        }

        // Only after Resend accepts. Recording a send that did not happen would
        // suppress the same item next week for no reason.
        if (model.shown.length) {
          await db.from('digest_sent_items').insert(
            model.shown.map(s => ({ org_id: org.id, section: s.section, item_key: s.key })),
          )
        }
        sentTo.push({
          org: org.name, to: org.owner_email, mode: model.mode,
          sections: Array.from(new Set(model.shown.map(s => s.section))),
        })
      }

      return {
        success: true,
        mode: dryRun ? 'dry-run' : onlyOrgId ? 'single-org' : 'broadcast',
        limits: { ...CAPS, closingWindowDays: CLOSING_WINDOW_DAYS, allowlistSize: allowlist.length },
        orgsEligible: allOrgs.length,
        orgsConsidered: orgs.length,
        sentCount: sentTo.length,
        sentTo, blocked, skipped, failed,
        ...(dryRun ? { previews } : {}),
        ...(html ? { html } : {}),
      }
    } catch (err) {
      httpStatus = 500
      return { error: err instanceof Error ? err.message : 'Digest job failed' }
    }
  })

  return NextResponse.json(payload, { status: httpStatus })
}
