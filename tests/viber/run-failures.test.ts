/*
 * run-failures.test.ts - proves viber/scripts/run-failures.sh's contract: with no
 * model involved it turns the Blocking findings of a run's review reports and the
 * lines of its final test run reports into the run's `failures.md`, one entry per
 * line as `- <cause> | <source> | <text>`, and prints one line of counts per cause.
 *
 * Properties that carry the design. A Blocking first line `- Blocking [<cause>] ...`
 * becomes an entry carrying the bracket's cause; a missing bracket, or one holding
 * none of the four reviewer causes, is recorded as `unknown` rather than dropped. A
 * Minor line and an indented continuation line yield nothing. Entries are ordered by
 * the report's file name in byte order, then by report order, so the same reports
 * always give the same file. `failures.md` exists only while it holds an entry: a
 * call with none removes a stale one, a call with some replaces the file whole. The
 * caller takes the printed line as it stands, so stdout (one line, nothing on a
 * refusal) and the exit codes (2: unusable argv, 3: `failures.md` could not be
 * written or removed) are the whole interface.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/run-failures.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SUT = path.resolve(REPO_ROOT, "viber/scripts/run-failures.sh");
const SUT_REL = "viber/scripts/run-failures.sh";

const STATUS = ["# status", "", "progress: 1/1", "done: T1", "skipped: none", ""].join("\n");

/** A run directory holding `status.md` and the named files under `work/`. */
function seedRun(root: string, work: Record<string, string>, name = "run"): string {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "work"), { recursive: true });
  fs.writeFileSync(path.join(dir, "status.md"), STATUS);
  for (const [file, body] of Object.entries(work)) fs.writeFileSync(path.join(dir, "work", file), body);
  return dir;
}

function lines(...parts: string[]): string {
  return parts.join("\n") + "\n";
}

function run(cwd: string, args: string[]) {
  return runScript(SUT, args, { cwd, shell: "bash" });
}

function failuresFile(dir: string): string {
  return path.join(dir, "failures.md");
}

function readFailures(dir: string): string {
  return fs.readFileSync(failuresFile(dir), "utf8");
}

const NO_ENTRY_REPORT = lines("VERDICT: PASS", "", "- Minor src/a.ts:3 - a name is vague", "  rename it");

// --- DoD.1: a Blocking first line becomes one entry, ordered ---

test("a Blocking first line of a review report becomes one entry carrying its cause, its source and the text after the bracket", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-T1-1.md": lines("VERDICT: FAIL", "", "- Blocking [convention] src/a.ts:12 - reads the file twice", "  read it once"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- convention | review-T1-1 | src/a.ts:12 - reads the file twice"));
  });
});

test("a Blocking first line of a final review report is read as one, its source the file name without .md", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "final-review-recheck-2.md": lines("- Blocking [place] src/b.ts:4 - the cache is shared across requests", "  copy it"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- place | final-review-recheck-2 | src/b.ts:4 - the cache is shared across requests"));
  });
});

test("entries are ordered by source name in byte order, then by report order inside a source", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-a1-1.md": lines("- Blocking [task] x.ts:1 - lower case sorts after upper case in bytes"),
      "review-T9-1.md": lines("- Blocking [plan] y.ts:2 - upper case first"),
      "review-T1-10.md": lines("- Blocking [task] z.ts:3 - ten"),
      "review-T1-2.md": lines("- Blocking [place] w.ts:5 - two, first line of the report", "- Blocking [task] w.ts:4 - two, second line of the report", "  fix"),
      "final-review-a.md": lines("- Blocking [convention] v.ts:6 - final review first"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFailures(dir),
      lines(
        "# Failures",
        "",
        "- convention | final-review-a | v.ts:6 - final review first",
        "- task | review-T1-10 | z.ts:3 - ten",
        "- place | review-T1-2 | w.ts:5 - two, first line of the report",
        "- task | review-T1-2 | w.ts:4 - two, second line of the report",
        "- plan | review-T9-1 | y.ts:2 - upper case first",
        "- task | review-a1-1 | x.ts:1 - lower case sorts after upper case in bytes",
      ),
    );
  });
});

test("every line of a final test run report but its status line and blank lines becomes a test entry, as written", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "tests-1.md": lines("status: fail", "a case | tests/a.test.ts | expected 1, got 2", "", "another case | tests/b.test.ts | threw | with a pipe"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFailures(dir),
      lines(
        "# Failures",
        "",
        "- test | tests-1 | a case | tests/a.test.ts | expected 1, got 2",
        "- test | tests-1 | another case | tests/b.test.ts | threw | with a pipe",
      ),
    );
  });
});

test("a leading '- ' or '* ' marker of a test report line is removed, any other leading character is kept", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "tests-1.md": lines("status: fail", "- a case | tests/a.test.ts | dash marker", "* b case | tests/b.test.ts | star marker", "-c case | tests/c.test.ts | no space", "  - d case | tests/d.test.ts | indented"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFailures(dir),
      lines(
        "# Failures",
        "",
        "- test | tests-1 | a case | tests/a.test.ts | dash marker",
        "- test | tests-1 | b case | tests/b.test.ts | star marker",
        "- test | tests-1 | -c case | tests/c.test.ts | no space",
        "- test | tests-1 |   - d case | tests/d.test.ts | indented",
      ),
    );
  });
});

test("the baseline test report and a tests report whose suffix is not a round number are not read", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "tests-baseline.md": lines("status: fail", "old case | tests/a.test.ts | already failing"),
      "tests-2x.md": lines("status: fail", "odd case | tests/a.test.ts | not a round"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "failures: 0 convention 0 place 0 plan 0 task 0 test 0 unknown 0\n");
    assert.equal(fs.existsSync(failuresFile(dir)), false);
  });
});

// --- DoD.2: unknown cause, Minor and continuation lines ---

test("a Blocking first line with no bracket is recorded as unknown, its text everything after the word Blocking", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking src/a.ts:9 - no cause given", "  fix it") });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- unknown | review-T1-1 | src/a.ts:9 - no cause given"));
  });
});

test("a Blocking first line whose bracket holds no reviewer cause is recorded as unknown, its text everything after the bracket", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-T1-1.md": lines("- Blocking [test] src/a.ts:9 - the script alone assigns test", "- Blocking [flaky] src/b.ts:1 - not a cause", "- Blocking [] src/c.ts:2 - empty"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFailures(dir),
      lines(
        "# Failures",
        "",
        "- unknown | review-T1-1 | src/a.ts:9 - the script alone assigns test",
        "- unknown | review-T1-1 | src/b.ts:1 - not a cause",
        "- unknown | review-T1-1 | src/c.ts:2 - empty",
      ),
    );
  });
});

test("a Minor line and an indented continuation line yield no entry, even one that reads like a Blocking item", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-T1-1.md": lines(
        "- Minor src/a.ts:3 - a name is vague",
        "  - Blocking [task] src/a.ts:4 - quoted inside a continuation",
        "  rename it",
        "- Blocking [task] src/b.ts:5 - the one real finding",
        "  see the contract",
      ),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | src/b.ts:5 - the one real finding"));
  });
});

// --- DoD.3: the counts line ---

test("stdout is the one counts line, each count matching the entries written", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, {
      "review-T1-1.md": lines(
        "- Blocking [convention] a.ts:1 - one",
        "- Blocking [place] a.ts:2 - two",
        "- Blocking [plan] a.ts:3 - three",
        "- Blocking [task] a.ts:4 - four",
        "- Blocking [task] a.ts:5 - five",
        "- Blocking a.ts:6 - six",
      ),
      "tests-1.md": lines("status: fail", "case | f.test.ts | boom"),
    });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "failures: 7 convention 1 place 1 plan 1 task 2 test 1 unknown 1\n");
    assert.equal(readFailures(dir).split("\n").filter((line) => line.startsWith("- ")).length, 7);
  });
});

// --- DoD.4: the file exists only while it holds an entry ---

test("with no entry the call writes no failures.md and prints zero counts", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": NO_ENTRY_REPORT, "tests-1.md": "status: pass\n" });
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "failures: 0 convention 0 place 0 plan 0 task 0 test 0 unknown 0\n");
    assert.equal(fs.existsSync(failuresFile(dir)), false);
  });
});

test("with no entry the call removes a failures.md already there", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": NO_ENTRY_REPORT });
    fs.writeFileSync(failuresFile(dir), lines("# Failures", "", "- task | review-T1-1 | stale"));
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(failuresFile(dir)), false);
  });
});

test("with entries the call replaces an existing failures.md whole", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - fresh") });
    fs.writeFileSync(failuresFile(dir), lines("# Failures", "", "- task | review-T1-1 | stale", "- plan | review-T9-1 | gone"));
    const result = await run(tmp, [dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | a.ts:1 - fresh"));
  });
});

test("a second call over the same reports leaves each failure once, never doubled", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    await run(tmp, [dir]);
    const second = await run(tmp, [dir]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | a.ts:1 - once"));
  });
});

test("the call writes failures.md alone: no other file of the run directory changes", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    await run(tmp, [dir]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["failures.md", "status.md", "work"]);
    assert.deepEqual(fs.readdirSync(path.join(dir, "work")), ["review-T1-1.md"]);
  });
});

// --- the run directory argument ---

test("a relative argument resolves against the repository root from a subdirectory of the repository", async () => {
  await withGitRepo(async (repo) => {
    const dir = seedRun(repo.dir, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") }, "docs-run");
    const sub = path.join(repo.dir, "sub");
    fs.mkdirSync(sub);
    const result = await run(sub, ["docs-run"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | a.ts:1 - once"));
  });
});

test("an absolute argument names the run directory wherever the cwd is", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    await withTempDir("p2p2-viber-", async (elsewhere) => {
      const result = await run(elsewhere, [dir]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFailures(dir), lines("# Failures", "", "- task | review-T1-1 | a.ts:1 - once"));
    });
  });
});

test("outside a repository a relative argument resolves against the cwd", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    const result = await run(tmp, ["run"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(failuresFile(dir)), true);
  });
});

// --- DoD.5: refusals ---

function assertRefused(result: { status: number | null; stdout: string; stderr: string }, code: number): void {
  assert.equal(result.status, code);
  assert.equal(result.stdout, "");
  assert.match(result.stderr.trimEnd(), /^error: [^\n]+$/);
}

test("no argument exits 2 with one error line and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    assertRefused(await run(tmp, []), 2);
  });
});

test("more than one argument exits 2 and writes nothing", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const one = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") }, "one");
    const two = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") }, "two");
    assertRefused(await run(tmp, [one, two]), 2);
    assert.equal(fs.existsSync(failuresFile(one)) || fs.existsSync(failuresFile(two)), false);
  });
});

test("a directory that does not exist exits 2", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    assertRefused(await run(tmp, [path.join(tmp, "nowhere")]), 2);
  });
});

test("a directory holding no status.md exits 2 and writes nothing", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    fs.rmSync(path.join(dir, "status.md"));
    assertRefused(await run(tmp, [dir]), 2);
    assert.equal(fs.existsSync(failuresFile(dir)), false);
  });
});

test("a failures.md that cannot be written exits 3 with one error line and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") });
    fs.mkdirSync(failuresFile(dir));
    assertRefused(await run(tmp, [dir]), 3);
  });
});

test("a failures.md that cannot be removed exits 3 with one error line and nothing on stdout", async () => {
  await withTempDir("p2p2-viber-", async (tmp) => {
    const dir = seedRun(tmp, { "review-T1-1.md": NO_ENTRY_REPORT });
    fs.mkdirSync(failuresFile(dir));
    assertRefused(await run(tmp, [dir]), 3);
  });
});

// --- DoD.6: the file as shipped ---

function indexLine(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return result.stdout.trim();
}

test("the script is tracked with mode 100755", () => {
  assert.match(indexLine(["ls-files", "-s", "--", SUT_REL]), /^100755 /);
});

test("the script is stored with LF line endings only", () => {
  assert.match(indexLine(["ls-files", "--eol", "--", SUT_REL]), /^i\/lf\s+w\/lf\s/);
});

/** Whichever of `needles` the header does not carry - the caller asserts the
 *  empty list, so a failure names the missing line rather than just "false". */
function missingFrom(header: string, needles: string[]): string[] {
  return needles.filter((needle) => !header.includes(needle));
}

// The header is the I/O contract a caller trusts (shell-script-header rule), so its
// text is product here and is read as such.
test("the script header opens with the file name and carries the Contract: block a caller trusts", () => {
  const source = fs.readFileSync(SUT, "utf8");
  const header = source.slice(0, source.indexOf("\nset -u"));
  assert.deepEqual(
    missingFrom(header, [
      "#!/usr/bin/env bash\n#\n# run-failures.sh - ",
      "Contract:",
      "argv",
      "cwd",
      "env",
      "reads",
      "writes",
      "stdout",
      "exit",
    ]),
    [],
  );
});
