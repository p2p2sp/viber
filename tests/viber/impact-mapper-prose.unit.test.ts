/*
 * impact-mapper-prose.unit.test.ts - pins the prose that makes the reach step map a change that
 * adds files, and impact-mapper find implementers, constructors and collections.
 *
 * `planner/SKILL.md` skips the reach map only when the change adds, modifies, moves or deletes
 * nothing and writes each added file as a `| new` target; `impact-mapper.md` answers a `| new`
 * target with the existing files enumerating the set the file joins (kind `collection`) and a type
 * symbol with its implementers (kind `implementation`) and constructing places (kind `call`);
 * `README.md` and `help.html` say the map also covers what the change adds. The planner runs
 * `reach.sh` before the dispatch and passes its `plan:` and `candidates:` lines; the mapper
 * classifies that file and searches itself only where the file says so. The files read here
 * are shipped prompts and guides, whose text is the behaviour. Nothing is spawned. Each phrase is
 * matched with any run of whitespace between its words, so rewrapping a line breaks no test.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/impact-mapper-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

function read(relative: string): string {
  return fs.readFileSync(path.join(VIBER, relative), "utf8");
}

const PLANNER = read("skills/planner/SKILL.md");
const MAPPER = read("agents/impact-mapper.md");
const README = read("README.md");
const HELP = read("skills/setup/assets/help.html");

function has(haystack: string, text: string): boolean {
  const escaped = text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+")).test(haystack);
}

test("the planner skips the reach map only when the change adds, modifies, moves or deletes no file or symbol", () => {
  assert.ok(has(PLANNER, "Skip it only when the change adds, modifies, moves or deletes no file or symbol."));
});

test("the planner writes each file the change adds as a `| new` target", () => {
  assert.ok(has(PLANNER, "or `<path> | new` for each file the change adds"));
  assert.ok(has(PLANNER, "<repo-relative path> | new"));
});

test("impact-mapper reports, for a `| new` target, the files enumerating the set it joins and the tests asserting a count or a list over them as collection", () => {
  assert.ok(
    has(
      MAPPER,
      "For a `| new` target, search for the existing files that enumerate, count, glob or link the set the new file joins, and the tests asserting a count or a list over such a file, each with kind `collection`.",
    ),
  );
});

test("impact-mapper reports, for a type symbol, every implementer and deriving class with test doubles as implementation and every constructing place as call", () => {
  assert.ok(
    has(
      MAPPER,
      "For a type symbol, search every class implementing or deriving from it, test doubles included, with kind `implementation`, and every place constructing it, with kind `call`.",
    ),
  );
});

test("the description of impact-mapper names the files a plan adds beside those it modifies, moves or deletes", () => {
  const description = MAPPER.split(/\r?\n/).find((line) => line.startsWith("description:")) ?? "";
  assert.ok(has(description, "the files and symbols a plan modifies, moves or deletes, and every file listing, counting or linking the files it adds"));
});

test("the planner allows its reach.sh call through the skill directory", () => {
  assert.ok(has(PLANNER, "Bash(${CLAUDE_SKILL_DIR}/scripts/reach.sh:*)"));
});

test("the planner runs reach.sh as one literal line with one double-quoted argument per target", () => {
  assert.ok(has(PLANNER, 'Run `"${CLAUDE_SKILL_DIR}/scripts/reach.sh" "<target>" "<target>"` as one literal line, one double-quoted argument per target'));
});

test("the planner says reach.sh writes one file under .temp/ and that write is expected in plan mode", () => {
  assert.ok(has(PLANNER, "Its one write under `.temp/viber/planner/` is expected in plan mode."));
});

test("step 2 names the reach file as a write allowed beside the plan file", () => {
  assert.ok(has(PLANNER, "the only file you may write while planning besides the candidates file `reach.sh` wrote and the state file `review-round.sh` writes, both under `.temp/viber/planner/` (expected in plan mode)"));
});

test("the planner dispatches impact-mapper with the plan and candidates lines before the targets block", () => {
  assert.ok(has(PLANNER, "plan: <absolute path of the plan file> candidates: <path printed by reach.sh> targets: <repo-relative path>"));
});

test("on a reach.sh exit 2 the planner dispatches the mapper without a candidates line", () => {
  assert.ok(has(PLANNER, "On a `reach.sh` exit 2, dispatch it with the `plan:` and `targets:` lines and no `candidates:` line: the mapper runs every search itself."));
});

test("impact-mapper names plan: as the plan path carried for the token report and never read", () => {
  assert.ok(has(MAPPER, "`plan:` is the plan path, carried for the token report and never read."));
});

test("impact-mapper names candidates: as the file it classifies", () => {
  assert.ok(has(MAPPER, "`candidates:` is the file you classify; a prompt without it means every search is yours."));
});

test("impact-mapper keeps a candidate that refers to its target with the kind it reads there and drops a name shared with an unrelated symbol", () => {
  assert.ok(
    has(
      MAPPER,
      "Keep each candidate that refers to its target, with the kind it reads there, and drop a name shared with an unrelated symbol.",
    ),
  );
});

test("impact-mapper searches itself only for a truncated target, a skipped term and a new target's glob or count not naming its directory", () => {
  assert.ok(
    has(
      MAPPER,
      "Search yourself only for a target whose section ends on `truncated:`, a term listed on `skipped:` and, for a `| new` target, a glob or count that does not name its directory.",
    ),
  );
});

test("impact-mapper runs every search itself when the prompt carries no candidates line", () => {
  assert.ok(has(MAPPER, "Without a `candidates:` line, search for each target as follows."));
});

test("README says the map also covers the files that list, count or link what the change adds", () => {
  assert.ok(has(README, "and every file that lists, counts or links a file it adds"));
});

test("help.html says in English and in Polish that the map also covers what the change adds", () => {
  assert.ok(has(HELP, "and every file that lists, counts or links a file it adds"));
  assert.ok(has(HELP, "oraz każdy plik, który wylicza, zlicza lub linkuje plik dodawany przez zmianę"));
});
