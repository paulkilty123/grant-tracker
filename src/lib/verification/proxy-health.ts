/**
 * Is the reader proxy actually working?
 *
 * It was configured in production on 2026-07-25 and had no `READER_PROXY_KEY`,
 * so every call returned 401 for sixteen days without anyone noticing. Nothing
 * broke loudly: the enrichment chain only reaches for the proxy after a direct
 * fetch has already failed, so a dead proxy looks exactly like a funder site
 * being difficult. The roughly sixteen bot-walled hosts it exists for were
 * simply never read, and the catalogue quietly stopped improving for them.
 *
 * That is the failure this check exists to make impossible: something that is
 * only used on the failure path, and whose own failure is indistinguishable
 * from the failure it is meant to rescue.
 *
 * It runs against a real bot-walled host rather than a synthetic target,
 * because a proxy that can fetch example.com but not the sites we need it for
 * is not working for our purposes.
 */

/** A funder that refuses plain fetches — a true test of what the proxy is for. */
const CANARY_URL = 'https://juliarausingtrust.org/'

export type ProxyHealth = {
  ok:        boolean
  configured: boolean
  keyed:     boolean
  status:    'ok' | 'not_configured' | 'no_key' | 'http_error' | 'empty' | 'network_error'
  detail:    string
  chars?:    number
  canary:    string
}

export async function checkReaderProxy(canaryUrl = CANARY_URL): Promise<ProxyHealth> {
  const base = process.env.READER_PROXY_URL
  const key  = process.env.READER_PROXY_KEY
  const configured = !!base
  const keyed = !!key

  if (!base) {
    return { ok: false, configured, keyed, status: 'not_configured',
             detail: 'READER_PROXY_URL is not set, so bot-walled funder pages cannot be read at all', canary: canaryUrl }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${canaryUrl}`, {
      signal: controller.signal,
      headers: { Accept: 'text/plain', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    })
    if (!res.ok) {
      // 401/402 with no key is the exact sixteen-day failure. Name it, so the
      // fix is obvious from the status line rather than needing investigation.
      const status = res.status === 401 || res.status === 402
        ? (keyed ? 'http_error' : 'no_key')
        : 'http_error'
      return {
        ok: false, configured, keyed, status,
        detail: keyed
          ? `proxy returned HTTP ${res.status} with a key set — the key may be invalid, expired or out of quota`
          : `proxy returned HTTP ${res.status} and READER_PROXY_KEY is not set`,
        canary: canaryUrl,
      }
    }
    const text = await res.text()
    if (text.trim().length < 200) {
      return { ok: false, configured, keyed, status: 'empty',
               detail: `proxy returned only ${text.trim().length} characters`, chars: text.trim().length, canary: canaryUrl }
    }
    return { ok: true, configured, keyed, status: 'ok',
             detail: `read ${text.trim().length} characters from a bot-walled host`, chars: text.trim().length, canary: canaryUrl }
  } catch (e) {
    return { ok: false, configured, keyed, status: 'network_error',
             detail: e instanceof Error ? e.message : String(e), canary: canaryUrl }
  } finally {
    clearTimeout(timeout)
  }
}
