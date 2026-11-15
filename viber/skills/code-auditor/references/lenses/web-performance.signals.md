# Web performance lens map signals
Rank units by route reach (root layout first, then the landing page), then by the signals below and by churn. Only when the first three blocks (framework config files, framework dependencies, HTML and template files) all find nothing: `## Units` reads `none: <reason>`.

Framework config files:
```bash
git -c core.quotePath=false ls-files | grep -E '(^|/)(next|vite|nuxt|astro|svelte|remix|angular|webpack|vue|rsbuild|rspack|react-router|gatsby)[.-](config\.)?([cm]?[jt]s|json)$'
```

Framework dependencies:
```bash
git -c core.quotePath=false grep -lE '"(react|vue|svelte|@angular/core|solid-js|preact|astro|lit|@builder.io/qwik|jquery|htmx.org|alpinejs)"' -- '*package.json'
```

HTML and template files:
```bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -E '\.(html?|erb|haml|slim|twig|jinja2?|njk|liquid|hbs|cshtml|jsp|gohtml)$|\.blade\.php$' | head -50
```

Entry files:
```bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -E '(^|/)(app/(.*/)?(page|layout|root)|pages/[^/]+|routes/.*|src/(main|App|index)|layouts?/[^/]+)\.([cm]?[jt]sx?|vue|svelte|astro)$|(^|/)(index|base|_?layout|application)(\.html)?\.(html|erb|twig|njk|liquid|hbs)$'
```

Heavy imports and whole polyfill imports:
```bash
git -c core.quotePath=false grep -nE "from ['\"](moment|lodash|chart\.js|three|monaco-editor|xlsx|pdfjs-dist|highlight\.js|firebase|aws-sdk|core-js|jquery|mapbox-gl|echarts|plotly\.js|mermaid)['\"]|^import ['\"]core-js" -- '<scope>' | head -50
```

Barrel files, per file:
```bash
git -c core.quotePath=false grep -cE '^export \* from' -- '<scope>' | sort -t: -k2 -nr | head -20
```

Client roots in layouts and providers:
```bash
git -c core.quotePath=false grep -lE "^['\"]use client['\"]" -- '<scope>' | grep -E 'layout|providers|_app'
```

Eager hydration directives and eager routes (Astro, Angular, Vue):
```bash
git -c core.quotePath=false grep -nE "client:(load|only)|component: [A-Z][A-Za-z]*Component[,} ]|app\.component\(" -- '<scope>' | head -50
```

Unsized media, line-based and approximate:
```bash
git -c core.quotePath=false grep -nE '<(img|iframe|video)([ >]|$)' -- '<scope>' | grep -v 'width=' | head -50
```

Hero priority and lazy loading:
```bash
git -c core.quotePath=false grep -nE "loading=[{\"']*lazy|fetch[pP]riority|rel=[\"']preload|<Image " -- '<scope>' | head -50
```

Fetch waterfalls in effects:
```bash
git -c core.quotePath=false grep -nA4 -E '(useEffect|onMounted|onMount)\(' -- '<scope>' | grep -E 'fetch\(|axios|\.get\(' | head -50
```

Rendering forced per request, and back/forward cache blockers:
```bash
git -c core.quotePath=false grep -nE "force-dynamic|cookies\(\)|headers\(\)|getServerSideProps|addEventListener\(['\"](unload|beforeunload)|onunload" -- '<scope>' | head -50
```

Third-party tags, embeds and fonts:
```bash
git -c core.quotePath=false grep -nE "googletagmanager|gtag|hotjar|intercom|beforeInteractive|fonts\.googleapis|@font-face|font-display|<script[^>]+src=[\"'](https?:)?//|youtube\.com/embed|maps\.googleapis|connect\.facebook|clarity\.ms|onetrust|cookiebot" -- '<scope>' | head -50
```

Largest binaries, extensions in any case:
```bash
git -c core.quotePath=false ls-files -- '<scope>' | grep -i -E '\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ttf|otf|woff2?)$' | while IFS= read -r f; do du -k "$f"; done | sort -rn | head -20
```

Cache headers anywhere in the scope:
```bash
git -c core.quotePath=false grep -nE 'Cache-Control|immutable|max-age|maxAge|no-store' -- '<scope>' | head -40
```

Churn:
```bash
git -c core.quotePath=false log --no-merges --since='6 months ago' --name-only --format= -- '<scope>' | grep -v '^$' | sort | uniq -c | sort -nr | head -30
```
