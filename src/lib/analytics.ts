// Umami custom-event tracking. `window.umami` is injected by the Umami script
// loaded in src/app/layout.tsx, served first-party via the /o/* rewrites in
// next.config.mjs (so adblockers don't block it). Guarded so calls are safe
// before the script loads, in SSR, or if analytics is blocked/disabled.

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void
    }
  }
}

/** Fire a Umami custom event. No-op if the tracker isn't present. */
export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.umami) {
    window.umami.track(event, data)
  }
}
