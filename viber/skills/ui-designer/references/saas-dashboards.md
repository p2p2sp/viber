# SaaS Dashboards

Read when designing SaaS dashboards, KPI tiles, app navigation/sidebars, billing/pricing pages, or SaaS landing pages.

## Philosophy: Design the Hammer, Not the Poster
- A dashboard is a work tool: users come to read data, not admire branding. Every pixel of chrome competes with data.
- No oversized top bars with logo + greeting ("Welcome back, Anna!") added to "balance" the layout - they detach functionality and shrink the workspace that IS the product.
- Branding yields to data readability: charts need not use brand colors if that hurts interpretation.
- Navigation placement (global vs local, dropping it on full-workspace views) -> layout-spacing.md "Navigation structure".

## Containers and Layout
- Do not widgetize everything: never wrap each chart/section in its own frame. Separate with section-header typography and white space instead.
- When cards are needed, go borderless: white card on very light gray page + near-invisible shadow. No heavy borders, no dark shadows.
- Reuse ONE pattern for all section headers and ONE for all chart legends - repeated anatomy makes the interface learnable.
- Keep search and key functions in predictable global positions (top/center), fixed across screens.
- Object/list cards: key metric right-aligned, date centered, actions in the trailing overflow menu (Tables and lists).

## Tables and lists
- Tables are the primary work surface of most dashboards - invest here before any chrome. Users come to scan, sort, and act on rows, not to admire the frame.
- Every data table needs column sorting and filtering; add a search box once the list outgrows one screen. Keep the active filter/sort visible so users know why rows are missing.
- Right-align numeric columns on tabular figures so digits line up for down-column comparison (label/value treatment -> typography.md "Data display").
- Bulk actions are contextual: a leading checkbox column, and a bulk-action bar (delete, export, move, assign) that appears ONLY after at least one row is selected - never a standing button per row. Show the selected-count and a clear-selection control in that bar.
- Collapse per-row and per-card actions into a trailing overflow (triple-dot) menu, never a row of visible buttons.
- Long tables: sticky header row plus pagination or virtualized scroll - never render thousands of DOM rows at once.

## KPI Stat Tiles
- Never show the same metric in two places on one dashboard. One number, one home.
- Use a compact card grid (e.g. two-column KPI layout) so top values compare at a glance.
- Label/value sizing and number formatting -> typography.md "Data display" (label small and muted, value ~2x and bold; never the inverse).
- Trend delta: label-sized, immediately right of the value, semantic color (green + up-arrow when good, red/pink when bad). It must never compete in size with the value.
- Identical anatomy across a tile row: the same element set in the same positions on every tile (e.g. label top-left, icon chip top-right, big value below, sparkline at the bottom). Icon chips and sparklines are optional; cross-tile consistency is not.
- Sparkline color encodes trend semantics: green fill = rising/good, red-pink fill = declining/bad. The chart reads as a health signal before the number is read.
- Offer a toggle-to-split control that breaks aggregate charts into per-object series (per link, per campaign) for direct comparison.
- Add contextual density only where it aids reading: shaded regions on maps, doughnut breakdowns - richness signals a premium tool, on top of neutral chrome, never instead of it.

## Color Through Data
- Chrome stays neutral: black/white/gray, or deep muted greens/navies for dark analytics themes that reduce eye fatigue in long sessions.
- Charts and micro-charts are the ONLY carriers of saturated color. Strip bright accents from buttons and icons - a limited palette lets users ignore chrome and lock onto the anomaly or trend.
- Red/green strictly reserved for system states (error/success) and trend semantics - never decorative.

## Chart construction
- Never round bar/column tops - rounded caps detach the fill from its value and make the height hard to read against the Y axis. Flat tops meet the gridline exactly.
- Start a bar/column value axis at zero; a truncated axis exaggerates differences and misreads magnitude.
- Ship the reading furniture: visible axes, subtle gridlines, a legend, numeric value labels (or an accessible on-hover tooltip), and a date-range selector for any time series.
- Never encode a series by color alone - add direct labels, patterns, or shapes so colorblind users can still separate series (-> accessibility.md "Never color alone").
- Pie/donut charts cap at 5 categories - beyond that, slices become visually indistinguishable; switch to a horizontal bar chart instead. Sort bar/column charts descending by value unless the axis is inherently ordinal or time-based.
- Ship a non-visual alternative alongside every chart: a data-table view of the underlying values, or a one-sentence text summary of the key insight, so screen reader users get the finding without parsing the visual.

## Sidebar and Navigation
- Sidebar: left-aligned labels, dense professional spacing, navigation only (e.g. Dashboard, Analytics).
- Low-frequency items - Settings, Billing, Teams, Custom Domains, Logout - never in main nav; consolidate them into the account-card popover or a settings screen.

## Account and Identity
- Replace gradient initial-circles (default AI-generator output) with account cards: avatar + name + secondary line.
- Clicking the account card opens a popover holding settings, billing, and logout.

## Icons
- Use one system icon library (Lucide, Phosphor or a peer) for consistent stroke width and legibility across scales, retuned to the surface - the stock set as scaffolded is itself a tell (anti-slop.md).
- No emoji as UI icons. Notion's emoji use is a brand-specific exception, not a SaaS standard.
- No icon library available (single-file deliverable, no dependencies)? Inline the SVG paths - never fall back to emoji or unicode glyphs.
- Inline SVG craft: set `fill`/`stroke` to `currentColor` so the icon inherits the surrounding text color, use `viewBox="0 0 24 24"`, and include a `<title>` element naming what the icon means. For outlined styles, use round line caps and joins.
- Design icons at 24px, then verify legibility at both 16px and 48px - detail that vanishes at 16px does not belong in the icon.
- Match icon style to context: outlined with a ~2px stroke for dense app UI, filled for mobile nav bars and toolbars, duotone for marketing surfaces. Hold one style per product (-> distinctiveness.md consistency lock) unless an existing product icon set already dictates otherwise.

## Modals and Forms
- Prefer compact modals over flyouts and loose inline forms.
- Hide advanced options by default behind a collapsed "Advanced" section - clean surface, full configurability retained.

## Billing and Pricing
- Max 3-4 plans; cut low-margin "Hobby" tiers. Name the top tier "Enterprise", not "Business" - high-volume needs signal a large organization wanting corporate features.
- Price is the largest visual element in a plan card; the plan name is secondary.
- Expose the annual discount explicitly.
- Upsell via "What's next": on the current-plan view, list the features unlocked by the next tier.
- Show trust elements: a visible contact email and the saved payment method - removes friction at the decision point.

## Landing Page
- Hero composition limits, decoration tells, and demo-content realism -> anti-slop.md, already loaded before any layout work here.
- Show the real product: lightly skewed, in-perspective screenshots of actual modules ("skewed graphics") instead of generic flat icons - a polished real interface builds trust no stock icon can. Never fake a product screenshot with styled divs.
- This principle is backed by CRO case studies (e.g. StatusCake's landing test replacing an abstract hero with real UI screenshots), but no verified universal uplift numbers exist - never quote specific conversion percentages as fact.
- Communicate benefits, not technical internals: presentation over complexity; perceived visual quality drives perceived product value.
- Hero archetype by message: text-left / visual-right is the default trust-builder; center-aligned suits one short, strong statement; a bento grid organizes many features into one scannable block. Pick by content, not taste.
- Hero internal spacing: ~12px below the eyebrow line, ~8px heading-to-subtext, ~32px before the CTA - tight proximity binds the lockup, the larger gap sets the CTA apart (scale -> layout-spacing.md).
- Progressive disclosure over infinite scroll: prefer a "Load more" button to auto-infinite-scroll on browse/marketing pages - it hands the user control and keeps the footer reachable, which infinite scroll pushes permanently out of reach.
- Flavor is the deliberate style layer (corner radius, grain/texture, color temperature) tuned to brand personality: a friendly brand takes larger radii and warmer hues; a professional/enterprise one takes sharp edges, restraint, and a neutral palette. Choose one flavor and hold it system-wide; radii still snap to the spacing scale (-> layout-spacing.md).
