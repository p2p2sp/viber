# Mobile UI Patterns

Read when designing mobile app screens, bottom navigation, touch targets, or multi-step mobile flows.

## Bottom navigation: destinations
- Use 3-5 top-level destinations. Material Design explicitly requires "three to five destinations of equal importance"; current Apple HIG says use "the appropriate number of tabs" and caps iPhone tab bars at 5 visible tabs.
- Fewer than 3 destinations does not justify a nav bar; more than 5 shrinks tap targets and causes choice paralysis.
- Belongs in the bar: home, search, create-CTA, notifications, profile - core, frequently used destinations only.
- Never in the bar: help, logout, privacy policy/terms, back buttons, logos - relegate these to a menu or settings screen.
- Jakob's law: keep the platform convention (Tab Bar on iOS, Navigation Bar on Android). Do not invent novel navigation - users transfer expectations from every other app.

```
Bad:  Home | Help | Logout | Terms | Back
Good: Home | Search | (+) Create | Alerts | Profile
```

## Bottom navigation: anatomy and states
- Reference anatomy on a 375px-wide viewport: bar 64px tall, 24px icons, 12px labels (11-12px range - 11px is the absolute text floor, see typography.md), 8px padding-top, 4px padding-bottom.
- Labels: short, single line, never wrapped. Omit labels only for highly tech-savvy target audiences.
- Active state = minimum 2 simultaneous visual changes (the "2-rule change"): color + filled icon, or color + bold label. A single change is too weak a signal of "where am I".

```
Inactive: outline house icon, gray regular "Home"
Active:   filled house icon + accent color + bold "Home"   (fill + color/weight = 2+ changes)
```

- Keep the bar palette neutral (white/gray) with one accent reserved for the active item; use exactly one icon style - never a different color or style per tab. Inactive icons still need 3:1 contrast (WCAG).
- Central elevated CTA pattern for the primary action (add/create/buy): 56px raised circle with a 24px icon in the accent color, centered in the bar - the most reachable, most distinct spot.
- Separate the fixed bar from scrolling content with exactly one of: a 1px top border, a background color difference (e.g. white content / light-gray bar), or a subtle top shadow.
- Never cover or modify the home-indicator safe area (bottom ~34pt on iOS) - controls placed there cause accidental app exits. The bar sits above it.
- Tab-switch and tap feedback microinteractions: a sliding active indicator, radial + opacity tap feedback; durations and easing -> motion.md.

## Touch targets
- Platform minimums are in the SKILL.md non-negotiables; full rules and the WCAG spacing exception in accessibility.md. Apple's unit is points (density-independent), Android's is dp.
- Visual size is not hit area: a 24px icon may render at 24px, but its tappable zone must still meet the platform minimum.
- Fitts's law: large, well-spaced targets are hit faster with fewer errors - size the most-used controls generously, keep at least 8dp between targets, never pack them edge-to-edge.

## Thumb zone
- Place primary actions in the bottom reachable area of the screen - tap zones are sized and positioned for the average human thumb in one-handed use.
- The bottom nav bar and its central CTA exist precisely because the bottom edge is the easiest reach; do not move the primary action to the top of the screen.

## Gestures over chrome
- Prefer native swipe to on-screen arrows for carousels and paged content on touch screens - drop the prev/next arrow chrome and let the horizontal swipe drive it, with a dot/position indicator for orientation. Keep a visible control only where discoverability needs it (a first-run hint) or for pointer/accessibility users.

## Mobile flows
- 3-5 screens per flow; one concept or decision per screen - never a wall of empty inputs on one screen.
- Auto-save progress at every step; input must survive interruption.
- Design re-entry: after an interruption (call, app switch), return the user exactly where they left off, never to the start of the flow.
- Give every non-essential step a visible Skip / "Later" escape hatch - never force users through steps that do not apply (full rule -> ux-psychology.md "Escape hatches").

## Spacing rhythm (mobile)
- Mobile rhythm values (stacked blocks, gap before the primary CTA, tight intra-component gaps) -> layout-spacing.md "How much white space".
