- Blocking [task] tests/tools/lint/layering.unit.test.ts:97 - the unit test spawns git and reads the real file system: it breaks C8 (`*.unit.test.ts` in process, no outside world) and test-strategy `Single`
    Lines 97-102 load `repoTree` with the real `nodeFs` and `gitCommand` adapters. `gitCommand` calls `execFileSync("git", ...)` (viber/lib/adapters/git.ts:6,11), so a `*.unit.test.ts` under `tests/tools/lint` starts a subprocess. The dynamic import also gets past the instance's own `unitForbidden` sweep. The tree check also duplicates the task's `Verification` run `node tools/lint/run.ts layering`, which reports `lint: 0 findings, 1 rules` with exit 0 and which the lint job runs. Deleting the block would leave every regression still caught.
    Remove the repository tree check from the unit test (lines 97-102). Leave the "reports nothing on the tree" part of DoD.5 to the lint run in `Verification`, the way forbidden.unit.test.ts does for the dash instance.
- Blocking [task] tests/tools/lint/layering.unit.test.ts:78 - test-strategy `Earned`: lines 78-96 compare each field of the instance's params with a literal copy of tools/lint/data/layering.ts
    The assertions mirror a data holder, so they are true by construction. They also fail on a refactor that keeps the observed behaviour. For example, reordering `outside` or `unitForbidden` breaks the `deepEqual` while the lint still reports the same findings. They never show that the instance makes the rule report anything. The round 1 fix asked for one more such literal. That fix was wrong, and this finding replaces it.
    Prove DoD.5 through behaviour instead, following the dash-instance test at tests/tools/lint/forbidden.unit.test.ts:31.
    Make one test that runs `layering.check(treeOf({...}), rules[0].params)` with a single literal list of expected findings. The fixture tree holds:
    - a `viber/lib/config/*.ts` module that imports each of the six outside modules
    - a module under `viber/lib/adapters` that imports `node:fs`
    - `viber/lib/ports.ts` with no test
    - a `viber/lib` module outside `viber/lib/config`
    - a `viber/scripts/*.ts` entry and `tools/lint/run.ts`, each with 41 code lines
    - unit test files under `tests/viber/config`, `tests/viber/lib` and `tests/tools/lint` that import between them the four forbidden node modules and the five harness helpers
    - a unit test outside those three directories that imports one of them
