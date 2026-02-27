# Grant Tracker — Analysis & Recommendations
*February 2026*

---

## Overview

Grant Tracker is a well-structured Next.js app with a solid foundation: authentication, a kanban pipeline, AI-powered search, and deep live research. The core architecture is sound. This report covers **features & functionality gaps**, **UI & design quality**, and **grant data & content** — the three areas that will most determine whether users keep coming back.

---

## Part 1: Features & Functionality

### Critical Bugs (Break Core Workflows)

**1. "+ Pipeline" button doesn't actually save anything**

This is the most important issue in the app. When a user clicks "+ Pipeline" on any grant card (both curated and deep search results), it shows a green toast notification — but nothing is written to Supabase. The `createPipelineItem()` function exists in `src/lib/pipeline` and is used correctly on the Pipeline page, but the search page never calls it. Users who think they've saved a grant will find their pipeline empty when they navigate to it.

*Fix: Call `createPipelineItem()` from the search page's `onAddToPipeline` handler, passing grant title, funder, amount range, and the user's org ID.*

---

**2. Organisation Profile doesn't save**

The Profile page (`/dashboard/profile`) has a well-designed form collecting organisation name, charity number, type, income band, location, themes, and mission. However, clicking "Save Profile" only shows a brief "Saved!" toast — no data is sent to Supabase. This means:

- The org profile is always empty on every visit
- The AI search can't use profile data to personalise results (even though the subtitle says "Keep this up to date to improve your grant match scores")
- Fields like location and income band that should filter grants have no effect

*Fix: Wire the form to `upsert` the `organisations` table using the logged-in user's ID.*

---

**3. Deadlines page is always empty**

The Deadlines page (`/dashboard/deadlines`) is a stub that unconditionally shows "No upcoming deadlines" regardless of what's in the pipeline. The database schema and the `DeadlineAlert` type already exist to support this feature — it just hasn't been implemented.

*Fix: Query `pipeline_items` for the current user's org, filter to those with non-null deadlines and stages that aren't won/declined, sort by deadline, and render urgency-colour-coded cards.*

---

### High-Value Missing Features

**4. AI search doesn't use the organisation profile**

The AI search prompt sends the full list of 90 grants to Claude but provides no information about the searching organisation — no location, income band, sectors, or beneficiary groups. This means two different organisations searching for the same term get identical results.

Once the profile is wired up (fix #2 above), the AI search prompt should include the org's primary location, annual income, and themes so the scoring can genuinely personalise to that organisation.

---

**5. No way to bookmark / save a grant without pipelining it**

The Supabase schema already has a `saved_grants` table, but there's no UI for it. Users often want to "shortlist" a grant they're curious about without formally adding it to their pipeline. A simple bookmark icon on each card (saving to `saved_grants`) and a Saved Grants page would round out the workflow neatly.

---

**6. Deep search results can't be reviewed and promoted to the curated pool**

Every deep search query discovers real, live funding opportunities that don't exist in the 90-grant seed list. There's currently no mechanism for you (as the product owner) to review these results and decide to add valuable ones to the curated pool. Over time, deep search data could be one of the best sources for expanding the grant database. A simple admin review queue — even just a Supabase table with a `reviewed` flag — would make this possible.

---

**7. No email deadline reminders**

Users add grants to their pipeline with deadlines, but there's no mechanism to alert them as those dates approach. A weekly digest email (or even a simple in-app notification banner) saying "You have 3 deadlines in the next 14 days" would significantly improve retention and utility. Supabase's scheduled edge functions or a cron job via Vercel could handle this.

---

**8. No export**

Grant managers often need to share their pipeline with colleagues, trustees, or funders. There's no way to export the pipeline to CSV or PDF. A simple "Export to CSV" button on the pipeline page would make the tool usable in reporting contexts.

---

**9. No collaboration / team access**

The RLS policies are built around a single owner per organisation. A team of fundraisers working together can't all log in to the same pipeline. Adding team member invites (even just sharing an org ID rather than full multi-tenancy) would be a meaningful upgrade for any organisation with more than one person.

---

## Part 2: UI & Design

### What's Working Well

The app has a genuinely attractive, coherent visual identity. The earthy green-and-gold palette (forest, sage, mint, gold) is distinctive and appropriate for a civic/charity tool. The Nunito/DM Sans font pairing gives clear hierarchy, and the custom shadow tints using the forest green colour create a branded depth. Component patterns — cards, buttons, form inputs, tags, pipeline cards — are consistent and well-named. The kanban board with drag-and-drop, progress bars, and coloured stage accents is a strong centrepiece feature visually.

### Critical UI Issues

**10. The app has no mobile support whatsoever**

This is the single largest UI problem. The entire layout assumes a wide desktop screen:

- The sidebar is a fixed 240px wide with no hamburger/collapsed state
- The main content uses `ml-60` to offset around it — on a phone, content would start 240px in and be nearly invisible
- The pipeline board is `grid-cols-6` — six columns with no breakpoints; on a tablet it would be completely unusable
- The dashboard stats use `grid-cols-4` with no responsive fallback
- The profile page is `grid-cols-2` — would break on any narrow screen

Given that grant-writing charities are often run by small teams who may be checking deadlines on their phone or tablet, this is a meaningful gap. Adding `sm:` and `md:` breakpoints and a collapsible sidebar would transform usability on smaller screens.

---

**11. The Local Grants page is significantly less polished than the Search page**

The Search page has grant cards with descriptions, eligibility criteria, sector tags, AI reasoning, amounts, deadlines, apply links, and add-to-pipeline buttons. The Local Grants page shows the same grants as a flat list with just a name, funder, amount, and button — no description, no deadline, no tags, no eligibility. There's also no filter or search bar, so all 28 local grants appear at once with no way to narrow them. A user landing here from the sidebar gets a much worse experience than they would landing on the Search page.

*Fix: Use the same `GrantCard` component as the Search page, or at minimum add a short description and deadline to each row.*

---

**12. Inline style objects break consistency on the Dashboard**

The pipeline mini-view on the Dashboard uses inline JavaScript style objects to set stage colours rather than the Tailwind utility classes used everywhere else:

```js
style={{ background: s.id === 'won' ? '#d4f0dc' : ... }}
```

These hex values don't match the design token palette (the forest green is `#1a3c2e` but the "won" background `#d4f0dc` doesn't correspond to any named token). This creates subtle colour inconsistencies and makes future theme changes harder.

---

**13. No loading skeleton screens**

The pipeline page shows only the text "Loading pipeline…" centred in a 64px high container while data fetches. The search page has no loading state at all for the initial grant list. Skeleton screens (grey placeholder rectangles in card shapes) would make the app feel significantly faster and more polished during load.

---

**14. Toast animations are inconsistent across pages**

The pipeline page's toast has `animate-in slide-in-from-bottom-4` (a smooth slide-up animation). The search page toast just appears instantly with no animation. Small inconsistency, but worth unifying.

---

**15. No accessible focus styles or ARIA labels**

The app relies on hover states for most interactive affordances but doesn't provide equivalent keyboard navigation or screen-reader support. Key gaps:

- Drag-and-drop cards have no keyboard alternative (pressing Enter/Space to pick up, arrow keys to move)
- Modal close buttons are `✕` text with no `aria-label="Close"`
- Form inputs in the Profile page have no `id`/`for` label associations (the `<label>` and `<input>` are adjacent but not linked)
- The grant type filter pills have no indication of which is selected beyond colour (no `aria-pressed` or `aria-selected`)

---

**16. There is no landing page — unauthenticated visitors hit the login screen**

The root URL (`/`) currently does nothing except redirect: logged-in users go to the dashboard, everyone else goes straight to `/auth/login`. There is no public-facing page explaining what Grant Tracker is, who it's for, or why someone should sign up. This means:

- Word-of-mouth or shared links land cold visitors on a login form with no context
- There's no way to show the product to a funder, trustee, or partner without giving them an account
- Search engines have nothing to index (no SEO presence at all)
- The first impression for a new user is a generic login form rather than a compelling product story

A landing page doesn't need to be elaborate — a clear headline, a 3-panel feature overview (Find → Track → Apply), a screenshot or two of the pipeline and search, and a "Sign up free" CTA would transform the first impression. Given the existing design system (forest/gold palette, Nunito headings), this could be built quickly and look polished.

Key sections a grant sector landing page should include: headline with the core value proposition ("Find the right UK grants, track your applications, never miss a deadline"), feature highlights with visuals, a "Who it's for" section (small charities, CICs, community groups), social proof or a brief "why it works" section, and a clear sign-up CTA.

---

**17. The search bar's inner button gets crowded at mid-widths**

The search input has `pr-36` padding to make room for the "✦ AI Search" button sitting inside the right edge of the input. At intermediate screen widths (around 768–900px), the button text may overflow into the input text area. The Deep Search button is on the same row as all the funder type filter pills, and on a populated row this gets very cramped.

---

**17. Colour semantics for "declined" and "urgent" overlap**

Both urgent deadline warnings and the "Declined" pipeline stage use `red-400` / `red-500`. This means red simultaneously signals "act now" (urgency) and "this is over" (declined). Using a distinct muted colour like `gray-400` for declined outcomes would make the urgent red more meaningful and scannable.

---

## Part 3: Grant Data & Content

### Critical Issues

**18. Many deadlines have already passed**

The seed data was written in 2024–2025 and a significant number of grants have deadlines in the past — e.g. July 2025, September 2025, October 2025. Users in February 2026 will see these grants displayed without any indication that the window has closed. This actively undermines trust in the product.

*Immediate fix: Audit all 90 grants and either update deadlines to current 2025–2026 rounds, mark passed deadlines with a "Closed — check for next round" flag, or remove them until updated.*

---

**19. 90 grants is too small to be competitive**

The main competitors operate at a very different scale:

| Platform | Approximate grant records |
|---|---|
| Funding Central | 8,000+ |
| Charity Excellence Framework | 4,000+ |
| GrantFinder | 10,000+ |
| Turn2us (Trusts & Foundations) | 3,000+ |
| **Grant Tracker (current)** | **90** |

At 90 grants, users who don't find what they need in AI search have nowhere to go except Deep Search, which costs API credits on every query. The curated pool needs to grow substantially — even reaching 500 well-maintained grants would be a meaningful step.

---

### Content Quality Gaps

**20. Missing major funders**

Several very large and well-known UK funders are absent from the seed data. Notable gaps include:

- **Wellcome Trust** — one of the UK's largest funders, active in health and community
- **Comic Relief / Sport Relief** — major open grant rounds every 1–2 years
- **National Grid Community Matters** — corporate fund active across many regions
- **Lloyds Bank Foundation** — large trust supporting small charities
- **BBC Children in Need** (only one programme included — several others exist)
- **Localgiving / Localgiving Foundation** — specifically targets small local groups
- **Social Investment Business** — loans and grants for social enterprises
- **Groundwork UK** — environment and community regeneration
- **Coalfields Regeneration Trust** — relevant for former industrial areas
- **Youth Music** — specialist music sector funder

---

**21. Grant descriptions lack actionable detail**

Most seed grant descriptions are 1–2 generic sentences. To genuinely help fundraisers evaluate fit, each grant should ideally include:

- Whether they fund running costs vs. project costs vs. capital
- Key exclusions (e.g. "does not fund individuals", "registered charities only")
- Application difficulty or competitiveness (e.g. "typically 15% success rate")
- Whether a relationship with the funder is expected before applying

---

**22. No grant refresh mechanism**

The curated data is entirely static — it lives in a TypeScript file. There's no process to check whether funders have opened new rounds, changed deadlines, or closed programmes. Even a simple quarterly review checklist (which grants to check, last verified date) would help maintain data quality as the database grows.

---

**23. Scotland, Wales, and Northern Ireland coverage is thin**

There are a handful of Scotland/Wales/NI-specific grants, but the depth is significantly less than the England coverage. For users outside England, the curated pool offers very little local relevance. Dedicated filters for devolved nation funders (e.g. Scottish Government, Senedd funding, NI Community Relations Council) would improve utility considerably.

---

## Prioritised Action Plan

| Priority | # | Area | Action | Effort |
|---|---|---|---|---|
| 🔴 Critical | 1 | Features | Fix "+ Pipeline" to actually save to Supabase | Low |
| 🔴 Critical | 2 | Features | Wire Profile page to Supabase | Medium |
| 🔴 Critical | 3 | Data | Audit and update/remove stale 2025 deadlines | Medium |
| 🟠 High | 4 | Features | Build out Deadlines page from pipeline data | Medium |
| 🟠 High | 5 | Features | Use profile data in AI search prompt | Low |
| 🟠 High | 6 | Auth | Fix password reset email delivery — configure custom SMTP via Resend (Supabase default has 2/hr rate limit and poor deliverability). Steps: create Resend account → add domain → set SMTP in Supabase Auth settings | Low |
| 🟠 High | 7 | UI | Build a public landing page at `/` (headline, features, CTA, screenshots) | Medium |
| 🟠 High | 8 | UI | Add mobile responsiveness (collapsible sidebar, responsive grids) | High |
| 🟠 High | 9 | UI | Upgrade Local Grants page to use full GrantCard layout | Low |
| 🟠 High | 10 | Data | Expand seed grants to 200–500 (add missing major funders) | High |
| 🟡 Medium | 11 | Features | Add bookmark/saved grants UI | Low |
| 🟡 Medium | 12 | Features | Add export to CSV on pipeline | Low |
| 🟡 Medium | 13 | UI | Add skeleton loading screens | Low |
| 🟡 Medium | 14 | UI | Fix colour semantics: distinguish "declined" from "urgent" | Low |
| 🟡 Medium | 15 | UI | Unify toast animation across all pages | Low |
| 🟡 Medium | 16 | Content | Replace placeholder testimonial on homepage with a real user quote | Low |
| 🟡 Medium | 17 | Data | Improve grant descriptions (exclusions, award type, competitiveness) | High |
| 🟢 Nice to have | 18 | UI | Add keyboard navigation and ARIA labels for accessibility | Medium |
| 🟢 Nice to have | 19 | UI | Replace inline style objects on Dashboard with Tailwind tokens | Low |
| 🟢 Nice to have | 20 | Features | Email deadline reminders | Medium |
| 🟢 Nice to have | 21 | Features | Team/multi-user access | High |
| 🟢 Nice to have | 22 | Features | Admin queue to promote deep search results to curated pool | Medium |

---

*The single most impactful sprint would be: fix the pipeline save bug (#1), wire the profile (#2), build out the deadlines page (#4), and add mobile responsiveness (#8). Together these four changes transform Grant Tracker from a promising demo into a reliable daily-use tool. Fix the SMTP email delivery (#6) before sharing the product with any new users.*
