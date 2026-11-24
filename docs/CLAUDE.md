# docs - non-shipped records of this repo

Holds what this repo keeps for reference but never ships: the retired plugin sources and viber's runs of work on this repo. It owns no plugin code, no test and no release input.

## Relationships

- No `plugin.json`, `marketplace.json`, release script or CI workflow reads anything under `docs/`.
- The two run directory names come from `.claude/viber.yml` `directories:`: `runs: _specs` (an open run, `docs/_specs/<stamp>_<slug>/`, present only while one is open) and `specifications: specs` (where `cleanup` archives a finished run).
- Child nodes: `docs/archive/superdev/CLAUDE.md`, `docs/archive/superdev/skills/CLAUDE.md`, `docs/archive/superdev/tests/CLAUDE.md`, `docs/specs/CLAUDE.md`.

## Contracts

- Every path starting with `docs/` is outside the repo-wide sweeps: the `orphan-tags/tracked` and `script-portability/shipped` rules of `tools/lint/` both exclude it, so no file here is checked for orphan closing tags or Windows/macOS portability.

## Traps

- A file under `docs/` is not an example of current plugin practice: its scripts and markdown are never tested, so never copy one into a shipped plugin without checking it against the live rules.
