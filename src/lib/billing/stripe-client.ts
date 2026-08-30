// The Stripe client, constructed once and lazily.
//
// Lazy because importing this module must not throw. A route that imports a
// client which explodes at module load fails at BUILD time and takes unrelated
// pages with it — and the message says nothing about a missing environment
// variable. Constructing on first use means a missing key is a clear runtime
// error on the one route that needed it.

import 'server-only'
import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set. Billing routes cannot run without it.')
  }
  client = new Stripe(key)
  return client
}

/** True when this process is talking to the sandbox rather than the live account. */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')
}
