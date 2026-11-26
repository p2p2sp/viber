# Motion - bringing a static interface to life

Read when adding animation, making a static page or component feel alive, choosing easing/duration/springs, reviewing existing motion, or hunting for animation opportunities.

Two failure modes, and the first is worse: animating something that should not animate, and animating the right thing with the wrong ingredients. Sometimes the best animation is no animation - a short list of high-conviction moments beats motion everywhere. Over-animated interfaces are themselves a generated-look tell (anti-slop.md).

## Contents

- The gate - every animation passes all four, in order
- Where a static page comes alive - the hunt list
- Scroll-reveal budget
- Easing
- Duration
- Physicality
- Springs
- Interruption, enter, exit
- Performance
- clip-path recipes
- Gestures and drag
- Stagger
- Masking imperfect crossfades
- Accessibility gates - ship with the animation, never as a follow-up
- Never ship
- Cohesion and feel-checks

## The gate - every animation passes all four, in order

1. **Frequency** - how often will a user see it?
   - 100+ times/day (keyboard shortcuts, command palette, core navigation): no animation. Ever. Keyboard-initiated actions are a disqualifier, not a judgment call - Raycast has no open/close animation, and that is correct.
   - Tens of times/day (hover states, list navigation, frequent toggles): near-imperceptible only - fast and subtle, or nothing.
   - Occasional (modals, drawers, toasts, settings): standard animation.
   - Rare / first-time (onboarding, empty states, success, celebration): the delight budget lives here - the only tier where bounce, generous stagger, or a longer beat are welcome.
2. **Purpose** - name it in one of these words: feedback (press scale, hold-to-confirm), spatial consistency (toast exits the edge it entered), state indication (morphing button, expanding accordion), preventing a jarring change (content that would otherwise teleport), explanation (marketing/onboarding demos), delight (rare tier only). "It looks cool" is not on the list - cannot name it, do not build it.
3. **Speed** - it must fit the duration budget below. A moment that only "works" as a slow, showy animation fails the gate.
4. **Function** - data the user is reading or acting on never moves for style. Decorative mouse-tracking belongs on a marketing page, not on a chart in a banking app.

## Where a static page comes alive - the hunt list

Sweep these seams; each is a known class of genuine opportunity. Gate every candidate; expect to reject most.

- Feedback gaps: pressable elements with no `:active` state -> `transform: scale(0.97)`, `transition: transform 160ms ease-out` (subtle: 0.95-0.98; applies to any pressable element). Destructive actions confirmed with a plain click -> hold-to-confirm fill (clip-path recipe below).
- Teleporting state: content that swaps, appears, or vanishes instantly (conditional renders, route content, expanding sections) -> fade/scale entrance from `scale(0.95)` + `opacity: 0`, ease-out; accordions that snap open -> height + opacity transition (the one tolerated height animation).
- Missing spatial story: panels, popovers, menus appearing with no connection to their trigger -> scale in with `transform-origin` at the trigger; dismissable surfaces exiting a different way than they entered -> symmetric paths.
- Group entrances: a grid or list popping in all at once on an occasionally-seen page -> stagger (below).
- Gesture seams: draggable/swipeable elements that snap with no physics -> springs, velocity dismissal, rubber-banding (below).
- Delight budget: rare, high-emotion moments rendered flat - first-run, empty states, success, celebration.

Useful sweeps: conditional renders with no transition (`{isOpen &&`, `display: none` toggles), `onClick` on elements with no `:active`/transition styles, accordion markup, drag handlers, entering lists, empty-state and success components.

## Scroll-reveal budget

- Per page: one orchestrated entrance (typically the hero) plus at most 1-2 further scroll-reveal moments; every other section renders visible by default, no scroll trigger at all.
- Fade-up-on-scroll applied to every section is a named generated-look tell (anti-slop.md) - the budget is the fix, spend it deliberately.
- Hard rule: content is visible without JS and in a full-page screenshot. Initial `opacity: 0` on content that only a scroll handler later reveals is an accessibility, SEO and share-card defect, not a stylistic choice.
- Progressive enhancement only - a JS-added class enables the animation, never the visibility. The unanimated state IS the visible state; JS adds motion on top, it does not gate whether content is there.

## Easing

Decision order:
- Entering or exiting -> `ease-out` (starts fast, feels responsive).
- Moving / morphing on screen -> `ease-in-out`.
- Hover / color change -> `ease`.
- Constant motion (marquee, progress) -> `linear`.
- Default -> `ease-out`.

**Never `ease-in` on UI.** It starts slow, delaying the exact moment the user is watching - `ease-out` at 200ms feels faster than `ease-in` at 200ms. Built-in CSS easings are too weak for deliberate animation; use strong custom curves:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* strong ease-out for UI */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer curve (Ionic) */
```

Need another curve - take it from easing.dev or easings.co, never hand-roll one. If the project already defines easing/duration tokens, extend them; a parallel system is a defect.

## Duration

- Button press feedback: 100-160ms.
- Tooltips, small popovers: 125-200ms.
- Dropdowns, selects: 150-250ms.
- Modals, drawers: 200-500ms.
- Marketing / explanatory: can be longer.

**UI animations stay under 300ms**, modals and drawers alone up to 500ms - a 180ms dropdown feels more responsive than a 400ms one. Perceived performance is real: a faster-spinning spinner makes the same load feel shorter; once one tooltip is open, adjacent tooltips open instantly (skip delay and animation) and the whole toolbar feels faster.

## Physicality

- **Never animate from `scale(0)`.** Nothing in the real world appears from nothing - start from `scale(0.9-0.97)` + `opacity: 0`.
- **Popovers scale from their trigger**, not from center: `transform-origin: var(--transform-origin)` (Base UI). Modals are exempt - not anchored to a trigger, they stay centered.
- **Percentages in `translate()`** are relative to the element's own size - `translateY(100%)` hides a drawer whatever its height. Prefer over hardcoded px.
- `scale()` scales children too (font, icons) - a feature for press feedback, not a bug.

## Springs

Use when motion is drag with momentum, an element that should feel alive, a gesture the user can interrupt or reverse, or decorative mouse-tracking (interpolate with a spring instead of tying the value directly to the pointer - direct coupling feels artificial).

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }             // Apple-style - easier to reason about
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }   // traditional physics - more control
```

Keep bounce 0.1-0.3 and avoid it in most UI - reserve for drag-to-dismiss and playful moments. Springs carry velocity through an interruption (keyframes restart from zero), so they are the tool for gestures the user may reverse mid-motion.

## Interruption, enter, exit

- **Transitions, not keyframes, for anything triggered rapidly** (toasts, toggles): transitions retarget from the current value, keyframes restart from zero.
- Entry without JS state: `@starting-style` (fallback: `useEffect(() => setMounted(true), [])` + a `data-mounted` attribute).

```css
.toast {
  opacity: 1; transform: translateY(0);
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);
  @starting-style { opacity: 0; transform: translateY(100%); }
}
```

- **Exit the way it entered** - a toast sliding in from the bottom leaves through the bottom; symmetric paths make swipe-to-dismiss feel obvious.
- **Exit faster than enter** - leaving is acknowledgment, not a second entrance.
- **Asymmetric timing where the user is deciding**: slow on the deliberate phase (hold-to-confirm press: 2s linear), snappy on the system response (release: 200ms ease-out).

## Performance

- **Animate only `transform` and `opacity`** - they skip layout and paint. `width`/`height`/`margin`/`padding`/`top`/`left` trigger all three rendering steps (`clip-path` is the sanctioned fourth property; `height` is tolerated only for accordions).
- Never drive a child's transform from a CSS variable on the parent - it recalculates styles for every child; set `transform` on the element directly.
- Framer Motion shorthands (`x`, `y`, `scale`) are NOT hardware-accelerated - they run on the main thread and drop frames under load. Use the full string: `animate={{ transform: "translateX(100px)" }}`.
- CSS animations beat JS under load (they run off the main thread) - CSS for predetermined motion, JS for dynamic/interruptible. WAAPI (`element.animate()`) gives JS control with CSS performance, no library.
- Blur stays under 20px - heavy blur is expensive, especially in Safari.
- `will-change: transform` sparingly, only while animating.
- `backdrop-filter: blur` only on fixed/sticky elements (nav, overlays) - on scrolling containers it repaints continuously and kills mobile frame rate. Grain/noise overlays live on a `position: fixed; pointer-events: none` layer, never on scrolling content.

## clip-path recipes

`clip-path: inset(t r b l)` - each value eats in from that side; hardware-accelerated, no extra DOM.

- Reveal on scroll: `inset(0 0 100% 0)` -> `inset(0 0 0 0)` when the element enters the viewport (IntersectionObserver, `{ once: true }`) - counts against the scroll-reveal budget.
- Hold-to-confirm: colored overlay clipped `inset(0 100% 0 0)`; on `:active` transition to `inset(0 0 0 0)` over 2s linear; on release snap back 200ms ease-out; add `scale(0.97)` press feedback.
- Tab indicators with perfect color transitions: duplicate the tab list, style the copy active, clip it to the active tab, animate the clip.
- Comparison sliders: overlay two images, clip the top with `inset(0 50% 0 0)`, drive the inset from drag position.

## Gestures and drag

- Momentum dismissal: do not require a distance threshold - compute velocity (`Math.abs(distance) / elapsedMs`) and dismiss above ~0.11; a flick should be enough.
- Rubber-band at boundaries: dragging past a natural edge moves less the further it goes - real things slow before stopping, never hit an invisible wall.
- Pointer capture once dragging starts, so the drag survives the pointer leaving the element.
- Ignore extra touch points after a drag begins (`if (isDragging) return`) - prevents jumps when fingers switch.

## Stagger

Group entrances cascade with 30-80ms between items; longer delays feel slow. Cap at ~8 children - beyond that the tail feels laggy. Stagger is decorative: never block interaction while it plays. Trigger it with IntersectionObserver or CSS scroll timelines, never a scroll listener.

```css
.item { opacity: 0; transform: translateY(8px); animation: fadeIn 300ms ease-out forwards; }
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
@keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
```

## Masking imperfect crossfades

When a crossfade shows two overlapping states despite tuned easing/duration, add subtle `filter: blur(2px)` during the transition - blur blends the states into one perceived transformation.

## Accessibility gates - ship with the animation, never as a follow-up

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; } /* keep opacity/color, drop transform-based motion */
}
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* touch fires false hovers on tap */
}
```

Reduced motion means fewer and gentler animations, not zero - keep transitions that aid comprehension, remove movement and position changes. Infinite loops, parallax and scroll-driven effects collapse to static; entrances become plain visibility.

## Never ship

- `transition: all` -> name the exact properties.
- `scale(0)` entrance -> `scale(0.95)` + `opacity: 0`.
- `ease-in` on a UI element -> `ease-out` or a strong custom curve.
- Animation on a keyboard shortcut or 100+/day action -> none.
- UI duration over 300ms outside modals and drawers -> 150-250ms.
- `transform-origin: center` on a trigger-anchored popover -> origin at the trigger (modals exempt).
- Keyframes on toasts, toggles, rapidly-triggered elements -> CSS transitions.
- Animating `width`/`height`/`margin`/`padding`/`top`/`left` -> `transform`/`opacity`.
- Ungated `:hover` motion or missing `prefers-reduced-motion` -> the two media queries above.
- Everything entering at once -> 30-80ms stagger.
- Fade-up on every section -> the scroll-reveal budget (one orchestrated entrance plus at most 1-2 reveal moments per page).
- Content hidden until a scroll handler runs -> visible by default; JS adds motion only, never visibility.

## Cohesion and feel-checks

Match motion to the product's personality: a playful component can be bouncier, a professional dashboard is crisp and fast - fewer and subtler animations. When feel cannot be judged from code (a crossfade, a spring's bounce, opacity + height in an entering list - trial and error, no formula): play it at 2-5x duration or frame by frame in the DevTools animation inspector, test gestures on a real device, and look again the next day with fresh eyes.
