# Grant Tracker — Claude Instructions

## Project
Next.js App Router + Supabase + Tailwind CSS + Framer Motion, deployed on Vercel via GitHub auto-deploy.

## Non-negotiable Git Rule
**After every file edit, immediately `git add`, `git commit`, and `git push`.**
Vercel deploys from GitHub only — uncommitted changes never appear on the live site.

## Verify After Every Push
Check that the change looks correct on the live site: https://grant-tracker-kappa.vercel.app/
Vercel takes ~1 minute to deploy after a push.

## Just Fix It
When given a bug or UI issue, diagnose and fix it autonomously. Don't ask clarifying questions unless genuinely blocked.

## Keep Changes Simple
Make the smallest change that solves the problem. Don't refactor surrounding code unless asked.

## Lessons Learned
- Changes not appearing on live site → almost always means the edit was never committed/pushed to git
- SVG z-index: give parent span `zIndex: 0` to create a stacking context, then `zIndex: -1` on the SVG child so it renders behind text without disappearing behind the page background
- Hero line-break control: use explicit `<span className="block">` elements rather than `max-w` + `<br>` to lock heading line breaks at specific points
