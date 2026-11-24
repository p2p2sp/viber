/*
 * close-part.unit.test.ts - the shipped close part of `implementor`
 * (`viber/skills/implementor/parts/close.md`) through the skill-part core: each
 * of its seven fragment call blocks prints the fragment of its switch value and
 * nothing when the value has no fragment file, so the part reaches the model
 * as the preloads it replaced would have produced it.
 *
 * It reads the part and the fragments from the tree as text and plants them in
 * a fake file system beside a `.claude/viber.yml`, then calls the core in
 * process: no script is spawned. The block rules themselves are proven on
 * planted parts by tests/viber/lib/skill-part.unit.test.ts.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fakeFs, fakeGit } from "../harness/fakes.ts";
import { slash } from "../harness/paths.ts";
import { test } from "../harness/test.ts";
import { runSkillPart, type SkillPartResult } from "../../viber/lib/skill-part.ts";

const FENCE = "```";
const HOST = "/host";
const IMPLEMENTOR_DIR = slash(path.resolve(import.meta.dirname, "../../viber/skills/implementor"));
const PLUGIN_ROOT = IMPLEMENTOR_DIR.split("/").slice(0, -2).join("/");

const PART = fs.readFileSync(`${IMPLEMENTOR_DIR}/parts/close.md`, "utf8");
const FRAGMENTS: Record<string, string> = Object.fromEntries(
  fs.readdirSync(`${IMPLEMENTOR_DIR}/fragments`).map((file) => [file, fs.readFileSync(`${IMPLEMENTOR_DIR}/fragments/${file}`, "utf8")]),
);

/** The seven fragment calls of `parts/close.md`, in order: switch key, fragment name. */
const CLOSE_CALLS = [
  ["build.final-review", "final-review"],
  ["build.baseline-tests", "baseline-close"],
  ["build.memory", "memory"],
  ["build.rules", "rules"],
  ["build.qa", "qa"],
  ["build.extensions", "extensions"],
  ["build.cleanup", "cleanup"],
] as const;

const CLOSE_CONFIG_OFF: Record<string, string> = {
  "build.final-review": "false",
  "build.baseline-tests": "off",
  "build.memory": "false",
  "build.rules": "false",
  "build.qa": "false",
  "build.cleanup": "false",
};

function expand(text: string): string {
  return text.replaceAll("${CLAUDE_SKILL_DIR}", IMPLEMENTOR_DIR).replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN_ROOT);
}

function fragmentOf(name: string, value: string): string {
  return expand(FRAGMENTS[`${name}.${value}.md`] ?? "");
}

/** The real close part with each call block replaced by the fragment text of its value (none: nothing). */
function closeWith(fragments: Record<string, string>): string {
  let text = PART;
  for (const [key, name] of CLOSE_CALLS) {
    const block = `${FENCE}!\n"\${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" ${key} "\${CLAUDE_SKILL_DIR}" ${name}\n${FENCE}\n`;
    assert.ok(text.includes(block), `close.md holds the ${name} call block`);
    text = text.replace(block, () => fragments[name] ?? "");
  }
  return expand(text);
}

/** The real close part under a config with every switch off but the given lines. */
function runClose(lines: Record<string, string>, extensions = false): SkillPartResult {
  const config = { ...CLOSE_CONFIG_OFF, ...lines };
  const leaf = (key: string) => `  ${key.slice("build.".length)}: ${config[key]}\n`;
  const files: Record<string, string> = {
    [`${HOST}/.claude/viber.yml`]: `build:\n${Object.keys(config).map(leaf).join("")}${extensions ? "  extensions:\n    docs:\n" : "  extensions:\n"}`,
    [`${IMPLEMENTOR_DIR}/parts/close.md`]: PART,
  };
  if (extensions) files[`${HOST}/.claude/agents/docs.md`] = "agent\n";
  for (const [file, body] of Object.entries(FRAGMENTS)) files[`${IMPLEMENTOR_DIR}/fragments/${file}`] = body;
  return runSkillPart([IMPLEMENTOR_DIR, "close"], HOST, { fs: fakeFs(files), git: fakeGit({ root: HOST, tracked: [] }) });
}

const printed = (stdout: string): SkillPartResult => ({ stdout, stderr: "", exit: 0 });

test("the real implementor close part with every switch off prints no fragment text", () => {
  assert.deepEqual(runClose({}), printed(closeWith({})));
});

for (const [key, name] of CLOSE_CALLS.filter(([key]) => key !== "build.baseline-tests" && key !== "build.extensions")) {
  test(`the real implementor close part prints the ${name} fragment only when ${key} is on`, () => {
    const fragment = fragmentOf(name, "true");
    assert.notEqual(fragment, "");

    const on = runClose({ [key]: "true" });
    const off = runClose({ [key]: "false" });

    assert.deepEqual([on, off.exit, off.stdout.includes(fragment)], [printed(closeWith({ [name]: fragment })), 0, false]);
  });
}

test("the real implementor close part prints the extensions fragment only when build.extensions names an agent", () => {
  const fragment = fragmentOf("extensions", "on");
  assert.notEqual(fragment, "");

  const on = runClose({}, true);
  const off = runClose({});

  assert.deepEqual([on, off.exit, off.stdout.includes(fragment)], [printed(closeWith({ extensions: fragment })), 0, false]);
});

for (const value of ["fast", "full"]) {
  test(`the real implementor close part prints the baseline-close text of ${value} under build.baseline-tests ${value}`, () => {
    const fragment = fragmentOf("baseline-close", value);
    assert.notEqual(fragment, "");

    assert.deepEqual(runClose({ "build.baseline-tests": value }), printed(closeWith({ "baseline-close": fragment })));
  });
}

test("the real implementor close part prints no baseline-close text under build.baseline-tests off", () => {
  const result = runClose({ "build.baseline-tests": "off" });

  assert.deepEqual([result, ["fast", "full"].some((value) => result.stdout.includes(fragmentOf("baseline-close", value)))], [printed(closeWith({})), false]);
});
