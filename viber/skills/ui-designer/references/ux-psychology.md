# UX Psychology for Conversion and Onboarding

Read when designing onboarding, forms, signup/paywall placement, progress indicators, personalization steps, or upgrade/pricing screens.

## Core thesis
- Make the user's next action obvious, valuable, and worth finishing - apps fail on decision friction, not ugliness.
- Four framing facts drive everything below: an empty form feels harder than a pre-filled one; 0% progress hurts more than 20%; a signup wall before value repels; the same price reads cheap or expensive depending on what was shown just before it.

## 1. Smart defaults
- Mechanism: empty fields force users to generate answers from scratch (decision fatigue, Hick's law); a sensible default turns the task into "accept or correct".
- Rule: pre-fill every field with the most common sensible choice; replace open inputs with a small closed set; ask 5 questions, not 20. Roughly 70-90% of users never change defaults (practitioner heuristic, not a single study).
- Put the payoff in the CTA itself: "See 12 results", not "Search".
- Mobile: predefined choices as large tap-ready chips; no manual typing where a pick suffices. Web/SaaS: pre-fill from known data - country from IP, recommended plan pre-selected, most-common billing cycle.
- Anti-pattern: defaults that serve the metric against the user - pre-checked upsells, marketing consents, hidden auto-renewal.

## 2. Endowed progress + goal gradient
- Mechanism: a granted head start raises completion, and motivation intensifies as the goal nears (Nunes & Dreze 2006; goal gradient).
- Rule: never show 0%. Count an already-performed action (account created, email confirmed) as step 1 and start the bar at 20-30%.
- Mobile: 3-5 screen flows with visible "step 2 of 4"; auto-save progress for interruptions. Web/SaaS: activation checklist with one item already checked; multi-step forms with progress indicator and draft save.
- Anti-pattern: a head start tied to no real action - endowed progress must reflect something the user actually did.

## 3. Zeigarnik effect
- Mechanism: unfinished tasks occupy memory more than finished ones (B. Zeigarnik); a visible open gap creates tension to close it.
- Rule: make the incomplete state visible and specific - "Profile 70% complete, finish 2 steps" with the exact remaining items listed, tied to real user value.
- Mobile: setup checklist on the home screen; sparing push reminders about unfinished setup. Web/SaaS: dashboard activation checklist; "X/Y done" badge.
- Anti-pattern: artificial forever-open states that manufacture anxiety instead of delivering value.

## 4. Reciprocity - value before signup
- Mechanism: people who receive value first are inclined to reciprocate (Cialdini); asking for commitment before delivering value is a top abandonment cause.
- Rule: demonstrate concrete value before asking for anything; delay the signup wall until the user is already convinced.
- Frame the signup CTA as keeping value ("Save your report"), not unlocking it ("Register to view").
- Mobile: let users run the core flow without an account; ask at save/sync. Web/SaaS: try-before-signup, interactive demo, an immediate visible result.
- Anti-pattern: blurred "results locked" screens at entry; bait-and-switch where the promised value turns out gated after signup.

## 5. IKEA effect
- Mechanism: people value what they helped build (Norton, Mochon & Ariely) - leaving then means abandoning their own work.
- Rule: invite a light, meaningful investment early (name, goals, palette, workspace setup), but only input that visibly changes the product afterward.
- Mobile: onboarding personalization that alters recommendations. Web/SaaS: workspace wizard, data import, custom template or theme.
- Anti-pattern: empty personalization (questions that change nothing) and forced busywork added only to trap the user.

## 6. Loss aversion + anchoring
- Mechanism: losses feel roughly 2x as strong as equal gains (Kahneman & Tversky); the first or adjacent number sets the reference point for any price.
- Rule (loss framing): at conversion points state what the user actually loses - access, data, progress, discount - instead of listing features. Only when the loss is real.
- Rule (anchoring): never show a price in isolation. Anchor it: yearly next to monthly with "save X%", a highlighted reference plan, per-day price breakdown, the $50 add-on shown after the $1,900 product.
- Mobile: paywall with plan anchor and savings callout. Web/SaaS: plan table with a highlighted anchor plan; trial-end message naming exactly what access disappears.
- Anti-pattern: fake urgency, fake scarcity, fake strikethrough prices, misleading anchors - this principle sits closest to dark patterns; apply the ethics rules below.

## Moment -> principle -> avoid
- Onboarding forms / questions -> smart defaults, fewer closed choices. Avoid: empty fields, 20 questions, anti-user defaults.
- Onboarding start / progress bar -> endowed progress (start >0%) + Zeigarnik (visible gap). Avoid: start at 0%, fake progress.
- Access to value / registration -> reciprocity, value before the wall. Avoid: signup wall at entry, bait-and-switch.
- Personalization / setup -> IKEA, light meaningful input. Avoid: empty personalization, forced busywork.
- Upgrade / pricing / trial end -> loss framing + anchoring on true facts. Avoid: fake urgency/scarcity, misleading anchor.
- Whole platform -> short flows, low cognitive load, visible progress, re-entry after interruption. Avoid: overload, lost progress, no draft save.

## Escape hatches
- Every multi-step flow (onboarding, setup wizard, personalization) needs a visible way out: a "Skip" / "Do this later" on each non-essential step, and a working back/close that preserves entered data.
- Never force users through steps that do not apply to them - irrelevant forced steps are a top onboarding-abandonment cause. Gate optional steps behind the user's own choices (smart defaults -> section 1) so nothing mandatory is busywork.
- Skipping must not lose progress: a skipped step stays resumable from the activation checklist (-> Zeigarnik), never silently discarded.

## Hard ethics rules (never do)
1. Fake urgency - countdown timers or "offer ends in 5 min" that do not really expire.
2. Fake scarcity - "2 spots left" when untrue.
3. Fake progress - a bar tied to no real action.
4. Fake results, reviews, or social proof.
5. Misleading anchors or fake strikethrough prices.
6. Defaults that work against the user - hidden consents, hidden auto-renewal.
7. Forced excess effort only to lock the user in (IKEA-effect abuse).

- Litmus test: if a technique works only because the user does not know something or is misled, it is a dark pattern. Good UX still works when the user fully understands what is happening.

## Verified study numbers (cite with these caveats)
- Jam study (Iyengar & Lepper 2000): the 24-jam display attracted MORE shoppers (60% stopped vs 40% at 6 jams), but only ~3% of its stoppers purchased vs ~30% at the 6-jam display (~10x conversion gap among stoppers). Caveat: Scheibehenne, Greifeneder & Todd's 2010 meta-analysis (50 experiments, ~5,000 participants) found a mean assortment-size effect near zero (d ~0.02); choice overload appears only under moderators such as high complexity and no strong preferences (Chernev et al. 2015). Cite as "fewer choices can help under specific conditions", never as a general law.
- Loss aversion (Kahneman & Tversky 1979; Tversky & Kahneman 1992): loss-aversion coefficient about 2 (lambda ~2.25). "Losses feel about twice as strong as gains" is a fair paraphrase; the exact multiplier varies across studies.
- Endowed progress (Nunes & Dreze 2006, car-wash loyalty cards): 10-stamp card issued with 2 free stamps reached 34% completion vs 19% for an 8-stamp card - identical 8 purchases required; endowed customers also completed faster.
- Do NOT cite: the "e-book conversion rose from ~22% (benefits list) to ~48% (real product pages)" story - no traceable primary source exists; treat as an unverified marketing anecdote. The underlying idea (show real product screenshots) is supported only by informal case studies.
