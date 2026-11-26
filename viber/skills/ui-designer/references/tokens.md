# Token Architecture: Primitive, Semantic, Component

Read when building or reviewing a host project's own token system - CSS variables, a theming mechanism, dark-mode switching, or z-index layering - before writing the first token or `:root` block. Advisory for projects building their own system; an existing project token set wins (SKILL.md "Design-system precedence").

## Three layers

- **Primitive** - raw values with no meaning: `--color-blue-600`, `--space-4`. Change rarely - they are the foundation.
- **Semantic** - purpose aliases that reference primitives only: `--color-primary`, `--color-muted-foreground`. Change when the theme changes.
- **Component** - per-component tuning that references semantic tokens only: `--button-bg`, `--card-padding`. Change per component need.
- Each layer references only the layer directly below it - a component token never points at a primitive, a semantic token never points at another semantic token's raw value.

## Consumption rule

- Components consume semantic tokens, never primitives. A component that hardcodes `--color-gray-50` instead of `--color-background` breaks the moment the project rethemes or adds dark mode.
- Once a token system exists, no raw hex or px value belongs in component code - every color and spacing value routes through a token.

## Dark mode mechanism

- Dark mode overrides ONLY the semantic layer (`--color-background`, `--color-card`, `--color-muted-foreground`, ...). Primitive values never change - a primitive is a fact about a color, not a statement about a theme.
- Component tokens need no dark-mode override of their own: they inherit the swap automatically because they already point at semantic tokens.
- The physiology behind which values a dark surface actually needs (never pure black, elevation via lightness not shadow) lives in color.md - this file covers only the switching mechanism.

## Pairing and naming

- Every surface token ships with its foreground partner: `--surface` + `--surface-foreground`, `--card` + `--card-foreground`. Contrast is decided once at the token level, not re-checked at every call site.
- Name by role, never by hue: `--color-destructive`, not `--color-red` - the role survives a rebrand, the hue name does not.
- Convention: `--{category}-{item}-{variant}-{state}` - e.g. `--color-primary-hover`, `--button-bg-hover`. Keep the ordering consistent across the whole set so a token's name alone tells you where it sits.

## Derived scales

- Derive the radius scale from one base token instead of picking each size by hand: e.g. `md` = base, `sm` = base minus a fixed step, `lg` = base plus a fixed step. One change to the base retunes the whole surface.
- Define z-index as named tiers, once, instead of an arbitrary `9999` scattered per component: content tiers first (base, raised, overlay-within-content), then `dropdown < sticky < modal < popover < tooltip`. The ordering is the contract - the concrete numeric values are the project's own choice, not a fixed catalog.
