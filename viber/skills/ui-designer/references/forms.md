# Forms: Validation Timing, Error Messages, Smart Defaults

Read when designing or reviewing any form - sign-up, checkout, settings, search/booking - including its validation logic, error copy, and default values.

## Validation timing

- Validate a field on blur (when the user leaves it) - never on first focus, on page load, or on every keystroke while the user is still typing a not-yet-erroneous field. In React: first validation pass in `onBlur`, not `onChange`.
- Exception: fixed-length inputs (ZIP, phone, card number) may validate the moment the expected character count is reached.
- Reward early, punish late: once a field IS in an error state, re-validate on every keystroke and remove the error the instant input becomes valid; a valid or untouched field waits until blur for any new error. Never leave a stale error visible after the fix.
- Validate empty required fields only on submit, never on blur - tabbing past an empty field must not paint it red; skipping is not yet an error.
- Reserve true keystroke (`onChange`) validation for fields where live feedback IS the feature - password-strength meters, username availability, character counters - and debounce so nothing flashes red mid-word.
- Evidence for inline-on-blur: vs submit-only validation it gave +22% success rate, -22% errors, +31% satisfaction, -42% completion time, -47% eye fixations (eye-tracking study, 22 participants); on-blur feedback was 7-10 s faster per form than while-typing or on-focus variants.

## Error message placement and copy

- Place each error immediately adjacent to its field (directly below the input or next to the label), always visible - never tooltip-only, never top-of-form-summary-only, never a modal for field-level errors.
- If a long form adds an error summary, every summary entry must be an in-page link to the offending field; on failed submit move keyboard focus to the first invalid field.
- Copy formula: (1) name the field, (2) state precisely what is wrong, (3) say how to fix it with the expected format shown as an example.
- Never write generic "Invalid input" / "An error occurred"; ban the words "invalid", "illegal", "incorrect", "forbidden"; no error codes, no humor; keep copy at 7th-8th grade reading level or lower.
- Guideline-compliant forms hit 78% one-try error-free submissions vs 42% for violating forms - error copy quality is conversion-critical, not polish.

Bad:  `Invalid input`
Good: `The date field is in the wrong format; it should be similar to 17/09/2013`

## Error state visuals and accessibility

- Mark error state with redundant cues, never color alone: red border + warning icon + red error text in heavier font weight.
- Set `aria-invalid="true"` on the input; link the message via `aria-describedby`; announce injected errors with `role="alert"` (or `aria-live="polite"` for as-you-type feedback).
- On failed submit, prefix the page `<title>` with the error count (e.g. "3 Errors - Billing Address") - screen-reader users hear the outcome immediately.
- Do not animate the error text itself - reduces readability.
- Keep validation feedback persistent; never fade it out - disappearing messages make users doubt whether they erred.

## Recovery and submit behavior

- PRESERVE all user input when validation fails - never clear fields, never reset the form, never discard entries on a full-page error round-trip. The wrong value stays in the field so the user edits instead of retyping.
- Keep the submit button enabled and run full validation on click - never use a permanently disabled submit as the validation gate; it explains nothing and strands users.
- When the same error recurs 3+ times, escalate with extra help or an alternative path instead of repeating the identical message.
- Show positive inline confirmation (green check) only on complex or high-uncertainty fields - password strength, username/email availability, coupon codes - not on trivial fields like name or city, where checkmarks confuse ("filled in, or correct?").

## Required vs optional marking

- On checkout-length forms mark BOTH categories: asterisk (*) on required labels AND the literal text "(optional)" on optional labels - in the label, never as placeholder text.
- Do not rely on a page-level "All fields required" note, and never mark only one category - when only optional fields were marked, 32% of users hit a needless required-field error from guessing; only 14% of sites mark both (6% on mobile).
- Explicitly mark optional phone fields - 15% of adults refuse to give a phone number and abandon if they assume it is required.
- State constraints up front as persistent helper text near the field (password rules, accepted formats, character limits) before typing starts - never reveal requirements only through error messages after a failed attempt.

## Mobile input mechanics

- Set every input's font-size to 16px or larger on mobile - iOS Safari auto-zooms any focused field below 16px and leaves the page zoomed after the user leaves the field.
- Use semantic `type` (`email`, `tel`, `url`, `number`) plus `inputmode` (`numeric`, `decimal`) so the field raises the matching mobile keyboard instead of the default alphabetic one.
- Use real `autocomplete` tokens (`name`, `email`, `postal-code`, `cc-number`) matching the field's data - never blanket `autocomplete="off"`, it breaks password managers and autofill for every field it touches.

## Smart defaults

- Pre-fill every field and prefer closed choices; mechanism, the payoff in the CTA label and the ban on anti-user defaults -> ux-psychology.md "Smart defaults".
- Auto-apply beneficial values (e.g. a promo code) visibly and removably (X to dismiss) - never silently.
- A wall of empty inputs with a disabled submit is the anti-pattern: it maximizes decision fatigue and kills conversion.

Bad:  5 empty dropdowns ("Select date...", "Number of guests...") + disabled gray "Search"
Good: pre-filled "15 Oct - 20 Oct", "1 Adult", "Standard Room", auto code "AUTO15" (removable) + enabled CTA "See 12 results"

## Choice reduction

- Fewer visible options can help, never as a general law: evidence and caveats -> ux-psychology.md "Verified study numbers".
