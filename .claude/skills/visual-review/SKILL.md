---
name: visual-review
description: >
  Visual UI review and fix workflow for the grant-tracker web app. Use this skill any time
  the user wants to: see how a page looks, fix a design or spacing issue, check alignment,
  verify a change deployed correctly, compare a page against a mockup or design, or do a
  general UX audit. Trigger on phrases like "review the dashboard", "check how this looks",
  "screenshot the site", "fix the spacing on X", "does this look right", "visual check",
  "design review", "can you see what's wrong", or any request that involves actually looking
  at the live app rather than just editing code. Even if the user hasn't enabled Computer Use
  yet, suggest using this skill and remind them to enable it in Settings → Desktop app →
  Computer use.
---

# Visual Review Skill — Grant Tracker

This skill lets you see the live site, diagnose visual issues, make targeted fixes, and verify
the result — all in one loop. The goal is to replace the painful "describe the issue in words,
guess at the fix, push, wait, repeat" cycle with a visual feedback loop.

## Live Site

- **Dashboard**: https://grant-tracker-kappa.vercel.app/dashboard
- **Search / Find Funding**: https://grant-tracker-kappa.vercel.app/dashboard/search
- **Pipeline**: https://grant-tracker-kappa.vercel.app/dashboard/pipeline
- **Deadlines**: https://grant-tracker-kappa.vercel.app/dashboard/deadlines
- **Profile**: https://grant-tracker-kappa.vercel.app/dashboard/profile

Vercel auto-deploys from GitHub. After a push, allow ~60 seconds before screenshotting to verify.

## Design System (Stitch)

When reviewing visuals, check against these tokens:

| Token    | Value     | Usage                          |
|----------|-----------|--------------------------------|
| forest   | `#008080` | Primary teal, CTAs, accents    |
| sage     | `#26A69A` | Secondary teal, hover states   |
| mint     | `#B2DFDB` | Light teal backgrounds/badges  |
| coral    | `#FF7043` | CTA buttons, urgent states     |
| gold     | `#FFB74D` | Tertiary accent, amounts       |
| warm     | `#E8E8EC` | Borders, dividers              |
| cream    | `#F5F5F7` | Page background                |
| charcoal | `#1C1C2E` | Body text                      |
| mid      | `#6E6E80` | Muted text, labels             |

Fonts: DM Serif Display for headings, DM Sans for body. No border-radius anywhere (except `rounded-full` for pills/avatars).

## Step-by-Step Workflow

### 1. Screenshot the target page

Use Claude in Chrome to navigate to the relevant page and take a screenshot. If the user hasn't
specified a page, start with the dashboard.

```
navigate → screenshot → annotate what you see
```

If the page requires login and you're not logged in, note this and ask the user to navigate
to the correct page themselves, then take a screenshot of what's on screen.

### 2. Diagnose

Look at the screenshot carefully and identify:
- Spacing or alignment issues (compare against typical 4px/8px grid)
- Colour mismatches against the Stitch tokens above
- Typography inconsistencies (wrong font, weight, or size)
- Component issues (buttons, cards, badges looking off)
- Anything that looks visually broken or out of place

If the user described a specific issue, focus on that. If doing a general review, note everything
you spot and prioritise the most visually jarring issues.

### 3. Locate and fix the code

Source files live at:
- Dashboard page: `src/app/dashboard/page.tsx`
- Search page: `src/app/dashboard/search/page.tsx`
- Pipeline page: `src/app/dashboard/pipeline/page.tsx`
- Layout (sidebar, topbar): `src/app/dashboard/layout.tsx`, `src/components/layout/`
- Global styles: `src/app/globals.css`
- Tailwind tokens: `tailwind.config.ts`

Make the smallest change that fixes the issue. Read the file first, then use Edit (not Write)
to make targeted changes.

### 4. TypeScript check before pushing

Always run this before committing:
```bash
cd /sessions/keen-gifted-davinci/mnt/grant-tracker && ./node_modules/.bin/tsc --noEmit
```

Fix any errors before proceeding. A TypeScript error = silent Vercel build failure = change
never appears on the live site.

### 5. Git commit and push

Use the lock-file workaround — the mounted .git directory has persistent lock files:

```bash
rm -rf /tmp/grant-git-clean && \
cp -a /sessions/keen-gifted-davinci/mnt/grant-tracker/.git /tmp/grant-git-clean && \
rm -f /tmp/grant-git-clean/index.lock /tmp/grant-git-clean/HEAD.lock /tmp/grant-git-clean/gc.log.lock
```

If remote has diverged (push rejected), sync first:
```bash
GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git fetch origin main

# Get remote SHA, then:
GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git update-ref HEAD <remote-sha>
GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git reset HEAD
```

Then stage only changed files, commit, and push:
```bash
GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git add <files>

GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git commit -m "fix: <description>"

GIT_DIR=/tmp/grant-git-clean GIT_WORK_TREE=/sessions/keen-gifted-davinci/mnt/grant-tracker \
  git push origin HEAD:refs/heads/main
```

### 6. Verify on the live site

Wait ~60 seconds, then navigate back to the page in Chrome and take another screenshot.
Compare before and after. If the issue is fixed, confirm to the user. If not, diagnose again
from the new screenshot.

## Tips

- **Be specific about what changed** when confirming fixes. Show the before/after screenshots
  side by side in your response if possible.
- **One issue at a time** unless doing a full audit. Fix, verify, then move to the next issue.
- **If a change isn't showing up**, the most common cause is a TypeScript error blocking the
  Vercel build. Run the TS check and look for errors.
- **For layout issues**, check whether the problem is in the page component or the shared
  layout (`layout.tsx`). Layout changes affect all dashboard pages.
- **When the user shares a mockup image**, compare it side-by-side with the screenshot and
  list specific differences (spacing, colour, font, element position) before making any changes.
