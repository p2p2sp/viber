/*
 * rules-map.critical.test.ts - the critical tier of
 * viber/skills/rules/scripts/rules-map.sh: map mode scores a rule against
 * tracked files, reset deletes clean rules and refuses unfit targets without
 * deleting anything, and backslash paths and Windows invocation spellings are
 * handled.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by rules-map.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/rules-map.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo } from "../harness/tmp.ts";
import {
  SUT,
  run,
  write,
  seed,
  rule,
  lines,
  section,
  QUOTED_NAMES,
  seedQuotedNames,
  findings,
  ANY_TS,
} from "./rules-map-fixture.ts";

test("map mode scores a rule and counts only the tracked files its globs match", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["src/*.ts"]);
    await seed(repo, {
      "src/a.ts": "a\n",
      "src/b.ts": "b\n",
      "src/deep/c.ts": "c\n",
      "docs/x.md": "x\n",
      ".claude/rules/code.md": body,
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "state"), ["complete"]);
    assert.deepEqual(section(result.stdout, "rule"), [
      `.claude/rules/code.md ${Buffer.byteLength(body)} paths src/*.ts matches 2 ok`,
    ]);
    assert.deepEqual(section(result.stdout, "total"), [`${Buffer.byteLength(body)} ok`]);
  });
});

test('map mode counts tracked paths holding " or \\ as tracked and matching (git quotes them in its plain listing)', QUOTED_NAMES, async () => {
  await withGitRepo(async (repo) => {
    await seedQuotedNames(repo);
    const lib = rule(["lib/*.ts"]);

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "dirty"), []);
    assert.deepEqual(section(result.stdout, "dead"), []);
    assert.ok(
      section(result.stdout, "rule").includes(
        `.claude/rules/lib.md ${Buffer.byteLength(lib)} paths lib/*.ts matches 2 ok`,
      ),
    );
  });
});

test("reset deletes every clean rule it is given", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/one.md": rule(["src/*.ts"]),
      ".claude/rules/two.md": rule(["src/*.ts"]),
    });

    const result = await run(repo, ["--reset", ".claude/rules/one.md", ".claude/rules/two.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [
      "removed: .claude/rules/one.md",
      "removed: .claude/rules/two.md",
      "removed: 2",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "one.md")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "two.md")), false);
  });
});

test("reset names every unfit target and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      "docs/loose.md": "# not a rule\n",
      ".claude/rules/one.md": rule(["src/*.ts"]),
      ".claude/rules/edited.md": rule(["src/*.ts"]),
    });
    write(repo, ".claude/rules/edited.md", rule(["src/*.ts"], "# edited\n"));
    write(repo, ".claude/rules/fresh.md", rule(["src/*.ts"]));

    const result = await run(repo, [
      "--reset",
      ".claude/rules/one.md",
      ".claude/rules/edited.md",
      ".claude/rules/fresh.md",
      ".claude/rules/gone.md",
      "docs/loose.md",
    ]);

    assert.equal(result.status, 3);
    assert.deepEqual(lines(result.stdout), [
      "refused: .claude/rules/edited.md modified",
      "refused: .claude/rules/fresh.md untracked",
      "refused: .claude/rules/gone.md missing",
      "refused: docs/loose.md not-a-rule",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "one.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs", "loose.md")), true);
  });
});

/** The ways a caller can spell the path it invokes the script by, each with the
 *  plugin root the script must print for it: on Windows the native `C:\...`, the
 *  mixed `C:/...` and the MSYS `/c/...` spellings, elsewhere the one absolute path. */
function invocations(): { form: string; script: string; root: string }[] {
  const plugin = path.resolve(import.meta.dirname, "../../viber");
  if (process.platform !== "win32") return [{ form: "absolute", script: SUT, root: plugin }];
  const msys = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
  return [
    { form: "C:\\", script: path.win32.normalize(SUT), root: slash(plugin) },
    { form: "C:/", script: slash(SUT), root: slash(plugin) },
    { form: "/c/", script: msys(SUT), root: msys(plugin) },
  ];
}

/** The `refs:` lines of a stdout, read raw: a backslash must not be normalized away. */
function refsLines(stdout: string): string[] {
  return stdout.trim().split("\n").filter((line) => line.startsWith("refs: "));
}

for (const { form, script, root } of invocations()) {
  test(`brief invoked by a ${form} path prints the references path in that spelling`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo, { "src/a.ts": "a\n", ".claude/rules/code.md": rule([ANY_TS]) });

      const result = await runScript(script, ["--brief", "run1", ".claude/rules/code.md"], {
        cwd: repo.dir,
        env: repo.env,
        shell: "bash",
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(refsLines(result.stdout), [`refs: ${root}/references`]);
    });
  });

  test(`confirm invoked by a ${form} path prints the writer block's references path in that spelling`, async () => {
    await withGitRepo(async (repo) => {
      await seed(repo, { "src/a.ts": "a\n", ".claude/rules/code.md": rule([ANY_TS]) });
      findings(repo, "run1", "code-audit.md", "STALE: x -> y\n");

      const result = await runScript(script, ["--confirm", "run1", ".claude/rules/code.md"], {
        cwd: repo.dir,
        env: repo.env,
        shell: "bash",
      });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(refsLines(result.stdout), [`refs: ${root}/references`]);
    });
  });
}
