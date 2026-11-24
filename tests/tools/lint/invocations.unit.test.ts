/*
 * invocations.unit.test.ts - proves the `invocations` rule type of tools/lint/rules/invocations.ts:
 * exec bit of a bare-called script, preload quoting and the switch-text.sh fragment calls.
 *
 *   node --test tests/tools/lint/invocations.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import rule from "../../../tools/lint/rules/invocations.ts";
import { treeOf } from "./tree-fixture.ts";

const switches = {
  "github.issues": ["true", "false"],
  "build.extensions": ["off", "on"],
};
const params = { plugin: "p", switches };
const run = (files: Record<string, string>, modes: Record<string, string> = {}) => rule.check(treeOf(files, modes), params);
const messages = (files: Record<string, string>, modes: Record<string, string> = {}) => run(files, modes).map((f) => `${f.path}:${f.line}: ${f.message}`);
const call = (key: string, name: string) => `"\${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" ${key} "\${CLAUDE_SKILL_DIR}" ${name}`;
const fenced = (body: string) => `\`\`\`!\n${body}\n\`\`\`\n`;

test("a script invoked bare from a SKILL.md with mode 100644 is reported", () => {
  const out = messages({ "p/scripts/bare.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/bare.sh"`\n' });
  assert.deepEqual(out, ["p/scripts/bare.sh:0: invoked bare at p/skills/foo/SKILL.md:1 but git mode is 100644 (expected 100755)"]);
});

test("a script invoked bare with mode 100755 is not reported", () => {
  const out = run({ "p/scripts/bare.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/bare.sh"`\n' }, { "p/scripts/bare.sh": "100755" });
  assert.deepEqual(out, []);
});

for (const word of ["bash", "sh", "node"]) {
  test(`a script invoked through ${word} is not reported at mode 100644`, () => {
    const out = run({ "p/scripts/w.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": `${word} "\${CLAUDE_PLUGIN_ROOT}/scripts/w.sh"\n` });
    assert.deepEqual(out, []);
  });
}

test("an interpreter word inside a prose backtick span still counts as explicit", () => {
  const out = run({ "p/scripts/w.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": 'Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/w.sh" "<arg>"` now.\n' });
  assert.deepEqual(out, []);
});

test("a script called bare from hooks.json with its quotes escaped is reported", () => {
  const out = messages({ "p/hooks/scripts/h.sh": "#!/bin/sh\n", "p/hooks/hooks.json": '{"command": "\\"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/h.sh\\""}\n' });
  assert.deepEqual(out, ["p/hooks/scripts/h.sh:0: invoked bare at p/hooks/hooks.json:1 but git mode is 100644 (expected 100755)"]);
});

test("a script called bare from a fragment is reported", () => {
  const out = messages({ "p/scripts/f.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": "x\n", "p/skills/foo/fragments/a.true.md": 'run "${CLAUDE_PLUGIN_ROOT}/scripts/f.sh"\n' });
  assert.ok(out.includes("p/scripts/f.sh:0: invoked bare at p/skills/foo/fragments/a.true.md:1 but git mode is 100644 (expected 100755)"), out.join("\n"));
});

test("a script called bare from a part file is reported", () => {
  const out = messages({ "p/scripts/f.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": "x\n", "p/skills/foo/parts/c.md": 'run "${CLAUDE_PLUGIN_ROOT}/scripts/f.sh"\n' });
  assert.deepEqual(out, ["p/scripts/f.sh:0: invoked bare at p/skills/foo/parts/c.md:1 but git mode is 100644 (expected 100755)"]);
});

test("a bare skill-relative call is reported for its own skill's script and never for a same-named one of another skill", () => {
  const files = {
    "p/skills/foo/scripts/d.sh": "#!/bin/sh\n",
    "p/skills/bar/scripts/d.sh": "#!/bin/sh\n",
    "p/skills/foo/SKILL.md": "1. Detect\n   scripts/d.sh /path\n",
    "p/skills/bar/SKILL.md": "nothing\n",
  };
  assert.deepEqual(messages(files), ["p/skills/foo/scripts/d.sh:0: invoked bare at p/skills/foo/SKILL.md:2 but git mode is 100644 (expected 100755)"]);
});

test("a script no document calls is not reported", () => {
  assert.deepEqual(run({ "p/scripts/u.sh": "#!/bin/sh\n", "p/skills/foo/SKILL.md": "x\n" }), []);
});

test("an unquoted glob character in a preload argument is reported at its line", () => {
  const out = messages({ "p/skills/foo/SKILL.md": 'name: foo\n\nRun: !`"${CLAUDE_PLUGIN_ROOT}/scripts/t.sh" ?plan`\n' });
  assert.deepEqual(out, ["p/skills/foo/SKILL.md:3: unquoted '?' in argument \"?plan\" (zsh nomatch risk)"]);
});

test("a glob character inside single quotes is not reported", () => {
  assert.deepEqual(run({ "p/skills/foo/SKILL.md": "Run: !`\"${CLAUDE_PLUGIN_ROOT}/scripts/t.sh\" '?plan'`\n" }), []);
});

test("a glob character inside double quotes is not reported", () => {
  assert.deepEqual(run({ "p/skills/foo/SKILL.md": 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/t.sh" "a-*-b"`\n' }), []);
});

test("a glob character in a line of a fenced ! block of a part file is reported", () => {
  const out = messages({ "p/skills/foo/SKILL.md": "x\n", "p/skills/foo/parts/c.md": fenced('sh "${CLAUDE_PLUGIN_ROOT}/scripts/a.sh" *two') });
  assert.deepEqual(out, ["p/skills/foo/parts/c.md:2: unquoted '*' in argument \"*two\" (zsh nomatch risk)"]);
});

test("prose mentioning the !` syntax mid-sentence is not read as a preload", () => {
  assert.deepEqual(run({ "p/skills/foo/SKILL.md": "Safety of the `!`-block + `$ARGUMENTS` rules\n" }), []);
});

test("a plugin root variable outside double quotes in a preload is reported", () => {
  const out = messages({ "p/skills/foo/SKILL.md": "Run: !`${CLAUDE_PLUGIN_ROOT}/scripts/a.sh`\n" });
  assert.deepEqual(out, ['p/skills/foo/SKILL.md:1: ${CLAUDE_PLUGIN_ROOT} must be double-quoted in argument "${CLAUDE_PLUGIN_ROOT}/scripts/a.sh"']);
});

test("a skill root variable outside double quotes in a preload is reported", () => {
  const out = messages({ "p/skills/foo/SKILL.md": "Run: !`cat ${CLAUDE_SKILL_DIR}/x.md`\n" });
  assert.deepEqual(out, ['p/skills/foo/SKILL.md:1: ${CLAUDE_SKILL_DIR} must be double-quoted in argument "${CLAUDE_SKILL_DIR}/x.md"']);
});

test("a switch-text.sh call naming an unknown key is reported at its line", () => {
  const out = messages({ "p/skills/foo/SKILL.md": `x\n${fenced(call("memory", "memory"))}` });
  assert.deepEqual(out, ["p/skills/foo/SKILL.md:3: switch-text.sh call names unknown key 'memory'"]);
});

test("a call whose fragment has no file for any valid value of its key is reported", () => {
  const out = messages({ "p/skills/foo/SKILL.md": fenced(call("github.issues", "ghost")) });
  assert.deepEqual(out, ["p/skills/foo/SKILL.md:2: switch-text.sh call names fragment 'ghost' with no file for any value of key 'github.issues'"]);
});

test("a call in a part file counts as a call of its skill", () => {
  const out = run({ "p/skills/foo/SKILL.md": "x\n", "p/skills/foo/parts/c.md": fenced(call("github.issues", "m")), "p/skills/foo/fragments/m.true.md": "t\n" });
  assert.deepEqual(out, []);
});

test("a part file call naming an unknown key is reported with the part's path", () => {
  const out = messages({ "p/skills/foo/SKILL.md": "x\n", "p/skills/foo/parts/c.md": `t\n${call("bogus", "m")}\n` });
  assert.deepEqual(out, ["p/skills/foo/parts/c.md:2: switch-text.sh call names unknown key 'bogus'"]);
});

test("a key written with a quote splice resolves to its real key", () => {
  const out = run({ "p/skills/foo/SKILL.md": fenced(call('build.""extensions', "ext")), "p/skills/foo/fragments/ext.on.md": "t\n" });
  assert.deepEqual(out, []);
});

test("a fragment file whose value suffix is not valid for its call's key is reported", () => {
  const out = messages({
    "p/skills/foo/SKILL.md": fenced(call("build.extensions", "ext")),
    "p/skills/foo/fragments/ext.on.md": "t\n",
    "p/skills/foo/fragments/ext.true.md": "t\n",
  });
  assert.deepEqual(out, ["p/skills/foo/fragments/ext.true.md:0: value 'true' is not valid for key 'build.extensions'"]);
});

test("a fragment file no call of its own skill names is reported, even when another skill calls it", () => {
  const out = messages({
    "p/skills/foo/SKILL.md": "x\n",
    "p/skills/foo/fragments/m.true.md": "t\n",
    "p/skills/bar/SKILL.md": fenced(call("github.issues", "m")),
    "p/skills/bar/fragments/m.true.md": "t\n",
  });
  assert.deepEqual(out, ["p/skills/foo/fragments/m.true.md:0: called by no SKILL.md of its own skill"]);
});

test("a tree whose every call resolves and every fragment is called reports nothing", () => {
  const out = run({
    "p/skills/foo/SKILL.md": fenced(call("github.issues", "m")),
    "p/skills/foo/fragments/m.true.md": "t\n",
    "p/skills/foo/fragments/m.false.md": "t\n",
  });
  assert.deepEqual(out, []);
});
