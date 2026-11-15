# AI-slop tells - recognize and remove

These are the statistical defaults of generated UI - the patterns a model reaches for when no one decides otherwise. Each is legitimate when the brief explicitly asks for it; as an unexamined default it fingerprints the design as generated. The brief always wins (SKILL.md "Scope discipline"). Anti-patterns matter as much as rules: they are the model's own failure modes, so they never surface without being named.

Entropy meta-rule: any concrete recommendation repeated at scale becomes the next default. This file forces a subject-justified decision, never a swap of one ready-made look for another. Treat "safe escape" looks as second-generation tells, not as safety - emerald instead of purple, navy plus glow instead of a mesh gradient, cream plus serif plus terracotta instead of Inter-and-gradient, Space Grotesk plus Instrument Serif instead of Inter. Cloning one recognizable product wholesale is the same move with a better reference, and the six current clone looks read as generated the moment they arrive unbriefed: near-black plus subtle grain plus 1px low-contrast borders plus gray body text plus small radius; near-black with one bright acid-green or vermilion accent; pure black-and-white with monospace micro-labels and hairline grid lines; the broadsheet (hairline rules, zero radius, dense newspaper-style columns); brutalist-lite (thick black borders, hard offset shadows, one acid yellow); glassy bento tiles on dark. Picking the alternative everyone else now also picks is the same failure one layer down.

## Layout tells

- The canonical section SEQUENCE is a tell in itself, even when every individual section passes every ban below: centered hero -> cards -> numbered steps -> feature grid -> centered CTA. A page that runs this order end to end reproduces the generic skeleton no matter how the sections are dressed. Minimums: at least one fully asymmetric or full-bleed section; at least one section of visibly different density or temperature than its neighbors; never two adjacent sections in the same card-on-slab language.
- Centered hero + two CTAs over a dark mesh gradient - the single most common generated opening.
- Three equal cards in a row as the feature section. Use a 2-column zig-zag, an asymmetric grid (e.g. 2fr 1fr 1fr), or a horizontal scroll instead.
- The count reflex: 3 features, 3 steps, 3 tiers, 3 testimonials, 4 KPI tiles, all on one page. Item counts come from the content - when every section lands on the same number, nobody chose it. Break at least one group off the house count (2, 5, 7 items), or merge and cut until the count is the true one.
- The centered section header stacked above every section: eyebrow, centered H2, centered 1-2 line subtitle. At most 2 centered section headers per page - elsewhere set the heading left, or fold it into the content instead of announcing the section.
- The same left-text / right-image split repeated down the page. Never twice in a row; cap alternating zig-zag runs at 2; a layout family (3-col cards, full-width quote, split text+image) appears at most once per page, and an 8-section page needs at least 4 different families.
- Uniform section rhythm: every section the same density, alignment, and scale. Vary density, image-to-text ratio, alignment, and tempo deliberately - calmer sections between denser ones, so the page reads as paced, not as repeated slabs. Constant section padding is its own tell: vertical rhythm changes deliberately too - a tight section right after a spacious one reads as paced, uniform padding down the whole page reads as templated.
- Cardocalypse: at most ~50% of page content lives inside cards. The single most important feature gets a unique, non-card treatment - not the same rounded-rect-with-shadow as everything else. The rest can be a plain list or an editorial layout instead of another card grid. Icon-in-a-rounded-square sitting above a title is itself a named tell, independent of the card question.
- Box-in-box-in-box: cards inside cards inside a giant rounded section container. One primary framing move per section (containment rules -> layout-spacing.md).
- Bento grids with dead cells: N items = N cells, spans interlock, no blank filler tile and no empty corner. 3-5 intentional cells beat 8 messy ones.

## Visual tells

- The purple-blue "AI gradient" (violet-to-indigo, indigo-to-cyan, and every neighbor of that arc), neon glows and glowing edges, floating blobs, mesh-blob backgrounds. It is the single most recognizable generated-UI signature: a gradient earns its place only when the brief or the subject asks for one, and then it is not that arc.
- Grain or noise dropped over a gradient to make a flat background look crafted. Gradient plus grain is one reflex, not two decisions, and it is the most-copied texture in generated UI. Texture ships when it comes from the subject (paper, print, film, fabric, sensor noise) at one deliberate strength, never as a default overlay on a hero.
- Glassmorphism stacked on everything: blurred translucent cards over a gradient, `backdrop-filter` on nav, modals, cards and badges alike. Translucency is a depth device for ONE floating layer over content that must stay visible behind it - as a card skin it destroys text contrast and makes every surface the same material.
- Gradient text on large headings as a shortcut for "premium" - usually the same purple-blue arc, usually clipping descenders, and always signalling that the headline had nothing to say on its own. Emphasis comes from size, weight, and the accent used as one flat color.
- Inter + near-black + one bright accent as the automatic everything-look. Inter is fine for neutral product UI; it fails only as the unexamined answer to every brief (typeface voice -> distinctiveness.md).
- The escape pairing is the same reflex one layer down: Space Grotesk (or Clash Display, Bricolage Grotesque) for headings plus Instrument Serif italic for accents, on every brief that wants to look "designed". A face picked because it is the current alternative to Inter was not picked for the subject. Justify the pairing from the subject's world, or ship one well-tuned family (-> distinctiveness.md).
- Untouched framework defaults: stock Tailwind slate/zinc neutrals with indigo-600 or violet-600 as the accent, or shadcn/ui components exactly as scaffolded (default card header stack, default button variants, stock Lucide set, default radius). The tell is not the library, it is that nothing was chosen - retune neutrals, accent, radius and density before shipping.
- Emoji as UI icons, and emoji in headings - a rocket in the H1, a sparkle on the section title, a checkmark emoji leading every bullet, a fire in a tab label. That is chat formatting leaking into an interface: it inherits the OS emoji font, ignores the type ramp, cannot be recolored, and reads as generated at a glance. Set the icon from the one icon family, or ship the text alone.
- Mixed icon sets or mixed stroke weights - one icon family, one stroke weight, everywhere. The stock Lucide set on every project is itself a default: retune size, stroke and corner style to the surface, swap in a family that matches the type's voice, or draw the handful of icons that carry meaning.
- Icons picked by keyword match: rocket for launch, lightning for fast, shield for secure, brain or sparkles for anything AI. Sparkles in particular - as an icon, as a gradient "AI" badge, on an "Ask AI" button - is the current universal AI signifier and reads as generated on sight. Draw the icon from the product's own world, or ship the label alone.
- A colored 3-4px bar on a card edge as the default way to signal "this one matters", and its variants: an accent-tinted 1px border around every card, or a different accent hue per card in a feature row. Rank cards by content, size, or position - a row of colored borders ranks nothing and turns the accent into decoration.
- A single serif-italic word dropped inside an otherwise sans-serif H1 (and its sibling, an italic serif pull-quote in a sans page). Emphasize with weight or italic of the SAME family; a second face imported for one word is a costume, not a hierarchy.
- Permanent dark mode adopted as a reflex, with no brief reason a dark-only surface serves the product.
- The gray-on-gray dark mode: a near-black canvas, mid-gray body text, borders at 5% white, every layer inside one narrow luminance band - so nothing has an edge, elevation is invisible, and few pairs clear AA. Dark mode is built from measured luminance steps (4-6% between layers) and a real text-contrast floor, never from dimming everything until it looks moody (-> color.md).
- Emerald or green reached for as the safe escape from purple - still a reflex, just a newer one.

## Interaction and motion tells

- Fade-up-on-scroll applied to every section - a reveal budget exists for a reason (-> motion.md).
- Content invisible without JS: initial `opacity: 0` (or equivalent) on real content is a hard defect, not a motion choice - it breaks a static screenshot and a no-JS render alike (-> motion.md).
- Custom cursors, and the whole pointer-effect family: a beam or glow trailing the cursor, a spotlight tracking it across a hero, a gradient border chasing the pointer around a card, tilt-on-hover 3D cards, magnetic buttons. They run a frame budget for no information, do nothing at all on touch, and are the most recognizable "make it feel premium" move in generated UI. A pointer effect ships only when the pointer position is the content (a canvas, a map, a drawing tool).
- Micro-animations scattered on everything, and `transition: all` as the house transition - it animates properties nobody chose, layout ones included, and it is why generated UI shimmers when anything changes. Name the properties (`transform`, `opacity`, `background-color`) and the duration per component (-> motion.md).
- Buttons that only fade on hover (`hover:opacity-90`, `opacity: .8`): a translucent button is not a hovered button, it is a disabled-looking one - the label loses contrast along with the fill. Hover changes a real property: the next step on the accent scale, a background or border step, an elevation change - at full text contrast (state layers -> components-states.md).
- The uniform hover lift: every card rising `translateY(-4px)` with a bigger shadow, whether or not it is clickable. Hover feedback marks what is actionable; a whole grid lifting equally marks nothing.

## Craft tells - the execution giveaways

These survive every palette and font change, so they are what remains visible after a restyle.

- Spacing that never resolves to a scale: one-off values (`mt-[13px]`, `py-7` beside `py-8`, 18px here and 25px there), unequal gaps between visually parallel elements, 32px above one section heading and 24px above the next. Nothing else says "nobody laid this out" as reliably (-> layout-spacing.md).
- Padding that ignores its neighbors: card padding larger than the gap between cards, group spacing equal to intra-group spacing - so grouping has to be inferred from the content instead of read from the layout.
- `rounded-2xl` plus `shadow-lg` as the only depth idea, at the same strength on every surface. One radius scale and one elevation ramp are locked decisions per surface, not a per-element reflex (-> distinctiveness.md).
- Optical misalignment shipped as-is: an icon off its label's cap-height, a glyph off-center in its circle, CTAs at different heights across side-by-side cards, pricing columns whose feature lists start at different Y.
- Type sizes off the ramp (13px, 15px, 17px) mixed with ramp values in one screen - the typographic form of the same failure (-> typography.md).

## Decoration tells - banned by default

- Numbered section eyebrows ("01 / INDEX", "SECTION 02") on content that is not a sequence. Ration eyebrows to at most 1 per 3 sections - and prefer deleting them; the headline is enough.
- Version labels in a hero ("V0.6", "BETA", "EARLY ACCESS") outside a genuine launch; version footers ("v1.4.2", "Build 0048") on marketing pages.
- Decorative status dots and pulsing "live" indicators with no real state behind them - only for real semantic state, at most one per section.
- Middle-dot spam: at most one "·" per metadata line, never the default everything-separator.
- Mono-caps decoration strips ("DESIGN · BUILD · SHIP"), vertical rotated text, decorative crosshairs and hairline grids that encode nothing.
- Fake photo credits ("Field study no. 12"), weather/locale/time strips ("LIS 14:23 · 18°C"), mock-poetic section labels ("From the field", "On our desks").
- Scroll cues of any kind ("Scroll to explore", bouncing chevrons, numbered scroll markers) - the bottom of the viewport does not need a label.
- Fake div-built product screenshots (fake terminals, fake task lists, fake dashboards) - use a real screenshot, a real working mini component, or nothing.
- Logo walls built from styled text wordmarks, category labels under logos, unreadable micro-logo tickers. Real logos, sized to read, or no logo wall.

## Hero discipline

- The H1 never exceeds 2-3 lines. A 4-line hero headline is a container-width or font-size error, not a copy problem: widen the heading container and clamp() the size down until the count holds - or cut words.
- The hero stack holds at most 4 text elements: (eyebrow OR brand strip OR neither) + headline + subtext of at most ~20 words + CTAs (1 primary, at most 1 quiet secondary). If the value proposition needs more than 20 words, the proposition is unclear, not the limit too tight.
- Banned inside the hero: pill tags, fake stats (the stat hero of big number + small label + supporting stats + gradient accent included), badges, trust micro-strips, pricing teasers, feature bullets, avatar rows. All of it moves below; a logo wall goes under the hero, never in it.
- The badge above the headline is the default opener of every generated hero, in all its costumes: the eyebrow pill with a leading status dot ("dot + Now available", "dot + New"), the bordered chip announcing a release, the gradient "AI-powered" tag, the "Backed by X" strip. It is not a neutral container choice - it is the first thing that marks the page as templated. Ship it only when it carries real, current news, and then as plain text on the grid, not as a pill.
- First-viewport test on a small laptop: headline, supporting text, one visible CTA, one focal point - without exposing the whole product in one crowded view.

## App and AI-surface tells

- The canonical dashboard skeleton: icon sidebar left, top bar with search + bell + avatar, a row of 4 KPI cards with trend arrow and sparkline, then one chart, then one table. Same failure as the canonical section sequence - reproduce it and the app reads as scaffolded regardless of styling. Open with the surface's real primary job (the queue, the document, the map, the one number that decides something) and let the rest follow from it.
- Chat and AI surfaces: the centered "How can I help you today?" with four suggestion cards under it, a typewriter effect on the headline, a floating chat bubble parked bottom-right. Suggestions ship only when they come from real context or real history; a static four-card grid of invented prompts is decoration.

## Copy and demo-content tells

- Banned filler vocabulary: Elevate, Seamless, Unleash, Next-Gen, Revolutionize, Transformative, Game-changer, Delve, Empower, Supercharge, Effortless, Streamline, Cutting-edge, Robust, Leverage, Harness, "unlock your potential", "powered by AI", "in seconds", "10x", "say goodbye to". Concrete verbs; specific beats clever (voice rules -> distinctiveness.md).
- Banned cadences: the "It's not just X, it's Y" construction in any variant; adjective triads ("fast, simple, secure") as the default way to summarize a value proposition.
- Em and en dashes anywhere in visible copy - headline, subtext, caption, tooltip, empty state, error message. The dash-as-default-connector is the strongest text tell there is and it arrives bundled with every other AI cadence, so a page full of them reads as generated even when the words are right. Use a plain hyphen, a comma, a colon, or two sentences.
- Uniform sentence rhythm: every line the same medium length, every section closing on a one-line summary, bold-label bullets ("**Fast:** we do X") down a marketing page. Vary length, cut the closers, and let a fragment stand where a fragment is the point.
- Banned headline formulas: "<Verb> your <noun> with AI", "The <adjective> way to <verb>", "Everything you need to <verb>", "Meet <Product>", "The future of <noun>", "<Noun>, reimagined", "Built for the modern <noun>", and paired two-word imperatives with full stops ("Ship faster. Scale smarter."). A headline says what the product does and for whom, in the subject's own vocabulary.
- Banned fake brands and people: Acme, Nexus, Flowbit, Quantumly, NovaCore, SmartFlow; John Doe, Jane Smith. Invent contextual, realistic, locale-appropriate names; every person gets a distinct avatar, never an egg placeholder.
- Round fake numbers read as fake: 50%, 99.99%, $100.00, 1234567. Use organic data: 47.2%, $99.40, +1 (312) 847-1928, non-uniform dates. Never Lorem Ipsum - write real draft copy.
- One CTA label per intent per page: "Get in touch", "Contact us" and "Let's talk" are the same intent - pick one label and reuse it in nav, hero, and footer. CTA labels fit one line, at most ~3 words.
- The default CTA tail: "Ready to get started?" or "Start building today" as the closing-section headline, with "No credit card required" under the button. Write the closing line from the actual next step the reader takes, and keep the reassurance only when it is a true fact about the offer.
- Testimonials: at most ~3 lines of quote, attribution = name + role (+ company), never a bare name; real typographic quotes or none.
- Stat rows and charts only where the domain logically needs them - no three identical stat columns ("99% satisfaction / 10x faster / infinite scale"). Otherwise keep proof human: quotes, real-workflow screenshots, timelines.
- Before shipping, re-read every visible string: cute-but-wrong wordplay, unclear referents, and mock-poetic micro-copy are worse than boring copy.
