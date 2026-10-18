/*
 * skill-part.test.ts - proves viber/scripts/skill-part.sh's contract: it prints
 * one part file of a skill (`<skill dir>/parts/<part>.md`) with every fenced
 * `switch-text.sh` call block replaced by the fragment that script selects, and
 * both root placeholders expanded, so a skill can load a part on demand and
 * still get exactly the text its preloads would have produced.
 *
 * Every case plants a skill dir in a throwaway repository (`<repo>/plugin/skills/demo`,
 * so the plugin root is `<repo>/plugin`) and a `.claude/viber.yml` beside it, then
 * runs the script from the repository root.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/skill-part.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/skill-part.sh");

const FENCE = "```";
const MEMORY_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.memory "${CLAUDE_SKILL_DIR}" memory';

function skillDir(repo: GitRepo): string {
  return path.join(repo.dir, "plugin", "skills", "demo");
}

function writeConfig(repo: GitRepo, body: string): void {
  fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), body);
}

function writeIn(repo: GitRepo, sub: string, file: string, body: string): void {
  const dir = path.join(skillDir(repo), sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

function writePart(repo: GitRepo, name: string, body: string): void {
  writeIn(repo, "parts", `${name}.md`, body);
}

function writeFragment(repo: GitRepo, file: string, body: string): void {
  writeIn(repo, "fragments", file, body);
}

async function run(repo: GitRepo, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

test("a part with no fragment block prints byte for byte, a missing final newline kept", async () => {
  await withGitRepo(async (repo) => {
    const body = "# Close\n\n  indented line\n\ttab line\nlast line, no newline";
    writePart(repo, "close", body);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, body]);
  });
});

test("both root placeholders expand to the skill dir as passed and to its parent's parent", async () => {
  await withGitRepo(async (repo) => {
    writePart(repo, "close", "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT} again=${CLAUDE_SKILL_DIR}\n");
    const dir = `${repo.dir}/plugin/skills/demo/`;

    const result = await run(repo, [dir, "close"]);

    assert.deepEqual(
      [result.status, result.stdout],
      [0, `skill=${dir} root=${repo.dir}/plugin again=${dir}\n`],
    );
  });
});

test("a skill dir spelled with a dot-dot segment is expanded as passed, never canonicalised", async () => {
  await withGitRepo(async (repo) => {
    writePart(repo, "close", "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT}\n");
    const dir = `${repo.dir}/plugin/skills/../skills/demo`;

    const result = await run(repo, [dir, "close"]);

    assert.deepEqual(
      [result.status, result.stdout],
      [0, `skill=${dir} root=${repo.dir}/plugin/skills/..\n`],
    );
  });
});

test("a fragment block prints the fragment of the configured switch value in its place, fence lines removed", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: true\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n\nSecond line.\n");
    writeFragment(repo, "memory.false.md", "No memory.\n");
    writePart(repo, "close", `before\n\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n\nafter\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "before\n\nUpdate the memory.\n\nSecond line.\n\nafter\n"]);
  });
});

test("a fragment block prints the fragment of a false switch when only the .false.md file exists", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: false\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n");
    writeFragment(repo, "memory.false.md", "No memory.\n");
    writePart(repo, "close", `before\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\nafter\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "before\nNo memory.\nafter\n"]);
  });
});

test("a fragment block whose value has no fragment file prints nothing in its place", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: false\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n");
    writePart(repo, "close", `before\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\nafter\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "before\nafter\n"]);
  });
});

test("a branching.mode call spelled with its joined empty quotes selects the branching fragment", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "branching:\n  mode: allowed\n");
    writeFragment(repo, "branch.allowed.md", "Branching allowed.\n");
    const call = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branch';
    writePart(repo, "close", `${FENCE}!\n${call}\n${FENCE}\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "Branching allowed.\n"]);
  });
});

test("a fragment's own placeholders are expanded and two blocks in one part are both replaced in order", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: true\n  qa: true\n");
    writeFragment(repo, "memory.true.md", "memory at ${CLAUDE_SKILL_DIR}\n");
    writeFragment(repo, "qa.true.md", "qa under ${CLAUDE_PLUGIN_ROOT}\n");
    const qaCall = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa';
    writePart(repo, "close", `${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n${FENCE}!\n${qaCall}\n${FENCE}\n`);
    const dir = skillDir(repo);

    const result = await run(repo, [dir, "close"]);

    assert.deepEqual(
      [result.status, result.stdout],
      [0, `memory at ${dir}\nqa under ${path.dirname(path.dirname(dir))}\n`],
    );
  });
});

test("a line ending in a carriage return still matches as a fence or a call line, other lines keep theirs", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo, "build:\n  memory: true\n");
    writeFragment(repo, "memory.true.md", "Update the memory.\n");
    writePart(repo, "close", `before\r\n${FENCE}!\r\n${MEMORY_CALL}\r\n${FENCE}\r\nafter\r\n`);

    const result = await run(repo, [skillDir(repo), "close"]);

    assert.deepEqual([result.status, result.stdout], [0, "before\r\nUpdate the memory.\nafter\r\n"]);
  });
});

for (const [label, block] of [
  ["two body lines", `${FENCE}!\n${MEMORY_CALL}\necho extra\n${FENCE}\n`],
  ["a different command", `${FENCE}!\n"\${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"\n${FENCE}\n`],
  ["an extra argument", `${FENCE}!\n${MEMORY_CALL} extra\n${FENCE}\n`],
  ["a plain fence opening", `${FENCE}\n${MEMORY_CALL}\n${FENCE}\n`],
  ["a bash fence opening", `${FENCE}bash\n${MEMORY_CALL}\n${FENCE}\n`],
  ["an empty body", `${FENCE}!\n${FENCE}\n`],
  ["a block never closed", `${FENCE}!\n${MEMORY_CALL}\n`],
] as const) {
  test(`a fenced block with ${label} prints unchanged (never run)`, async () => {
    await withGitRepo(async (repo) => {
      writeConfig(repo, "build:\n  memory: true\n");
      writeFragment(repo, "memory.true.md", "Update the memory.\n");
      const part = `before\n${block}after\n`;
      writePart(repo, "close", part);

      const result = await run(repo, [skillDir(repo), "close"]);

      assert.deepEqual(
        [result.status, result.stdout],
        [0, part.replaceAll("${CLAUDE_PLUGIN_ROOT}", `${repo.dir}/plugin`).replaceAll("${CLAUDE_SKILL_DIR}", skillDir(repo))],
      );
    });
  });
}

test("a fenced block holding another command leaves that command unrun", async () => {
  await withGitRepo(async (repo) => {
    const marker = path.join(repo.dir, "ran.txt");
    writePart(repo, "close", `${FENCE}!\ntouch "${marker.replaceAll("\\", "/")}"\n${FENCE}\n`);

    await run(repo, [skillDir(repo), "close"]);

    assert.equal(fs.existsSync(marker), false);
  });
});

const IMPLEMENTOR_DIR = path.resolve(import.meta.dirname, "../../viber/skills/implementor");
const PLUGIN_ROOT = path.dirname(path.dirname(IMPLEMENTOR_DIR));

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
  const file = path.join(IMPLEMENTOR_DIR, "fragments", `${name}.${value}.md`);
  return fs.existsSync(file) ? expand(fs.readFileSync(file, "utf8")) : "";
}

/** The real close part with each call block replaced by the fragment text of its value (none: nothing). */
function closeWith(fragments: Record<string, string>): string {
  let text = fs.readFileSync(path.join(IMPLEMENTOR_DIR, "parts", "close.md"), "utf8");
  for (const [key, name] of CLOSE_CALLS) {
    const block = `${FENCE}!\n"\${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" ${key} "\${CLAUDE_SKILL_DIR}" ${name}\n${FENCE}\n`;
    assert.ok(text.includes(block), `close.md holds the ${name} call block`);
    text = text.replace(block, () => fragments[name] ?? "");
  }
  return expand(text);
}

/** Runs the real `implementor` skill dir's close part under a config with every switch off but the given lines. */
async function runClose(repo: GitRepo, lines: Record<string, string>, extensions = false): Promise<RunResult> {
  const config = { ...CLOSE_CONFIG_OFF, ...lines };
  const leaf = (key: string) => `  ${key.slice("build.".length)}: ${config[key]}\n`;
  writeConfig(repo, `build:\n${Object.keys(config).map(leaf).join("")}${extensions ? "  extensions:\n    docs:\n" : "  extensions:\n"}`);
  if (extensions) {
    fs.mkdirSync(path.join(repo.dir, ".claude", "agents"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude", "agents", "docs.md"), "agent\n");
  }
  return await runScript(SUT, [IMPLEMENTOR_DIR, "close"], { cwd: repo.dir, env: repo.env, shell: "bash" });
}

test("the real implementor close part with every switch off prints no fragment text", async () => {
  await withGitRepo(async (repo) => {
    const result = await runClose(repo, {});

    assert.deepEqual([result.status, result.stdout], [0, closeWith({})]);
  });
});

for (const [key, name] of CLOSE_CALLS.filter(([key]) => key !== "build.baseline-tests" && key !== "build.extensions")) {
  test(`the real implementor close part prints the ${name} fragment only when ${key} is on`, async () => {
    await withGitRepo(async (repo) => {
      const fragment = fragmentOf(name, "true");
      assert.notEqual(fragment, "");

      const on = await runClose(repo, { [key]: "true" });
      const off = await runClose(repo, { [key]: "false" });

      assert.deepEqual(
        [on.status, on.stdout, off.status, off.stdout.includes(fragment)],
        [0, closeWith({ [name]: fragment }), 0, false],
      );
    });
  });
}

test("the real implementor close part prints the extensions fragment only when build.extensions names an agent", async () => {
  await withGitRepo(async (repo) => {
    const fragment = fragmentOf("extensions", "on");
    assert.notEqual(fragment, "");

    const on = await runClose(repo, {}, true);
    const off = await runClose(repo, {});

    assert.deepEqual(
      [on.status, on.stdout, off.status, off.stdout.includes(fragment)],
      [0, closeWith({ extensions: fragment }), 0, false],
    );
  });
});

for (const value of ["fast", "full"]) {
  test(`the real implementor close part prints the baseline-close text of ${value} under build.baseline-tests ${value}`, async () => {
    await withGitRepo(async (repo) => {
      const fragment = fragmentOf("baseline-close", value);
      assert.notEqual(fragment, "");

      const result = await runClose(repo, { "build.baseline-tests": value });

      assert.deepEqual([result.status, result.stdout], [0, closeWith({ "baseline-close": fragment })]);
    });
  });
}

test("the real implementor close part prints no baseline-close text under build.baseline-tests off", async () => {
  await withGitRepo(async (repo) => {
    const result = await runClose(repo, { "build.baseline-tests": "off" });

    assert.deepEqual(
      [result.status, result.stdout, ["fast", "full"].some((value) => result.stdout.includes(fragmentOf("baseline-close", value)))],
      [0, closeWith({}), false],
    );
  });
});

for (const [label, argsFor] of [
  ["no argument", () => []],
  ["an empty skill dir", () => ["", "close"]],
  ["a missing part", (dir: string) => [dir]],
  ["an empty part", (dir: string) => [dir, ""]],
  ["an uppercase part name", (dir: string) => [dir, "Close"]],
  ["a part name with a slash", (dir: string) => [dir, "../close"]],
  ["a part name with a dot", (dir: string) => [dir, "close.md"]],
  ["a part file that is absent", (dir: string) => [dir, "nothere"]],
] as const) {
  test(`${label} exits 1 with one error line on stderr and nothing on stdout`, async () => {
    await withGitRepo(async (repo) => {
      writePart(repo, "close", "text\n");

      const result = await run(repo, argsFor(skillDir(repo)));

      assert.deepEqual(
        [result.status, result.stdout, /^error: [^\n]+\n$/.test(result.stderr)],
        [1, "", true],
      );
    });
  });
}
