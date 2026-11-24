/*
 * run-failures.unit.test.ts - the run-failures core on fake ports: with no
 * model involved it turns the Blocking findings of a run's review reports and
 * the lines of its final test run reports into the run's `failures.md`, one
 * entry per line as `- <cause> | <source> | <text>`, and prints one line of
 * counts per cause.
 *
 * Properties that carry the design. A Blocking first line `- Blocking [<cause>] ...`
 * becomes an entry carrying the bracket's cause; a missing bracket, or one
 * holding none of the four reviewer causes, is recorded as `unknown` rather
 * than dropped. A Minor line and an indented continuation line yield nothing.
 * Entries are ordered by the report's file name in byte order, then by report
 * order, so the same reports always give the same file. `failures.md` exists
 * only while it holds an entry: a call with none removes a stale one, a call
 * with some replaces the file whole. The caller takes the printed line as it
 * stands, so stdout (one line, nothing on a refusal) and the exit codes (2:
 * unusable argv, 3: `failures.md` could not be written or removed) are the
 * whole interface.
 *
 * The wrapper is run as a process by tests/viber/run-failures.critical.test.ts;
 * the header of the entry, which a caller trusts, is read as text by
 * tests/viber/failure-trail-prose.unit.test.ts. The exec bit and the line
 * endings of the wrapper are held by the `invocations` and
 * `script-portability` lint rules.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runRunFailures } from "../../../viber/lib/run-failures.ts";

const ROOT = "/r";
const RUN = `${ROOT}/run`;
const STATUS = ["# status", "", "progress: 1/1", "done: T1", "skipped: none", ""].join("\n");
const ZERO = "failures: 0 convention 0 place 0 plan 0 task 0 test 0 unknown 0 runs 0\n";

const lines = (...parts: string[]): string => parts.join("\n") + "\n";

/** A run directory under ROOT holding `status.md` and the named files under `work/`. */
function seedRun(work: Record<string, string>, name = "run"): Record<string, string> {
  const files: Record<string, string> = { [`${ROOT}/${name}/status.md`]: STATUS };
  for (const [file, body] of Object.entries(work)) files[`${ROOT}/${name}/work/${file}`] = body;
  return files;
}

/** An archived run `docs/<archive>/<name>/failures.md` under ROOT. */
const archived = (archive: string, name: string, body: string): Record<string, string> => ({ [`${ROOT}/docs/${archive}/${name}/failures.md`]: body });

interface Scene {
  cwd?: string;
  /** True: ROOT is a repository. Left out: no repository anywhere. */
  repo?: boolean;
  opts?: FakeFsOpts;
}

function run(argv: string[], files: Record<string, string>, scene: Scene = {}) {
  const fs: Fs = fakeFs(files, { dirs: [ROOT], ...scene.opts });
  const result = runRunFailures(argv, scene.cwd ?? ROOT, { fs, git: fakeGit(scene.repo ? { root: ROOT, tracked: [] } : null) });
  return { ...result, fs, trail: fs.readText(`${RUN}/failures.md`) };
}

/** The trail a run over these work files writes, the call having exited 0. */
function trailOf(work: Record<string, string>): string | null {
  const result = run([RUN], seedRun(work));
  assert.equal(result.exit, 0, result.stderr);
  return result.trail;
}

const trail = (...entries: string[]): string => lines("# Failures", "", ...entries);
const runsOf = (stdout: string): string => stdout.trimEnd().split(" ").slice(-2).join(" ");

const NO_ENTRY_REPORT = lines("VERDICT: PASS", "", "- Minor src/a.ts:3 - a name is vague", "  rename it");

// --- a Blocking first line becomes one entry, ordered ---

test("a Blocking first line of a review report becomes one entry carrying its cause, its source and the text after the bracket", () => {
  const work = { "review-T1-1.md": lines("VERDICT: FAIL", "", "- Blocking [convention] src/a.ts:12 - reads the file twice", "  read it once") };
  assert.equal(trailOf(work), trail("- convention | review-T1-1 | src/a.ts:12 - reads the file twice"));
});

test("a Blocking first line of a final review report is read as one, its source the file name without .md", () => {
  const work = { "final-review-recheck-2.md": lines("- Blocking [place] src/b.ts:4 - the cache is shared across requests", "  copy it") };
  assert.equal(trailOf(work), trail("- place | final-review-recheck-2 | src/b.ts:4 - the cache is shared across requests"));
});

test("entries are ordered by source name in byte order, then by report order inside a source", () => {
  const work = {
    "review-a1-1.md": lines("- Blocking [task] x.ts:1 - lower case sorts after upper case in bytes"),
    "review-T9-1.md": lines("- Blocking [plan] y.ts:2 - upper case first"),
    "review-T1-10.md": lines("- Blocking [task] z.ts:3 - ten"),
    "review-T1-2.md": lines("- Blocking [place] w.ts:5 - two, first line of the report", "- Blocking [task] w.ts:4 - two, second line of the report", "  fix"),
    "final-review-a.md": lines("- Blocking [convention] v.ts:6 - final review first"),
  };
  assert.equal(
    trailOf(work),
    trail(
      "- convention | final-review-a | v.ts:6 - final review first",
      "- task | review-T1-10 | z.ts:3 - ten",
      "- place | review-T1-2 | w.ts:5 - two, first line of the report",
      "- task | review-T1-2 | w.ts:4 - two, second line of the report",
      "- plan | review-T9-1 | y.ts:2 - upper case first",
      "- task | review-a1-1 | x.ts:1 - lower case sorts after upper case in bytes",
    ),
  );
});

test("every line of a final test run report but its status line and blank lines becomes a test entry, as written", () => {
  const work = { "tests-1.md": lines("status: fail", "a case | tests/a.test.ts | expected 1, got 2", "", "another case | tests/b.test.ts | threw | with a pipe") };
  assert.equal(trailOf(work), trail("- test | tests-1 | a case | tests/a.test.ts | expected 1, got 2", "- test | tests-1 | another case | tests/b.test.ts | threw | with a pipe"));
});

test("a leading '- ' or '* ' marker of a test report line is removed, any other leading character is kept", () => {
  const work = {
    "tests-1.md": lines("status: fail", "- a case | tests/a.test.ts | dash marker", "* b case | tests/b.test.ts | star marker", "-c case | tests/c.test.ts | no space", "  - d case | tests/d.test.ts | indented"),
  };
  assert.equal(
    trailOf(work),
    trail(
      "- test | tests-1 | a case | tests/a.test.ts | dash marker",
      "- test | tests-1 | b case | tests/b.test.ts | star marker",
      "- test | tests-1 | -c case | tests/c.test.ts | no space",
      "- test | tests-1 |   - d case | tests/d.test.ts | indented",
    ),
  );
});

test("the baseline test report and a tests report whose suffix is not a round number are not read", () => {
  const result = run(
    [RUN],
    seedRun({
      "tests-baseline.md": lines("status: fail", "old case | tests/a.test.ts | already failing"),
      "tests-2x.md": lines("status: fail", "odd case | tests/a.test.ts | not a round"),
    }),
  );
  assert.deepEqual([result.exit, result.stdout, result.trail], [0, ZERO, null]);
});

test("a report line ended by \\r\\n is read without its \\r, and a last line with no line end is read too", () => {
  const work = { "review-T1-1.md": "- Blocking [task] a.ts:1 - one\r\n- Blocking [plan] a.ts:2 - two" };
  assert.equal(trailOf(work), trail("- task | review-T1-1 | a.ts:1 - one", "- plan | review-T1-1 | a.ts:2 - two"));
});

// --- unknown cause, Minor and continuation lines ---

test("a Blocking first line with no bracket is recorded as unknown, its text everything after the word Blocking", () => {
  const work = { "review-T1-1.md": lines("- Blocking src/a.ts:9 - no cause given", "  fix it") };
  assert.equal(trailOf(work), trail("- unknown | review-T1-1 | src/a.ts:9 - no cause given"));
});

test("a Blocking first line whose bracket holds no reviewer cause is recorded as unknown, its text everything after the bracket", () => {
  const work = { "review-T1-1.md": lines("- Blocking [test] src/a.ts:9 - the script alone assigns test", "- Blocking [flaky] src/b.ts:1 - not a cause", "- Blocking [] src/c.ts:2 - empty") };
  assert.equal(
    trailOf(work),
    trail("- unknown | review-T1-1 | src/a.ts:9 - the script alone assigns test", "- unknown | review-T1-1 | src/b.ts:1 - not a cause", "- unknown | review-T1-1 | src/c.ts:2 - empty"),
  );
});

test("a Minor line and an indented continuation line yield no entry, even one that reads like a Blocking item", () => {
  const work = {
    "review-T1-1.md": lines(
      "- Minor src/a.ts:3 - a name is vague",
      "  - Blocking [task] src/a.ts:4 - quoted inside a continuation",
      "  rename it",
      "- Blocking [task] src/b.ts:5 - the one real finding",
      "  see the contract",
    ),
  };
  assert.equal(trailOf(work), trail("- task | review-T1-1 | src/b.ts:5 - the one real finding"));
});

// --- a loosely written Blocking line is read into one entry ---

for (const [name, line, entry] of [
  ["a bracket cause written with capitals is read lower-cased", "- Blocking [Convention] x", "- convention | review-T1-1 | x"],
  ["blanks inside the bracket around the cause are trimmed", "- Blocking [ task ] x", "- task | review-T1-1 | x"],
  ["a bold Blocking marker opens a Blocking line like the plain one", "- **Blocking** [plan] x", "- plan | review-T1-1 | x"],
  ["a cause spelled with a letter outside ASCII that lower-cases into one (the Kelvin sign for k) is no reviewer cause", "- Blocking [TAS\u212a] x", "- unknown | review-T1-1 | x"],
] as const) {
  test(name, () => {
    assert.equal(trailOf({ "review-T1-1.md": lines(line) }), trail(entry));
  });
}

for (const [name, line] of [
  ["a Blocking line whose bracket is followed by no text", "- Blocking [task]"],
  ["a bare Blocking line", "- Blocking"],
  ["a word that only opens on Blocking", "- Blockingly [task] x"],
] as const) {
  test(`${name} yields no entry`, () => {
    const result = run([RUN], seedRun({ "review-T1-1.md": lines(line) }));
    assert.deepEqual([result.exit, result.stdout, result.trail], [0, ZERO, null]);
  });
}

// --- a finding repeated across the review rounds of one task is kept once ---

const REPEATED = "- Blocking [task] src/a.ts:1 - reads the file twice";
const KEPT = "src/a.ts:1 - reads the file twice";

test("the same Blocking line in two rounds of one task's reviews yields one entry, with the first round's source", () => {
  assert.equal(trailOf({ "review-T3-1.md": lines(REPEATED), "review-T3-2.md": lines(REPEATED) }), trail(`- task | review-T3-1 | ${KEPT}`));
});

test("rounds are compared as numbers: round 2 is lower than round 10", () => {
  assert.equal(trailOf({ "review-T2-10.md": lines(REPEATED), "review-T2-2.md": lines(REPEATED) }), trail(`- task | review-T2-2 | ${KEPT}`));
});

test("the same Blocking line in the reviews of two different tasks yields two entries", () => {
  assert.equal(trailOf({ "review-T1-1.md": lines(REPEATED), "review-T2-1.md": lines(REPEATED) }), trail(`- task | review-T1-1 | ${KEPT}`, `- task | review-T2-1 | ${KEPT}`));
});

test("the same Blocking line twice in one review report yields two entries", () => {
  assert.equal(trailOf({ "review-T1-1.md": lines(REPEATED, REPEATED) }), trail(`- task | review-T1-1 | ${KEPT}`, `- task | review-T1-1 | ${KEPT}`));
});

test("the same Blocking line in two final review reports yields two entries", () => {
  assert.equal(trailOf({ "final-review-1.md": lines(REPEATED), "final-review-2.md": lines(REPEATED) }), trail(`- task | final-review-1 | ${KEPT}`, `- task | final-review-2 | ${KEPT}`));
});

test("the same text under two different causes in two rounds of one task yields two entries", () => {
  const work = { "review-T1-1.md": lines("- Blocking [task] src/a.ts:1 - same words"), "review-T1-2.md": lines("- Blocking [plan] src/a.ts:1 - same words") };
  assert.equal(trailOf(work), trail("- task | review-T1-1 | src/a.ts:1 - same words", "- plan | review-T1-2 | src/a.ts:1 - same words"));
});

test("two identical lines of a tests report yield two test entries", () => {
  const work = { "tests-1.md": lines("status: fail", "a case | tests/a.test.ts | boom", "a case | tests/a.test.ts | boom") };
  assert.equal(trailOf(work), trail("- test | tests-1 | a case | tests/a.test.ts | boom", "- test | tests-1 | a case | tests/a.test.ts | boom"));
});

test("the counts line counts the entries kept after a repeated finding is merged", () => {
  const result = run([RUN], seedRun({ "review-T3-1.md": lines(REPEATED), "review-T3-2.md": lines(REPEATED, "- Blocking [place] src/b.ts:2 - a new finding") }));
  assert.deepEqual([result.exit, result.stdout], [0, "failures: 2 convention 0 place 1 plan 0 task 1 test 0 unknown 0 runs 0\n"]);
});

// --- the runs field: archived trails holding a convention entry, plus this run ---

const CONVENTION_REPORT = { "review-T1-1.md": lines("- Blocking [convention] src/a.ts:1 - breaks the naming rule") };
const TASK_REPORT = { "review-T1-1.md": lines(REPEATED) };

test("with no archived trail and one convention entry the counts line ends 'runs 1'", () => {
  const result = run([RUN], seedRun(CONVENTION_REPORT));
  assert.deepEqual([result.exit, result.stdout], [0, "failures: 1 convention 1 place 0 plan 0 task 0 test 0 unknown 0 runs 1\n"]);
});

test("an archived failures.md holding a convention entry and one convention entry in this run end the line 'runs 2'", () => {
  const old = archived("specs", "2026-01-01-00-00-00_old", trail("- task | review-T1-1 | x", "- convention | review-T2-1 | y"));
  assert.equal(runsOf(run([RUN], { ...seedRun(CONVENTION_REPORT), ...old }).stdout), "runs 2");
});

test("an archived trail holding only test entries adds nothing to runs", () => {
  const old = archived("specs", "2026-01-01-00-00-00_old", trail("- test | tests-1 | a case | f.test.ts | boom"));
  assert.equal(runsOf(run([RUN], { ...seedRun(CONVENTION_REPORT), ...old }).stdout), "runs 1");
});

test("an archived trail holding several convention entries counts as one run", () => {
  const old = archived("specs", "2026-01-01-00-00-00_old", trail("- convention | a | x", "- convention | b | y"));
  assert.equal(runsOf(run([RUN], { ...seedRun(TASK_REPORT), ...old }).stdout), "runs 1");
});

test("with no convention entry in this run the count is the archived trails alone", () => {
  const old = { ...archived("specs", "2026-01-01-00-00-00_a", trail("- convention | a | x")), ...archived("specs", "2026-01-02-00-00-00_b", trail("- convention | b | y")) };
  assert.equal(runsOf(run([RUN], { ...seedRun(TASK_REPORT), ...old }).stdout), "runs 2");
});

const TWO_ARCHIVES = { ...archived("archive", "2026-01-01-00-00-00_a", trail("- convention | a | x")), ...archived("specs", "2026-01-02-00-00-00_b", trail("- convention | b | y")), ...archived("specs", "2026-01-03-00-00-00_c", trail("- convention | c | z")) };

test("a 'directories.specifications: archive' config makes it read docs/archive/<run>/failures.md and not docs/specs", () => {
  const config = { [`${ROOT}/.claude/viber.yml`]: lines("directories:", "  runs: _specs", "  specifications: archive") };
  assert.equal(runsOf(run([RUN], { ...seedRun(TASK_REPORT), ...TWO_ARCHIVES, ...config }).stdout), "runs 1");
});

test("with no config file, and with a directories.specifications that is no plain directory name, it reads docs/specs/<run>/failures.md", () => {
  const config = { [`${ROOT}/.claude/viber.yml`]: lines("directories:", "  specifications: ../archive") };
  const results = [run([RUN], { ...seedRun(TASK_REPORT), ...TWO_ARCHIVES }), run([RUN], { ...seedRun(TASK_REPORT), ...TWO_ARCHIVES, ...config })];
  assert.deepEqual(results.map((result) => runsOf(result.stdout)), ["runs 2", "runs 2"]);
});

// --- the counts line ---

test("stdout is the one counts line, each count matching the entries written", () => {
  const result = run(
    [RUN],
    seedRun({
      "review-T1-1.md": lines(
        "- Blocking [convention] a.ts:1 - one",
        "- Blocking [place] a.ts:2 - two",
        "- Blocking [plan] a.ts:3 - three",
        "- Blocking [task] a.ts:4 - four",
        "- Blocking [task] a.ts:5 - five",
        "- Blocking a.ts:6 - six",
      ),
      "tests-1.md": lines("status: fail", "case | f.test.ts | boom"),
    }),
  );
  assert.deepEqual([result.exit, result.stdout], [0, "failures: 7 convention 1 place 1 plan 1 task 2 test 1 unknown 1 runs 1\n"]);
  assert.equal((result.trail ?? "").split("\n").filter((line) => line.startsWith("- ")).length, 7);
});

// --- the file exists only while it holds an entry ---

test("with no entry the call writes no failures.md and prints zero counts", () => {
  const result = run([RUN], seedRun({ "review-T1-1.md": NO_ENTRY_REPORT, "tests-1.md": "status: pass\n" }));
  assert.deepEqual([result.exit, result.stdout, result.fs.exists(`${RUN}/failures.md`)], [0, ZERO, false]);
});

test("with no entry the call removes a failures.md already there", () => {
  const result = run([RUN], { ...seedRun({ "review-T1-1.md": NO_ENTRY_REPORT }), [`${RUN}/failures.md`]: trail("- task | review-T1-1 | stale") });
  assert.deepEqual([result.exit, result.fs.exists(`${RUN}/failures.md`)], [0, false]);
});

test("with entries the call replaces an existing failures.md whole, and a second call over the same reports leaves each failure once", () => {
  const files = { ...seedRun({ "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") }), [`${RUN}/failures.md`]: trail("- task | review-T1-1 | stale", "- plan | review-T9-1 | gone") };
  const first = run([RUN], files);
  const second = runRunFailures([RUN], ROOT, { fs: first.fs, git: fakeGit(null) });
  assert.deepEqual([first.exit, second.exit, first.fs.readText(`${RUN}/failures.md`)], [0, 0, trail("- task | review-T1-1 | a.ts:1 - once")]);
});

test("the call writes failures.md alone: no other file of the run directory changes", () => {
  const result = run([RUN], seedRun({ "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") }));
  assert.deepEqual([result.fs.listDir(RUN), result.fs.listDir(`${RUN}/work`), result.fs.readText(`${RUN}/status.md`)], [["failures.md", "status.md", "work"], ["review-T1-1.md"], STATUS]);
});

// --- the run directory argument ---

const ONCE = { "review-T1-1.md": lines("- Blocking [task] a.ts:1 - once") };
const ONCE_TRAIL = trail("- task | review-T1-1 | a.ts:1 - once");

test("a relative argument resolves against the repository root from a subdirectory of the repository", () => {
  const result = run(["run"], seedRun(ONCE), { repo: true, cwd: `${ROOT}/sub`, opts: { dirs: [`${ROOT}/sub`] } });
  assert.deepEqual([result.exit, result.trail], [0, ONCE_TRAIL]);
});

test("an absolute argument names the run directory wherever the cwd is", () => {
  const result = run([RUN], seedRun(ONCE), { cwd: "/elsewhere" });
  assert.deepEqual([result.exit, result.trail], [0, ONCE_TRAIL]);
});

test("outside a repository a relative argument resolves against the cwd", () => {
  const result = run(["run"], seedRun(ONCE));
  assert.deepEqual([result.exit, result.trail], [0, ONCE_TRAIL]);
});

for (const [label, arg] of [
  ["trailing slashes", "run//"],
  ["a backslash at the end", "run\\"],
  ["backslashes under a drive root", "C:\\r\\run"],
] as const) {
  test(`the run directory spelled with ${label} names the same run: ${arg}`, () => {
    const drive = arg.startsWith("C:");
    const files = Object.fromEntries(Object.entries(seedRun(ONCE)).map(([file, body]) => [drive ? `C:${file}` : file, body]));
    const fs = fakeFs(files);
    const result = runRunFailures([arg], drive ? "C:\\r" : ROOT, { fs, git: fakeGit(null) });
    assert.deepEqual([result.exit, fs.readText(`${drive ? "C:" : ""}${RUN}/failures.md`)], [0, ONCE_TRAIL]);
  });
}

// --- refusals ---

const usage = { stdout: "", stderr: "error: usage: run-failures.sh [--lessons] <run-dir>\n", exit: 2 };
const out = (result: { stdout: string; stderr: string; exit: number }) => ({ stdout: result.stdout, stderr: result.stderr, exit: result.exit });

for (const [name, argv] of [
  ["no argument", []],
  ["an empty argument", [""]],
  ["--lessons with no run directory", ["--lessons"]],
  ["--lessons after the run directory", [RUN, "--lessons"]],
  ["three arguments", ["--lessons", RUN, "more"]],
] as const) {
  test(`${name} exits 2 with the usage on stderr and nothing on stdout`, () => {
    assert.deepEqual(out(run([...argv], seedRun(ONCE))), usage);
  });
}

test("more than one argument exits 2 and writes nothing", () => {
  const result = run([`${ROOT}/one`, `${ROOT}/two`], { ...seedRun(ONCE, "one"), ...seedRun(ONCE, "two") });
  assert.deepEqual(out(result), usage);
  assert.equal(result.fs.exists(`${ROOT}/one/failures.md`) || result.fs.exists(`${ROOT}/two/failures.md`), false);
});

test("a directory that does not exist exits 2, the argument named as it was given", () => {
  assert.deepEqual(out(run([`${ROOT}/nowhere\\`], seedRun(ONCE))), { stdout: "", stderr: `error: run directory not found: ${ROOT}/nowhere\\\n`, exit: 2 });
});

test("a directory holding no status.md exits 2 and writes nothing", () => {
  const files = seedRun(ONCE);
  delete files[`${RUN}/status.md`];
  const result = run([RUN], files);
  assert.deepEqual(out(result), { stdout: "", stderr: `error: ${RUN} holds no status.md, so this is not a run directory\n`, exit: 2 });
  assert.equal(result.fs.exists(`${RUN}/failures.md`), false);
});

test("a failures.md that cannot be written exits 3 with one error line and nothing on stdout", () => {
  const result = run(["run"], seedRun(ONCE), { opts: { dirs: [`${RUN}/failures.md`] } });
  assert.deepEqual(out(result), { stdout: "", stderr: "error: could not write run/failures.md - it is a directory\n", exit: 3 });
});

test("a failures.md that cannot be removed exits 3 with one error line and nothing on stdout", () => {
  const result = run(["run"], seedRun({ "review-T1-1.md": NO_ENTRY_REPORT }), { opts: { dirs: [`${RUN}/failures.md`] } });
  assert.deepEqual(out(result), { stdout: "", stderr: "error: could not remove run/failures.md\n", exit: 3 });
});

// --- --lessons: the test-strategy rules the reviews of a run named ---

/** A Blocking first line naming a test-strategy rule, as the task reviewer spells it. */
const ruleItem = (name: string, where = "tests/a.test.ts:1"): string => `- Blocking [task] ${where} - breaks test-strategy \`${name}\``;

/** The stdout of a --lessons call over these work files, the call having exited 0. */
function lessonsOf(work: Record<string, string>): string {
  const result = run(["--lessons", RUN], seedRun(work));
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  return result.stdout;
}

test("two failed reviews naming Act and one naming Single print 'lessons: Act x2, Single x1'", () => {
  const work = { "review-T1-1.md": lines(ruleItem("Act")), "review-T2-1.md": lines(ruleItem("Single"), "  merge the two tests"), "review-T3-1.md": lines(ruleItem("Act", "tests/b.test.ts:2")) };
  assert.equal(lessonsOf(work), "lessons: Act x2, Single x1\n");
});

test("rules with the same count are ordered by name", () => {
  assert.equal(lessonsOf({ "review-T1-1.md": lines(ruleItem("Single")), "review-T2-1.md": lines(ruleItem("Act")) }), "lessons: Act x1, Single x1\n");
});

test("a rule named twice on one item counts once, and two rules on one item count each", () => {
  const item = "- Blocking [task] a.ts:1 - breaks test-strategy `Act` and test-strategy `Single`, test-strategy `Act` again";
  assert.equal(lessonsOf({ "review-T1-1.md": lines(item) }), "lessons: Act x1, Single x1\n");
});

test("an item copied verbatim from round 1 into round 2 of the same task counts once", () => {
  assert.equal(lessonsOf({ "review-T1-1.md": lines(ruleItem("Act")), "review-T1-2.md": lines(ruleItem("Act")) }), "lessons: Act x1\n");
});

test("a run with no review report prints 'lessons: none'", () => {
  assert.equal(lessonsOf({ "tests-1.md": lines("status: fail", "a case | f.test.ts | boom") }), "lessons: none\n");
});

test("review reports whose Blocking items name no rule print 'lessons: none'", () => {
  assert.equal(lessonsOf({ "review-T1-1.md": lines("- Blocking [task] src/a.ts:3 - reads the file twice") }), "lessons: none\n");
});

test("a Minor item and an indented continuation naming a rule count for nothing", () => {
  const work = { "review-T1-1.md": lines("- Minor src/a.ts:3 - test-strategy `Act`", "- Blocking [task] src/a.ts:4 - reads twice", "  test-strategy `Single`") };
  assert.equal(lessonsOf(work), "lessons: none\n");
});

test("a final review report is not read for lessons", () => {
  assert.equal(lessonsOf({ "final-review-1.md": lines(ruleItem("Act")) }), "lessons: none\n");
});

test("--lessons writes no file and needs no status.md: no failures.md appears and the run directory is unchanged", () => {
  const files = seedRun({ "review-T1-1.md": lines(ruleItem("Act")) });
  delete files[`${RUN}/status.md`];
  const result = run(["--lessons", RUN], files);
  assert.deepEqual([result.exit, result.stdout, result.fs.listDir(RUN), result.fs.listDir(`${RUN}/work`)], [0, "lessons: Act x1\n", ["work"], ["review-T1-1.md"]]);
});

test("--lessons on a run directory that does not exist exits 2 with one error line", () => {
  assert.deepEqual(out(run(["--lessons", `${ROOT}/nowhere`], seedRun(ONCE))), { stdout: "", stderr: `error: run directory not found: ${ROOT}/nowhere\n`, exit: 2 });
});
