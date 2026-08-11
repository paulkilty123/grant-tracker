import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { deepCheckUrl, checkUrl } from './url-validator'

/**
 * A bot wall must never be scored as a healthy page.
 *
 * Until 2026-08-11, 401 was absent from the status handling: 404/410/400 → dead
 * and 5xx/403/429 → blocked, but a 401 fell through to the content checks, where
 * the verdict depended on whether the funder's name happened to appear in the
 * auth-error body. The Bromley Trust's /our-approach/ returns 401 to a plain
 * fetch and was recorded url_status='ok' on 9 August — a page nobody could read,
 * filed as healthy, which is the worst of the three possible answers because
 * nothing ever revisits it.
 *
 * The fix has two halves and both need pinning: a blocked page is only 'ok' if
 * the reader proxy can actually read it, and is 'unchecked' otherwise.
 */

const PAGE = 'https://funder.example/our-approach/'
const realFetch = global.fetch

function mockFetch(handler: (url: string) => { status: number; body?: string }) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const { status, body = '' } = handler(url)
    return {
      status,
      ok: status >= 200 && status < 300,
      url,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => body,
    } as unknown as Response
  }) as typeof fetch
}

beforeEach(() => {
  process.env.READER_PROXY_URL = 'https://reader.example'
  delete process.env.READER_PROXY_KEY
})

afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
  delete process.env.READER_PROXY_URL
})

describe('401/403 bot walls', () => {
  it('reports ok when the proxy can read the page', async () => {
    mockFetch(url =>
      url.startsWith('https://reader.example')
        ? { status: 200, body: 'x'.repeat(2000) }   // long markdown = a real read
        : { status: 401, body: 'Unauthorized' },
    )
    const r = await deepCheckUrl(PAGE, 'Funder', 'A grant')
    expect(r.status).toBe('ok')
    expect(r.issues).toContain('bot_walled_read_via_proxy')
  })

  it('reports blocked, NOT ok, when the proxy cannot read it', async () => {
    mockFetch(url =>
      url.startsWith('https://reader.example')
        ? { status: 401, body: '{"code":401}' }
        : { status: 401, body: 'Unauthorized' },
    )
    const r = await deepCheckUrl(PAGE, 'Funder', 'A grant')
    expect(r.status).toBe('wrong_page')
    expect(r.issues).toContain('http_401_blocked')
  })

  it('does not accept the proxy error envelope as a successful read', async () => {
    // A quota-exhausted proxy answers 200 with a short JSON error. Treating that
    // as a read would certify every blocked URL in the catalogue as live.
    mockFetch(url =>
      url.startsWith('https://reader.example')
        ? { status: 200, body: '{"data":null,"code":401,"name":"AuthenticationRequiredError"}' }
        : { status: 403, body: 'Forbidden' },
    )
    const r = await deepCheckUrl(PAGE, 'Funder', 'A grant')
    expect(r.status).toBe('wrong_page')
    expect(r.issues).toContain('http_403_blocked')
  })

  it('falls back to blocked when no proxy is configured', async () => {
    delete process.env.READER_PROXY_URL
    mockFetch(() => ({ status: 401, body: 'Unauthorized' }))
    expect(await checkUrl(PAGE, 'Funder')).toBe('unchecked')
  })

  it('still marks a genuine 404 dead rather than consulting the proxy', async () => {
    const spy = vi.fn()
    mockFetch(url => { if (url.startsWith('https://reader.example')) spy(); return { status: 404 } })
    const r = await deepCheckUrl(PAGE, 'Funder', 'A grant')
    expect(r.status).toBe('dead')
    expect(spy).not.toHaveBeenCalled()
  })
})
