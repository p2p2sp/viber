/*
 * switch-text.unit.test.ts - the switch-text core on fake ports: it resolves
 * one `.claude/viber.yml` key through the config core and returns the skill
 * fragment named after that key's value, so a loaded skill carries only the
 * instructions of its active configuration.
 *
 * It answers a `!` preload, so every data condition - a missing fragment, an
 * unknown key, a bad name, a missing argument - returns nothing. The fragment
 * is returned verbatim apart from its two root placeholders, which a preload's
 * output never gets substituted by Claude Code.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runSwitchText } from "../../../viber/lib/switch-text.ts";

const ROOT = "/r";
const SKILL = `${ROOT}/plugin/skills/demo`;

/** One call in a repository at ROOT holding the config and the fragments of the demo skill. */
function run(
  args: string[],
  config: string | null,
  fragments: Record<string, string>,
  opts: { cwd?: string; agents?: string[]; skill?: string } = {},
): string {
  const files: Record<string, string> = {};
  if (config !== null) files[`${ROOT}/.claude/viber.yml`] = config;
  for (const name of opts.agents ?? []) files[`${ROOT}/.claude/agents/${name}.md`] = "agent\n";
  for (const [file, body] of Object.entries(fragments)) files[`${opts.skill ?? SKILL}/fragments/${file}`] = body;
  return runSwitchText(args, opts.cwd ?? ROOT, { fs: fakeFs(files), git: fakeGit({ root: ROOT, tracked: [] }) });
}

test("`build.memory` under `build: memory: true` returns the skill's memory.true.md fragment, byte for byte", () => {
  const out = run(["build.memory", SKILL, "memory"], "build:\n  memory: true\n", {
    "memory.true.md": "Update the memory.\n\nSecond line.\n",
    "memory.false.md": "No memory.\n",
  });
  assert.equal(out, "Update the memory.\n\nSecond line.\n");
});

for (const [label, config] of [
  ["a false switch", "build:\n  memory: false\n"],
  ["an absent switch", "planning:\n  adr: true\n"],
  ["a flat column-0 switch outside its group", "memory: true\n"],
  ["no config file", null],
] as const) {
  test(`${label} returns the .false.md fragment (a disabled state that does something still gets its text)`, () => {
    const out = run(["build.memory", SKILL, "step"], config, { "step.true.md": "Memory on.\n", "step.false.md": "Memory off.\n" });
    assert.equal(out, "Memory off.\n");
  });
}

for (const [key, group, child, name] of [
  ["planning.adr", "planning", "adr", "adr"],
  ["planning.outside-plan-review", "planning", "outside-plan-review", "outside-plan-review"],
  ["build.final-review", "build", "final-review", "final-review"],
  ["build.memory", "build", "memory", "memory"],
  ["build.rules", "build", "rules", "rules"],
  ["build.qa", "build", "qa", "qa"],
  ["build.cleanup", "build", "cleanup", "cleanup"],
  ["build.red-check", "build", "red-check", "red-check"],
  ["github.issues", "github", "issues", "issues-input"],
] as const) {
  test(`\`${key}\` on returns the skill's ${name}.true.md fragment`, () => {
    assert.equal(run([key, SKILL, name], `${group}:\n  ${child}: true\n`, { [`${name}.true.md`]: "On.\n" }), "On.\n");
  });

  test(`\`${key}\` off returns nothing - there is no fragment for the off state`, () => {
    assert.equal(run([key, SKILL, name], `${group}:\n  ${child}: false\n`, { [`${name}.true.md`]: "On.\n" }), "");
  });
}

const BASELINE = { "baseline-run.fast.md": "Fast run.\n", "baseline-run.full.md": "Full run.\n" };

for (const [value, printed] of [
  ["fast", "Fast run.\n"],
  ["full", "Full run.\n"],
  ["true", "Full run.\n"],
] as const) {
  test(`\`build.baseline-tests\` written ${value} returns the fragment of its resolved value`, () => {
    assert.equal(run(["build.baseline-tests", SKILL, "baseline-run"], `build:\n  baseline-tests: ${value}\n`, BASELINE), printed);
  });
}

test("`build.baseline-tests` resolved to off returns nothing when no .off.md fragment exists", () => {
  assert.equal(run(["build.baseline-tests", SKILL, "baseline-run"], "build:\n  baseline-tests: false\n", BASELINE), "");
});

for (const [config, mode] of [
  ["branching:\n  mode: required\n", "required"],
  ["branching:\n  mode: Allowed\n", "allowed"],
  ["", "off"],
] as const) {
  test(`branching.mode resolved to ${mode} returns the fragment named by that mode`, () => {
    const out = run(["branching.mode", SKILL, "branch"], config, {
      "branch.off.md": "off\n",
      "branch.allowed.md": "allowed\n",
      "branch.required.md": "required\n",
    });
    assert.equal(out, `${mode}\n`);
  });
}

for (const [label, config, printed] of [
  ["one found entry", "build:\n  extensions:\n    docs:\n", "on\n"],
  ["a found entry with its own parallel option", "build:\n  extensions:\n    docs:\n      parallel: true\n", "on\n"],
  ["a map of missing names alone (never off)", "build:\n  extensions:\n    ghost:\n    phantom:\n", "on\n"],
  ["a found and a missing entry", "build:\n  extensions:\n    docs:\n    ghost:\n", "on\n"],
  ["an empty map (no fragment for the off state)", "build:\n  extensions:\n", ""],
  ["no extensions key", "build:\n  memory: true\n", ""],
] as const) {
  test(`\`build.extensions\` with ${label} returns ${printed === "" ? "nothing" : "the on fragment"}`, () => {
    assert.equal(run(["build.extensions", SKILL, "close"], config, { "close.on.md": "on\n" }, { agents: ["docs"] }), printed);
  });
}

test("`build.extensions` with an empty map returns the off fragment when the skill holds one", () => {
  const out = run(["build.extensions", SKILL, "close"], "build:\n  extensions:\n", { "close.on.md": "on\n", "close.off.md": "off\n" });
  assert.equal(out, "off\n");
});

test("`build.extensions` whose selected fragment file is missing returns nothing", () => {
  const out = run(["build.extensions", SKILL, "close"], "build:\n  extensions:\n    ghost:\n", {
    "close.off.md": "off\n",
    "close.serial.md": "serial\n",
  });
  assert.equal(out, "");
});

for (const removed of ["planning.plain-plan-review", "planning.fast-path"]) {
  test(`the removed key ${removed} returns nothing even with its line set true and its fragment present (a removed switch is refused)`, () => {
    const out = run([removed, SKILL, "step"], "planning:\n  plain-plan-review: true\n  fast-path: true\n", { "step.true.md": "on\n" });
    assert.equal(out, "");
  });
}

/** Every row stages the same config and fragments, and most rows name a file
 *  the fixture holds, so a row passes only because its argument is refused. */
for (const [label, args] of [
  ["a key whose fragment file is missing (build.memory resolves false, no step.false.md)", ["build.memory", SKILL, "step"]],
  ["an unknown key", ["e2e", SKILL, "step"]],
  ["a flat key though its grouped switch is on (adr for planning.adr)", ["adr", SKILL, "step"]],
  ["a config key that is no switch (directories.runs)", ["directories.runs", SKILL, "step"]],
  ["a config key that is no switch (tiers.min)", ["tiers.min", SKILL, "step"]],
  ["a name holding a slash", ["planning.adr", SKILL, "../fragments/step"]],
  ["a name holding ..", ["planning.adr", SKILL, "..step"]],
  ["a name holding an upper-case letter", ["planning.adr", SKILL, "Step"]],
  ["a name ended by a newline", ["planning.adr", SKILL, "step\n"]],
  ["an empty name", ["planning.adr", SKILL, ""]],
  ["a missing name", ["planning.adr", SKILL]],
  ["an empty skill directory", ["planning.adr", "", "step"]],
  ["a missing skill directory and name", ["planning.adr"]],
  ["no argument at all", []],
] as const) {
  test(`${label} returns nothing (a preload must never abort the skill load)`, () => {
    const out = run([...args], "planning:\n  adr: true\ne2e: true\n", {
      "step.true.md": "on\n",
      "Step.true.md": "an upper-case name\n",
      "step._specs.md": "a directory name\n",
      "step.haiku.md": "a tier\n",
      "..step.true.md": "a dotted name\n",
      ".true.md": "an empty name\n",
    });
    assert.equal(out, "");
  });
}

test("a fragment that cannot be read returns nothing", () => {
  const fs = fakeFs({ [`${ROOT}/.claude/viber.yml`]: "planning:\n  adr: true\n" }, { unreadable: [`${SKILL}/fragments/step.true.md`] });
  assert.equal(runSwitchText(["planning.adr", SKILL, "step"], ROOT, { fs, git: fakeGit({ root: ROOT, tracked: [] }) }), "");
});

test("a session started in a subdirectory resolves the repository's config (a preload runs wherever the session started)", () => {
  const out = run(["planning.adr", SKILL, "step"], "planning:\n  adr: true\n", { "step.true.md": "on\n", "step.false.md": "off\n" }, { cwd: `${ROOT}/src/deep` });
  assert.equal(out, "on\n");
});

const PLACEHOLDERS = "Run ${CLAUDE_SKILL_DIR}/x.sh & ${CLAUDE_PLUGIN_ROOT}/scripts/y.sh\nthen ${CLAUDE_SKILL_DIR}/z & ${CLAUDE_PLUGIN_ROOT}.\n";

for (const [label, dir, root] of [
  ["a skill directory as handed in", SKILL, `${ROOT}/plugin`],
  ["a skill directory with a trailing separator", `${SKILL}/`, `${ROOT}/plugin`],
  ["a skill directory written with backslashes (a Windows CLAUDE_SKILL_DIR)", "C:\\host\\plugin\\skills\\demo", "C:\\host\\plugin"],
  ["a backslash skill directory with a trailing backslash", "C:\\host\\plugin\\skills\\demo\\", "C:\\host\\plugin"],
  ["a skill directory holding a $& (no replacement pattern is read from the path)", "/r/a$&b/skills/demo", "/r/a$&b"],
  ["a skill directory of one segment (nothing to drop)", "demo", "demo"],
] as const) {
  test(`${label}: every root placeholder is replaced by the derived path`, () => {
    const out = run(["build.qa", dir, "step"], "build:\n  qa: true\n", { "step.true.md": PLACEHOLDERS }, { skill: dir.replace(/\/$/, "") });
    assert.equal(out, `Run ${dir}/x.sh & ${root}/scripts/y.sh\nthen ${dir}/z & ${root}.\n`);
  });
}

test("a placeholder of any other name stays literal ($ARGUMENTS is never expanded)", () => {
  const out = run(["build.qa", SKILL, "step"], "build:\n  qa: true\n", { "step.true.md": "$ARGUMENTS ${CLAUDE_OTHER} $CLAUDE_SKILL_DIR\n" });
  assert.equal(out, "$ARGUMENTS ${CLAUDE_OTHER} $CLAUDE_SKILL_DIR\n");
});
