/*
 * reach.unit.test.ts - the reach core on a fake git: `collectReach(targets,
 * root, git, candidatesFile)` asks git for each reach target of the planner and
 * answers two pages, the candidates (the lines naming the target, never the
 * target's own file) and the paths (one `<path> | <hit count>` line for every
 * file with a hit), one section per target in both, with the counts of the hit
 * lines kept and of their files.
 *
 * The cases pin what a reader of the two files relies on: the terms a target
 * expands to (path, file name, file name without extension, the directory of
 * an index file; a whole-word symbol; the parent directory of a `| new`
 * target), a `| new` target written to the candidates page alone (a file the
 * change adds has nothing referring to it, so it forces no file into the plan),
 * the terms too short to search being named instead, a derived term of a
 * whole-file target and the directory of a new file dropped once its hits span
 * more than 25 files (the project name of a `.csproj` matches every
 * `namespace` line) and named on `common:`, the path term and a symbol never
 * dropped, a target past 200 lines
 * keeping at most 2 lines per file with its `truncated:` line on both pages,
 * neither telling an agent to search, the files left out (the target's own,
 * everything under `.temp/`) and a target with an empty path getting no
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
const CANDIDATES = "/r/.temp/viber/planner/reach-2026.md";

const reach = (targets: string[], texts: Record<string, string>) => collectReach(targets, ROOT, fakeGit({ root: ROOT, tracked: [], texts }), CANDIDATES);
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

test("a `| new` target lists the lines naming its parent directory on the candidates page alone: the paths page, which the plan places file by file, gets no section for it", () => {
  const result = reach(["src/new/c.ts | new", "src/auth.ts"], { "docs/other.md": "Nothing about it here.\n", "docs/y.md": "Add the files under src/new later.\n", "docs/x.md": "See src/auth.ts.\n" });
  assert.deepEqual(result.candidates, ["## src/new/c.ts | new", "terms: src/new", "docs/y.md:1: Add the files under src/new later.", "## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: See src/auth.ts."]);
  assert.deepEqual(result.paths, ["## src/auth.ts", "docs/x.md | 1"]);
});

test("an index file is searched by its directory too, and a `| new` target at the top level by no term at all (the directory `.` is too short)", () => {
  assert.deepEqual(candidates(["src/ui/index.ts", "c.ts | new"], { "docs/z.md": "Import it from src/ui.\n" }), ["## src/ui/index.ts", "terms: src/ui/index.ts, index.ts, index, src/ui", "docs/z.md:1: Import it from src/ui.", "## c.ts | new", "terms: ", "skipped: ."]);
});

test("a term shorter than 3 characters is named on the skipped line and never searched", () => {
  assert.deepEqual(candidates(["src/io.ts"], { "docs/z.md": "Wire it through io.ts first.\nThe io layer is slow.\n" }), ["## src/io.ts", "terms: src/io.ts, io.ts", "skipped: io", "docs/z.md:1: Wire it through io.ts first."]);
});

/** count files under dir, each holding lines lines of the text. */
const filesOf = (dir: string, count: number, text: string, lines = 1): Record<string, string> => Object.fromEntries(Array.from({ length: count }, (_, i) => [`${dir}/f${String(i + 1).padStart(3, "0")}.cs`, `${Array.from({ length: lines }, (_, k) => `${text} ${k + 1}`).join("\n")}\n`]));

test("a derived term of a whole-file target whose hits span more than 25 files is dropped and named on the common line with its file count, the path term kept (a project name matching every namespace line)", () => {
  const result = reach(["src/Shop.csproj"], { ...filesOf("src", 26, "namespace Shop.Orders"), "build.sln": "Project src/Shop.csproj\n", "docs/a.md": "Open Shop.csproj first.\n" });
  assert.deepEqual(result.candidates, ["## src/Shop.csproj", "terms: src/Shop.csproj, Shop.csproj", "common: Shop (28 files)", "build.sln:1: Project src/Shop.csproj", "docs/a.md:1: Open Shop.csproj first."]);
  assert.deepEqual(result.paths, ["## src/Shop.csproj", "build.sln | 1", "docs/a.md | 1"]);
});

test("a derived term naming 25 files or fewer is kept", () => {
  const result = reach(["src/Shop.csproj"], filesOf("src", 25, "namespace Shop.Orders"));
  assert.deepEqual(result.candidates.slice(0, 2), ["## src/Shop.csproj", "terms: src/Shop.csproj, Shop.csproj, Shop"]);
  assert.equal(result.paths.length, 26);
});

test("a symbol term is never dropped, however many files name it", () => {
  const texts = filesOf("src/app", 30, "Shop.open()");
  assert.deepEqual(reach(["src/shop.ts | Shop"], texts).candidates.slice(0, 2), ["## src/shop.ts | Shop", "terms: Shop"]);
  assert.equal(reach(["src/shop.ts | Shop"], texts).paths.length, 31);
});

test("the directory of a new file named by more than 25 files is dropped and named on the common line, and by 25 or fewer it is listed, on the candidates page alone either way (a directory every import names forces no file into the plan)", () => {
  const wide = reach(["src/app/new.ts | new"], filesOf("lib", 30, "import from src/app"));
  assert.deepEqual([wide.candidates, wide.paths, wide.hits], [["## src/app/new.ts | new", "terms: ", "common: src/app (30 files)"], [], 0]);
  const narrow = reach(["src/app/new.ts | new"], filesOf("lib", 25, "import from src/app"));
  assert.deepEqual([narrow.candidates.length, narrow.candidates[1], narrow.paths, narrow.hits], [27, "terms: src/app", [], 25]);
});

test("a new file's directory named on more than 200 lines is cut short on the candidates page and still leaves the paths page empty", () => {
  const result = reach(["src/app/new.ts | new"], filesOf("lib", 20, "import from src/app", 11));
  assert.deepEqual([result.candidates.length, result.candidates[42], result.paths], [43, "truncated: 40 of 220 lines kept, 2 per file at most", []]);
});

test("a target with more than 200 hit lines keeps at most 2 lines per file, files in path order, and ends its section on a truncated line on both pages: the counts on the candidates page, the candidates file on the paths page, neither telling an agent to search", () => {
  const result = reach(["src/auth.ts | login"], { ...filesOf("zz", 2, "login again", 100), "aa/first.ts": "login once\n", "mm/big.ts": `${Array.from({ length: 5 }, (_, i) => `login ${i + 1}`).join("\n")}\n` });
  assert.deepEqual(result.candidates, [
    "## src/auth.ts | login",
    "terms: login",
    "aa/first.ts:1: login once",
    "mm/big.ts:1: login 1",
    "mm/big.ts:2: login 2",
    "zz/f001.cs:1: login again 1",
    "zz/f001.cs:2: login again 2",
    "zz/f002.cs:1: login again 1",
    "zz/f002.cs:2: login again 2",
    "truncated: 7 of 206 lines kept, 2 per file at most",
  ]);
  assert.deepEqual(result.paths, ["## src/auth.ts | login", "aa/first.ts | 1", "mm/big.ts | 5", "zz/f001.cs | 100", "zz/f002.cs | 100", `truncated: 206 lines, 7 kept in ${CANDIDATES}`]);
  assert.deepEqual([result.hits, result.files], [7, 4]);
  assert.doesNotMatch([...result.candidates, ...result.paths].join("\n"), /search/);
});

test("a target past 200 lines over more than 100 files keeps 200 lines, 2 of each file in path order", () => {
  const result = reach(["src/auth.ts | login"], filesOf("src", 120, "login here", 2));
  assert.deepEqual([result.candidates.length, result.candidates[2], result.candidates[201], result.candidates[202]], [203, "src/f001.cs:1: login here 1", "src/f100.cs:2: login here 2", "truncated: 200 of 240 lines kept, 2 per file at most"]);
  assert.deepEqual([result.paths.length, result.paths[121]], [122, `truncated: 240 lines, 200 kept in ${CANDIDATES}`]);
});

test("a target with exactly 200 hit lines keeps every line and carries no truncated line", () => {
  const result = reach(["src/auth.ts | login"], { "big.txt": `${Array.from({ length: 200 }, (_, i) => `login ${i + 1}`).join("\n")}\n` });
  assert.deepEqual([result.candidates.length, result.candidates[201], result.paths], [202, "big.txt:200: login 200", ["## src/auth.ts | login", "big.txt | 200"]]);
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
