// Open Stripe's customer portal for the signed-in account.
//
//   POST /api/billing/portal  -> { url }
//
// The portal is where a paying customer changes card, sees invoices, or
// cancels. Stripe hosts it; we only mint the session. Nothing here changes a
// subscription, so the only rule is: you get a portal for YOUR customer id,
// found through your own subscription row, never from a parameter.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { getStripe } from '@/lib/billing/stripe-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: row } = await getAdminDb()
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  const customer = (row as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (!customer) {
    return NextResponse.json(
      { error: 'There is no billing account for this login yet.', code: 'no_customer' },
      { status: 409 },
    )
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: `${req.nextUrl.origin}/dashboard/account`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    // The usual cause is the portal never having been configured in the
    // Stripe dashboard (Settings, Billing, Customer portal, Save). Say so
    // plainly rather than a generic failure, because it is a one-time step.
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[billing-portal] session create failed:', msg)
    return NextResponse.json(
      { error: 'Could not open billing. Email hello@shootsfunding.co.uk and we will sort it.', detail: msg },
      { status: 502 },
    )
  }
}
