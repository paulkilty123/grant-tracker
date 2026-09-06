/**
 * The email palette and type stack, in one place.
 *
 * Extracted from `digest/render.ts` when the waitlist acknowledgement became
 * the second email built from these values. Two surfaces holding their own
 * copy of a brand colour is the failure `mcp-brand.ts` already exists to
 * prevent, and email is the worst place to discover it: nothing lints the
 * HTML inside these strings, and the reader sees the drift before we do.
 *
 * These are EMAIL values and deliberately not the app's design tokens. The
 * app's Forest is #173404; email ground is #1D3C3E. They are different
 * surfaces with different histories, and collapsing them would be a
 * redesign wearing a refactor's clothes.
 */

/** Headings, labels, buttons, numbers. */
export const UI = "'Space Grotesk',Helvetica,Arial,sans-serif"
/** Body prose. */
export const BODY = "'Plus Jakarta Sans',Helvetica,Arial,sans-serif"

export const C = {
  page:   '#FFFFFF',
  card:   '#EDF6F1',
  deep:   '#1D3C3E',
  onDeep: '#F6F1E7',
  body:   '#5F5E5A',
  muted:  '#73726F',
  rule:   'rgba(29,60,62,.10)',
  danger: '#B94040',
}

/**
 * The header lockup. ONE image for mark and wordmark together.
 *
 * Space Grotesk does not load in Outlook or the Gmail app, so a live-text
 * wordmark renders Helvetica, which is not the logo. A logo is the one
 * element where the typeface IS the content.
 *
 * The PNG already contains the word "shoots", so nothing may print it as
 * live text beside this. A reader with images on would see it twice.
 */
export function logoLockup(origin: string): string {
  // height:auto derives the height from the width, so no client can stretch
  // it by honouring one attribute and not the other. The height attribute
  // stays for Outlook, which ignores the style.
  return `<img src="${origin}/email/shoots-logo@2x.png" width="146" height="43" alt="Shoots"
     style="display:block;width:146px;height:auto;max-width:100%;border:0;outline:none;text-decoration:none;">`
}
