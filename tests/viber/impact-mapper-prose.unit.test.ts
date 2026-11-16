/*
 * impact-mapper-prose.unit.test.ts - pins the prose that makes the reach step map a change that
 * adds files, and impact-mapper find implementers, constructors and collections.
 *
 * `planner/SKILL.md` skips the reach map only when the change adds, modifies, moves or deletes
 * nothing and writes each added file as a `| new` target; `impact-mapper.md` answers a `| new`
 * target with the existing files enumerating the set the file joins (kind `collection`) and a type
 * symbol with its implementers (kind `implementation`) and constructing places (kind `call`);
 * `README.md` and `help.html` say the map also covers what the change adds. The files read here
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

test("README says the map also covers the files that list, count or link what the change adds", () => {
  assert.ok(has(README, "and every file that lists, counts or links a file it adds"));
});

test("help.html says in English and in Polish that the map also covers what the change adds", () => {
  assert.ok(has(HELP, "and every file that lists, counts or links a file it adds"));
  assert.ok(has(HELP, "oraz każdy plik, który wylicza, zlicza lub linkuje plik dodawany przez zmianę"));
});
