// Recording a billing failure where somebody will see it.
//
// The webhook's refusals are correct towards Stripe — a retry cannot fix an
// unrecognised price or a missing owner_id, so it returns 200 — and that is
// exactly what makes them invisible to us. A console.error goes to a runtime
// log nobody watches and then rolls off, while the customer has paid, Stripe
// shows their subscription as active, and our table has no row for them.
//
// This is the difference between finding out from a query and finding out from
// an email that says "I've paid and I can't get in".

import { getAdminDb } from '@/lib/admin/admin-db'

export interface BillingIncident {
  kind: string
  detail: string
  stripe_subscription_id?: string | null
  stripe_customer_id?: string | null
  owner_id?: string | null
}

/**
 * Never throws.
 *
 * This is called from the failure path of the webhook, and a webhook that
 *500s because it could not write a note about a problem turns a recorded
 * problem into a retry storm and, eventually, an endpoint Stripe disables.
 * If recording fails, the console line is what is left and it says so.
 */
export async function recordBillingIncident(incident: BillingIncident): Promise<void> {
  try {
    const { error } = await getAdminDb()
      .from('billing_incidents')
      .upsert(
        {
          kind: incident.kind,
          detail: incident.detail,
          stripe_subscription_id: incident.stripe_subscription_id ?? null,
          stripe_customer_id: incident.stripe_customer_id ?? null,
          owner_id: incident.owner_id ?? null,
          last_seen: new Date().toISOString(),
        },
        // Repeats bump the row rather than adding another. Stripe redelivers,
        // and a hundred copies of one failure buries the other failures.
        { onConflict: 'kind,stripe_subscription_id', ignoreDuplicates: false },
      )
    if (error) {
      console.error('[billing-incident] could not record; the log line below is the only record:', error.message)
    }
  } catch (e) {
    console.error('[billing-incident] could not record; the log line below is the only record:', e)
  }
}
