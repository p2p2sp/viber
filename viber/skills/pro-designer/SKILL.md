---
name: pro-designer
description: Professional UI/UX design standards to avoid AI slop. Use when the look of an interface is the goal - a new screen or page, a redesign, a UI review or critique, choosing colors, type, spacing, layout or motion, or a UI that looks generic or AI-generated. Not for a small functional change.
allowed-tools: Read, Grep, Glob, Bash(sh:*), Bash(node:*)
---

# Professional UI Design

## Load the AI Slop filter before reasoning about anything

FIRST ACTION of every invocation, no exceptions: read `${CLAUDE_SKILL_DIR}/references/anti-slop.md` in full. Nothing else in this skill starts until it is in context.

- Applies to every job size - a whole page, one component, a color question, a code review, a one-line fix - and applies even when a design system, brief, or token set already exists.
- Load it before proposing anything. The tells it names are your own statistical defaults; they have to leave the candidate set before the first decision, not get scrubbed out of a finished draft.
- Keep it active for the rest of the run: every palette, layout family, section sequence, icon, headline and demo value is checked against it at the moment it is chosen, not at the end.

## The bar

- Give every color, size and space one deliberate signal, so the user never guesses where to look or what to do next.
- Remove until only the signal remains: UI is attention management, not decoration, and shouting everywhere at once is the amateur failure.

## Surface mode - name the visitor's success first

Before any design decision, name what the visitor's success looks like on this surface. Choose from the requested surface, not the product: a tool's landing page is still Persuade; a fashion brand's docs are still Read.

- **Persuade** - the visitor decides and acts: landing pages, marketing, pricing. Design earns attention and action.
- **Operate** - the visitor completes a task: app UI, dashboards, forms, settings, admin. Scanability, consistency and platform expectations outrank expression; brand lives in precise details.
- **Read** - the visitor understands something: docs, articles, help, changelogs. Structure for comprehension first, then make staying worth it.
- **Experience** - the visitor is inside the work itself: portfolios, galleries, showcases. The artifact leads from the first viewport; the interface recedes.

## Design pass - apply in this order

1. **Aesthetic direction** - for a new Persuade/Experience surface, first write the mandatory concept brief and show it to the user -> `${CLAUDE_SKILL_DIR}/references/concepting.md`; then ground the direction in the subject, refuse every AI-default look `anti-slop.md` catalogs, and pick one signature element -> `${CLAUDE_SKILL_DIR}/references/distinctiveness.md`
2. **Layout skeleton** - spacing scale, grouping, grid, max-width -> `${CLAUDE_SKILL_DIR}/references/layout-spacing.md`
3. **Hierarchy & type** - one focal point per screen, fixed type ramp, mute labels / amplify values, on Persuade surfaces section headings from the display scale -> `${CLAUDE_SKILL_DIR}/references/typography.md`
4. **Color** - neutral foundation + elevation, a scarce 100-900 accent scale, dark mode by physiology, OKLCH theming -> `${CLAUDE_SKILL_DIR}/references/color.md`
5. **Components & states** - loading/empty/error designed, soft elevation, card anatomy -> `${CLAUDE_SKILL_DIR}/references/components-states.md`
6. **Motion** - only where the frequency gate allows it: purposeful enter/exit, press feedback, one orchestrated moment - never motion everywhere -> `${CLAUDE_SKILL_DIR}/references/motion.md`
7. **Flow psychology** - only on conversion surfaces (onboarding, signup, upgrade, pricing) -> `${CLAUDE_SKILL_DIR}/references/ux-psychology.md`
8. **QA** - Final QA below, contrast script included; never ship on "looks fine".

## Non-negotiables - every screen

- One primary CTA per screen; the accent color appears **only** where interaction is required - a scarce functional signal, not a surface fill.
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI components), verified in **every theme the surface ships** - dark mode is a second set of pairs to check, never an inversion that inherits the light-mode result. Verify with the contrast script (Final QA), never by eye.
- Every spacing and component size sits on the 4/8px scale. Space between groups > space within groups; padding ≤ surrounding margin.
- Font sizes only from the type ramp. Body 16px / line-height 1.5, line length ≤ 75ch. Hierarchy via size + weight + color - never by adding typefaces.
- Red and green are reserved for system error/success states. Never decorative, never red logout.
- Every interactive element has visible hover, `:focus-visible`, and disabled states. A hover that only lowers opacity is not a state - change background, border, or elevation, and keep text contrast at full strength. No `outline: none` without an equal replacement.
- Every async view exists in at least 3 designed states: loading, empty, error.
- Color is never the only signal - pair it with icon, text, or underline.
- Touch targets: web ≥ 24×24 CSS px (WCAG AA legal floor), iOS ≥ 44×44 pt, Android ≥ 48×48 dp. Design anything a finger touches to 44-48px, not the web floor.
- In data display the value dominates, the label is muted - never equal weight.
- Motion: animate only `transform`/`opacity`, UI durations under 300ms (modals and drawers up to 500ms), `ease-out` for enter/exit (never `ease-in`), never from `scale(0)`, no animation on keyboard-initiated or 100+/day actions, and `prefers-reduced-motion` handled (gentler, not zero). Never `transition: all`; never a cursor-tracking beam, spotlight, or tilt.
- Demo content is real content: no Acme/John Doe/Lorem Ipsum, no fake round numbers (47.2%, not 50%), no cliche marketing verbs (Elevate, Seamless, Unleash). Full catalog: the `anti-slop.md` file.
- No dark patterns: no fake urgency, scarcity, progress, or anchors; defaults never work against the user. Full rules in `${CLAUDE_SKILL_DIR}/references/ux-psychology.md`.
- Never output an em dash (U+2014) or an en dash (U+2013) anywhere - not in UI copy, microcopy, code, comments, or reports. Always use a plain hyphen (-).

## Design-system precedence

When the project already defines its own design system - a token set, a design spec, or documented brand/UI guidelines - those authoritative values override this skill's generic absolutes: apply the project's own type ramp, spacing scale, and color system, never a second one alongside them. This skill stays advisory: it reasons about the project's system, never overwrites it.

A token set binds palette, typography, radii and spacing - it is not a composition concept or art direction. A new Persuade/Experience surface still requires the full concept brief (`${CLAUDE_SKILL_DIR}/references/concepting.md`), expressed in the project's tokens.

## Scope discipline

- **The brief wins.** Honor aesthetics, eras, fonts, and palettes the user pinned - even when they conflict with this skill's anti-generic warnings. Redirecting a clear brief toward your own taste is failure; only accessibility and anti-dark-pattern rules stay non-negotiable.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity, behavior, and copy, touching only what is in scope - ask before rewriting factual copy or adding claims. Redesign keeps product truth, content, and function, but treats the old look as evidence and anti-reference. Never split the difference into polish on a discarded look.

## Reference routing

- Aesthetic direction for a new surface, signature elements, UI copy/microcopy voice, consistency locks (radius/gray/theme/accent/register) -> `${CLAUDE_SKILL_DIR}/references/distinctiveness.md`
- Choosing/using colors, palettes, dark mode -> `${CLAUDE_SKILL_DIR}/references/color.md`
- Building or reviewing a token system - CSS variables, primitive/semantic/component layering, theming mechanism, dark-mode switching, z-index layers -> `${CLAUDE_SKILL_DIR}/references/tokens.md`
- Headings, body text, data/number display, form text conventions -> `${CLAUDE_SKILL_DIR}/references/typography.md`
- Page layout, spacing, responsive breakpoints, grids, navigation structure -> `${CLAUDE_SKILL_DIR}/references/layout-spacing.md`
- Contrast, focus states, non-color cues, target sizes -> `${CLAUDE_SKILL_DIR}/references/accessibility.md`
- Cards, badges, shadows, loading/empty/error/disabled states, optimistic UI, overlays (modal/drawer/popover) -> `${CLAUDE_SKILL_DIR}/references/components-states.md`
- Adding or reviewing animation, making a static page or component feel alive, micro-interactions, enter/exit transitions, easing/duration/springs, gestures, scroll reveals, animation performance -> `${CLAUDE_SKILL_DIR}/references/motion.md`
- Any form: fields, validation, error copy, smart defaults -> `${CLAUDE_SKILL_DIR}/references/forms.md`
- Dashboards, KPI tiles, data tables, charts, SaaS app chrome, sidebar, billing, landing pages and hero layouts -> `${CLAUDE_SKILL_DIR}/references/saas-dashboards.md`
- Mobile app UI, bottom navigation, touch ergonomics -> `${CLAUDE_SKILL_DIR}/references/mobile.md`
- Design process, wireframes, developer handoff specs -> `${CLAUDE_SKILL_DIR}/references/process.md`

## Final QA

- **Squint test**: blur your eyes - the primary CTA must be the only element that pops.
- **Contrast**: resolve the `node` command via `sh "${CLAUDE_SKILL_DIR}/scripts/check_node.sh"` first (`NODE_MISSING` -> skip with a note that Node.js >= 22.6 is required), then run `<resolved node cmd> "${CLAUDE_SKILL_DIR}/scripts/check_contrast.ts" FG BG [TYPE] [FG BG [TYPE] ...]` for every text/background and component/background pair. TYPE = `normal` (default, 4.5:1) | `large` (3:1) | `ui` (borders/icons/focus, 3:1) - exit 1 means a pair failed the AA threshold for its own type; exit 2 means bad input or usage.
- **States inventory**: hover, focus, disabled, loading, empty, error - all present?
- **Detail rule**: if a detail is too small or too faint to notice, delete it instead of keeping it faint.
- **Template test** (new surfaces only): would this exact palette + type + hero combination ship for any similar brief? If yes, it is a default, not a decision - revise the generic part (`${CLAUDE_SKILL_DIR}/references/distinctiveness.md`).
- **Bounded passes**: verify in batches, not an open loop - build fully, inspect once (desktop and mobile together), fix everything found in one batch, confirm with at most one more round, then stop polishing. Open-ended self-QA burns effort without improving the result.
- **Screenshot QA** (new Persuade/Experience surfaces only): render the built page and take full-page desktop and mobile screenshots with whatever the host project offers; no way to render -> note the gap and run the same checks on the code instead. On the image: skeleton test (would this section sequence ship for any similar product?), domain-artifact test (point at 3 places showing the product's world, not the template's), signature recurrence (3+ placements), and "would I remember this page tomorrow?". Run the squint test on the screenshot itself, not rhetorically - a full-page screenshot also exposes content hidden by initial `opacity: 0` (-> `${CLAUDE_SKILL_DIR}/references/motion.md`). Stays inside the bounded-passes discipline above.
