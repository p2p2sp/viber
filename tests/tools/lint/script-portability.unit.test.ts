/*
 * script-portability.unit.test.ts - proves the `script-portability` rule type of
 * tools/lint/rules/script-portability.ts: shebang, CRLF, bash-only and GNU-only checks.
 *
 *   node --test tests/tools/lint/script-portability.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import rule from "../../../tools/lint/rules/script-portability.ts";
import { treeOf } from "./tree-fixture.ts";

const params = { extensions: [".sh", ".ts"], exclude: ["tests/", "docs/"] };
const run = (files: Record<string, string>) => rule.check(treeOf(files), params);

test("a .sh file with no shebang is reported on line 1", () => {
  const out = run({ "p/a.sh": "echo hi\n" });
  assert.deepEqual(out, [{ path: "p/a.sh", line: 1, message: "missing shebang on line 1" }]);
});

test("a .ts module with no shebang is not reported (a module is imported, never executed)", () => {
  const out = run({ "p/a.ts": "export const x = 1;\n" });
  assert.deepEqual(out, []);
});

test("a file holding a CRLF line ending is reported at the line of the first one", () => {
  const out = run({ "p/a.sh": "#!/bin/sh\r\necho hi\n" });
  assert.deepEqual(out, [{ path: "p/a.sh", line: 1, message: "contains a CRLF line ending" }]);
});

test("a .sh file with LF line endings only is not reported", () => {
  const out = run({ "p/a.sh": "#!/bin/sh\necho hi\n" });
  assert.deepEqual(out, []);
});

test("[[ in a #!/bin/sh script is reported at its line", () => {
  const out = run({ "p/a.sh": '#!/bin/sh\nif [[ -n "$x" ]]; then\nfi\n' });
  assert.deepEqual(out, [
    { path: "p/a.sh", line: 2, message: "bashism under #!/bin/sh - [[ (bash conditional, not a POSIX [[:class:]] bracket expr)" },
  ]);
});

test("a POSIX [[:space:]] bracket class and $(( arithmetic are not reported under #!/bin/sh", () => {
  const out = run({ "p/a.sh": "#!/bin/sh\nsed -e 's/[[:space:]]*//' f\nx=$((i-1))\n" });
  assert.deepEqual(out, []);
});

test("a bash script is skipped by the bash-only check", () => {
  const out = run({ "p/a.sh": "#!/usr/bin/env bash\nif [[ -n $x ]]; then\n  echo y\nfi\n" });
  assert.deepEqual(out, []);
});

test("grep -P, a bash 4 case modification and a gawk-only function are reported with their lines", () => {
  const body = ["#!/usr/bin/env bash", 'grep -oP "x" f', 'echo "${name^^}"', "awk '{ print gensub(/a/, \"b\", 1) }'"];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, [
    { path: "p/a.sh", line: 2, message: "GNU-only, breaks on macOS - grep -P (BSD grep has no PCRE)" },
    { path: "p/a.sh", line: 3, message: "GNU-only, breaks on macOS - ${var^^} / ${var,,} case modification (bash 4)" },
    { path: "p/a.sh", line: 4, message: "GNU-only, breaks on macOS - gawk-only function or variable" },
  ]);
});

test("a stat -c paired with stat -f in the same file is accepted", () => {
  const body = ["#!/usr/bin/env bash", 't="$(stat -c %Y "$1" 2>/dev/null || stat -f %m "$1")"'];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, []);
});

test("a date -d guarded by a date -v probe lines above is accepted (the pairing is looked for file-wide)", () => {
  const body = [
    "#!/usr/bin/env bash",
    "if date -v-1d >/dev/null 2>&1; then",
    '  s="$(date -v-7d +%F)"',
    "else",
    '  s="$(date -d "-7 days" +%F)"',
    "fi",
  ];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, []);
});

test("a bare stat -c and a bare date -d with no BSD counterpart are reported", () => {
  const body = ["#!/usr/bin/env bash", 't="$(stat -c %Y "$1")"', 's="$(date -d "-7 days" +%F)"'];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, [
    { path: "p/a.sh", line: 2, message: "GNU-only, breaks on macOS - stat -c (BSD stat spells it -f)" },
    { path: "p/a.sh", line: 3, message: "GNU-only, breaks on macOS - date -d (BSD date spells it -j -f, or -v for relative)" },
  ]);
});

test("a comment line naming a GNU-only form is not reported", () => {
  const body = ["#!/usr/bin/env bash", "# a mutation (sed -i, grep -P, mapfile)", "echo ok"];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, []);
});

test("a comment line naming a bash-only form in a #!/bin/sh script is not reported", () => {
  const body = ["#!/bin/sh", "# if [[ -n $x ]]; then", "echo ok"];
  const out = run({ "p/a.sh": body.join("\n") });
  assert.deepEqual(out, []);
});

test("a file under an excluded prefix is not checked", () => {
  const out = run({ "tests/a.sh": "echo hi\n" });
  assert.deepEqual(out, []);
});

test("a file of an extension outside the params is not checked", () => {
  const out = run({ "p/c.md": "a\r\nb" });
  assert.deepEqual(out, []);
});

test("the self-check sample is reported by the type itself", () => {
  const out = rule.check(rule.selfCheck.tree, rule.selfCheck.params);
  assert.ok(out.length > 0);
});
