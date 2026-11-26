# Component States, Depth and Card Anatomy

Read when designing or reviewing component states (loading, empty, error, disabled, hover/focus/pressed), shadows/elevation, or card layouts.

## Loading states - tier by expected duration
- Under ~1s: show nothing - a flashed spinner is more distracting than the wait.
- ~1-10s: looped spinner plus a text label ("Loading comments…"). Never a static "Please wait".
- Over 10s: determinate percent-done progress bar - users shown a moving progress bar waited ~3x longer.
- Skeleton screens only for full-page or container content loads finishing within ~10s. Mimic the final layout: gray boxes sized and positioned where real text, images, cards will land. Never frame-only (header + footer + blank body) - users assume the page is broken.
- Animate skeletons with a subtle left-to-right shimmer/pulse, ~1-2s loop (CSS gradient translating across placeholders).
- No skeletons for uploads, downloads, or file conversions - use a progress bar or step wizard there.
- Submit buttons: on click, switch the button itself to loading (inline spinner next to the label, interaction blocked via aria-disabled + click guard, not the disabled attribute) - prevents double-submit.
- Reserve space for async content: explicit dimensions or `aspect-ratio` on images, embeds and late-loading blocks so nothing jumps on arrival. Load webfonts with `font-display: swap` plus a metric-similar fallback font.

## Empty states
- Branch on loading BEFORE emptiness. Never flash "No records" while a fetch is in flight - users watch it populate seconds later and distrust the app.

```jsx
// isLoading first, then emptiness, then data - never default to the empty message
{isLoading ? <Skeleton/> : items.length === 0 ? <EmptyState/> : <List items={items}/>}
```

- Every empty state has 3 parts: (1) why it is empty ("No records for the selected date range"), (2) how it gets populated ("Star favorites to list them here"), (3) a direct CTA ("Create project"). Never a bare blank container.
- Design first-use and no-results differently. First-use = onboarding: explain the feature's value, lead with the creation CTA. No-results = recovery: keep the query visible in the search box; offer related categories, alternative query suggestions, popular items - "try different keywords" alone is a dead end (nearly 50% of e-commerce sites fail at no-results recovery).

## Error states
- Place the message immediately adjacent to the field or element that caused it - never only a toast or top-of-page summary.
- Bold, high-contrast red + icon + text - never color alone (colorblind users).
- Say precisely what went wrong and how to fix it: "Card number must be 16 digits", not "Invalid input" or an error code. Avoid blaming words like "invalid/illegal".
- Preserve the user's typed input for editing - never clear the form.

## Optimistic UI
- For high-confidence, reversible mutations (delete a row, toggle, like, reorder, send), update the view immediately on the user action and reconcile with the server in the background - the interface feels instant instead of waiting on a round-trip (Gmail archive/delete is the canonical case).
- Always design the rollback: if the request fails, restore the prior state and surface a clear, adjacent error (-> Error states above) - never leave the optimistic state standing after a failure.
- Pair a reversible destructive action (delete a row, archive) with a time-boxed Undo ("Deleted. Undo", ~5-10s) rather than a blocking confirm dialog on every delete - it removes friction while still protecting the user; hold the real commit until the undo window closes. Reserve hard-stop confirm dialogs for irreversible / high-stakes actions.
- Do NOT use optimistic UI for low-confidence or high-stakes writes (payments, irreversible or slow server-validated operations) - there a pending state and an explicit confirmed result are correct.

## Toasts and async status
- Toasts auto-dismiss in 3-5s, never steal focus, and announce via `aria-live="polite"` - reserve `assertive` for errors. An undo toast (-> Optimistic UI above) keeps its longer, time-boxed window instead; the toast being dismissable does not shorten it.
- Any non-form async status change (a background save, an async result arriving) gets an `aria-live` region so the state change is announced without a focus shift. Form-field errors keep `role="alert"` (-> forms.md) rather than a generic live region.
- An AI/LLM response streams token-by-token as it arrives - a long spinner hiding an already-flowing answer is a designed-in wait.

## Overlays: modal vs drawer vs popover
- Choose on two axes: stakes / need for a hard stop, and task complexity / need to keep page context. Do not decide on importance alone.
- Modal (blocking) - a short, self-contained, high-stakes decision that must interrupt: destructive/irreversible confirms, or a single focused choice. Keep it rare; overused confirms breed click-through and lose their stopping power. For reversible actions prefer Undo (-> Optimistic UI) over a confirm dialog.
  - Destructive confirm: restate the exact consequence, put the verb in the button ("Delete account", not "OK"), default focus on the safe option, dismissive action left / affirmative right, and require typing a token (DELETE) for the most dangerous.
- Drawer / side panel (non-blocking) - a sub-task too big for a modal but not worth a full navigation, where the user needs the page's data visible while acting (edit a record, create beside a list, inspect a detail). Slides in, page stays readable behind it.
- Popover (non-blocking) - a quick, small, contextual pick or edit inline, so users fix a gap without jumping to another screen. Small content only; escalate to a drawer when it grows. Dismisses on outside click, so never gate a critical/destructive decision behind one.
- Keyboard/focus contract: a modal or drawer traps focus inside, autofocuses its first meaningful control, closes on Esc, and returns focus to the trigger element on close. A menu or popover opens on Enter/Space, navigates its items with arrow keys, and closes on Esc.
- Modal scrim: 40-60% black over the page - lighter fails to isolate the dialog from the background, darker reads as a full screen change rather than a layer on top.

## Disabled
- Style as the on-surface (text) color at 38% opacity for label and icon, 12% for the container (M3 tokens) - not a bespoke gray. Keep the label legible so users can still read what the action would be.
- No hover/pressed state layer, no elevation, cursor: default.
- Prefer aria-disabled="true" with a click-handler guard over the HTML disabled attribute - keeps the control in tab order so keyboard and screen-reader users can find it. Pair with a nearby hint saying what unlocks it.

## Hover, focus, pressed
- Implement as a translucent state layer in the component's own content color: hover 8%, focus 12%, pressed 12%, dragged 16% opacity (M3 tokens; e.g. pseudo-element with background: currentColor). One layer at a time - when states co-occur, priority runs disabled > loading > pressed > focus > hover.
- Hover transitions ~150-200ms - prevents flicker when the cursor passes through. Always set cursor: pointer. Transition the named properties (`background-color`, `border-color`, `transform`, `box-shadow`), never `transition: all`.
- Opacity is not a hover state: `hover:opacity-90` on a button dims the label along with the fill and makes the hovered control read as disabled. Move one step on the accent scale, add the state layer above, or change border/elevation - text contrast stays at full strength through every state.
- Pressed feedback within 100-150ms of activation - immediate, or users click twice. Give the press a physical cue: `scale(0.98)` or `translateY(1px)` on `:active` - a button that does not move reads as dead.
- Screen transitions = cross-fade + horizontal slide; durations and easing for every transition -> motion.md.
- Never remove the focus outline without a replacement (no bare outline: none) - recipe and contrast minimums in accessibility.md.

## Depth and elevation
- Give shadows a positive Y offset, never X:0 Y:0 - a symmetric halo exists under no real light source.
- On colored backgrounds, tint the shadow with the background hue (darken + desaturate the background color) - pure black or neutral gray reads muddy.

```
BAD:  box-shadow: 0 0 48px #9F9F9F;     /* symmetric halo, neutral gray */
GOOD: box-shadow: 0 12px 48px #CFC9DD;  /* Y offset, hue-shifted toward lavender bg */
```

- Default recipe: soft, fitted shadows - large blur (~48px), Y offset 12-19px, subtle background-tinted color.
- Separate borderless cards via subtle background contrast (white card on very light gray) plus a near-invisible shadow. Avoid heavy borders and separator lines - they are visual noise.
- Hard shadows / neo-brutalism only as a deliberate style choice, limited to interactive elements - never as the default separation method.
- Separate fixed nav from scrolling content with a 1px top border or an ultra-soft shadow.
- Keep one light source: audit all shadows on a surface for a single consistent direction - mixed offsets read as broken physics.
- Glass surfaces need three layers to read as material: backdrop blur + a 1px light inner border (e.g. rgba(255,255,255,0.1)) + an inset top highlight (`inset 0 1px 0 rgba(255,255,255,0.1)`). Blur alone reads cheap. Provide a solid fallback under `prefers-reduced-transparency`, and treat glass as an accent, never the default surface.
- Nested rounded elements stay concentric: inner radius = outer radius minus the padding between them. Equal radii on nested corners read as a mistake.

## Card anatomy
- Give every card 3-4 explicit hierarchy tiers: T1 primary value (largest, boldest, darkest) -> T2 title (medium, bold) -> T3 metadata (small, gray, icon-led) -> T4 supporting block. Eight rows at one size/weight = zero hierarchy.
- Label/value treatment (mute the label, amplify the value) and number formatting -> typography.md "Data display". The number must land first at a glance.
- Kill label:value rows - encode meaning with icons: pin = location, bed = bedrooms. Icon + value beats "Location: Warsaw".
- Render status/type as colored pill badges, not plain text.
- Group metadata into one compact horizontal stats row (icon + value clusters), not a stacked list.
- Humanize person data: avatar next to the name, never a bare text row.
