# Typography

Read when choosing font sizes, line-heights, weights, letter-spacing, or font families, or when styling text-heavy UI: headings, paragraphs, forms, cards, KPI/stat displays.

## Type ramp - fixed roles, never invented sizes

- Pick every font-size from a fixed ramp with named roles. Never emit one-off sizes (13px, 15px, 17px, 19px) - snap to the nearest ramp step. Arbitrary px values are the most common tell of a generated UI.
- Default ramp = Material Design 3: 15 tokens, 5 roles x 3 sizes. Values below are px font-size/line-height (large, medium, small):
  - Display: 57/64, 45/52, 36/44 - weight 400
  - Headline: 32/40, 28/36, 24/32 - weight 400
  - Title: 22/28 (weight 400), 16/24 (500), 14/20 (500)
  - Body: 16/24, 14/20, 12/16 - weight 400
  - Label: 14/20, 12/16, 11/16 - weight 500

- Role mapping: display = short hero text/numerals; headline = page-level headings; title = card headers, dialog titles; body = paragraphs; label = buttons, captions, inputs. Ramp membership is binding, role mapping is the default guide - e.g. a full-width 48px CTA may step up from label-large to 16px/600.
- Operate/Read surfaces (product UI): avoid oversized text - huge fonts make the UI look bloated and unfinished, not premium. Persuade/Experience surfaces follow the display ramp below instead - oversized type there is a deliberate tool, not a mistake.

## Persuade surfaces - the display ramp

- Marketing section headings come from the display scale, not the document scale. A headline-to-body gap of roughly 2x the document ramp's is the target - an h1 at display size followed by 24px h2s reads as documentation, not marketing.
- Extreme weight contrast is a legitimate tool on Persuade surfaces: pair 100 and 900, not 400 and 700. The gap itself carries the intent.
- When the page has no imagery budget, typography IS the imagery - oversized type serves as texture and composition, not just a label for content below it.
- Ramp membership stays binding even at display sizes - the display tokens are part of the ramp, not a one-off escape from it.

## Body text

- Default body: 16px / line-height 1.5 (16/24). Dense secondary text only: 14px / ~1.43 (14/20).
- Never set running text below 12px; never render any text below 11px (Apple's floor is 11pt).
- Paragraph spacing at least 1.5x the line spacing (body 16/1.5 -> `margin-bottom: ~1em-1.5em`, never 0).
- Left-align; `text-align: justify` is banned for UI copy - creates rivers of space (WCAG 1.4.8).
- Zoom and user-spacing resilience (200% zoom, no fixed-height text containers, rem units) -> accessibility.md "Resize and spacing resilience".
- Kill orphaned last words: `text-wrap: balance` on headings, `text-wrap: pretty` on body paragraphs - a single word on the last line of a heading reads as a layout bug.

## Line-height - inverse to font size, never one global value

- Body 12-16px: 1.4-1.6. Sub-headings 20-24px: ~1.3. Large headings 28-36px: 1.15-1.25. Display 45px+: 1.0-1.12.
- Use unitless values per role: `h1 { font-size: 3rem; line-height: 1.1 }` `p { line-height: 1.5 }`.
- Copying body line-height onto headings makes multi-line headings fall apart; large headline text at line-height 1 is fine.
- Also scale with measure: narrow columns (<50ch) ~1.5; wide text blocks up to 2.0 - raise leading rather than keep 1.5 on a wide paragraph.

## Measure (line length)

- Put `max-width: 65ch` (or ~34em) on every paragraph container; optimal is 50-75 characters per line.
- Never let running text span the full width of a desktop layout; 100+ character lines fatigue readers.
- Hard accessibility ceiling: 80 characters, 40 for CJK (WCAG 1.4.8, AAA).

## Letter-spacing - varies by size, never one global value

- Display 36px+: slightly negative (M3 display-large: -0.25px; up to -0.02em safe).
- Headlines 24-32px: 0. Body: 0 to +0.5px (M3: body-large +0.5px, body-medium +0.25px).
- Small labels/captions 11-14px: positive, +0.1px to +0.5px.
- ALL-CAPS text always gets extra tracking: +0.05em to +0.1em.
- Apple nuance: SF system fonts are variable fonts with continuous optical sizing and per-size tracking applied by the OS - the old "SF Text below 20pt / SF Display at 20pt+" hard switch applies only to the legacy static fonts.

## Hierarchy - size + weight + color, never more typefaces

- Build hierarchy with size, weight, and color together. To emphasize at the same size, step weight up (Apple: Body = 17pt Regular, Headline = 17pt Semibold) - never add a font.
- Weights on Operate/Read surfaces: 400 for display/headline/body; 500-600 for titles, labels, buttons. Don't bold everything; no heavy weights at display sizes. Persuade surfaces follow "Persuade surfaces - the display ramp" above.
- One typeface family per UI by default; hard max 2. If pairing: contrast classification (serif headings + sans body), match x-heights; prefer a superfamily (Roboto + Roboto Serif + Roboto Mono, IBM Plex) or one variable family.
- Align a leading icon to the adjacent text's cap-height and size it near that cap- or x-height, so icon and label share one optical line instead of sitting off-center (icon sizes on the grid -> layout-spacing.md).
- Cards need 3-4 explicit hierarchy tiers - full card anatomy in components-states.md.

## Data display

- Mute the label, amplify the value: label small (12-14px, label tokens), regular weight, muted gray; value ~2x label size, bold, maximum contrast. Never invert (big bold "Earnings" over a tiny "$4,981.00" is the classic mistake).
  - Bad: `Earnings` 24px bold, `$4,981.00` 13px. Good: `Earnings` 12px gray, `$4,981.00` 28px bold.
- Bold the number, mute the unit: `1634` bold dark + `sqft` regular gray; `5` bold + `bed.` muted - users compare numbers, units are context.
- Trend deltas stay small (~12px, label-size), semantically colored, immediately beside the value - never competing with it.
- Format numbers: thousands separators, currency, one-decimal percentages, abbreviations where space is tight (`$4,981.00`, `2,121`, `3.2%`, `12.4k`).
- Columns and stacks of numbers get `font-variant-numeric: tabular-nums` (or a mono face) so digits align for down-column comparison; proportional figures make identical values look different lengths.

## Forms and links

- Reading order top to bottom: 1) goal (heading, e.g. "Sign in") -> 2) inputs -> 3) primary CTA -> 4) alternatives. Secondary actions ("Sign up") become text links, never equal-weight buttons next to the CTA.
- Labels: ALL-CAPS or bold to distinguish from content (caps labels get +0.05-0.1em tracking).
- Placeholders: visibly lighter than input text yet still >= 4.5:1 (accessibility.md), and never used as the label - a full-opacity placeholder reads as a filled field.
- Links: underline or a clearly distinct color vs static text - users must not guess what is clickable.
