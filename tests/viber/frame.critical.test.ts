/*
 * frame.critical.test.ts - the critical tier of
 * viber/skills/code-auditor/scripts/frame.sh, the wrapper of the frame.ts
 * entry: a framed run writes its directories and run.md and prints the RUN
 * line, and drive-letter, backslash and /c/ spellings of the script and of the
 * scope directory behave correctly on Windows.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the token
 * rules, the questions, every stop line and the scope forms are proven in
 * process by tests/viber/lib/frame.unit.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/frame.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import {
  SUT,
  SKILL_DIR,
  LENS_LIST,
  assertPosix,
  frame,
  commitFiles,
  rootOf,
  lines,
  assertStdout,
  assertWroteNothing,
  workspaceOf,
  runFile,
} from "./frame-fixture.ts";

test("a framed repo run writes the reports and worktrees directories and run.md, then prints the RUN line of map-signals.sh", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitFiles(repo, { "src/a.txt": "1\n" });
      const root = await rootOf(repo);
      const ws = workspaceOf(await frame(shell, repo, ["security", "repo"]), root);
      assert.equal(fs.statSync(path.join(ws, "reports")).isDirectory(), true);
      assert.equal(fs.statSync(path.join(ws, "worktrees")).isDirectory(), true);
      assert.equal(
        runFile(ws),
        lines(
          "Lens: security",
          `Lens file: ${SKILL_DIR}/references/lenses/security.md`,
          "Scope: repo",
          `Target root: ${slash(root)}`,
        ),
      );
    });
  });
});

// Every invoked spelling prints the C:/ form: the MSYS runtime hands node the entry path of a /c/ call as C:/...
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; skillDir: string }> = [
  { label: "a C:\\ path", invoked: SUT, skillDir: SKILL_DIR },
  { label: "a C:/ path", invoked: slash(SUT), skillDir: SKILL_DIR },
  { label: "a /c/ path", invoked: MSYS(SUT), skillDir: SKILL_DIR },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, a framed run prints its RUN line and writes run.md with the skill paths in the C:/ form`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        const result = await runScript(row.invoked, ["design", "repo"], { shell, cwd: repo.dir, env: repo.env });
        assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
        const match = /^RUN: sh "(.+)\/scripts\/map-signals\.sh" "(.+)"\n$/.exec(result.stdout);
        assert.ok(match, `stdout is no RUN line: ${result.stdout}`);
        assert.equal(match[1], row.skillDir);
        assert.ok(runFile(match[2]).includes(`Lens file: ${row.skillDir}/references/lenses/design.md\n`), runFile(match[2]));
      });
    });
  });
}

// An absolute area token on Windows names the same directory in three spellings: the root's `C:/` form,
// a `C:\` form and the `/c/` form (handed to node as `C:/` by the MSYS runtime), and a drive letter of either case.
// Each is read as the root's own form.
const flipDrive = (p: string) => p.replace(/^([A-Za-z]):/, (_, drive: string) => `${drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()}:`);

const WINDOWS_FORM_ROWS: Array<{ label: string; token: (root: string) => string }> = [
  { label: "the root in /c/ form", token: (root) => `${MSYS(root)}/src` },
  { label: "the root in C:\\ form", token: (root) => `${slash(root).replace(/\//g, "\\")}\\src` },
  { label: "the root with the other case of its drive letter", token: (root) => `${flipDrive(slash(root))}/src` },
  { label: "the root in /c/ form with a trailing slash", token: (root) => `${MSYS(root)}/src/` },
];

for (const row of WINDOWS_FORM_ROWS) {
  test(`a src directory given as ${row.label} frames with Scope: src`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { "src/a.txt": "1\n" });
        const root = await rootOf(repo);
        const ws = workspaceOf(await frame(shell, repo, ["bugs", row.token(root)]), root);
        assert.equal(
          runFile(ws),
          lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, "Scope: src", `Target root: ${slash(root)}`),
        );
      });
    });
  });
}

test("an existing directory outside the root given in /c/ form keeps the directory stop, naming the C:/ form node was handed", { skip: WINDOWS_ONLY }, async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await withTempDir("p2p2-outside-", async (outside) => {
        await commitFiles(repo, { "src/a.txt": "1\n" });
        const root = await rootOf(repo);
        const handed = slash(outside).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
        assertStdout(
          await frame(shell, repo, ["bugs", MSYS(outside)]),
          lines(`STOP: code-auditor: area directory not found under ${root}: ${handed} ${LENS_LIST}`),
        );
        assertWroteNothing(repo);
      });
    });
  });
});
