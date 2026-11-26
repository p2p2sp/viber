# Distinctiveness - anti-generic direction

Read when setting the aesthetic direction of a new surface (landing page, hero, marketing or brand-carrying screen), when a brief leaves look-and-feel open, or when reviewing UI that reads generic, templated, or AI-generated.

Scope: direction-setting, not a decoration license. Every choice here still obeys the skill's non-negotiables (contrast, states, spacing scale, type ramp) - the signature risk lives inside the accessibility floor. A project design system binds as SKILL.md "Design-system precedence" states. The AI-default looks to refuse are catalogued in anti-slop.md, already loaded: where the brief leaves an axis free, never spend that freedom on one of them.

## Ground the direction in the subject

- If the brief does not pin down the product or subject, pin it before designing: name one concrete subject, its audience, and the page's single job - and state the choice.
- Distinctive choices come from the subject's own world - its materials, instruments, artifacts, vernacular - never from a house style applied to every project.
- Design with the real content throughout; placeholder-content thinking produces template design.
- Verifiable rule: when the product concerns physical or visual objects, render them as designed graphic elements - their real shapes, proportions, and layouts drawn from their own world. Line icons are allowed only for genuinely abstract concepts, never as a stand-in for a real object. Test: point at 3 places on the render that show the product's own world, not the template's - if you cannot, the subject is not grounded yet.

## Direction rules

- The hero is a thesis: open with the most characteristic thing in the subject's world - a headline, an image, an animation, a live demo, an interactive moment - chosen deliberately, not defaulted (hero composition limits -> anti-slop.md).
- Typography carries the personality of the page: pair display and body faces deliberately for THIS brief, never the families reached for on every project. Reaching for the same face every time is itself a default - rotate among characterful families (Geist, Satoshi, Cabinet Grotesk, Outfit and peers for sans; a distinctive modern serif only when the brief is genuinely editorial, luxury, or heritage - "creative brief = serif" is a generated-look reflex, not a rule). Those names are a prompt to look wider, not a shortlist to reuse: the entropy rule applies to fonts first, which is why Space Grotesk + Instrument Serif now reads exactly as Inter did (-> anti-slop.md). A face is chosen when you can say what about the subject it carries. Emphasize a headline word with weight or italic of the SAME family, never by injecting a second face. Ramp and pairing mechanics stay in typography.md; this file governs the choice of voice.
- Structure is information: numbering, eyebrows, dividers, and labels must encode something true about the content (a real sequence, a real taxonomy) - never decoration.
- Motion is deliberate: one orchestrated moment (a page-load sequence, one scroll reveal) lands harder than scattered effects - and sometimes none is the right call.
- Match complexity to the vision: a maximalist direction needs elaborate execution; a minimal direction needs precision in spacing, type, and detail. Elegance is executing the chosen vision well.

## Commit and lock

A direction only reads as designed when it is held everywhere. Once chosen, lock these for the whole surface - drift is what makes a page feel assembled from parts:

- One corner-radius scale per surface: all-sharp, all-soft, or a documented mixed rule ("buttons pill, cards 16px, inputs 8px") applied without exception. Round buttons inside a square layout read broken.
- One gray family: never mix warm and cool grays; tint every neutral with the same hue.
- One theme per page: sections never invert light/dark mid-scroll. Adjacent tints of the same family are fine; a lone dark section inside a light page is a break, not a feature.
- One accent, used consistently: the accent chosen in section 1 is the accent in section 7 - no surprise second accent at the CTA.
- One copy register: technical mono, editorial prose, and marketing punch do not mix on one page.
- Across multiple screens, composition, density, and emphasis may vary; palette and accent logic, type families and scale logic, radius language, image treatment, icon style, and CTA wording never do. Anything that breaks brand recall is over-variation.

Simplicity is not the goal by itself - cleanliness is. A surface may be rich, layered, and textured if it stays readable; forced emptiness is as much a default as clutter.

## One signature element

- Spend boldness in ONE place: a single element the page is remembered by, embodying the brief. Everything around it stays quiet and disciplined.
- Cut every decoration that does not serve the brief. Before shipping, remove one accessory.
- Not taking any risk is itself a risk: a surface with no signature reads as template.
- A signature element exists only if it recurs in at least 3 points of the page, in consistent form. One hero effect followed by neutral cards is decoration, not a signature. Later returns may be quieter than the first appearance (a list marker, a chip shape, a CTA background echoing the same device) but they must be present.
- The quality floor ships silently, never announced: responsive to mobile, visible focus, reduced motion respected.

The mandatory pre-build concept brief and skeleton critique live in concepting.md - read it before setting direction on any new surface.

## Copy is design material

Templated copy makes a distinctive design read generic. Words exist to make the design easier to understand and use - bring spacing-and-color intentionality to them:

- Write from the user's side of the screen: name things by what people control and recognize ("notifications"), never by system internals ("webhook config").
- Active voice; a control says exactly what happens ("Save changes", not "Submit"); an action keeps one name through the whole flow (button "Publish" -> toast "Published").
- Errors state what went wrong and how to fix it, in the interface's voice - never vague, never apologizing. An empty screen is an invitation to act.
- Register: plain verbs, sentence case, no filler, tone matched to brand and audience. Each element does exactly one job - a label labels, an example demonstrates.
- Being specific beats being clever.
