/*
 * layering.unit.test.ts - proves the `layering` rule type of tools/lint/rules/layering.ts and its
 * instance in tools/lint/data/layering.ts: a pure core, thin entries, a unit test per core module
 * and unit tests off the outside world.
 *
 *   node --test tests/tools/lint/layering.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import layering, { type LayeringParams } from "../../../tools/lint/rules/layering.ts";
import { rules } from "../../../tools/lint/data/layering.ts";
import { treeOf } from "./tree-fixture.ts";

const params: LayeringParams = {
  core: ["lib"],
  adapters: ["lib/adapters"],
  exempt: ["lib/ports.ts"],
  outside: ["node:fs", "node:os"],
  entries: ["bin/*.ts"],
  entryMaxLines: 3,
  tests: [{ core: "lib/config", tests: "tests/config" }],
  unitTests: ["tests/config"],
  unitForbidden: ["node:child_process", "harness/run.ts"],
};

test("a core module importing an outside module is reported with the import, an adapter is not", () => {
  const tree = treeOf({
    "lib/config/a.ts": 'import fs from "node:fs";\nimport os from "node:os";\n// import x from "node:fs";\n',
    "lib/adapters/fs.ts": 'import fs from "node:fs";\n',
    "tests/config/a.unit.test.ts": "",
  });
  const out = layering.check(tree, params);
  assert.deepEqual(out, [
    { path: "lib/config/a.ts", line: 1, message: "core module imports node:fs" },
    { path: "lib/config/a.ts", line: 2, message: "core module imports node:os" },
  ]);
});

test("an entry past the line cap is reported, comment and blank lines not counted", () => {
  const body = "// c\n/* block\n   more */\n\na\nb\nc\n";
  const tree = treeOf({ "bin/ok.ts": body, "bin/long.ts": `${body}d\n` });
  const out = layering.check(tree, params);
  assert.deepEqual(out, [{ path: "bin/long.ts", line: 0, message: "entry holds 4 lines of code, the cap is 3" }]);
});

test("a core module without its unit test or under no mapping is reported, an adapter and an exempt module are not", () => {
  const tree = treeOf({
    "lib/config/a.ts": "",
    "lib/config/b.ts": "",
    "tests/config/a.unit.test.ts": "",
    "lib/other.ts": "",
    "lib/ports.ts": "",
    "lib/adapters/git.ts": "",
  });
  const out = layering.check(tree, params);
  assert.deepEqual(out, [
    { path: "lib/config/b.ts", line: 0, message: "core module has no unit test tests/config/b.unit.test.ts" },
    { path: "lib/other.ts", line: 0, message: "core module is under no tests mapping" },
  ]);
});

test("a unit test under the swept directories importing a forbidden module is reported", () => {
  const tree = treeOf({
    "tests/config/a.unit.test.ts": 'import cp from "node:child_process";\nimport { run } from "../harness/run.ts";\nimport x from "../../lib/config/run.ts";\n',
    "tests/other/b.unit.test.ts": 'import cp from "node:child_process";\n',
  });
  const out = layering.check(tree, params);
  assert.deepEqual(out, [
    { path: "tests/config/a.unit.test.ts", line: 1, message: "unit test imports node:child_process" },
    { path: "tests/config/a.unit.test.ts", line: 2, message: "unit test imports ../harness/run.ts" },
  ]);
});

const longEntry = "x;\n".repeat(41);

test("the core instance reports the viber core, its entries and its unit tests and spares the adapters and ports", () => {
  const tree = treeOf({
    "viber/lib/config/a.ts":
      'import "node:fs";\nimport "node:child_process";\nimport "node:os";\nimport "node:net";\nimport "node:http";\nimport "node:https";\n',
    "viber/lib/adapters/fs.ts": 'import fs from "node:fs";\n',
    "viber/lib/ports.ts": "",
    "viber/lib/other.ts": "",
    "viber/scripts/x.ts": longEntry,
    "tools/lint/run.ts": longEntry,
    "tests/viber/config/a.unit.test.ts":
      'import "node:child_process";\nimport "node:net";\nimport "../../harness/run.ts";\n',
    "tests/viber/lib/b.unit.test.ts": 'import "node:http";\nimport "../../harness/tmp.ts";\nimport "../../harness/stub.ts";\n',
    "tests/tools/lint/c.unit.test.ts":
      'import "node:https";\nimport "../../harness/shells.ts";\nimport "../../harness/scene.ts";\n',
    "tests/other/d.unit.test.ts": 'import "node:child_process";\n',
  });
  const out = layering.check(tree, rules[0].params as LayeringParams);
  assert.deepEqual(out, [
    { path: "viber/lib/config/a.ts", line: 1, message: "core module imports node:fs" },
    { path: "viber/lib/config/a.ts", line: 2, message: "core module imports node:child_process" },
    { path: "viber/lib/config/a.ts", line: 3, message: "core module imports node:os" },
    { path: "viber/lib/config/a.ts", line: 4, message: "core module imports node:net" },
    { path: "viber/lib/config/a.ts", line: 5, message: "core module imports node:http" },
    { path: "viber/lib/config/a.ts", line: 6, message: "core module imports node:https" },
    { path: "viber/lib/other.ts", line: 0, message: "core module is under no tests mapping" },
    { path: "viber/scripts/x.ts", line: 0, message: "entry holds 41 lines of code, the cap is 40" },
    { path: "tools/lint/run.ts", line: 0, message: "entry holds 41 lines of code, the cap is 40" },
    { path: "tests/viber/config/a.unit.test.ts", line: 1, message: "unit test imports node:child_process" },
    { path: "tests/viber/config/a.unit.test.ts", line: 2, message: "unit test imports node:net" },
    { path: "tests/viber/config/a.unit.test.ts", line: 3, message: "unit test imports ../../harness/run.ts" },
    { path: "tests/viber/lib/b.unit.test.ts", line: 1, message: "unit test imports node:http" },
    { path: "tests/viber/lib/b.unit.test.ts", line: 2, message: "unit test imports ../../harness/tmp.ts" },
    { path: "tests/viber/lib/b.unit.test.ts", line: 3, message: "unit test imports ../../harness/stub.ts" },
    { path: "tests/tools/lint/c.unit.test.ts", line: 1, message: "unit test imports node:https" },
    { path: "tests/tools/lint/c.unit.test.ts", line: 2, message: "unit test imports ../../harness/shells.ts" },
    { path: "tests/tools/lint/c.unit.test.ts", line: 3, message: "unit test imports ../../harness/scene.ts" },
  ]);
});
