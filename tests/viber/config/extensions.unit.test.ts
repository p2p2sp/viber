/*
 * extensions.unit.test.ts - the build.extensions map of viber.yml: which names
 * are found or missing, how found entries group into steps, where the map
 * ends and which lines it owns.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { resolveExtensions } from "../../../viber/lib/config/extensions.ts";
import { resolveBlock } from "../../../viber/lib/config/block.ts";

const AGENTS = ["a", "b", "c", "d", "e", "x-1", "memory"];
const has = (name: string): boolean => AGENTS.includes(name);

/** A map of the given lines below `build:` and `extensions:`, each line indented by four blanks unless it carries its own. */
function build(...lines: string[]): string {
  return `build:\n  extensions:\n${lines.join("\n")}\n`;
}

const cases: [string, string, string, string][] = [
  ["a name with an agent file is found", build("    a:"), "a", "none"],
  ["a name with no agent file is missing", build("    ghost:"), "none", "ghost"],
  ["a name with a capital is missing even beside its file", build("    A:"), "none", "A"],
  ["a name opening on a hyphen is missing", build("    -a:"), "none", "-a"],
  ["a name holding an underscore is missing", build("    a_b:"), "none", "a_b"],
  ["a name with digits and a hyphen is found", build("    x-1:"), "x-1", "none"],
  ["a map with no entry gives both lines none", "build:\n  extensions:\n", "none", "none"],
  ["consecutive parallel entries join into one step", build("    a:\n      parallel: true", "    b:\n      parallel: true"), "a + b", "none"],
  ["a parallel entry beside no parallel one is a step alone", build("    a:\n      parallel: true", "    b:"), "a, b", "none"],
  ["an entry not marked parallel is a step alone between parallel ones", build("    a:\n      parallel: true", "    b:", "    c:\n      parallel: true", "    d:\n      parallel: true"), "a, b, c + d", "none"],
  ["parallel in capitals counts", build("    a:\n      parallel: TRUE", "    b:\n      parallel: True"), "a + b", "none"],
  ["parallel true followed by a comment counts", build("    a:\n      parallel: true # now", "    b:\n      parallel: true#x"), "a + b", "none"],
  ["parallel reading anything but true does not count", build("    a:\n      parallel: yes", "    b:\n      parallel: truee"), "a, b", "none"],
  ["the first parallel of an entry wins", build("    a:\n      parallel: false\n      parallel: true", "    b:\n      parallel: true\n      parallel: false", "    c:\n      parallel: true"), "a, b + c", "none"],
  ["missing names are dropped before grouping", build("    a:\n      parallel: true", "    ghost:", "    b:\n      parallel: true"), "a + b", "ghost"],
  ["a missing name between two steps leaves them apart", build("    a:", "    ghost:", "    b:"), "a, b", "ghost"],
  ["missing names keep their listed order", build("    z:", "    a:", "    y:"), "a", "z, y"],
  ["a name counts once at its first entry with that entry's option", build("    a:", "    b:\n      parallel: true", "    a:\n      parallel: true", "    c:\n      parallel: true"), "a, b + c", "none"],
  ["a repeated missing name is listed once", build("    ghost:", "    ghost:"), "none", "ghost"],
  ["an inline value of an entry is ignored", build("    a: whatever", "    b: [1, 2]"), "a, b", "none"],
  ["an inline value after the map key gives no entry", "build:\n  extensions: yes\n    a:\n", "none", "none"],
  ["a comment after the map key keeps the map", "build:\n  extensions: # none\n    a:\n", "a", "none"],
  ["a blank line and a comment inside the map keep it going", build("    a:", "", "# note", "    b:"), "a, b", "none"],
  ["a column-0 line ends the map", "build:\n  extensions:\n    a:\nother:\n    b:\n", "a", "none"],
  ["an indented line no deeper than the key ends the map", "build:\n  extensions:\n    a:\n  qa: true\n    b:\n", "a", "none"],
  ["a shallower key line than the entry depth is ignored", "build:\n  extensions:\n      a:\n    b:\n        c:\n", "a", "none"],
  ["a deeper key line is an option of the entry above", build("    a:\n        parallel: true", "    b:\n        parallel: true"), "a + b", "none"],
  ["the first key line of the map sets the entry depth, so a shallower entry after it is ignored", build("      parallel: true", "    a:"), "none", "parallel"],
  ["a map outside build gives no name", "other:\n  extensions:\n    a:\n", "none", "none"],
  ["a map at column 0 gives no name", "extensions:\n  a:\n", "none", "none"],
  ["a map under another group than build gives no name", "planning:\n  extensions:\n    a:\n", "none", "none"],
  ["a CR at the end of a line is no part of a name", "build:\r\n  extensions:\r\n    a:\r\n    b:\r\n      parallel: true\r\n", "a, b", "none"],
  ["only the first extensions key of build owns the map", "build:\n  extensions:\n    a:\n  extensions:\n    b:\n", "a", "none"],
];
for (const [name, text, steps, missing] of cases) {
  test(`${name}: steps ${steps}, missing ${missing}`, () => {
    assert.deepEqual(resolveExtensions(text, has), { steps, missing });
  });
}

test("an entry named like a switch changes no switch of the block", () => {
  const lines = resolveBlock("build:\n  extensions:\n    memory:\n    qa: true\n  rules: true\n", has);
  assert.ok(lines.includes("build.memory: false"));
  assert.ok(lines.includes("build.qa: false"));
  assert.ok(lines.includes("build.rules: true"));
});

test("the block carries the extension lines in place from the map", () => {
  const lines = resolveBlock(build("    a:\n      parallel: true", "    b:\n      parallel: true", "    ghost:"), has);
  const at = lines.indexOf("build.extensions: a + b");
  assert.ok(at > 0);
  assert.equal(lines[at + 1], "build.extensions-missing: ghost");
});
