# Grant Tracker — Brand Guidelines

**Purpose:** A self-contained brand reference you can hand to a fresh session (or a designer) to produce on-brand work without reading the codebase. For exhaustive page-by-page UI patterns see `docs/grant-tracker-design-spec.md`; the implemented source of truth for tokens is `src/app/globals.css`.

**Product:** Grant Tracker — UK funding discovery + pipeline tool for charities, CICs, and social enterprises. https://granttracker.co.uk
**Locale:** British English (`en_GB`). "organisation", "programme", "£".

---

## 1. Personality

Grounded, plainspoken, optimistic. We help under-resourced impact organisations find money without jargon or hype. The brand should feel like a capable, warm operator — not a corporate SaaS dashboard and not a charity-sector cliché. Natural green palette (growth, funding, the UK), warm cream neutrals (approachable, not sterile), generous rounded corners (friendly), confident typography.

---

## 2. Typography

Three faces, each with a fixed role. **Do not substitute or mix roles.**

| Face | Role | Weights | CSS variable |
|---|---|---|---|
| **Space Grotesk** | Headings, UI labels, button text, nav, metadata, **all numeric values** | 500, 700 | `--font-space-grotesk` |
| **Plus Jakarta Sans** | Body prose, form content, help text, descriptions | 400, 500, 600, 700 | `--font-dm-sans` *(legacy var name — it IS Plus Jakarta)* |
| **DM Serif Display** | Decorative only — two places: onboarding welcome headline + marketing About testimonial quote. Nowhere else. | 400 | `--font-dm-serif` |

- Body inherits Plus Jakarta automatically (set on `body` in globals.css). Apply Space Grotesk explicitly: `style={{ fontFamily: 'var(--font-space-grotesk)' }}` or the `.font-display` / `font-sans` utility.
- Headings (`h1`–`h6`) default to Space Grotesk, weight 500, `letter-spacing: -0.02em`.
- `Fraunces` is also loaded as `--font-fraunces` but is not part of the active brand system — don't reach for it.

**Heading accent rule (marketing/branded surfaces):** dark text leads, **lime green resolves on the second clause** — e.g. "Plans that respect *your budget.*" Exception: the marketing hero leads with green ("*Funding,* matched for you."). **App utility pages use all-black headings — no green accent.**

---

## 3. Colour

Use these hex values exactly. Tokens are defined in `globals.css :root`.

### Greens (primary brand)
| Token | Hex | Use |
|---|---|---|
| Lime | `#8ECB3C` | Primary CTAs, match-bar fill, hero accents, success |
| Lime hover | `#7BB82F` | Primary button hover |
| Mid green | `#639922` | Button hover, filled states, "Won" column, toggle-on |
| Deep forest | `#173404` | Sidebar bg, utility buttons, final CTA blocks, primary-button text |
| Active forest | `#27500A` | Active nav item background |
| Pale green 1 | `#F1F7E4` | Icon badges, success panels, default match panel |
| Pale green 2 | `#EAF3DE` | "Applying" column bg |
| Pale green 3 | `#C0DD97` | "Submitted" column bg |
| Green text deep | `#3B6D11` | Text on pale-green backgrounds |
| Nav green | `#97C459` | Nav labels on deep forest |

### Neutrals (warm — never cold grey)
| Token | Hex | Use |
|---|---|---|
| Cream 1 | `#F5F1E8` | "Identified" column, cream surfaces, sector tags |
| Page bg | `#FAFAF7` | App background |
| Pill neutral | `#F1F0EA` | Location tags, segmented-control track |
| Text primary | `#2C2C2A` | Body / headings (charcoal, not pure black) |
| Text secondary | `#5F5E5A` | Supporting text |
| Text tertiary | `#8A8986` | Placeholders, least emphasis |

### Accent families (one per funding type — see §5)
| Family | Pale | Saturated | Deep |
|---|---|---|---|
| Coral | `#FAECE7` | `#D85A30` | `#993C1D` |
| Blue | `#E6F1FB` | `#378ADD` | `#0C447C` |
| Amber | `#FAEEDA` | `#BA7517` | `#854F0B` |

### Borders, radii, shadows
- Borders are faint: `rgba(0,0,0,0.06–0.14)`. Card borders are `0.5px`, not `1px`.
- Radii: input `10px`, card `14px`, modal `16px`, badge `8px`, pill `999px`.
- **Hard rule: never `border-radius: 0` anywhere.** Rounded corners are non-negotiable.
- Modal backdrop is **always deep-forest at 40% — `rgba(23,52,4,0.4)` — never black.**

---

## 4. Buttons

Semantic hierarchy (when to use which), with implementation:

| Tier | Look | Use for | CSS class |
|---|---|---|---|
| **Primary** | Lime fill `#8ECB3C`, forest text `#173404`, radius 10, weight 600 | Genuine conversion CTAs: Find Funding, Finish & see matches, Save changes, card-level + Pipeline / + Save | `.btn-primary` |
| **Secondary** | White bg, charcoal text, `0.5px` border, hover fills page-bg | Page-level add actions: "+ Add Opportunity", "+ Add deadline" | `.btn-secondary` / `.btn-outline` |
| **Utility / nav** | Deep-forest fill `#173404`, pale-green text | Navigation/utility: Search, Continue, Done (applied inline) | *(inline styles — `.btn-utility` class is deprecated, now remaps to lime)* |
| **Tertiary** | Faint outline or green text link `#639922`, underlined | Lowest-emphasis supporting actions | `.btn-tertiary`, `.btn-link` |
| **Danger** | Transparent, coral text `#993C1D` | Danger-zone destructive actions only | `.btn-danger` |

Standard button padding `11px 22px`; small variant `7px 14px`. Icons inside buttons are `14px` (`12px` for small).

---

## 5. Funding-type colour coding

Each funding type owns one accent family. Used on type chips (dot + pill) across cards.

| Type | Dot | Pill bg | Pill text |
|---|---|---|---|
| Grant | `#97C459` | `#F1F7E4` | `#3B6D11` |
| Programme | `#F0997B` | `#FAECE7` | `#993C1D` |
| Investment | `#85B7EB` | `#E6F1FB` | `#0C447C` |
| In-Kind | `#EF9F27` | `#FAEEDA` | `#854F0B` |

## 6. Pipeline stage ladder

Five stages, a tonal green ladder that darkens toward "Won", with coral for "Declined".

| Stage | Column bg | Text |
|---|---|---|
| Identified | `#F5F1E8` (cream) | `#5F5E5A` |
| Applying | `#EAF3DE` | `#3B6D11` |
| Submitted | `#C0DD97` | `#173404` |
| Won | `#639922` | `#fff` |
| Declined | `#FAECE7` | `#993C1D` |

---

## 7. Voice & copy

- **Plain, direct, British.** Short sentences. Say "find funding", not "unlock funding solutions". No exclamation-mark hype.
- **Audience phrasing — canonical for directory/marketing copy:** "UK charities, CICs, and social enterprises" (three terms). Note: legal copy, the /apply page, and the homepage deliberately use different phrasings — **do not standardise them to match.**
- We cover four funding types, not just grants: grants, programmes/accelerators, social investment, and in-kind support. Lean into the breadth — it's the differentiator vs grants-only tools.
- Numbers and metadata are set in Space Grotesk for a confident, tabular feel.
- Match scores are framed positively but honestly; we never fake a high score.

---

## 8. Quick do / don't

**Do:** warm cream backgrounds; faint `0.5px` borders; rounded everything; Space Grotesk for anything that isn't a paragraph; lime only for true primary actions; forest-green (never black) modal backdrops.

**Don't:** pure-black text or backgrounds; cold grey neutrals; square corners; DM Serif outside its two reserved spots; lime on secondary/utility buttons; green-accented headings on app utility pages.
