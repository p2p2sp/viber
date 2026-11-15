# Color: Programmatic Four-Layer Architecture

Read when choosing a palette, assigning colors to surfaces, building dark mode, theming/white-labeling, coloring data viz, or auditing a screen that feels "loud", flat, or muddy in the dark.

## Start here

- Do not default to a 60-30-10 split for product UI; it gives no rules for elevation, dark mode, or state steps. Apply the four layers below instead.
- Aim the distribution semantic, not balanced: neutral dominates, accent stays scarce - closer to ~90% neutral / 8% structure / 2% accent (Vercel) than to 60/30/10.
- Apply in order: (1) neutral foundation + elevation, (2) accent scale + states, (3) semantic colors, (4) OKLCH math theming.
- The accent is a scarce functional signal, never a surface fill - it must be the single element that pops on a squint test.

## Layer 1 - Neutral foundation and spatial architecture

The neutral palette is infrastructure, not background: it defines spatial division and reading hierarchy. Budget at least four background layers, two stroke types (soft light-mode border, brighter dark-mode edge), and three text-contrast levels. One gray family per project: never mix warm and cool grays - tint every neutral with the same hue, or the surface reads assembled from two different products.

Canvas and elevation (light mode):
- Pure white (100%) is the scarcest resource - reserve it for lifted surfaces (cards, popovers) so they detach from the canvas. Give the base canvas a subtle gray/color tint instead of pure white.
- Reference canvases: Notion ~100% white (paper approach, darker cards divide nested content); Linear ~99% white; Vercel ~98% white (absolutely white cards build depth against a low-luminance canvas).
- Anchor large chrome (sidebars, frames) with a faint structural tint, not high contrast - e.g. Mercury's ~2% blue sidebar. It marks the region without pulling attention.
- Card borders: soft stroke (~85% white) - no hard dark outlines.

Text hierarchy (light mode), as offset from pure black:
- Headings: ~11% white offset (near-black) - top scan priority.
- Body: 15-20% white - optimal for long reading.
- Metadata / labels: 30-40% white - low visual weight.

Button surface hierarchy:
- Primary: solid black (or brand) - max visual weight, conversion action.
- Secondary: 90-95% white - helper actions, low weight, clean.
- Ghost / tertiary: transparent / borderless - contextual actions, minimal footprint.

Dark mode - physiology, not inversion:
- Never a pure #000000 canvas or pure #FFFFFF text - off-black surfaces (a zinc/charcoal register) and dimmed off-white text; pure values kill depth and glare-fatigue readers.
- "Double the distance": the eye resolves dark luminance poorly, so a 2% step that reads in light mode vanishes in the dark. Widen luminance steps between background layers to 4-6%.
- "Lighter-as-it-rises": obey a physical light model - higher elevation = lighter surface. Level 0 background = lowest luminance; Level 1 card/surface = 4-6% lighter; Level 2 popover/modal = highest.
- Shadows stop reading as depth in the dark; replace them with active borders - brighten the stroke relative to the card so the edge, not a shadow, defines the component.
- Dim text off pure white (light grays) to kill glare; brighten borders above the surface - the inverse of light mode's darker-than-background borders.
- Dimming has a floor. Body text still clears 4.5:1 against its own dark surface, and structural strokes stay visible on a mid-brightness laptop screen, not only on an OLED at night. Near-black canvas + mid-gray text + 5%-white borders is the generated dark mode (-> anti-slop.md): one narrow luminance band, no edges, nothing passing AA. Run the contrast check as a separate pass on the dark tokens - light-mode results never carry over.

## Layer 2 - Accent scale and interactive states

Brand color is a continuous scale (100-900), not one hex. Each step maps to an operational state, which is what lets states be automated.

- One accent per surface, saturation below ~80% by default: a fully saturated accent fights the neutrals instead of sitting with them. Desaturate until it reads as part of the system.
- The accent is locked page-wide once chosen: the accent of section 1 is the accent of section 7 - a warm-gray page never suddenly gets a blue CTA.

- Baseline (default action / brand): 500 or 600 in light; 300 or 400 in dark.
- Hover: 700 (darker) in light; 400 or 500 (brighter / more saturated) in dark.
- Inline links: 400 or 500 in light; 300 or 400 in dark.
- Dark-mode rule: never carry the light-mode 500 weights straight over - mid weights read muddy and dim and break WCAG on dark surfaces. Use vibrant 300-400 so accents stay luminous and pass contrast.

## Layer 3 - Semantic colors and perceptual uniformity (OKLCH)

Semantic colors (error / warning / success) outrank brand absolutely: the system must signal an error regardless of brand aesthetics. Even a monochrome system (e.g. Vercel) overrides itself with a hard red for a failed state.

Data visualization - use OKLCH, not RGB/HSL:
- RGB/HSL carry a perceptual bias: at identical L, a green reads brighter than a blue, so a chart's categories get unequal visual weight.
- OKLCH (Lightness, Chroma, Hue) is perceptually uniform - equal L reads as equal brightness.
- Build a categorical palette by holding L and C constant and stepping Hue by a fixed 25-30 degrees. Every series then carries identical visual weight; no category falsely dominates.
- Keep saturated color in the data, not the chrome: mute app chrome (desaturated navies/greens) so anomalies and trends pop and long sessions fatigue less. Reject "pretty" palettes that trade data readability for looks.

## Layer 4 - OKLCH mathematical theming

Programmatic theming / white-labeling is coordinate math in OKLCH, not hand-picked hexes and per-brand contrast audits.

- Turn a neutral surface into a colored one with a fixed transform, then vary only Hue per brand:
  - Lightness_new = Lightness_original - 0.03
  - Chroma_new = Chroma_original + 0.02
- Because the base's lightness relationships are preserved, the WCAG contrast ratios established on the neutral base carry over automatically - hierarchy holds whether the theme is blue, green, or violet.

## Color restraint - the "everything on fire" anti-pattern

- Amateur tell: one intense brand color on icons, headings, input borders AND buttons at once - everything screams, nothing signals. Put out the fire so one element shines.
- Junior: brand color everywhere. Senior: brand reserved for the primary action; black/white/gray is the text default (black text on light background for max contrast).
- Color supports function; it never leads it. Color in text only for links and semantic states.

## QA checklist (per screen)

- [ ] Neutral layers: at least four background steps, cards lifted off a tinted (not pure-white) canvas?
- [ ] Accent scarcity: does the accent appear ONLY where interaction is required - the single thing that pops on a squint test?
- [ ] State scale: do hover / active / disabled each pull a distinct step of the 100-900 scale, not one flat hex?
- [ ] Dark mode: 4-6% luminance steps between layers, elevated surfaces lighter, borders brighter than the surface (shadows not relied on)?
- [ ] Dark-mode contrast: does body text clear 4.5:1 against its own dark surface, measured on the dark tokens rather than inherited from the light-mode pass?
- [ ] Dark accents: do main actions use 300-400 weights, not a carried-over 500 (no muddy/dim CTA)?
- [ ] Semantic priority: do red/green appear only for error/success/destructive - never decorative, never a routine action?
- [ ] Data viz: are categorical colors stepped in OKLCH (constant L/C, Hue +25-30 degrees), with saturated color confined to data, not chrome?
- [ ] Theming: are brand variants derived by OKLCH shift (L -0.03, C +0.02, vary H) so contrast holds across themes?

## Key terms

- OKLCH (Lightness, Chroma, Hue): color model built on perception, not screen math.
- Perceptual uniformity: equal lightness reads as equal brightness across hues.
- Double the distance: widen dark-mode luminance steps to 4-6% to keep layers separable.
- Lighter-as-it-rises: higher-elevation surfaces are lighter in dark mode (physical light model).
- Semantic overriding: functional colors (error/success) outrank brand aesthetics.
