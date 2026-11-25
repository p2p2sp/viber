/*
 * reach.unit.test.ts - the reach core on a fake git: `collectReach(targets,
 * root, git)` asks git for each reach target of the planner and answers two
 * pages, the candidates (every line naming the target, never the target's own
 * file) and the paths (one `<path> | <hit count>` line per file), one section
 * per target in both, with the counts of the hit lines kept and of their files.
 *
 * The cases pin what a reader of the two files relies on: the terms a target
 * expands to (path, file name, file name without extension, the directory of
 * an index file; a whole-word symbol; the parent directory of a `| new`
 * target), the terms too short to search being named instead, the 200-line cap
 * and its `truncated:` line on both pages, the files left out (the target's
 * own, everything under `.temp/`) and a target with an empty path getting no
 * section.
 *
 * What git itself reads (an untracked file searched, an ignored and a binary
 * one left out, a term as a fixed string, a whole word) is held by the contract
 * cases of the Git port; the files are written by the plan-build core
 * (plan-build.unit.test.ts).
 */

import assert from "node:assert/strict";
import { fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { collectReach, targetPath } from "../../../viber/lib/reach.ts";

const ROOT = "/r";
const TRUNCATED = "truncated: past 200 lines - search this target yourself";

const reach = (targets: string[], texts: Record<string, string>) => collectReach(targets, ROOT, fakeGit({ root: ROOT, tracked: [], texts }));
const candidates = (targets: string[], texts: Record<string, string>): string[] => reach(targets, texts).candidates;

test("a path target lists the files importing or naming it with their lines, never the target's own file, and counts the lines and the files", () => {
  const result = reach(["src/auth.ts"], {
    "docs/x.md": "The login flow lives in src/auth.ts.\nSee auth.ts again.\n",
    "src/auth.ts": "// auth.ts holds the login\nexport const login = 1;\n",
    "src/b.ts": 'import { login } from "./auth";\n',
  });
  assert.deepEqual(result.candidates, ["## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: The login flow lives in src/auth.ts.", "docs/x.md:2: See auth.ts again.", 'src/b.ts:1: import { login } from "./auth";']);
  assert.deepEqual(result.paths, ["## src/auth.ts", "docs/x.md | 2", "src/b.ts | 1"]);
  assert.deepEqual([result.hits, result.files], [3, 2]);
});

test("a `| parse` target lists the whole word parse and never parser", () => {
  assert.deepEqual(candidates(["src/auth.ts | parse"], { "src/p.ts": "parse(input);\n", "src/q.ts": "const parser = makeParser();\n" }), ["## src/auth.ts | parse", "terms: parse", "src/p.ts:1: parse(input);"]);
});

test("a `| new` target lists the files naming its parent directory", () => {
  assert.deepEqual(candidates(["src/new/c.ts | new"], { "docs/other.md": "Nothing about it here.\n", "docs/y.md": "Add the files under src/new later.\n" }), ["## src/new/c.ts | new", "terms: src/new", "docs/y.md:1: Add the files under src/new later."]);
});

test("an index file is searched by its directory too, and a `| new` target at the top level by no term at all (the directory `.` is too short)", () => {
  assert.deepEqual(candidates(["src/ui/index.ts", "c.ts | new"], { "docs/z.md": "Import it from src/ui.\n" }), ["## src/ui/index.ts", "terms: src/ui/index.ts, index.ts, index, src/ui", "docs/z.md:1: Import it from src/ui.", "## c.ts | new", "terms: ", "skipped: ."]);
});

test("a term shorter than 3 characters is named on the skipped line and never searched", () => {
  assert.deepEqual(candidates(["src/io.ts"], { "docs/z.md": "Wire it through io.ts first.\nThe io layer is slow.\n" }), ["## src/io.ts", "terms: src/io.ts, io.ts", "skipped: io", "docs/z.md:1: Wire it through io.ts first."]);
});

test("a target with more than 200 hit lines keeps 200 and ends its section on the truncated line on both pages, the counts being of the lines kept", () => {
  const lines = Array.from({ length: 250 }, (_, i) => `see auth.ts again ${i + 1}`);
  const result = reach(["src/auth.ts"], { "big.txt": `${lines.join("\n")}\n` });
  assert.deepEqual([result.candidates.length, result.candidates[2], result.candidates[201], result.candidates[202]], [203, "big.txt:1: see auth.ts again 1", "big.txt:200: see auth.ts again 200", TRUNCATED]);
  assert.deepEqual(result.paths, ["## src/auth.ts", "big.txt | 200", TRUNCATED]);
  assert.deepEqual([result.hits, result.files], [200, 1]);
});

test("a hit line is written without its leading blanks and its \\r, cut at 200 characters", () => {
  assert.deepEqual(candidates(["src/auth.ts"], { "wide.txt": `\t  auth.ts ${"ż".repeat(300)}\r\n` }), ["## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", `wide.txt:1: auth.ts ${"ż".repeat(192)}`]);
});

test("a file under .temp/ is never a candidate, even when the repository does not ignore it", () => {
  assert.deepEqual(candidates(["src/auth.ts"], { ".temp/viber/v.md": "Scratch about src/auth.ts.\n", "docs/x.md": "Real mention of src/auth.ts.\n", "pkg/.temp/w.md": "Also src/auth.ts.\n" }), ["## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: Real mention of src/auth.ts."]);
});

test("a leading ./ of a target path is dropped once for the search, so its own file is still left out, and the target is written as given", () => {
  assert.deepEqual(candidates(["./src/auth.ts"], { "docs/x.md": "See src/auth.ts.\n", "src/auth.ts": "// auth.ts\n" }), ["## ./src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: See src/auth.ts."]);
});

test("targets keep their order, and one with an empty path gets no section on either page", () => {
  const result = reach(["src/b.ts | helper", " | parse", "src/auth.ts"], { "docs/x.md": "Mentions src/auth.ts here.\n" });
  assert.deepEqual(result.paths, ["## src/b.ts | helper", "## src/auth.ts", "docs/x.md | 1"]);
  assert.deepEqual(result.candidates.filter((line) => line.startsWith("## ")), ["## src/b.ts | helper", "## src/auth.ts"]);
});

test("targetPath answers the path a target names, its symbol and a leading ./ dropped", () => {
  assert.deepEqual(["./src/a.ts | parse", "src/new/c.ts | new", "src/a.ts"].map(targetPath), ["src/a.ts", "src/new/c.ts", "src/a.ts"]);
});
