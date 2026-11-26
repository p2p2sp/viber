# Design Process & Handoff

Read when planning a design workflow, choosing wireframe fidelity, or writing a developer handoff spec.

## Problem framing

- Anchor the work in ONE specific problem statement phrased as "How might we ...", grounded in a user need (e.g. "Independent creators need a safe way to reach a wider audience.") - never a feature request.
- Treat the process as a loop, not a line: findings from testing feed back into the problem statement and ideas. The loop ends in developer handoff.

## Wireframe fidelity ladder

- Lo-fi: layout and functionality skeleton only - validate structure before any styling.
- Mid-fi: real buttons and text fields, still no visual detail - validate flows.
- Hi-fi: final look and feel - the right fidelity for user testing, since users react to realistic screens.
- Escalate fidelity only after the previous rung is validated - polishing an unvalidated structure wastes the polish.

## Redesign levers - order by lift per unit of risk

When upgrading an existing surface (refinement or redesign - scope rules in SKILL.md), apply levers in this order; levers 1-4 deliver roughly 70% of the value at 40% of the risk:

1. Typography refresh - the biggest visual lift, lowest risk.
2. Spacing and rhythm - scale, grouping, section padding.
3. Color recalibration - neutrals, accent discipline, contrast fixes.
4. Interaction states and motion layer - hover/pressed/focus, transitions.
5. Hero recomposition.
6. Full block replacement - only when a section is unsalvageable.

Never change silently during a redesign: URL slugs, primary nav labels, form field names/order (breaks analytics and autofill), the logo, legal/consent copy. Never regress an existing accessibility win.

## What generated builds forget - finish checklist

- A custom 404 page; back navigation from every page (no dead ends).
- A "skip to content" link; visible focus everywhere (-> accessibility.md).
- Legal footer links (privacy, terms); a real favicon - legible at 16px, survives single-color.
- Client-side form validation wired, not just styled (-> forms.md).
- Every link goes somewhere: no dead `#` hrefs - link for real or visibly disable.
- A social share image (`og:image`, 1200x630) - critical content centered; platforms crop the edges.

## Developer handoff = full UI specification

A design is not done until every component ships with:

- Exact dimensions in px for every element.
- All spacing values (margins, padding, gaps between stacked blocks).
- Responsive behavior of each element.
- Interactive states (default/hover/active/disabled) with duration and easing for every interaction - timing recipes in motion.md. Unspecified motion gets improvised by developers; write it down or lose consistency.

Annotate layouts like an engineering blueprint: element names, px dimensions, margins, states. Tag readiness explicitly, e.g. `STATUS: READY FOR DEV | VERSION 1.0`.

Model of required spec granularity - a single button:

```
Button: width 168px, height 48px, corner radius 8px, horizontal padding 12px
Type: Inter Bold, 16px / 24px line-height, letter-spacing 0.5px
```

Page-level rhythm belongs in the spec too - e.g. 16px vertical margin between stacked sections, 32px gap before the primary CTA.
