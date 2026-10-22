/*
 * switch-text.test.ts - proves viber/scripts/switch-text.sh's contract: it
 * resolves one `.claude/viber.yml` key through config.sh and prints the skill
 * fragment named after that key's value, so a loaded skill carries only the
 * instructions of its active configuration.
 *
 * It runs as a `!` preload, so every data condition - a missing fragment, an
 * unknown key, a bad name, a missing argument - prints nothing and still exits
 * 0: a non-zero exit would abort the whole skill load. The fragment is printed
 * verbatim apart from its two root placeholders, which a preload's output never
 * gets substituted by Claude Code, so the script expands them itself.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/switch-text.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/switch-text.sh");

/** The skill directory every case hands the script: `<repo>/plugin/skills/demo`,
 *  so the plugin root it derives is `<repo>/plugin`. */
function skillDir(repo: GitRepo): string {
  return path.join(repo.dir, "plugin", "skills", "demo");
}

function writeConfig(repo: GitRepo, body: string): void {
  fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), body);
}

function writeFragment(repo: GitRepo, file: string, body: string): void {
  const dir = path.join(skillDir(repo), "fragments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

async function run(repo: GitRepo, args: string[], cwd: string = repo.dir, shell: Shell = "bash"): Promise<RunResult> {
  return await runScript(SUT, args, { cwd, env: repo.env, shell });
}

test("a true switch prints its .true.md fragment, byte for byte", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "planning:\n  adr: true\n");
    writeFragment(repo, "step.true.md", "ADR on.\n\nSecond line.\n");
    writeFragment(repo, "step.false.md", "ADR off.\n");

    const result = await run(repo, ["planning.adr", skillDir(repo), "step"]);

    assert.deepEqual([result.status, result.stdout], [0, "ADR on.\n\nSecond line.\n"]);
  });
});

test("`build.memory` under `build: memory: true` prints the skill's memory.true.md fragment", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: true\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n");
    writeFragment(repo, "memory.false.md", "No memory.\n");

    const result = await run(repo, ["build.memory", skillDir(repo), "memory"]);

    assert.deepEqual([result.status, result.stdout], [0, "Update the memory.\n"]);
  });
});

for (const [label, config] of [
  ["a false switch", "build:\n  memory: false\n"],
  ["an absent switch", "planning:\n  adr: true\n"],
  ["a flat column-0 switch outside its group", "memory: true\n"],
] as const) {
  test(`${label} prints the .false.md fragment (a disabled state that does something still gets its text)`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, config);
      writeFragment(repo, "step.true.md", "Memory on.\n");
      writeFragment(repo, "step.false.md", "Memory off.\n");

      const result = await run(repo, ["build.memory", skillDir(repo), "step"]);

      assert.deepEqual([result.status, result.stdout], [0, "Memory off.\n"]);
    });
  });
}

for (const [key, group, child, name] of [
  ["build.final-review", "build", "final-review", "final-review"],
  ["planning.outside-plan-review", "planning", "outside-plan-review", "outside-plan-review"],
  ["github.issues", "github", "issues", "issues-input"],
  ["build.red-check", "build", "red-check", "red-check"],
] as const) {
  test(`\`${key}\` on prints the skill's ${name}.true.md fragment`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, `${group}:\n  ${child}: true\n`);
      writeFragment(repo, `${name}.true.md`, "On.\n");

      const result = await run(repo, [key, skillDir(repo), name]);

      assert.deepEqual([result.status, result.stdout], [0, "On.\n"]);
    });
  });

  test(`\`${key}\` off prints nothing - there is no fragment for the off state`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, `${group}:\n  ${child}: false\n`);
      writeFragment(repo, `${name}.true.md`, "On.\n");

      const result = await run(repo, [key, skillDir(repo), name]);

      assert.deepEqual([result.status, result.stdout], [0, ""]);
    });
  });
}

for (const [value, printed] of [
  ["fast", "Fast run.\n"],
  ["full", "Full run.\n"],
  ["true", "Full run.\n"],
] as const) {
  test(`\`build.baseline-tests\` written ${value} prints the fragment of its resolved value`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, `build:\n  baseline-tests: ${value}\n`);
      writeFragment(repo, "baseline-run.fast.md", "Fast run.\n");
      writeFragment(repo, "baseline-run.full.md", "Full run.\n");

      const result = await run(repo, ["build.baseline-tests", skillDir(repo), "baseline-run"]);

      assert.deepEqual([result.status, result.stdout], [0, printed]);
    });
  });
}

test("`build.baseline-tests` resolved to off prints nothing when no .off.md fragment exists", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  baseline-tests: false\n");
    writeFragment(repo, "baseline-run.fast.md", "Fast run.\n");
    writeFragment(repo, "baseline-run.full.md", "Full run.\n");

    const result = await run(repo, ["build.baseline-tests", skillDir(repo), "baseline-run"]);

    assert.deepEqual([result.status, result.stdout], [0, ""]);
  });
});

for (const [config, mode] of [
  ["branching:\n  mode: required\n", "required"],
  ["branching:\n  mode: Allowed\n", "allowed"],
  ["", "off"],
] as const) {
  test(`branching.mode resolved to ${mode} prints the fragment named by that mode`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, config);
      writeFragment(repo, "branch.off.md", "off\n");
      writeFragment(repo, "branch.allowed.md", "allowed\n");
      writeFragment(repo, "branch.required.md", "required\n");

      const result = await run(repo, ["branching.mode", skillDir(repo), "branch"]);

      assert.deepEqual([result.status, result.stdout], [0, `${mode}\n`]);
    });
  });
}

function writeAgent(repo: GitRepo, name: string): void {
  const dir = path.join(repo.dir, ".claude", "agents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), "agent\n");
}

function writeExtensionFragments(repo: GitRepo): void {
  writeFragment(repo, "close.on.md", "on\n");
}

for (const [label, config, printed] of [
  ["one found entry", "build:\n  extensions:\n    docs:\n", "on\n"],
  ["a found entry with its own parallel option", "build:\n  extensions:\n    docs:\n      parallel: true\n", "on\n"],
  ["a map of missing names alone (never off)", "build:\n  extensions:\n    ghost:\n    phantom:\n", "on\n"],
  ["a found and a missing entry", "build:\n  extensions:\n    docs:\n    ghost:\n", "on\n"],
  ["an empty map (no fragment for the off state)", "build:\n  extensions:\n", ""],
  ["no extensions key", "build:\n  memory: true\n", ""],
] as const) {
  test(`\`build.extensions\` with ${label} prints ${printed === "" ? "nothing" : "the on fragment"}`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, config);
      writeAgent(repo, "docs");
      writeExtensionFragments(repo);

      const result = await run(repo, ["build.extensions", skillDir(repo), "close"]);

      assert.deepEqual([result.status, result.stdout], [0, printed]);
    });
  });
}

test("`build.extensions` whose selected fragment file is missing prints nothing and exits 0", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  extensions:\n    ghost:\n");
    writeFragment(repo, "close.off.md", "off\n");
    writeFragment(repo, "close.serial.md", "serial\n");

    const result = await run(repo, ["build.extensions", skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, ""]);
  });
});

for (const removed of ["planning.plain-plan-review", "planning.fast-path"]) {
  test(`the removed key ${removed} prints nothing even with its line set true and its fragment present (a removed switch is refused)`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, "planning:\n  plain-plan-review: true\n  fast-path: true\n");
      writeFragment(repo, "step.true.md", "on\n");

      const result = await run(repo, [removed, skillDir(repo), "step"]);

      assert.deepEqual([result.status, result.stdout], [0, ""]);
    });
  });
}

/** Every row stages the same config and fragments, and most rows name a file
 *  the fixture holds, so a row passes only because its argument is refused. */
for (const [label, args] of [
  ["a key whose fragment file is missing (build.memory resolves false, no step.false.md)", (dir: string) => ["build.memory", dir, "step"]],
  ["an unknown key", (dir: string) => ["e2e", dir, "step"]],
  ["a flat key though its grouped switch is on (adr for planning.adr)", (dir: string) => ["adr", dir, "step"]],
  ["a config key that is no switch (directories.runs)", (dir: string) => ["directories.runs", dir, "step"]],
  ["a config key that is no switch (tiers.min)", (dir: string) => ["tiers.min", dir, "step"]],
  ["a name holding a slash", (dir: string) => ["planning.adr", dir, "../fragments/step"]],
  ["a name holding ..", (dir: string) => ["planning.adr", dir, "..step"]],
  ["a missing name", (dir: string) => ["planning.adr", dir]],
  ["an empty skill directory", () => ["planning.adr", "", "step"]],
  ["a missing skill directory and name", () => ["planning.adr"]],
  ["no argument at all", () => []],
] as const) {
  test(`${label} prints nothing and exits 0 (a preload must never abort the skill load)`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, "planning:\n  adr: true\ne2e: true\n");
      writeFragment(repo, "step.true.md", "on\n");
      writeFragment(repo, "step._specs.md", "a directory name\n");
      writeFragment(repo, "step.haiku.md", "a tier\n");
      writeFragment(repo, "..step.true.md", "a dotted name\n");
      writeFragment(repo, ".true.md", "an empty name\n");

      const result = await run(repo, [...args(skillDir(repo))]);

      assert.deepEqual([result.status, result.stdout], [0, ""]);
    });
  });
}

test("a session started in a subdirectory resolves the repository's config (a preload runs wherever the session started)", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "planning:\n  adr: true\n");
    writeFragment(repo, "step.true.md", "on\n");
    writeFragment(repo, "step.false.md", "off\n");
    const sub = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });

    const result = await run(repo, ["planning.adr", skillDir(repo), "step"], sub);

    assert.deepEqual([result.status, result.stdout], [0, "on\n"]);
  });
});

const PLACEHOLDERS = "Run ${CLAUDE_SKILL_DIR}/x.sh & ${CLAUDE_PLUGIN_ROOT}/scripts/y.sh\nthen ${CLAUDE_SKILL_DIR}/z & ${CLAUDE_PLUGIN_ROOT}.\n";

for (const [label, suffix] of [
  ["a skill directory as handed in", ""],
  ["a skill directory with a trailing separator", path.sep],
] as const) {
  test(`${label}: every root placeholder is replaced by the derived path, under every bash present`, async () => {
    await forEachShell("bash", async (bash) => {
      await withGitRepo(async (repo) => {
        writeConfig(repo, "build:\n  qa: true\n");
        writeFragment(repo, "step.true.md", PLACEHOLDERS);
        const dir = skillDir(repo) + suffix;
        const root = path.join(repo.dir, "plugin");

        const result = await run(repo, ["build.qa", dir, "step"], repo.dir, bash);

        assert.deepEqual(
          [result.status, result.stdout],
          [0, `Run ${dir}/x.sh & ${root}/scripts/y.sh\nthen ${dir}/z & ${root}.\n`],
        );
      });
    });
  });
}

test(
  "a skill directory written with backslashes derives the plugin root across them (a Windows CLAUDE_SKILL_DIR)",
  { skip: process.platform === "win32" ? "a backslash is a separator on Windows, so every other case already proves it there" : false },
  async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, "build:\n  qa: true\n");
      const dir = "C:\\host\\plugin\\skills\\demo";
      fs.mkdirSync(path.join(repo.dir, dir, "fragments"), { recursive: true });
      fs.writeFileSync(path.join(repo.dir, dir, "fragments", "step.true.md"), "${CLAUDE_PLUGIN_ROOT}|${CLAUDE_SKILL_DIR}\n");

      const result = await run(repo, ["build.qa", dir, "step"]);

      assert.deepEqual([result.status, result.stdout], [0, `C:\\host\\plugin|${dir}\n`]);
    });
  },
);

/** The mode the index records for a shipped script - never the filesystem bit,
 *  which this repo's `core.filemode=false` ignores on the way in. */
async function indexMode(file: string): Promise<string> {
  const listed = await runScript("git", ["ls-files", "-s", "--", file], { cwd: path.dirname(file) });
  return listed.stdout.trim().split(/\s+/)[0];
}

test("the index records the script 100755, so a skill can preload it by its bare quoted path", async () => {
  assert.equal(await indexMode(SUT), "100755");
});
