---
paths:
  - "viber/skills/**"
  - "viber/agents/**"
  - "viber/**/references/**"
---

# Skill and agent instructions

Compress every instruction to the extreme: each line is paid on every run. The readers are Opus and Fable, so choose the words for them.

## Compress

- Write only the delta from what the model does unprompted.
- One rule per line, imperative: "Run X", "Never Y".
- Rationale: one clause, only where it lets the model handle an unlisted case.
- Cut hedges, politeness, narration, decision history, caller context and repetition.
- Every character is a paid token, in templates and formats too: cut each mark that no reader and no script uses (a checkbox nobody ticks, a decorative label, a repeated marker).
- Never cut precision: keep the condition, the range (every, only, first, at most N) and the fallback of a rule.

## Words for Opus and Fable

- Both follow the text literally: write exactly what is meant, leave nothing to guess.
- One term per concept, the same in every file.
- Name the concrete thing: the file, the field, the value, the excluded behaviour. A vague quality ("avoid generic output") changes nothing.
- Name what to read and what is out of scope: Opus under-explores, Fable widens the scope.
- Capitals (NEVER, ALWAYS) only where a violation is irreversible or breaks a contract: both overreact to shouting.
- No "think carefully", no "step by step", no hard word or sentence limits.
