/*
 * ref-exists.unit.test.ts - proves the `ref-exists` rule type of tools/lint/rules/ref-exists.ts: the plugin
 * paths, agent and skill names, commands and manifest entries a swept file names must exist in the tree.
 *
 *   node --test tests/tools/lint/ref-exists.unit.test.ts
 */

import { test } from "../../harness/test.ts";
import assert from "node:assert/strict";
import refExists from "../../../tools/lint/rules/ref-exists.ts";
import { treeOf } from "./tree-fixture.ts";

const base = { sweep: ["p/**/*.md"], pluginRoot: "p", except: [] };

test("a plugin root path naming no tracked file is reported with its line, one naming a directory or holding a placeholder is not", () => {
  const tree = treeOf({
    "p/agents/a.md": "ok ${CLAUDE_PLUGIN_ROOT}/scripts\nbad ${CLAUDE_PLUGIN_ROOT}/scripts/gone.sh.\nskip ${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh",
    "p/scripts/real.sh": "",
  });
  assert.deepEqual(refExists.check(tree, base), [
    { path: "p/agents/a.md", line: 2, message: "${CLAUDE_PLUGIN_ROOT}/scripts/gone.sh names no tracked file or directory" },
  ]);
});

test("a skill root path resolves against the skill directory of the file naming it", () => {
  const tree = treeOf({
    "p/skills/one/SKILL.md": "${CLAUDE_SKILL_DIR}/own.md ${CLAUDE_SKILL_DIR}/other.md",
    "p/skills/one/own.md": "",
    "p/skills/two/other.md": "",
  });
  assert.deepEqual(refExists.check(tree, base), [
    { path: "p/skills/one/SKILL.md", line: 1, message: "${CLAUDE_SKILL_DIR}/other.md names no tracked file or directory" },
  ]);
});

test("a viber name that is neither an agent file nor a skill directory is reported, a name inside a tag is not", () => {
  const tree = treeOf({
    "p/agents/a.md": "viber:a viber:talk viber:ghost <viber:ghost> and </viber:ghost>",
    "p/skills/talk/SKILL.md": "",
  });
  assert.deepEqual(refExists.check(tree, base), [
    { path: "p/agents/a.md", line: 1, message: "viber:ghost is neither an agent file nor a skill directory" },
  ]);
});

test("a viber command naming no skill directory is reported", () => {
  const tree = treeOf({
    "p/agents/a.md": "run /viber:talk then /viber:ghost",
    "p/skills/talk/SKILL.md": "",
  });
  assert.deepEqual(refExists.check(tree, base), [
    { path: "p/agents/a.md", line: 1, message: "/viber:ghost names no skill directory" },
  ]);
});

test("a manifest entry of the skills or agents list that the tree lacks is reported", () => {
  const manifest = JSON.stringify({ skills: ["./skills/talk/", "./skills/gone/"], agents: ["./agents/a.md", "./agents/gone.md"] });
  const tree = treeOf({ "p/plugin.json": manifest, "p/skills/talk/SKILL.md": "", "p/agents/a.md": "" });
  assert.deepEqual(refExists.check(tree, { ...base, manifest: "p/plugin.json" }), [
    { path: "p/plugin.json", line: 0, message: "manifest entry ./skills/gone/ names no tracked file or directory" },
    { path: "p/plugin.json", line: 0, message: "manifest entry ./agents/gone.md names no tracked file or directory" },
  ]);
});

test("a reference listed in the exceptions of the rule is not reported", () => {
  const tree = treeOf({ "p/agents/a.md": "${CLAUDE_PLUGIN_ROOT}/gone.sh" });
  const except = [{ file: "p/agents/a.md", ref: "${CLAUDE_PLUGIN_ROOT}/gone.sh" }];
  assert.deepEqual(refExists.check(tree, { ...base, except }), []);
});
