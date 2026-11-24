# tools/lint - the rule engine of the lint job

Owns the engine, the rule types, the rule instances written as data, the tree the rules read and the list of accepted skill-lint failures. It does not own the other steps of the lint job (`tsc`, actionlint, shellcheck, `.github/scripts/lint-skills.sh`): those sit in `.github/workflows/ci.yml` and `.github/scripts/`.

## Terms

- Rule type: a `rules/<type>.ts` whose default export holds `name`, `check(tree, params)` and a `selfCheck` (a bad sample tree with its params). Rule instance: an entry of the `rules` array of a `data/*.ts`, with `id` (`<type>/<name>`), `type`, `params` and `why`.
- Self-check: before any rule of a type runs, `check` must report on the type's own bad sample; when it reports nothing the run prints `self-check: <type> reported nothing on its bad sample`, fails and runs no rule of that type, so a green run is never vacuous.
- Tree: `files` (the git index, with modes), `read` and `list`, built by `tree.ts` from the `Fs` and `Git` ports of `viber/lib/`.

## Relationships

- `run.ts` discovers by directory: every `rules/*.ts` is a type and every `data/*.ts` a list of instances, nothing is registered anywhere. `node tools/lint/run.ts [<type or rule id>...]` prints one `<path>:<line>: [<id>] <message>` line per finding (line 0: the whole file), then `lint: <n> findings, <m> rules`; exit 0, 1 on a finding or a failed self-check, 2 on an argument matching no rule.
- Types: `cap`, `token-contract`, `forbidden`, `ref-exists`, `layering`, `orphan-tags`, `script-portability`, `invocations`, `tiers`; their tests are `tests/tools/lint/<type>.unit.test.ts` over `tree-fixture.ts`, plus `engine.unit.test.ts`.
- `tools/lint/skill-exceptions.txt` is read by `.github/scripts/lint-skills.sh`: exact `FAIL <path>: <text>` lines of the skill lint, each under a reason comment.

## Contracts

- The rule instances own the caps, the sweeps and the invariants over the tree: `cap/*` (word caps of prompts, byte caps of role read sets), `invocations/viber`, `script-portability/shipped`, `orphan-tags/tracked`, `tiers/legacy`, `forbidden/dashes`, `forbidden/retired`, `ref-exists/viber`, `token-contract/node-requirement`, `layering/core`. A cap is raised on purpose only; a `cap` section matches its `## <name>` heading line whole.
- `layering/core` holds `viber/lib` modules (adapters and `ports.ts` apart) to import no file system, process, network or OS module, the entries (`viber/scripts/*.ts`, the sixteen skill entries `summary-path.ts`, `strip-tag.ts`, `handoff-path.ts`, `qa-ledger.ts`, `tree-record.ts`, `diff-files.ts`, `synthesize.ts`, `reach.ts`, `extension.ts`, `frame.ts`, `lint_skill.ts`, `keep-units.ts`, `hunt-return.ts`, `rules-map.ts`, `memory-map.ts` and `merge-settings.ts` named whole, `tools/lint/run.ts`) to 40 lines, every `viber/lib/config` module to a unit test of its name in `tests/viber/config` and every other `viber/lib` module to one in `tests/viber/lib`, and the unit directories (`tests/viber/config`, `tests/viber/lib`, `tests/tools/lint`) off every spawning or network module and off the shared scene.
- The rules read the git index: a new file is checked only after `git add`.

## Commands

- The whole lint, as the CI lint job runs it: `node tools/lint/run.ts`; one rule or type: `node tools/lint/run.ts forbidden`.
- The tests of the engine and the types: `node --test "tests/tools/lint/*.unit.test.ts"`.

## Change together

- `globToRegExp` in `rules/forbidden.ts` and `rules/layering.ts`: one copy each.
- The switch table of `data/invocations.ts` mirrors the keys of `viber/lib/switch-text.ts`.
- The `Node.js 22.18` token of `data/node-requirement.ts`: `README.md`, `viber/README.md`, `help.html` and `viber/hooks/content/node-missing.md` carry it.
- The test-file budget of `data/tiers.ts` counts `test(` call sites of the legacy critical files.

## Traps

- The dash characters are built from `String.fromCharCode` in `data/dashes.ts` and in the forbidden test: the editing tools decode a written escape into the dash itself.
- An untracked file holding a dash passes `forbidden/dashes` until it is added: grep a new file before trusting a green run.
- `forbidden` reads every tracked path under `**`, binary files included.
- A unit test of a type must not spawn git: "reports nothing on the tree" is proven by running `node tools/lint/run.ts <type>`, never by a unit test.
