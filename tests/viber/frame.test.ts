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

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/code-auditor/scripts/frame.sh");
const SKILL_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/code-auditor"));
const LENSES = ["bugs", "security", "web-performance", "runtime-performance", "tests", "design"];
const LENS_LIST = "(lenses: bugs, security, web-performance, runtime-performance, tests, design)";
const ARGUMENT_STOP = "STOP: code-auditor: give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]\n";

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function frame(shell: Shell, repo: GitRepo, args: string[], cwd: string = repo.dir): Promise<RunResult> {
  return await runScript(SUT, args, { shell, cwd, env: repo.env });
}

async function git(repo: GitRepo, ...args: string[]): Promise<string> {
  const result = await repo.git(...args);
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function write(repo: GitRepo, rel: string, content: string) {
  const file = path.join(repo.dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Writes the files, commits them all, returns the new commit sha. */
async function commitFiles(repo: GitRepo, files: Record<string, string>): Promise<string> {
  for (const [rel, content] of Object.entries(files)) write(repo, rel, content);
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "commit");
  return await git(repo, "rev-parse", "HEAD");
}

/** The harness keeps its git config file in the repo dir; no commit has swept it up in a fresh repo. */
function hideHarnessConfig(repo: GitRepo) {
  write(repo, ".git/info/exclude", ".gitconfig-global\n");
}

async function rootOf(repo: GitRepo): Promise<string> {
  return await git(repo, "rev-parse", "--show-toplevel");
}

function lines(...rows: string[]): string {
  return rows.map((row) => `${row}\n`).join("");
}

function assertStdout(result: RunResult, expected: string) {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  assert.equal(result.stdout, expected);
}

function assertWroteNothing(repo: GitRepo) {
  assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false, "a run that is not framed writes no workspace");
}

/** Asserts stdout is the RUN line for a workspace under the root and returns that workspace. */
function workspaceOf(result: RunResult, root: string): string {
  assert.equal(result.status, 0, `unexpected exit status: stderr=${result.stderr}`);
  const match = /^RUN: sh "(.+)\/scripts\/map-signals\.sh" "(.+)"\n$/.exec(slash(result.stdout));
  assert.ok(match, `stdout is no RUN line: ${result.stdout}`);
  assert.equal(match[1], SKILL_DIR);
  assert.match(match[2], new RegExp(`^${slash(root).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.temp/viber/code-auditor/\\d{8}-\\d{6}$`));
  return match[2];
}

function runFile(ws: string): string {
  return fs.readFileSync(path.join(ws, "run.md"), "utf-8");
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

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; skillDir: string }> = [
  { label: "a C:\\ path", invoked: SUT, skillDir: SKILL_DIR },
  { label: "a C:/ path", invoked: slash(SUT), skillDir: SKILL_DIR },
  { label: "a /c/ path", invoked: MSYS(SUT), skillDir: MSYS(SKILL_DIR) },
];

for (const row of SPELLINGS) {
  test(`invoked by ${row.label}, a framed run prints its RUN line and writes run.md with the skill paths in that spelling`, { skip: WINDOWS_ONLY }, async () => {
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
