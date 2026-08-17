# Grant Tracker — Design Specification

**Version:** 1.0
**Last updated:** 18 April 2026
**Purpose:** This document is the single source of truth for Grant Tracker's design system and UI decisions. Use it as reference when building or iterating on any surface. Organised so sections can be consumed independently — you don't need to read top to bottom.

---

## Contents

1. [Design foundations](#1-design-foundations)
2. [Component patterns](#2-component-patterns)
3. [Marketing site](#3-marketing-site)
4. [Onboarding flow](#4-onboarding-flow)
5. [Find Funding](#5-find-funding)
6. [Saved view](#6-saved-view)
7. [Dashboard](#7-dashboard)
8. [Pipeline](#8-pipeline)
9. [Pipeline edit modal](#9-pipeline-edit-modal)
10. [Deadlines](#10-deadlines)
11. [Profile settings](#11-profile-settings)
12. [Notifications settings](#12-notifications-settings)
13. [Account settings](#13-account-settings)
14. [Help approach](#14-help-approach)
15. [Copy and naming conventions](#15-copy-and-naming-conventions)
16. [Open questions and decisions deferred](#16-open-questions-and-decisions-deferred)

---

## 1. Design foundations

### 1.1 Typography

Three faces, each with a specific role. Do not substitute or mix.

- **Space Grotesk** — headings, UI labels, button text, metadata, numeric values. Used everywhere that isn't body prose. Weights: 400, 500 (primary UI weight).
- **Plus Jakarta Sans** — body copy, form field content, help text, descriptions, paragraph content. Weights: 400, 500.
- **DM Serif Display** — reserved exclusively for decorative moments. Used in two specific places only: the invitation welcome page ("Welcome, Paul.") and the About section founder quote on the marketing site. Do not use elsewhere, including on the marketing hero or any app utility pages.

**Heading rule:** Dark leads, green resolves on second clause. Example: "Plans that respect *your budget.*" with "your budget" in lime green. Exception: the marketing hero uses "*Funding,* matched for you." where the green leads because "Funding" is the subject word standing alone.

**App utility pages use all-black headings** (no green accent). Green-accented headings are for marketing surfaces and branded moments only.

### 1.2 Palette

Use these hex values exactly.

**Greens (primary brand)**
- Lime `#8ECB3C` — primary CTAs, match bar fills, hero accents, success states
- Mid green `#639922` — button hover, filled states, mid-ladder tones, "Applying" stage border
- Deep forest `#173404` — sidebar background, utility buttons, final CTA block, stage icons on pale backgrounds

**Pale greens (surfaces)**
- `#F1F7E4` — primary pale-green backgrounds (icon badges, success panels, default match panel)
- `#EAF3DE` — Applying column background, "Identified" done states
- `#C0DD97` — Submitted column background, progress icon accent
- `#FAFCF5` — hover state on pale-green-adjacent surfaces
- `#3B6D11` — text on pale-green backgrounds
- `#97C459` — nav labels on deep forest

**Cream (secondary surfaces)**
- `#F5F1E8` — Identified column, stats bar, compact info panels, neutral sector/metadata tags

**Coral (Programmes type + Declined stage + urgent deadlines)**
- `#FAECE7` — pale coral background (Programmes tile, Declined column, urgent deadline chips)
- `#F5C4B3` — mid coral (icon badges on Programmes tile)
- `#D85A30` — mid-saturated coral (Programmes tile border when selected, required field asterisks)
- `#993C1D` — deep coral text
- `#4A1B0C` — deepest coral (amount values on coral backgrounds)

**Blue (Social Investment type only)**
- `#E6F1FB` — pale blue background (Investment tile)
- `#B5D4F4` — mid blue (icon badges)
- `#378ADD` — mid-saturated blue (Investment tile border)
- `#0C447C` — deep blue text
- `#042C53` — deepest blue (amount values on blue backgrounds)

**Amber (In-Kind type + helper/assistant moments + warnings)**
- `#FAEEDA` — pale amber background
- `#FAC775` — mid amber (icon badges, slider accents)
- `#BA7517` — mid-saturated amber (In-Kind tile border)
- `#854F0B` — deep amber text
- `#412402` — deepest amber
- Amber is the "helper/assistant" colour — used on the auto-fill URL helper on onboarding entry, the re-import prompt on Profile, the Profile-off banner on Find Funding, and the missing-deadlines prompt on Deadlines.

**Neutrals**
- `#FAFAF7` — default page background
- `#F1F0EA` — pill backgrounds for segmented toggles (Browse/Saved, sort controls)
- `#E8E6DD` — muted stone for optional neutral states (unused in current designs, available)
- `#2C2C2A` — darkest neutral text (body)
- `#5F5E5A` — secondary text
- `#D9D6CB` — inactive toggle background

### 1.3 Four-category funding system

The colour system that carries through the entire product. Every funding opportunity belongs to one of four categories.

- **Grants** → green (lime lead, pale-green backgrounds)
- **Programmes** → coral (accelerators, fellowships, cohort programmes)
- **Social Investment** → blue (loans, equity, blended finance)
- **In-Kind Support** → amber (pro bono, software, workspace)

Applied consistently across: Find Funding tabs, Funder Insights markers, Saved view tabs, opportunity card type tags, Pipeline card type pills, Dashboard new-matches cards, Profile funding-type tiles, funding-specifics section headers.

### 1.4 Pipeline tonal ladder

A separate system from the four-category funding colours. Signals stage progression.

- **Identified** → cream `#F5F1E8` (unlabelled, passive)
- **Applying** → pale green `#EAF3DE` (active work beginning)
- **Submitted** → mid green `#C0DD97` (material investment made)
- **Won** → saturated green `#639922` with cream text (celebration end)
- **Declined** → soft coral `#FAECE7` with deep coral text (terminal end, not alarming)

The ladder climbs through four greens, then breaks to coral for Declined. The break is intentional — signals "Declined isn't the next step up the ladder, it's a different kind of outcome."

Never use red. Coral handles the declined state warmly — fundraising is rejection-heavy (70–80% decline rate in the sector), and red would be actively demoralising.

### 1.5 Iconography

- Lucide-style icons throughout. Stroke width 1.8–2, round line joins.
- Icons live in pale-green badge containers (`#F1F7E4` background, `#3B6D11` icon colour) for most contexts.
- Category-specific icon badges use the appropriate pale colour + deep text pair (e.g., Programmes icons sit on `#F5C4B3` badges with `#993C1D` strokes).
- Match reasons use small inline green checks (`#639922`, stroke width 3).
- Do not use outline-only icons without badge backgrounds in UI — the filled-badge pattern is the system.

### 1.6 Match bar

Thin horizontal bar under the match percentage, used on every opportunity card.

- Track: `rgba(57, 109, 17, 0.15)` — pale green at 15% opacity
- Fill: `#8ECB3C` (lime), width = match percentage
- Height: 4px, radius 2px
- Appears under the `83%` number, above or adjacent to "Strong match" label

Used in: Find Funding cards, Saved cards, Dashboard new-matches cards, Pipeline edit modal (writing progress variant).

### 1.7 Match score language

Three qualitative bands tied to percentages:
- 85%+ → "Strong match"
- 70–84% → "Good match"
- Below 70% → "Partial match"

Show both the number and the band label. Users can make decisions on either.

---

## 2. Component patterns

### 2.1 Buttons

Three tiers. One rule: deep forest `#173404` is the sidebar colour — never use it as a button fill.

**Primary (lime)** `#8ECB3C` background, `#173404` text, `font-weight: 600`, radius 10px.
- The single most important action in a visual region. One primary button per context.
- Apply, Save changes, Search, + Pipeline on opportunity cards, Apply at [funder], Done on filter panels.
- Include an inline icon (checkmark, arrow, plus) sized 12–13px.

**Secondary (white outline)** `#fff` background, `0.5px solid rgba(0,0,0,0.14)` border, `#2C2C2A` text, radius 10px.
- Supporting page-level actions that aren't the primary CTA.
- + Add Opportunity, + Add deadline, Pipeline →, Save on cards, Cancel, Clear search, Reset filters.
- **Page-level Add actions are always secondary.** These pages manage existing items — adding is a supporting action.

**Ghost (text only)** transparent background, no border, `#5F5E5A` text.
- Cancel, Discard, text links. No visual weight — use when the action is truly optional.

~~**Utility (deep forest green)** — retired.~~ Deep forest `#173404` is reserved for the sidebar and brand surfaces. Former "utility" actions (Search, Done, Apply at [funder]) are now primary (lime). See `src/components/ui/Button.tsx` for the shared component.

**Quiet/text links**
- Green text (`#639922`) with underline decoration at 30% opacity, underline appearing fully on hover. For "Show all N grants," "See all matches →," "View all deadlines →."
- Grey text with hover-coral for destructive links. "Remove from pipeline," "Unsubscribe from everything."

### 2.2 Tags and pills

**Funding type pills (the four categoricals)**
- Grant: `#F1F7E4` bg, `#3B6D11` text
- Programme: `#FAECE7` bg, `#993C1D` text
- Investment: `#E6F1FB` bg, `#0C447C` text
- In-Kind: `#FAEEDA` bg, `#854F0B` text
- Used on opportunity cards, pipeline cards, dashboard matches, pipeline edit modal header.

**Sector and funder-type tags (neutral)** `#F5F1E8` bg, `#5F5E5A` text. Used for metadata that isn't part of the four-category system.

**Location tags** `#F1F0EA` bg, `#5F5E5A` text, with a small location-pin icon. Never use blue for location — it would collide with Social Investment.

**Count pills** e.g., "13 saved" on Saved tab, "2 urgent" on Deadlines sidebar. Small, usually using a pale coloured bg + deep text combination. Colour matches context — coral for urgent states, pale green for positive counts.

**Status/state badges** e.g., "Restricted" on opportunity cards, "Recommended" next to 2FA setting. Small outline pill style.

### 2.3 Cards

**Opportunity card (Find Funding, Saved)**
- White bg, 14px radius, 0.5px neutral border
- Horizontal layout: main content (left) + action stack (right, ~170px wide)
- Meta row with 4 columns: Amount / Deadline / Eligible / Restriction
- Match panel full-width below main content in pale green (`#F1F7E4`), with reasons left and score+bar right
- "Funder insights ↓" disclosure at bottom — expands into full panel

**Match card (Dashboard, compact)**
- White bg, 10px radius, thinner border
- Type tag top-left, age indicator top-right
- Title, funder, and small meta row with amount + match score

**Pipeline card (on Pipeline board)**
- White bg, 10px radius
- Type tag top, title, funder, meta row at bottom (amount + deadline status)
- Context-aware action at bottom (see Section 8)
- Drag handle and remove action appear on hover only (6-dot icon top-right)

**Saved card** same as opportunity card plus a small "Saved N days ago" marker above the type tag. Primary action changes to "Add to pipeline" (green), secondary to "Unsave" with × icon.

### 2.4 Tabs and segmented controls

**Primary nav tabs** (Profile/Notifications/Account on settings pages): pill group, white active state with light shadow, grey inactive.

**Funding type tabs** (four category tabs on Find Funding): larger cards with icon + label + count, categorical colour fills when active.

**View toggles** (Browse/Saved, Matched/All, sort controls): smaller segmented pill groups with `#F1F0EA` background and white active state.

All segmented controls use 999px radius for both the outer container and the active indicator. Inactive buttons are transparent; active buttons are white with `0 1px 2px rgba(0,0,0,0.06)` shadow.

### 2.5 Toggles

**Standard toggle** (44×24px, 999px radius)
- Off: `#D9D6CB` bg
- On: `#639922` bg
- Thumb: 18×18px white circle, 3px inset

**Small inline toggle** (36×20px)
- Same colours, smaller dimensions
- Used in settings rows alongside cadence pills

### 2.6 Form fields

- Input height: ~42px (11px vertical padding + 14px horizontal)
- Border: 0.5px `rgba(0,0,0,0.14)` default, `#639922` on focus
- Radius: 10px
- Font: Plus Jakarta Sans, 14px, `var(--color-text-primary)`
- Placeholder: `var(--color-text-tertiary)`
- Pre-filled values in onboarding get pale-green background `#FAFCF5` + green border to signal "already answered"
- Currency inputs show `£` prefix as absolutely-positioned text; remove placeholder if overlapping

**Labels** sit above fields in Plus Jakarta Sans 13px medium weight. Required fields get a coral asterisk `*`. Optional fields get an inline "optional" in `var(--color-text-tertiary)`.

**Help text** sits under fields in Plus Jakarta Sans 12px, secondary text colour. Concise — single sentence where possible.

### 2.7 Sticky footer (on long-form pages)

Used on Profile and Notifications settings pages.
- Fixed bottom, full width, white bg, 0.5px top border, small box shadow
- Left: save status with green check icon ("All changes saved")
- Right: action buttons (Discard outlined, Save primary lime)
- 14px vertical padding, 28px horizontal matching page margins

### 2.8 Modal backdrop

All modals use `rgba(23, 52, 4, 0.4)` — deep forest green at 40% opacity. Never use generic black. Ties modals to brand.

### 2.9 Progress bars

- Track: `rgba(57, 109, 17, 0.15)`
- Fill: `#8ECB3C` (lime)
- Height: 4–6px depending on context (4px for match bars, 6px for profile completion)
- Same pattern used for profile completion, onboarding step progress, writing progress in pipeline edit modal

---

## 3. Marketing site

### 3.1 Overview

13 sections in order: Nav → Hero → Stats bar → Process (4 steps) → Funding Types (4 cards) → Features → Who it's for (4 cards) → About → Values (3 cards) → Application section (replaces testimonials) → Contact → Final CTA → Footer.

**Beta framing:** Every CTA on the marketing site says "Apply to join" — the beta is invitation-only/curated, not open signup. Hero pill: "Founding cohort — applications open" with green dot indicator.

### 3.2 Nav

Clean horizontal nav, "Founding cohort" replaces "Pricing" as a nav link with a small green dot indicator. "Apply to join" as the right-side CTA button.

### 3.3 Hero

Heading: "*Funding,* matched for you." — green leads here because "Funding" stands alone as the subject.

Below heading: cohort pill, CTA ("Apply to join"), product card on right showing funding-type colored tags (demonstrates the categorical system from the first moment), cohort note "We're hand-picking 20–30 founding users. Free during beta."

### 3.4 Stats bar

Cream background (`#F5F1E8`). Deep near-black numbers. "Free" in lime green. Positioned immediately below hero.

### 3.5 Process (4 steps)

Tonal green ladder — pale to saturated. Four cards representing the user journey: Create profile → Get matched → Apply → Track. Icons in pale-green badges.

### 3.6 Funding Types (4 cards)

This is where the four-category system gets introduced on the marketing site. Each card uses its category colour (green/coral/blue/amber): pill + icon badge + label + description. Legend row underneath reinforces the mapping.

### 3.7 Features

Floating product cards demonstrating different funding types alongside pipeline and dashboard previews. Match bar visible on one card. Shows the four-colour system in action.

### 3.8 Who it's for (4 cards)

Icons only (no numerals). Pale-green badge treatment. Four org types: CIC (circle+heart), Charities (columned building), Co-operatives (interlocking circles), Impact Founders (sprout).

### 3.9 About

DM Serif Display founder quote with oversized green quotation marks. Paul Kilty attribution. Pale-green stat card ("£8bn+" UK funding opportunities). "Why it exists" white card. This is one of only two uses of DM Serif Display in the entire product.

### 3.10 Values (3 cards)

Tonal green ladder — pale to saturated — for three values: Honest / Practical / Accessible.

### 3.11 Application section (replaces testimonials)

Heading: "Building this with a small group." Two cards: "Who we're looking for" (4 org types) + "The exchange" card describing what users get for joining the cohort (free beta access, first-year discount after launch, direct line to the founder).

**Pricing is hidden entirely until post-beta.** No pricing section. Commitment to "Discounted pricing for your first year after launch" lives in the exchange card.

### 3.12 Contact

Green "Send message" button, pale-green icon badges, simple contact form.

### 3.13 Final CTA + Footer

Deep forest green block (`#173404`). "Apply to join" button in lime. Integrated footer with brand tagline "Built for the UK social impact sector" in footer signature.

---

## 4. Onboarding flow

### 4.1 Flow map

1. **Sign-in page** (for returning users with existing invite)
2. **Invite-arrival account creation** (first-time users accepted to the cohort)
3. **Onboarding entry page** (choose path: URL auto-fill / manual / skip)
4. **3-step onboarding wizard** (profile setup)
5. Route to → **Find Funding** (first-visit users go straight here, not Dashboard)

Sidebar is hidden throughout the entire onboarding flow — only the GrantTracker wordmark in top-left as a quiet anchor. Sidebar only appears once onboarding is complete.

### 4.2 Sign-in page

Deep forest green left panel with pale-green icon badges. Deep-green "Sign in" button. Three alt routes below: check application status / apply to join / subscribe to newsletter. Removed any "Create one free" language that contradicted the invitation-only model.

### 4.3 Invite-arrival account creation

Personal welcome: **"Welcome, Paul."** in DM Serif Display — one of only two uses of this typeface. Founder note below.

Components: "You're in" pill (small, uppercase, pale-green bg + deep green text with dot), applicant chip showing email + "Founding cohort member," password field with inline validation of requirements, terms checkbox that explicitly mentions beta status.

### 4.4 Onboarding entry page

Page heading: "Let's set up your *profile*." Subhead signals both time commitments: "Takes about three minutes — or ten seconds if your organisation has a website we can read from."

Three paths, priority-ordered:

**1. Auto-fill from website (amber treatment).** "Got a website? We'll read it for you." Amber icon badge (warm helper treatment). URL input + "Read & draft" button. Helper text: "You can edit anything before saving."

**2. Fill it in yourself (green treatment).** "Three short steps — about 3 minutes. We'll guide you through." Pale-green icon badge. Arrow on the right signals this is a path forward, not a link.

**3. Skip (quietest treatment).** "Skip — browse the full funding database." Small grey link below a thin divider. Detail line below: "You won't see matches until you complete your profile. You can set it up anytime from your account."

Removed the "OR" divider between options. Removed the "fastest way" framing that implied manual was slow.

**Exit affordance:** "Sign out" in top-right. No other navigation.

### 4.5 3-step onboarding wizard

Reduced from the original 7 steps. The remaining ~70 fields from the old flow move to progressive profile completion inside Settings.

**Structure for all three steps**
- Top bar: wordmark left, "Skip setup — browse without matching" top-right (remove from Step 3 — pointless at the last step)
- Progress: "Step N of 3" with segmented bar (done / active / todo)
- Time estimate: "About 30 seconds" / "About a minute" / "Almost done"
- Heading with green subject word
- White card containing form fields
- Back link + Continue button (or Finish on Step 3)

**Step 1 — Who you are (30 seconds)**
- Welcome pill "You're in" + greeting "Welcome, *Paul.*"
- Subhead: "We've pre-filled what we learned from your application."
- Three fields: Organisation name (pre-filled, green-tinted input), Legal structure (pre-filled dropdown), Location (empty free-text)
- Pre-filled fields get a small "Pre-filled" pill with checkmark next to the label
- Helper text on location: "Town or borough is most useful. Local grants in your area get prioritised; national grants always apply."
- Helper text on legal structure: "This drives eligibility — we filter out funding your structure can't apply for."

**Step 2 — What you do (about a minute)**
- Heading: "What do you *do?*"
- Mission statement FIRST (most important, unconstrained)
- Then sector selection (one primary from 12 sectors, shown as chips)
- Then beneficiary selection (one primary from 10 groups, shown as chips)
- "Add secondary" disclosures below each — most users won't need
- Selected chip state: pale green bg `#F1F7E4` + green border + checkmark prefix

Sector list (12): Young people, Community development, Health & wellbeing, Mental health, Housing & homelessness, Education & skills, Environment & climate, Arts & creative industries, Employment, Food & agriculture, Tech for good, Justice & rights.

Beneficiary list (10): Children (under 16), Young people (16–25), Older people, Families, Women & girls, LGBTQ+ communities, Ethnic minorities, Disabled people, People experiencing poverty, General community.

**Step 3 — What you're looking for (almost done)**
- Heading: "What are you *looking for?*"
- Subhead: "A rough shape of what you need. You can adjust everything later."
- Funding size: range slider with two thumbs, £0 / £25k / £50k / £100k / £250k+ scale, numeric display above
- Funding types: four tiles in a 2x2 grid using the categorical colour system. All selected by default. Users deselect any they don't want.
- Alerts: single row with toggle. Label "Email me when new matches appear" + subtitle "Weekly digest — you won't get spammed." Default ON.
- Final CTA: **"Finish & see my matches"** in lime green (the only lime CTA in the flow — this is the conversion moment).

### 4.6 Newsletter signup (parked)

Designed but not launching until post-beta. Cream left panel with mock Issue #1 preview showing all four funding-type colours. First name + org type + email capture. Won't be linked anywhere until Issue #1 is ready.

---

## 5. Find Funding

The first-visit destination for new users after onboarding (not the Dashboard).

### 5.1 Page structure

**Header:** page title "Find funding" + subtitle with context ("Matched for Brighton Community CIC · Brighton"), green dot indicator.

**Top-right controls:** Browse/Saved segmented toggle (Saved shows count pill). Browse is default.

**Search bar:** single input, Filters button with count badge (and chevron up/down for expand/collapse state), deep-green Search button.

**Funding type tabs (4):** Grants / Programmes / Investment / In-kind. Each tab uses its categorical colour when active (pale bg, coloured icon badge, coloured count text). Inactive tabs have neutral border with coloured count text. Counts format: "222 matches" (not raw numbers).

**Results header row:** result count + context on left, sort pills on right.
- Count format: "222 grants · ✓ matched to your profile · Show all 2,847 grants"
- "Show all N grants" is a subtle underlined green link — the Profile-off escape hatch
- Sort pills: Best match (default active) / Newest / Closing soon

**Results list:** stacked opportunity cards.

### 5.2 Opportunity card

White bg, 14px radius, thin neutral border. Two main areas:

**Body (left + action column)**
- Tags row: type pill (categorical colour) + sector tags + location tag (with pin icon, neutral grey not blue)
- Title: Space Grotesk 18px medium
- Funder: Plus Jakarta 13px medium, primary text colour
- Description: Plus Jakarta 13px, secondary text colour
- Meta row (top border divider): Amount (green) / Deadline / Eligible structures / Restriction

**Action column (~170px wide)**
- Primary: "Add to pipeline" (lime green, + icon)
- Secondary: "Save for later" (outlined, bookmark icon)
- Tertiary: "Visit funder" (faint outlined, external-link icon)

**Match panel** (full-width below body, pale green `#F1F7E4` bg, thin green border top)
- Left: three match reasons with green checkmarks
- Right: match percentage (22px Space Grotesk, deep green) + thin match bar below + "Strong match" label

**Funder Insights disclosure** (bottom of card, full-width, cream-ish bg)
- "Funder insights ↓" with chevron
- On expand: 8-block grid covering What they fund / Who can apply / Geographic focus / Current priorities / Strong application / Typical award / Decision timeline / Insider tips
- Each block has small icon badge + uppercase label + body paragraph
- Icons use varied colour treatments from the palette (green/amber/blue/coral) for visual rhythm
- Timestamp top-right: "Updated 16 April 2026"
- "Apply at [funder]" deep-green CTA at bottom of expanded panel
- "Show less ↑" link left-aligned in same row

### 5.3 Profile toggle (inline)

Not a separate segmented control. Exists as inline link near results count: "Show all 2,847 grants." When activated:

- Page subtitle changes: "Showing all UK funding · profile filters paused" with amber dot
- Amber info banner appears below search: "**Profile filters are off.** You're seeing every UK funding opportunity, including ones you may not be eligible to apply for." + "Turn profile back on" deep-green button
- Tab counts change from "222 matches" to "2,847 total"
- Banner is persistent (not dismissible) while profile is off

### 5.4 Filter panel

Expanded state from "Filters N ↓" button. White card below search bar.

**Header row:** "Refine your results" + active count pill + Reset all (top-right, text link turns coral on hover) + Done button (deep forest, closes panel).

**Helper text:** "Results update as you go. Click Done when you're happy with your filters."

**Row 1 (three columns):**
- Funder type: pills — All sources / Trusts & Foundations / Community Foundations / Lottery / Local Authority / Government / Corporate / CSR
- Location: pills — Anywhere / UK-wide / England / London / Scotland / Wales / Northern Ireland / Regional
- Deadline: pills — Any / Rolling / Has deadline / Closing this month

**Row 2:** Amount range (£ Min – £ Max inputs, no placeholders to avoid prefix overlap).

**Row 3 (full width):** Sector pills using the profile taxonomy (same labels as Profile settings — "Arts & Creative Industries" not "Arts & Culture"). Show 12 initially with "Show N more sectors ↓" disclosure for the full 19.

**Pill selected state:** deep forest `#173404` bg + pale green text.

Funding Type is NOT a filter — the four tabs above the filter panel already serve that function.

---

## 6. Saved view

Accessed via the Browse/Saved segmented toggle on Find Funding. NOT a sidebar item.

### 6.1 Differences from Browse

- **Subtitle:** "13 opportunities saved for review" (instead of "Matched for Brighton Community CIC")
- **Saved count pill** on the Saved tab
- **Search placeholder:** "Search within saved…" (scope automatically narrows)
- **Sort options:** Recently saved (new, default) / Best match / Closing soon
- **Funding type tabs** show "8 saved / 3 saved / 0 saved / 2 saved" instead of match counts; "0 saved" tab is visible but greyed
- **Card marker:** each card gets a small "Saved N days ago" line above the type tag
- **Card actions change:** Primary becomes "Add to pipeline" (lime green), Secondary becomes "Unsave" (× icon), Tertiary stays "Visit funder"
- **Urgent deadlines** appear in coral inside the meta row when close to closing

### 6.2 Promotion path

When user clicks "Add to pipeline" from Saved: the opportunity **moves** from Saved to Pipeline (does not duplicate). Show a toast confirmation "Moved to Pipeline > Identified" with an Undo link.

This is the full journey: **Browse → Save for later → (audition) → Add to pipeline → (work through pipeline stages) → Won/Declined.**

---

## 7. Dashboard

Two states designed. Active users (Week 2+) see the populated state; first-visit users land on Find Funding instead and see the empty Dashboard only if they click Dashboard in the sidebar.

### 7.1 Empty state (Day 1)

No zeroes. Celebration of what's about to happen, not what hasn't happened yet.

**Header:** "Welcome to Grant Tracker, *Paul.*" + subtitle "Your profile's complete — time to find some funding." + right-side "Find funding" lime CTA.

**Welcome banner:** pale-green-to-neutral gradient card. Pill: "222 matches ready" (lime bg, deep text, dot indicator). Heading: "We've found funding that fits your profile." Body paragraph frames the invitation. Two actions: primary deep-green "See my matches" + secondary outlined "Give me a tour."

**Getting started checklist:** 5 items with done/next/todo states.
1. Complete your organisation profile (done — green filled check)
2. Browse your first matches (next — green ring + Start CTA)
3. Save your first opportunity (todo)
4. Add an opportunity to your pipeline (todo)
5. Enrich your profile for better matching (todo — with "Later" skip link)

The checklist auto-dismisses or collapses once completed. Remaining items update as user progresses.

**"What you'll see here soon" preview card:** cream background. Three tiles at 0.75 opacity showing future states: Upcoming deadlines / Pipeline at a glance / New matches. Educational without being patronising.

### 7.2 Populated state (Week 2+)

**Header:** "Good morning, *Paul.*" + informative subtitle "2 deadlines this week · 3 applications in progress · 8 new matches since Monday" + right-side "Find funding" lime CTA.

Subtitle is dynamic based on actual data. When no deadlines, no applications, no new matches — revert to empty state logic.

**This week's deadlines** (top card)
- Header: "This week's deadlines" + "2 closing soon" coral count pill + "View all deadlines →" link
- Each row: countdown (urgent coral / ok green) + date + name + funder + type tag (categorical colour) + "View" action

**Pipeline** (second card)
- Header: "Pipeline" + stats row on the right ("£187k total potential · 9 active · £8k won this year")
- Five-column tonal ladder of stage tiles: Identified (cream) / Applying (pale green) / Submitted (mid green) / Won (saturated green) / Declined (soft coral)
- Each tile shows stage label + amount + opportunity count
- Matches exactly the Pipeline page styling

**New matches** (third card)
- Header: "New matches" + "8 new since Monday" pale-green count pill + "See all matches →" link
- Three mini cards: type pill + age indicator + title + funder + amount + match score with bar

### 7.3 No vanity metrics

The four huge widget cards from the original design (Total Pipeline / Won This Year / Submitted / Urgent Deadlines) are gone. Those numbers live inline in the greeting subtitle and in the Pipeline card's stats row. Dashboard is actionable, not celebratory.

---

## 8. Pipeline

Full kanban board. Five columns using the tonal ladder.

### 8.1 Page header

- Title: "Pipeline"
- Subtitle: "Manage your active opportunities. Drag between stages to update status."
- Right side: "Total pipeline £281.5k" (small label, large green number) + "Add opportunity" lime button with + icon

### 8.2 Column structure (left to right)

Each column shows: stage icon + label + count pill + subtotal line.

1. **Identified** (cream) — "£35k potential"
2. **Applying** (pale green) — "£2k in progress"
3. **Submitted** (mid green) — "£5k awaiting"
4. **Won** (saturated green with cream text) — "£150k secured"
5. **Declined** (soft coral with deep coral text) — "£20k not won"

Stage-specific vocabulary for subtotals: "potential" / "in progress" / "awaiting" / "secured" / "not won" (neutral, not "lost" or "rejected").

### 8.3 Pipeline card

White bg, 10px radius, thin border.

- Type tag top-left (categorical colour)
- Title (Space Grotesk 13px medium)
- Funder (Plus Jakarta 11px)
- Meta row with border-top divider: amount (green) + deadline state (neutral or coral urgent)
- **Context-aware action** (border-top divider, bottom of card):
  - Identified → "Start application →" (green link)
  - Applying → "Mark submitted ✓" (green link)
  - Submitted → no action, shows "Awaiting decision" as status
  - Won → no action, shows "Awarded [date]" as status
  - Declined → no action, shows close date as status

### 8.4 Affordances

- **Drag handle** (6-dot icon): top-right of card, opacity 0 by default, opacity 0.6–1 on hover
- **Remove from pipeline**: accessed via ⋮ menu on hover (not a naked × — too easy to misclick)
- No "+ Add" ghost cards in columns. Adding happens via the top-right "Add opportunity" button only.

### 8.5 Urgent deadline state on cards

When a deadline is within 7 days: the deadline text in the card meta row turns coral (`#993C1D`) with bold weight. "3 days" / "In 5 days" etc.

---

## 9. Pipeline edit modal

Opens when clicking a card on the Pipeline board. Max-width 640px modal with deep-forest backdrop at 40% opacity.

### 9.1 Header

- Two pills at top: funding-type pill (categorical colour) + current stage pill (pipeline column colour)
- Title (Space Grotesk 20px medium)
- Funder line
- × close button top-right

### 9.2 Body sections (top to bottom)

**Amount + deadline row**
- Amount requested (with £ prefix)
- Your deadline (date input)
- Side-by-side in a 2-column grid

**Stage selector**
- 5-column grid of stage tiles using the tonal ladder colours
- Each tile: icon + uppercase label
- Currently selected stage gets a 1.5px green border (color matches stage)

**Writing progress**
- Grouped inside a quiet `#FAFAF7` container as a sub-system
- 7 sub-stages: Not started / Research / Outline / First draft / Revising / Review / Final
- Each sub-stage: icon + small label
- Active sub-stage: pale-green badge treatment
- Progress bar below (lime fill) shows position in sequence as percentage

**Grant URL**
- Input + "Visit" button (outlined) in a row

**Funder contact** (collapsed by default)
- "Add funder contact" green link → expands to Name + Email fields

**Notes**
- Textarea with helpful placeholder: "Key dates, application requirements, questions to answer, anything that helps future-you…"

### 9.3 Footer

- Left: "Remove from pipeline" grey text link (hovers to coral), trash icon
- Right: Cancel (outlined) + Save changes (lime, checkmark icon)

### 9.4 One flagged improvement

Helper text under Amount requested showing the funder's grant range (e.g., "Funder range: £500 – £5,000") — so users can see they're in bounds. Not in current design but recommended for v1.

---

## 10. Deadlines

Calendar view — not a list. Deadlines as a page answers "what's coming up?" better than any other surface.

### 10.1 Page header

- Title: "Deadlines"
- Subtitle: "6 upcoming across your pipeline · 2 need your attention this week" (dynamic)
- Right side: view toggle (Month default / Week / List) + outlined "Manage pipeline →" button

### 10.2 Layout

Two columns:
- **Left:** month calendar grid (takes ~70% of width)
- **Right sidebar (~320px):** Upcoming deadlines card + Missing deadlines prompt

### 10.3 Calendar

Standard 7-column weekly grid (Mon–Sun). Month nav header with `<` Today `>` controls.

**Urgency legend:** three swatches — coral (within 7 days), amber (within 30 days), green (30+ days).

**Day cells:** 88px min-height, neutral `#FAFAF7` bg by default. Today: pale green bg + green border. Other-month days: 0.4 opacity.

**Events on days:** coloured pill labels (coral/amber/green based on urgency), truncated with ellipsis if long. Show up to 2 per day with "+N more" overflow indicator.

### 10.4 Upcoming sidebar card

Header: "Upcoming" + "2 urgent" coral count pill.

Each item: countdown (coloured by urgency) + date + name + funder, in a compact row. Up to 4 items shown.

### 10.5 Missing deadlines prompt

Amber treatment (helper colour) — not alarming, but asks for attention.
- Title: "4 opportunities missing deadlines"
- Subtitle: "Add dates so they show up here and on your dashboard."
- List of first 2 items with "Add date" pill buttons
- "See all 4 →" link to modal with full list

### 10.6 Week and List views

Not designed in detail. Week = same calendar approach but with more event detail per day. List = similar to the sidebar's Upcoming list but extended across all months. Fill in during build.

---

## 11. Profile settings

### 11.1 Tab structure

Profile settings sits in a 3-tab container: **Profile / Notifications / Account**. Tabs use the pill group segmented control pattern.

### 11.2 Page structure

- Header: "Your profile" + subtitle "A complete profile means better grant matches and more relevant alerts." + top-right tabs
- Progress card (pale green, full-width)
- Re-import compact strip (amber, full-width, for returning users)
- 6 numbered section cards
- Sticky footer

### 11.3 Progress card

Pale green `#F1F7E4` bg. Clock icon badge left. Body:
- "Getting there" + "64% complete" on one line
- Thin green progress bar (lime fill)
- Detail line: "Still to fill in: **Legal structure · Organisation stage · Years operating · Grant size range**"

### 11.4 Re-import strip

Compact amber `#FAEEDA` strip (not a full card). Globe icon badge. Copy: "Updated your website? Re-import from **audioactive.org** to refresh your profile automatically." Right side: "Re-import" outlined amber button.

Replaces the large Auto-fill card from the original — the card was wasteful for returning users. First-time onboarding still has auto-fill prominently on the entry page.

### 11.5 Section cards

Each section: white bg, 14px radius, numbered circle (pale green) + title. No DM Serif Display — all headings use Space Grotesk.

**Section 1 — About your organisation**
- Organisation or venture name (required)
- Legal structure (required, dropdown with eligibility driver helper)
- Organisation stage (optional dropdown — Established / Early / Pre-revenue / etc.)
- Charity / CIC / Company number (if applicable)
- Annual income / turnover (optional dropdown with bands)
- Years operating (optional number)
- "I am also an individual practitioner" toggle (at bottom, on quiet grey strip, with clarifying text about DYCP/PRS Foundation-type grants)

**Section 2 — Impact sectors**
- "Pick up to 5 sectors in priority order. The first sector is your primary focus."
- Priority list: each selected sector gets a row with rank pill + name + reorder/remove controls
- Rank pills use tonal green ladder: Primary (saturated green) / Secondary (mid green) / Tertiary (pale green) / #4 / #5 (neutral)
- Below: chip grid of unselected sectors (greyed when at max 5)
- "Specialise further" disclosure at bottom — sub-tags contextual to selected top-level sectors (e.g., if "Arts & Creative Industries" selected, shows Music / Theatre & Drama / Dance / Visual Arts / Film & Media / Literature & Writing / Crafts & Making)

**Section 3 — Who you serve**
- Same priority-list pattern as Section 2, applied to beneficiary groups
- Beneficiary list of 10+ (see onboarding taxonomy)
- No sub-specialisation layer (unlike sectors)

**Section 4 — Location & focus**
- Primary location (free text — "For London orgs, include your borough — e.g. 'Hackney, London' not just 'London'")
- Geographic reach (auto-computed from location, disabled field showing derived value)
- Priority themes (comma-separated free text)
- Areas of work (comma-separated free text)

**Section 5 — Mission statement**
- Textarea with helper: "The more specific you are, the better the matching."

**Section 6 — Grant preferences**
- Target minimum / Target maximum amount (two fields, helper text "Leave blank to see all grant sizes")
- Funding types: 4 tiles using the categorical colour system — green Grants, coral Programmes, blue Investment, amber In-Kind. Selected tiles show filled background + checkmark in circle. Deselected tiles keep their colour hint but are lighter.
- Funding specifics: grouped under coloured section headers matching their parent funding type:
  - GRANTS & AWARDS (green): Unrestricted / Restricted / Capital / Emergency / Small grant
  - PROGRAMMES (coral): Accelerator / Incubator / Fellowship / Cohort programme / Award / prize
  - SOCIAL INVESTMENT (blue): Loan / Social investment / Equity / Quasi-equity / Convertible / Blended finance
  - IN-KIND SUPPORT (amber): Pro bono legal / Pro bono consulting / Tech / software / Volunteering / Office space / Training
  - If parent funding type not selected, the specifics group hides entirely
- Preferred funder types: pill grid (Trusts & Foundations / Community Foundations / Corporate Foundations / Capacity Builders / National Lottery / Local Authority / Central Government / Corporate or CSR / Housing Associations / Competitions & Awards / Social Lending / Matched Crowdfunding)

### 11.6 Sticky footer

- Left: save status with green check ("All changes saved" — assumes auto-save) or unsaved indicator
- Right: Discard (outlined) + Save changes (lime with checkmark)

---

## 12. Notifications settings

Accessed via the Notifications tab in settings.

### 12.1 Structure

- Header + tabs
- Master email toggle card (pale green, full-width)
- Section: What to notify me about
- Section: Timing
- Section: The Grant Tracker newsletter (parked)
- Unsubscribe link at very bottom
- Sticky footer

### 12.2 Master toggle

Pale green card with bell icon badge. Copy: "Email notifications" + "Sent to **paul@brightoncommunity.co.uk** · turn off to pause everything." Standard toggle (44×24) on right. When off, all downstream rows fade to 0.5 opacity.

### 12.3 Alert rows

Five alerts in one section. Each row: icon badge (categorical colour) + title + description + right-side controls (cadence + small toggle).

1. **New matches** (green badge, search icon)
   - Cadence pills: Instant / Weekly / Monthly — default Weekly
   - Toggle: ON default
2. **Upcoming deadlines** (coral badge, clock icon)
   - Cadence pills: 7 days / 10 days / 14 days (lead time)
   - Toggle: ON default
3. **Funder updates** (blue badge, document icon)
   - No cadence (event-driven)
   - Toggle: ON default
4. **Application reminders** (amber badge, check-circle icon)
   - No cadence
   - Toggle: OFF default (opt-in — avoids feeling pestered)
5. **Monthly summary** (neutral badge, chart icon)
   - Toggle: ON default
   - Delivered 1st of each month

### 12.4 Timing section

Two digest rows on `#FAFAF7` background:
- Weekly digest delivered on → dropdown (Monday mornings default)
- Monthly summary delivered on → dropdown (1st of month default)

### 12.5 Newsletter section (parked)

One row with neutral badge + envelope icon:
- Title: "Subscribe at launch"
- Subtitle: "We'll let you know when issue #1 is ready."
- Toggle ON default

### 12.6 Unsubscribe link

Bottom of page, centered. Grey underlined link "Unsubscribe from everything" — hovers to coral. Separated from master toggle because this is the harder stop (removes email from all lists).

---

## 13. Account settings

Accessed via the Account tab in settings.

### 13.1 Structure

- Header + tabs
- Identity strip (shows avatar, name, email, cohort badge)
- Beta banner (founding cohort plan status)
- Section: Sign-in
- Section: Billing
- Section: Your data
- Danger zone (pause + delete)

### 13.2 Identity strip

White card with 56px avatar (initials in lime bg + deep text), name, email, and two badges:
- "● Founding cohort" (pale green bg, green dot, deep text)
- "Member since April 2026" (cream bg, neutral text)

### 13.3 Beta banner

Pale green `#F1F7E4` card. Clock icon badge. Copy: "You're on the free founding-cohort plan" + "**Full access, no cost** during beta. Paid plans launch after beta — you'll get first-year discounted pricing for being here early."

### 13.4 Sign-in section

Four rows, each with: label + value/hint + action button on right:
- Email address → "Change email"
- Password (shows "Last changed N weeks ago") → "Change password"
- Two-factor authentication (shows "Recommended" inline pill) → "Set up"
- Active sessions (shows "2 devices · last signed in from Brighton 2 hours ago") → "Manage"

### 13.5 Billing section

Intro: "Paid plans launch after beta."

Rows:
- Current plan (shows "Founding cohort · free during beta") → "Available post-beta" (disabled button style)
- Payment method → hint "None on file — you'll be asked to add one when paid plans go live"
- Invoices → hint "No invoices yet"

Honest empty state. Don't fake features that don't exist yet.

### 13.6 Your data section

Three rows on `#FAFAF7` subtle rows with icon + title + sub + action:
- Export pipeline (CSV) → "Download"
- Export saved opportunities (CSV) → "Download"
- Download everything (JSON) → "Request" (for slower server-side export)

### 13.7 Danger zone

White card with coral `rgba(153, 60, 29, 0.25)` border. Section heading in deep coral. Two rows:

**Pause your account** → "Stop all alerts and matching. You can reactivate anytime." → "Pause" outlined coral button. Reversible.

**Delete account** → "Permanently remove your profile, pipeline, saved items, and notes. Your email will be unsubscribed from all lists." → "Delete account" outlined coral button. Opens a confirmation modal requiring the user to type their email to confirm.

Having Pause separate from Delete is deliberate — most users overwhelmed or going on sabbatical want to pause, not destroy their work.

---

## 14. Help approach

No floating "?" button. No tutorial popups. Trust the design.

**Three specific help surfaces:**

1. **Day 1 Dashboard checklist** — the primary onboarding / orientation mechanism. Task-based, fades when completed.

2. **Inline tooltips on 2–3 genuinely confusing moments:**
   - The "Save for later" vs "Add to pipeline" distinction
   - Funder Insights (what's in there, why it matters)
   - Pipeline stages and writing progress relationship
   
   Tooltip trigger: small "?" icon next to the affected element. Hover/tap reveals. Keep copy short (1–2 sentences).

3. **"Help" link in user menu** (top-right of sidebar when clicking avatar) → external help centre or docs site. Not in sidebar as a nav item.

**Why this works:** New users get guided via checklist. Confused users get specific answers inline. Power users never see help UI. No elaborate help content to maintain pre-launch.

**What we avoided:** persistent "?" floater, tutorial popups, tooltips on every icon, "How to use" page in sidebar.

---

## 15. Copy and naming conventions

### 15.1 Actions vocabulary

- **Save for later** (not "Save" or "Bookmark") — signals low commitment
- **Add to pipeline** (not "Track" or "Add to list") — signals commitment
- **Remove from pipeline** (not "Delete" or "Remove") — signals reversibility
- **Move to stage** / **Mark submitted** — action-oriented, specific to context
- **Unsave** (not "Remove from saved") — matches "Save" inverse
- **Start application** — used on Identified cards to move to Applying
- **Apply at [funder]** (not "Apply now") — names the destination

### 15.2 Stage names

Never rename these. Consistency across Pipeline, Dashboard, edit modal, and Profile:
- Identified / Applying / Submitted / Won / Declined

Subtotals use stage-specific vocabulary:
- "£35k potential" / "£2k in progress" / "£5k awaiting" / "£150k secured" / "£20k not won"

### 15.3 Urgency language

- Deadlines: "In 3 days" / "In 6 days" (not "3 days to go" or "3 days remaining")
- Date stamps: "Mon, 21 Apr" format (day + date + month)
- Writing progress: "Research" / "First draft" / "Final" (no "Stage N" format)

### 15.4 Empty states

- Never show "0" as a value. Instead: "No opportunities in pipeline yet" / "Add deadlines to see them here."
- Use "yet" when the empty state is expected to fill over time — gentler than absolute absence.

### 15.5 Beta framing

Consistent across marketing and product:
- "Founding cohort" (not "Beta users" or "Early access members")
- "Apply to join" (not "Sign up" or "Get started")
- "You're in" on welcome moments
- "Free during beta" / "Discounted pricing for your first year after launch"

### 15.6 Tone

- Warm but not chummy
- Directive without being bossy
- Honest about limitations ("Paid plans launch after beta" — not "Coming soon!")
- British English throughout (organisation, personalise, etc.)
- Avoid jargon that assumes fundraising expertise
- Avoid patronising explanations for jargon that users likely know (grants, charities, CICs)

---

## 16. Open questions and decisions deferred

Items that need resolution during build, not during design:

### 16.1 Auto-save vs manual save

Profile and Notifications pages have sticky footers implying manual save with an "All changes saved" status. The status phrasing assumes auto-save underneath (status updates on every change). If auto-save is too complex to build, the same sticky footer works with explicit Save — just update the copy to "You have unsaved changes" when dirty.

### 16.2 URL auto-fill failure states

When a user pastes a URL on the onboarding entry page and the scrape fails or returns nothing useful, we need a graceful fallback: "We couldn't read much from that page. Try another URL, or fill it in yourself."

### 16.3 Funder updates feature

The "Funder updates" alert in Notifications requires the system to detect when a funder changes their priorities/guidelines. If this isn't reliably buildable in v1, hide it initially or reframe as "Funder news (coming soon)."

### 16.4 Deadline view variants

Week and List views not fully designed. Use Month view as the primary; Week = zoomed-in daily detail grid; List = extended Upcoming sidebar scaled to all months.

### 16.5 Calendar event overflow

When a day has 3+ deadlines, show the first 1–2 event pills plus "+N more" overflow indicator. Clicking the day opens a mini-modal with all events.

### 16.6 Match percentage granularity

We settled on showing both the number (83%) and a qualitative band ("Strong match"). Worth user-testing whether to simplify to bands only (Strong / Good / Partial) post-launch.

### 16.7 Dashboard routing on Day 1

First-visit users route to Find Funding, not Dashboard. Implementation: check if user has pipeline activity; if none, route to /find-funding. After first visit, check Day-N threshold or explicit "show dashboard" user pref.

### 16.8 Cohort count visibility

Whether to show a live cohort count ("17 of 30 founding users") on the marketing site or stay with soft framing ("first 30 users"). Currently implicit — no live count.

### 16.9 Specific exchange card promises

"Forever-discounted" was softened to "discounted pricing for first year." "Monthly calls with founder" softened to "direct line to the founder." "3 minutes to apply" and "48 hours to reply" — confirm these before launch.

### 16.10 Opportunity detail full page

Deferred. Current card + Funder Insights expand handles detail sufficiently. If users start asking for shareable grant links or SEO on individual opportunities, build a `/funding/[id]` page in v2.

### 16.11 Delete account confirmation flow

Modal requiring user to type their email to confirm. Not yet designed — follow the system's modal pattern (deep forest backdrop, standard header, typed confirmation field + Delete coral button).

### 16.12 Auto-fill reliability / fallbacks on Profile

The re-import strip assumes the scrape works reliably for returning users. Needs same failure handling as onboarding entry auto-fill.

---

**End of specification.**

For questions or additions, reference the Claude Cowork session containing the design conversation history.
