/*
 * frame.test.ts - proves frame.sh's `sh frame.sh [<token>]...` contract (C2):
 * the lens list or scope question when one is missing, every stop line of the
 * Frame phase, and on a framed run the workspace (`reports/`, `worktrees/`,
 * `run.md`) and the `RUN:` line of map-signals.sh, checked as text (map-signals.sh
 * is never run here).
 *
 * frame.sh is `#!/bin/sh` and the skill invokes it as
 * `sh "${CLAUDE_SKILL_DIR}/scripts/frame.sh" ...`, so every case runs through
 * forEachShell("posix", ...) via opts.shell. Each case builds its own throwaway
 * repo; no case shares state with another. The root a case expects is the
 * `git rev-parse --show-toplevel` of its repo, the value frame.sh resolves too.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/frame.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import {
  SKILL_DIR,
  LENS_LIST,
  assertPosix,
  frame,
  git,
  write,
  commitFiles,
  rootOf,
  lines,
  assertStdout,
  assertWroteNothing,
  workspaceOf,
  runFile,
} from "./frame-fixture.ts";

const LENSES = ["bugs", "security", "web-performance", "runtime-performance", "tests", "design"];
const ARGUMENT_STOP = "STOP: code-auditor: give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]\n";

/** The harness keeps its git config file in the repo dir; no commit has swept it up in a fresh repo. */
function hideHarnessConfig(repo: GitRepo) {
  write(repo, ".git/info/exclude", ".gitconfig-global\n");
}

const NO_LENS_ROWS: Array<{ label: string; args: string[]; stdout: string }> = [
  { label: "no token", args: [], stdout: lines("NEXT: ask-lens | numbers: 1-6") },
  { label: "the performance group token", args: ["performance"], stdout: lines("NEXT: ask-lens | numbers: 3,4") },
  { label: "the quality group token", args: ["quality"], stdout: lines("NEXT: ask-lens | numbers: 5,6") },
  { label: "a directory token only", args: ["src/api"], stdout: lines("NEXT: ask-lens | numbers: 1-6", "scope: src/api") },
  { label: "the diff scope with a base only", args: ["diff:abc123"], stdout: lines("NEXT: ask-lens | numbers: 1-6", "scope: diff:abc123") },
  { label: "the performance group and the repo scope", args: ["performance", "repo"], stdout: lines("NEXT: ask-lens | numbers: 3,4", "scope: repo") },
  { label: "a scope then the quality group", args: ["diff", "quality"], stdout: lines("NEXT: ask-lens | numbers: 5,6", "scope: diff") },
];

for (const row of NO_LENS_ROWS) {
  test(`${row.label} with no lens prints the lens list numbers (carrying the scope token given) and writes nothing`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        assertStdout(await frame(shell, repo, row.args), row.stdout);
        assertWroteNothing(repo);
      });
    });
  });
}

for (const lens of LENSES) {
  test(`the ${lens} lens alone beside a directory named ${lens} asks the scope question for the lens and writes nothing (the name reads as the lens, never the directory)`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { [`${lens}/a.txt`]: "1\n" });
        assertStdout(
          await frame(shell, repo, [lens]),
          lines("ASK: changes -> diff | directory -> directory | whole repository -> repo", `lens: ${lens}`),
        );
        assertWroteNothing(repo);
      });
    });
  });

  test(`the ${lens} lens beside ./${lens} frames a run on the directory of that name`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { [`${lens}/a.txt`]: "1\n" });
        const root = await rootOf(repo);
        const ws = workspaceOf(await frame(shell, repo, [lens, `./${lens}`]), root);
        assert.equal(
          runFile(ws),
          lines(
            `Lens: ${lens}`,
            `Lens file: ${SKILL_DIR}/references/lenses/${lens}.md`,
            `Scope: ${lens}`,
            `Target root: ${slash(root)}`,
          ),
        );
      });
    });
  });
}

const ARGUMENT_ROWS: Array<{ label: string; args: string[] }> = [
  { label: "two lens tokens", args: ["bugs", "security"] },
  { label: "two scope tokens", args: ["diff", "repo"] },
  { label: "two directory tokens", args: ["src", "docs"] },
  { label: "a lens beside a group token", args: ["bugs", "performance"] },
  { label: "three tokens", args: ["bugs", "repo", "src"] },
];

for (const row of ARGUMENT_ROWS) {
  test(`${row.label} print the argument stop line and write nothing`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { "src/a.txt": "1\n", "docs/a.txt": "1\n" });
        assertStdout(await frame(shell, repo, row.args), ARGUMENT_STOP);
        assertWroteNothing(repo);
      });
    });
  });
}

const DIRECTORY_ROWS: Array<{ label: string; token: string; value: string }> = [
  { label: "a directory that does not exist", token: "missing/dir", value: "missing/dir" },
  { label: "a file that is no directory", token: "src/a.txt", value: "src/a.txt" },
  { label: "a directory above the root", token: "../outside", value: "../outside" },
  { label: "an existing directory reached through a .. segment", token: "src/../src", value: "src/../src" },
  { label: "an absolute path to a directory that does not exist under the root", token: "/no-such-dir-p2p2/x", value: "/no-such-dir-p2p2/x" },
  { label: "the --apostrophe token", token: "--apostrophe", value: "<token>" },
];

for (const row of DIRECTORY_ROWS) {
  test(`${row.label} stops with the directory line naming ${row.value}, writing nothing`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { "src/a.txt": "1\n" });
        const root = await rootOf(repo);
        assertStdout(
          await frame(shell, repo, ["bugs", row.token]),
          lines(`STOP: code-auditor: area directory not found under ${root}: ${row.value} ${LENS_LIST}`),
        );
        assertWroteNothing(repo);
      });
    });
  });
}

test("an absolute directory that exists outside the root stops with the directory line", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await withTempDir("p2p2-outside-", async (outside) => {
        await commitFiles(repo, { "src/a.txt": "1\n" });
        const root = await rootOf(repo);
        assertStdout(
          await frame(shell, repo, ["bugs", outside]),
          lines(`STOP: code-auditor: area directory not found under ${root}: ${outside} ${LENS_LIST}`),
        );
        assertWroteNothing(repo);
      });
    });
  });
});

test("an unknown diff base stops with the diff base line", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitFiles(repo, { "a.txt": "1\n" });
      assertStdout(
        await frame(shell, repo, ["bugs", "diff:no-such-commit"]),
        lines("STOP: code-auditor: diff base not found: no-such-commit"),
      );
      assertWroteNothing(repo);
    });
  });
});

test("the diff scope outside a git repository stops with the repository line", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await withTempDir("p2p2-nonrepo-", async (dir) => {
        assertStdout(
          await frame(shell, repo, ["bugs", "diff"], dir),
          lines("STOP: code-auditor: the diff scope needs a git repository"),
        );
        assert.equal(fs.existsSync(path.join(dir, ".temp")), false);
      });
    });
  });
});

test("the diff scope with nothing changed stops naming the base it measured from", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      await commitFiles(repo, { "a.txt": "1\n" });
      assertStdout(
        await frame(shell, repo, ["bugs", "diff"]),
        lines("STOP: code-auditor: nothing changed against HEAD"),
      );
      assertWroteNothing(repo);
    });
  });
});

test("the diff scope under a lens that verifies on a clean checkout, in a repository with no commit yet, stops with the no-commit line", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      hideHarnessConfig(repo);
      write(repo, "untracked.txt", "1\n");
      assertStdout(
        await frame(shell, repo, ["bugs", "diff"]),
        lines("STOP: code-auditor: bugs verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens"),
      );
      assertWroteNothing(repo);
    });
  });
});

const NO_COMMIT_ROWS: Array<{ label: string; args: string[] }> = [
  { label: "the repo scope under bugs", args: ["bugs", "repo"] },
  { label: "a directory scope under security", args: ["security", "src"] },
];

for (const row of NO_COMMIT_ROWS) {
  test(`${row.label} in a repository with no commit stops with the clean checkout line`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        hideHarnessConfig(repo);
        write(repo, "src/a.txt", "1\n");
        const root = await rootOf(repo);
        assertStdout(
          await frame(shell, repo, row.args),
          lines(`STOP: code-auditor: ${row.args[0]} verifies on a clean checkout and ${root} holds no git commit: commit first, or pick the design lens`),
        );
        assertWroteNothing(repo);
      });
    });
  });
}

test("the design lens frames the repo scope in a repository with no commit (it reads Worktree: none)", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      hideHarnessConfig(repo);
      write(repo, "src/a.txt", "1\n");
      const root = await rootOf(repo);
      const ws = workspaceOf(await frame(shell, repo, ["design", "repo"]), root);
      assert.equal(
        runFile(ws),
        lines("Lens: design", `Lens file: ${SKILL_DIR}/references/lenses/design.md`, "Scope: repo", `Target root: ${slash(root)}`),
      );
    });
  });
});

const SCOPE_ROWS: Array<{ label: string; token: (root: string) => string; scope: string }> = [
  { label: "a relative directory", token: () => "src/api", scope: "src/api" },
  { label: "a relative directory with a leading ./", token: () => "./src/api", scope: "src/api" },
  { label: "an absolute directory under the root", token: (root) => `${root}/src/api`, scope: "src/api" },
  { label: "a directory named diff", token: () => "./diff", scope: "./diff" },
  { label: "an absolute directory named repo", token: (root) => `${root}/repo`, scope: "./repo" },
];

for (const row of SCOPE_ROWS) {
  test(`${row.label} is recorded as Scope: ${row.scope}`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { "src/api/a.txt": "1\n", "diff/a.txt": "1\n", "repo/a.txt": "1\n" });
        const root = await rootOf(repo);
        const ws = workspaceOf(await frame(shell, repo, ["bugs", row.token(root)]), root);
        assert.equal(
          runFile(ws),
          lines("Lens: bugs", `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`, `Scope: ${row.scope}`, `Target root: ${slash(root)}`),
        );
      });
    });
  });
}

test("a framed diff run records the merge base and every changed path under Changed files", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const mainSha = await commitFiles(repo, { "base.txt": "1\n" });
      await git(repo, "checkout", "-b", "feature");
      await commitFiles(repo, { "committed.txt": "1\n" });
      write(repo, "untracked.txt", "1\n");
      const root = await rootOf(repo);
      const ws = workspaceOf(await frame(shell, repo, ["bugs", "diff"]), root);
      assert.equal(
        runFile(ws),
        lines(
          "Lens: bugs",
          `Lens file: ${SKILL_DIR}/references/lenses/bugs.md`,
          "Scope: diff",
          `Target root: ${slash(root)}`,
          `Base: ${mainSha}`,
          "",
          "## Changed files",
          "committed.txt",
          "untracked.txt",
        ),
      );
    });
  });
});

test("a framed diff:<sha> run records that commit as the base", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      const first = await commitFiles(repo, { "a.txt": "1\n" });
      await commitFiles(repo, { "b.txt": "1\n" });
      const root = await rootOf(repo);
      const ws = workspaceOf(await frame(shell, repo, ["security", `diff:${first}`]), root);
      assert.equal(
        runFile(ws),
        lines(
          "Lens: security",
          `Lens file: ${SKILL_DIR}/references/lenses/security.md`,
          "Scope: diff",
          `Target root: ${slash(root)}`,
          `Base: ${first}`,
          "",
          "## Changed files",
          "b.txt",
        ),
      );
    });
  });
});

test("the design lens frames the diff scope in a repository with no commit and records Base: none", async () => {
  await assertPosix(async (shell) => {
    await withGitRepo(async (repo) => {
      hideHarnessConfig(repo);
      write(repo, "untracked.txt", "1\n");
      const root = await rootOf(repo);
      const ws = workspaceOf(await frame(shell, repo, ["design", "diff"]), root);
      assert.equal(
        runFile(ws),
        lines(
          "Lens: design",
          `Lens file: ${SKILL_DIR}/references/lenses/design.md`,
          "Scope: diff",
          `Target root: ${slash(root)}`,
          "Base: none",
          "",
          "## Changed files",
          "untracked.txt",
        ),
      );
    });
  });
});

for (const lens of LENSES) {
  test(`the ${lens} lens frames a run whose Lens file is an existing file of references/lenses`, async () => {
    await assertPosix(async (shell) => {
      await withGitRepo(async (repo) => {
        await commitFiles(repo, { "a.txt": "1\n" });
        const root = await rootOf(repo);
        const ws = workspaceOf(await frame(shell, repo, [lens, "repo"]), root);
        const match = /^Lens file: (.+)$/m.exec(runFile(ws));
        assert.ok(match, "run.md carries a Lens file line");
        assert.equal(slash(match[1]), `${SKILL_DIR}/references/lenses/${lens}.md`);
        assert.equal(fs.statSync(match[1]).isFile(), true);
      });
    });
  });
}
