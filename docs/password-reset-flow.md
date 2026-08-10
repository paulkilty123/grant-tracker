# Password reset flow

## What was broken

Jo (Olympias Music) was locked out from 27 July to 10 August. Every attempt ended
in `Auth session missing!` after she had already typed a new password.

`src/app/auth/reset-password/page.tsx` read `?code=` and nothing else. When the
code was absent it set `exchanging = false` **without setting an error**, so the
password form rendered as fully usable with no session behind it. `updateUser()`
then threw. That error text can only come from `updateUser()` running with no
session, which is what made the symptom so repeatable for her.

Supabase can land on this page in four shapes, and only one of them was handled:

| Shape | When | Old behaviour |
|---|---|---|
| `?code=...` | PKCE, after `/auth/v1/verify` succeeds | handled |
| `?token_hash=...&type=recovery` | if the template sends it | fell through to a dead form |
| `?error=access_denied&error_code=otp_expired` | the token was already spent | fell through to a dead form |
| `#access_token=...&type=recovery` | implicit flow, tokens in the fragment | fell through to a dead form |

The third row is the likely everyday cause. Outlook and M365 safe-links prefetch
URLs in email, and Supabase recovery tokens are single-use, so the scanner spends
the token before the human clicks. Our users are heavily charity-sector M365.

## What changed

- `src/lib/auth/recovery-link.ts` parses query **and** fragment and branches on all
  four shapes. Errors win over any other param. Unit tested in
  `recovery-link.test.ts` (`npm test`).
- The token is redeemed **on click, not on GET**. A scanner fetching the page no
  longer burns the token.
- The password form only renders once a session is confirmed, and the session is
  re-checked at submit so an expiry mid-form reads as expired rather than as a
  library error.
- Dead links get an explicit expired state with an inline resend.
- `src/middleware.ts` no longer bounces authenticated users off
  `/auth/reset-password`. It used to, which silently burned the link for anyone
  who still had a live session in the browser where they opened the email.

## The email template change, and the order it must happen in

The click-to-redeem protection is **dormant** until the Supabase email template
stops sending `{{ .ConfirmationURL }}`. Supabase Dashboard → Authentication →
Email Templates → Reset Password:

```
{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

**Order matters. Deploy the code first, change the template second.**

The new page handles `?code=` and `?token_hash=` both, so deploying it under the
old template is safe and changes nothing for users. The reverse is not safe: the
old page code ignores `token_hash` entirely, so flipping the template while
production still runs the old page would send *every* resetting user into the
dead form. That would widen the bug from "people whose links get pre-scanned" to
"everyone".

1. Merge this branch to `main` and let Vercel deploy.
2. Confirm `/auth/reset-password?error=access_denied&error_code=otp_expired` on
   the live site shows "Reset link expired" and not a password form.
3. Then change the template.
4. Request a real reset and confirm the link now carries `token_hash`, that the
   page shows a **Continue** button before anything is consumed, and that the
   full path through to signing in with the new password works.

Links already sitting in inboxes keep working throughout: they carry `?code=`,
which is still handled.

## Also worth knowing

`resetPasswordForEmail` is rate limited to roughly one per hour per address. A
second request inside the hour sends nothing and is not evidence of a wrong
address. `auth.users.recovery_sent_at` moves only when a reset actually matches
an account and is not rate limited, so it is the cheapest signal that our side
sent the mail. `auth.audit_log_entries` is empty on this project, so it cannot be
used to reconstruct a user's attempts.

PKCE ties `?code=` to the browser that requested the reset. Opening the email on
a different device fails with a missing-verifier error, which the page now
explains rather than reporting as a generic expiry. The `token_hash` flow has no
such constraint, so moving the template also fixes cross-device resets.
