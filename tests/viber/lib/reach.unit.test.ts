/*
 * reach.unit.test.ts - the reach core on fake ports: `--plan <plan> "<target>" ...`
 * asks git for each reach target of the planner and writes the candidates
 * (every line naming the target, never the target's own file) to
 * `.temp/viber/planner/reach-<stamp>.md`, one section per target, then prints
 * `candidates: <absolute path>`, a `hits:` line and the `NEXT: dispatch` block
 * of `viber:impact-mapper` (outside a repository: the block alone, no file
 * written).
 *
 * The cases pin what a caller of the file relies on: the terms a target
 * expands to (path, file name, file name without extension, the directory of
 * an index file; a whole-word symbol; the parent directory of a `| new`
 * target), the terms too short to search being named instead, the 200-line cap
 * and its `truncated:` line, the files left out (the target's own, everything
 * under `.temp/`), the dispatch block and the refusals (no or empty --plan, no
 * target, an empty target path, a file that cannot be written), which exit 2
 * with an empty stdout.
 *
 * What git itself reads (an untracked file searched, an ignored and a binary
 * one left out, a term as a fixed string, a whole word) is held by the contract
 * cases of the Git port; the wrapper is run as a process by
 * tests/viber/reach.critical.test.ts, and its exec bit is held by the
 * `invocations` lint rule.
 */

import assert from "node:assert/strict";
import { fakeClock, fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runReach } from "../../../viber/lib/reach.ts";

const ROOT = "/r";
const PLAN = "/work/plan file.md";
const AT = new Date(2026, 10, 24, 17, 14, 16);
const OUT = `${ROOT}/.temp/viber/planner/reach-2026-11-24-17-14-16.md`;
const TRUNCATED = "truncated: past 200 lines - search this target yourself";

/** texts: the text files of the repository; null: no repository. */
function reach(argv: string[], texts: Record<string, string> | null = {}, cwd = ROOT) {
  const fs = fakeFs({}, { dirs: [ROOT] });
  const git = fakeGit(texts === null ? null : { root: ROOT, tracked: [], texts });
  return { ...runReach(argv, cwd, { fs, git, clock: fakeClock(AT) }), fs };
}

/** The candidates file a call with these targets writes, the call having exited 0. */
function candidates(targets: string[], texts: Record<string, string>): string {
  const result = reach(["--plan", PLAN, ...targets], texts);
  assert.deepEqual([result.exit, result.stderr], [0, ""]);
  return result.fs.readText(OUT) ?? "";
}

const section = (...rows: string[]): string => rows.map((row) => `${row}\n`).join("");

test("a path target lists the files importing or naming it with their lines, never the target's own file, and prints the candidates path and the hits line", () => {
  const result = reach(
    ["--plan", PLAN, "src/auth.ts"],
    {
      "docs/x.md": "The login flow lives in src/auth.ts.\n",
      "src/auth.ts": "// auth.ts holds the login\nexport const login = 1;\n",
      "src/b.ts": 'import { login } from "./auth";\n',
    },
    `${ROOT}/src`,
  );
  assert.equal(result.fs.readText(OUT), section("## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: The login flow lives in src/auth.ts.", 'src/b.ts:1: import { login } from "./auth";'));
  assert.deepEqual(result.stdout.split("\n").slice(0, 2), [`candidates: ${OUT}`, "hits: 2 lines in 2 files"]);
});

test("a `| parse` target lists the whole word parse and never parser", () => {
  const content = candidates(["src/auth.ts | parse"], { "src/p.ts": "parse(input);\n", "src/q.ts": "const parser = makeParser();\n" });
  assert.equal(content, section("## src/auth.ts | parse", "terms: parse", "src/p.ts:1: parse(input);"));
});

test("a `| new` target lists the files naming its parent directory", () => {
  const content = candidates(["src/new/c.ts | new"], { "docs/other.md": "Nothing about it here.\n", "docs/y.md": "Add the files under src/new later.\n" });
  assert.equal(content, section("## src/new/c.ts | new", "terms: src/new", "docs/y.md:1: Add the files under src/new later."));
});

test("an index file is searched by its directory too, and a `| new` target at the top level by no term at all (the directory `.` is too short)", () => {
  const content = candidates(["src/ui/index.ts", "c.ts | new"], { "docs/z.md": "Import it from src/ui.\n" });
  assert.equal(content, section("## src/ui/index.ts", "terms: src/ui/index.ts, index.ts, index, src/ui", "docs/z.md:1: Import it from src/ui.", "## c.ts | new", "terms: ", "skipped: ."));
});

test("a term shorter than 3 characters is named on the skipped line and never searched", () => {
  const content = candidates(["src/io.ts"], { "docs/z.md": "Wire it through io.ts first.\nThe io layer is slow.\n" });
  assert.equal(content, section("## src/io.ts", "terms: src/io.ts, io.ts", "skipped: io", "docs/z.md:1: Wire it through io.ts first."));
});

test("a target with more than 200 hit lines keeps 200 and ends its section on the truncated line, and the hits line counts the lines kept", () => {
  const lines = Array.from({ length: 250 }, (_, i) => `see auth.ts again ${i + 1}`);
  const result = reach(["--plan", PLAN, "src/auth.ts"], { "big.txt": `${lines.join("\n")}\n` });
  const rows = (result.fs.readText(OUT) ?? "").trimEnd().split("\n");
  assert.deepEqual([rows.length, rows[2], rows[201], rows[202]], [203, "big.txt:1: see auth.ts again 1", "big.txt:200: see auth.ts again 200", TRUNCATED]);
  assert.equal(result.stdout.split("\n")[1], "hits: 200 lines in 1 files");
});

test("a hit line is written without its leading blanks and its \\r, cut at 200 characters", () => {
  const content = candidates(["src/auth.ts"], { "wide.txt": `\t  auth.ts ${"ż".repeat(300)}\r\n` });
  assert.equal(content, section("## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", `wide.txt:1: auth.ts ${"ż".repeat(192)}`));
});

test("a file under .temp/ is never a candidate, even when the repository does not ignore it", () => {
  const content = candidates(["src/auth.ts"], { ".temp/viber/v.md": "Scratch about src/auth.ts.\n", "docs/x.md": "Real mention of src/auth.ts.\n", "pkg/.temp/w.md": "Also src/auth.ts.\n" });
  assert.equal(content, section("## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: Real mention of src/auth.ts."));
});

test("a leading ./ of a target path is dropped once for the search, so its own file is still left out, and the target is written as given", () => {
  const content = candidates(["./src/auth.ts"], { "docs/x.md": "See src/auth.ts.\n", "src/auth.ts": "// auth.ts\n" });
  assert.equal(content, section("## ./src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: See src/auth.ts."));
});

test("inside a repository the dispatch block follows the candidates and hits lines, every target as given in argument order", () => {
  const result = reach(["--plan", PLAN, "src/b.ts | helper", "src/auth.ts", "./src/new/c.ts | new"], { "docs/x.md": "Mentions src/auth.ts here.\n" });
  assert.deepEqual(result.stdout.split("\n"), [
    `candidates: ${OUT}`,
    "hits: 1 lines in 1 files",
    "NEXT: dispatch | agent: viber:impact-mapper",
    `plan: ${PLAN}`,
    `candidates: ${OUT}`,
    "targets:",
    "src/b.ts | helper",
    "src/auth.ts",
    "./src/new/c.ts | new",
    "",
  ]);
});

test("a directory outside a git repository prints the block without a candidates line, writes no file and exits 0", () => {
  const result = reach(["--plan", PLAN, "src/auth.ts", "src/b.ts | parse"], null);
  assert.deepEqual(
    { stdout: result.stdout, stderr: result.stderr, exit: result.exit },
    { stdout: section("NEXT: dispatch | agent: viber:impact-mapper", `plan: ${PLAN}`, "targets:", "src/auth.ts", "src/b.ts | parse"), stderr: "", exit: 0 },
  );
  assert.deepEqual(result.fs.listDir(ROOT), []);
});

const USAGE = 'reach.sh --plan "<plan path>" "<path>" ["<path> | <symbol>" | "<path> | new" ...]';

// [case, argv, reason]: every refusal prints one error line on stderr, nothing on stdout, and writes nothing.
for (const [name, argv, reason] of [
  ["no --plan at all", ["src/auth.ts"], `--plan missing: ${USAGE}`],
  ["no argument", [], `--plan missing: ${USAGE}`],
  ["a --plan with no value", ["--plan"], `--plan is empty: ${USAGE}`],
  ["an empty --plan", ["--plan", "", "src/auth.ts"], `--plan is empty: ${USAGE}`],
  ["a --plan and no target", ["--plan", PLAN], `no target: ${USAGE}`],
  ["a target with an empty path", ["--plan", PLAN, "src/auth.ts", " | parse"], "empty path in target:  | parse"],
] as const) {
  test(`${name} exits 2 with one error line on stderr, an empty stdout and no file written`, () => {
    const result = reach([...argv], { "docs/x.md": "src/auth.ts\n" });
    assert.deepEqual({ stdout: result.stdout, stderr: result.stderr, exit: result.exit }, { stdout: "", stderr: `error: ${reason}\n`, exit: 2 });
    assert.equal(result.fs.exists(`${ROOT}/.temp`), false);
  });
}

test("a candidates directory that cannot be created exits 2 with one error line and an empty stdout", () => {
  const fs = fakeFs({ [`${ROOT}/.temp`]: "a file where the directory belongs\n" });
  const result = runReach(["--plan", PLAN, "src/auth.ts"], ROOT, { fs, git: fakeGit({ root: ROOT, tracked: [] }), clock: fakeClock(AT) });
  assert.deepEqual(result, { stdout: "", stderr: "error: cannot create .temp/viber/planner\n", exit: 2 });
});
