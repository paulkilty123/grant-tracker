'use client'

// Stamps the "last looked" cookie AFTER the page has rendered, so the current
// view was computed against the previous visit's timestamp. Drives the
// briefing's changes_since / "Since you last looked" section.

import { useEffect } from 'react'

export default function BriefingSeen() {
  useEffect(() => {
    document.cookie = `gt_briefing_seen=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; samesite=lax`
  }, [])
  return null
}
