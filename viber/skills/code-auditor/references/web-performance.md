# web-performance

What changes the bytes, their order or their timing in the browser: initial JavaScript weight, the largest-contentful-paint path, layout stability, hydration and interaction cost, asset weight, delivery headers. Elsewhere: server data-access latency (runtime-performance), a wrong result or a listener, timer or subscription never removed on unmount (bugs), an exploitable flaw (security), structure with no browser cost (design).

## Hunts

- `initial-js-weight`: a heavy dependency reaching the entry chunk of a primary route: barrel (`export * from`) or whole-library imports; routes, modals, editors and charts imported statically; a `"use client"` root; legacy build targets or a whole `core-js` import; two libraries or two versions for one job. Per framework: Next `"use client"` in `layout.tsx`; Vite or Rollup putting all vendors in one chunk; Vue global component registration; Angular routes with `component:` instead of `loadComponent`; Astro `client:load` on a below-the-fold island.
- `lcp-critical-path`: an LCP element the HTML does not reveal early: `loading="lazy"` or no `fetchpriority` on the hero, a `next/image` hero with neither `preload` nor `fetchPriority="high"` (lazy by default), a hero rendered only on the client, render-blocking CSS or a sync `<script>` in `<head>`. Fetch waterfalls: a `useEffect` fetch chain, serial `await`s in a loader or server component, a blocking `await` in a root layout that stops streaming. HTML that could be static rendered per request: `cookies()`, `headers()`, `force-dynamic` or a `no-store` fetch in a shared layout; `getServerSideProps` for content with no per-user data.
- `layout-stability`: `img`, `video` or `iframe` without dimensions or `aspect-ratio`; ads, embeds or banners injected late with no reserved space, or a consent or promo banner inserted above existing content; font swap with no metric-matched fallback; client-only theme or locale branches flickering after hydration; a transition or keyframe animating `top`, `left`, `width`, `height` or `margin` instead of `transform`.
- `interaction-hydration`: static content hydrated as client components or islands; a whole record or list serialized into the HTML as client props when the client reads a few fields; a render branching on `typeof window` or `matchMedia` (hydration mismatch, client re-render); a root context `value` rebuilt every render; a keystroke-driven re-render of a large non-virtualized list; a long synchronous handler with no yield; a layout read after a style write inside a loop; a `scroll` or `pointermove` handler doing layout work per event.
- `asset-and-delivery`: third-party tags loaded eagerly or in `<head>` (tag manager, chat, A/B testing, consent); video, map or chat embeds with no facade; fonts not WOFF2, many weights or loaded by CSS `@import`; raw multi-MB images with no optimizer, or one large `src` with no `srcset` and `sizes`; hashed assets without a long `max-age` or `immutable`; HTML cached with a long `max-age`; back/forward cache blocked by an `unload` listener, an unconditional `beforeunload` or `Cache-Control: no-store` on HTML.

## Excluded

- Memoization or `useCallback` advice where React Compiler is enabled or the render is not shown to be expensive; loop and property-access micro-optimizations.
- Dev-only code: tests, Storybook, scripts, devDependencies, dev-server config.
- Imports already lazy, and named ESM imports that tree-shake.
- Content below the fold, for LCP and CLS claims. Its code in the initial chunk still counts as initial JS.
- Images served by a framework optimizer (`next/image`, `astro:assets`, `@nuxt/image`), for format and compression only. Their lazy loading, priority and `sizes` still count.
- Generic advice ("use a CDN"), and any finding naming no metric.
- Headers set outside the repository (CDN, proxy), and anything depending on third-party tag content.

## Proof

- The route, the element or dependency, and the metric it affects.
- A dependency claim: the import chain from the route file to the dependency, every import quoted, with no dynamic `import()` boundary on it.
- An LCP claim names its candidate: the first large image or text block of the route's first viewport, by markup order and declared size.
- A markup, header or handler defect: the lines quoted, and for a list the lines showing nothing bounds N.
- A byte size only as an estimate, naming its source.
- Never claim a measured duration or metric value: milliseconds of INP, a CLS score, which element the browser picks as LCP.

## Severity

Byte thresholds are judged on the estimate.

- 9-10: by construction pushes a Core Web Vital of the main or landing route to "poor" (LCP over 4 s, INP over 500 ms, CLS over 0.25): a lazy or client-only hero behind 2 or more serial requests; over 1 MB gzipped initial JS.
- 7-8: likely moves a metric out of "good": over 100 KB gzipped added to a primary route's initial chunk; a sync third-party script in `<head>`; unsized media above the fold; a blocking `await` in a root layout; a forced reflow in a loop or an unvirtualized list over unbounded N on a primary interaction; a primary route forced dynamic.
- 4-6: the same on a secondary route; a bfcache blocker on every page; hashed assets with weak caching; non-WOFF2 or unsubset fonts; oversized images below the fold; a re-render cascade on a proven path.
- 1-3: under about 20 KB gzipped, admin-only routes, best-practice gaps with no metric change.
