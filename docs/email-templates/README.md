# Supabase Auth email templates — Shoots

Two files, both pasted by hand into the Supabase dashboard. Neither is rendered by any code in the repo.

| File | Dashboard location | Subject heading |
|---|---|---|
| `supabase-confirm-signup.html` | Authentication → Email Templates → **Confirm signup** | Confirm your Shoots account |
| `supabase-reset-password.html` | Authentication → Email Templates → **Reset password** | Set a new Shoots password |

Paste everything **below** the comment block at the top of each file. Supabase's editor takes a single HTML body — there is no separate plain-text field, so the HTML is what sends.

---

## What these replace

`docs/email-templates/supabase-confirm-signup.html`, dated 17 June, is entirely pre-rebrand: subject "Confirm your email — Grant Tracker", the wordmark "GrantTracker", a logo hosted at `granttracker.co.uk`, the retired lime button `#8ECB3C`, and body greys at `#8A8986` (3.50:1). **Delete it rather than leave it beside the new one** — a stale file with that filename is how June's version gets pasted back in by someone fixing the branding.

There was no Shoots template for password reset at all. The dashboard is on Supabase's stock default, which says Supabase.

---

## Before pasting

1. **Check the expiry numbers match.** The confirm email says 24 hours, the reset email one hour. Both are set in Authentication → Providers → Email. If you would rather not keep copy and config in step, each file's comment block carries a wording variant with the number removed.
2. **Check the logo URL loads.** `https://www.shootsfunding.co.uk/email/shoots-logo@2x.png` — the same asset `src/lib/digest/render.ts:194` uses. It is a lockup containing the wordmark, which is why there is no live "shoots" text beside it.
3. **Send one of each to yourself** before opening public signup, in Gmail and Outlook at least. These are the two emails with no test coverage.

---

## After pasting

**Point `email-brand.test.ts` at this folder.** That test scans six route files for `granttracker.co.uk`, with a comment saying a seventh sender "is a deliberate act that shows up in review". Supabase is a seventh sender, it predates all six, and it is the reason the old domain survived here for months. Adding `docs/email-templates/**` to the glob makes the repo copy of these templates covered by the same check — the closest thing to test coverage a dashboard-hosted template can have.

---

## One thing that is not a template problem

Supabase Auth sends through its own infrastructure by default, not through Resend. Until custom SMTP is configured, these two emails arrive from a different domain than every other Shoots email, and the SPF/DKIM/DMARC work on the sending domain does not cover them. That is a settings change on both dashboards; it can be done before or after pasting, but it should be done before public signup opens on 8 September.
