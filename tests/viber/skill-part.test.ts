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
