/*
 * skill-part.unit.test.ts - the skill-part core on fake ports: it prints one
 * part file of a skill (`<skill dir>/parts/<part>.md`) with every fenced
 * `switch-text.sh` call block replaced by the fragment the switch-text core
 * selects, and both root placeholders expanded, so a skill can load a part on
 * demand and still get exactly the text its preloads would have produced. A
 * missing argument, a part name outside its pattern or an absent part file
 * exits 1 with one `error:` line and an empty stdout.
 *
 * Every case plants a skill directory in a fake repository at /r
 * (`/r/plugin/skills/demo`, so the plugin root is `/r/plugin`) and a
 * `.claude/viber.yml` beside it. No block is ever run as a command: the core
 * holds no process port. The real `implementor` close part is proven by
 * tests/viber/close-part.unit.test.ts, which reads it from the tree.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit, type FakeFsOpts } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runSkillPart, type SkillPartResult } from "../../../viber/lib/skill-part.ts";

const ROOT = "/r";
const SKILL = `${ROOT}/plugin/skills/demo`;
const FENCE = "```";
const MEMORY_CALL = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.memory "${CLAUDE_SKILL_DIR}" memory';

interface Scene extends FakeFsOpts {
  /** The body of `.claude/viber.yml`; left out: no config file. */
  config?: string;
  /** Part name to body, under the skill directory. */
  parts?: Record<string, string>;
  /** Fragment file name to body, under the skill directory. */
  fragments?: Record<string, string>;
  /** The directory the parts and fragments are planted in, as text. */
  skill?: string;
  cwd?: string;
}

function run(argv: string[], scene: Scene = {}): SkillPartResult {
  const skill = scene.skill ?? SKILL;
  const files: Record<string, string> = {};
  if (scene.config !== undefined) files[`${ROOT}/.claude/viber.yml`] = scene.config;
  for (const [name, body] of Object.entries(scene.parts ?? {})) files[`${skill}/parts/${name}.md`] = body;
  for (const [file, body] of Object.entries(scene.fragments ?? {})) files[`${skill}/fragments/${file}`] = body;
  return runSkillPart(argv, scene.cwd ?? ROOT, { fs: fakeFs(files, scene), git: fakeGit({ root: ROOT, tracked: [] }) });
}

const printed = (stdout: string): SkillPartResult => ({ stdout, stderr: "", exit: 0 });
const refused = (reason: string): SkillPartResult => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 1 });

test("a part with no fragment block prints byte for byte, a missing final newline kept", () => {
  const body = "# Close\n\n  indented line\n\ttab line\nlast line, no newline";
  assert.deepEqual(run([SKILL, "close"], { parts: { close: body } }), printed(body));
});

test("an empty part and a part of one newline print as they are", () => {
  assert.deepEqual(run([SKILL, "close"], { parts: { close: "" } }), printed(""));
  assert.deepEqual(run([SKILL, "close"], { parts: { close: "\n" } }), printed("\n"));
});

test("both root placeholders expand to the skill dir as passed and to its parent's parent, a trailing slash kept in the first and ignored for the second", () => {
  const dir = `${SKILL}/`;
  const out = run([dir, "close"], { parts: { close: "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT} again=${CLAUDE_SKILL_DIR}\n" } });
  assert.deepEqual(out, printed(`skill=${dir} root=${ROOT}/plugin again=${dir}\n`));
});

test("a skill dir spelled with a dot-dot segment is expanded as passed, never canonicalised", () => {
  const dir = `${ROOT}/plugin/skills/../skills/demo`;
  const out = run([dir, "close"], { skill: dir, parts: { close: "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT}\n" } });
  assert.deepEqual(out, printed(`skill=${dir} root=${ROOT}/plugin/skills/..\n`));
});

test("a skill dir written with backslashes derives the plugin root across them (a Windows CLAUDE_SKILL_DIR)", () => {
  const dir = "C:\\host\\plugin\\skills\\demo";
  const out = run([dir, "close"], { skill: dir, parts: { close: "${CLAUDE_PLUGIN_ROOT}|${CLAUDE_SKILL_DIR}\n" } });
  assert.deepEqual(out, printed(`C:\\host\\plugin|${dir}\n`));
});

test("a relative skill dir is looked up and expanded as passed", () => {
  const dir = "plugin/skills/demo";
  const out = run([dir, "close"], { skill: dir, parts: { close: "skill=${CLAUDE_SKILL_DIR} root=${CLAUDE_PLUGIN_ROOT}\n" } });
  assert.deepEqual(out, printed("skill=plugin/skills/demo root=plugin\n"));
});

test("a skill dir holding $& or $1 expands literally (a replacement pattern would paste the matched text)", () => {
  const dir = "/r/a$&b/skills/de$1mo";
  const out = run([dir, "close"], { skill: dir, parts: { close: "${CLAUDE_SKILL_DIR}|${CLAUDE_PLUGIN_ROOT}\n" } });
  assert.deepEqual(out, printed("/r/a$&b/skills/de$1mo|/r/a$&b\n"));
});

test("a fragment block prints the fragment of the configured switch value in its place, fence lines removed", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "Update the memory.\n\nSecond line.\n", "memory.false.md": "No memory.\n" },
    parts: { close: `before\n\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n\nafter\n` },
  });
  assert.deepEqual(out, printed("before\n\nUpdate the memory.\n\nSecond line.\n\nafter\n"));
});

test("a fragment block prints the fragment of a false switch when only the .false.md file matches the value", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: false\n",
    fragments: { "memory.true.md": "Update the memory.\n", "memory.false.md": "No memory.\n" },
    parts: { close: `before\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\nafter\n` },
  });
  assert.deepEqual(out, printed("before\nNo memory.\nafter\n"));
});

test("a fragment block whose value has no fragment file prints nothing in its place", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: false\n",
    fragments: { "memory.true.md": "Update the memory.\n" },
    parts: { close: `before\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\nafter\n` },
  });
  assert.deepEqual(out, printed("before\nafter\n"));
});

test("a call block naming a key the switch-text core does not know prints nothing in its place (the block has the call shape, so it is resolved)", () => {
  const call = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.nope "${CLAUDE_SKILL_DIR}" memory';
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "Update the memory.\n" },
    parts: { close: `before\n${FENCE}!\n${call}\n${FENCE}\nafter\n` },
  });
  assert.deepEqual(out, printed("before\nafter\n"));
});

test("a branching.mode call spelled with its joined empty quotes selects the branching fragment", () => {
  const call = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branch';
  const out = run([SKILL, "close"], {
    config: "branching:\n  mode: allowed\n",
    fragments: { "branch.allowed.md": "Branching allowed.\n" },
    parts: { close: `${FENCE}!\n${call}\n${FENCE}\n` },
  });
  assert.deepEqual(out, printed("Branching allowed.\n"));
});

test("a fragment's own placeholders are expanded and two blocks in one part are both replaced in order", () => {
  const qaCall = '"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" build.qa "${CLAUDE_SKILL_DIR}" qa';
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n  qa: true\n",
    fragments: { "memory.true.md": "memory at ${CLAUDE_SKILL_DIR}\n", "qa.true.md": "qa under ${CLAUDE_PLUGIN_ROOT}\n" },
    parts: { close: `${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n${FENCE}!\n${qaCall}\n${FENCE}\n` },
  });
  assert.deepEqual(out, printed(`memory at ${SKILL}\nqa under ${ROOT}/plugin\n`));
});

test("a fragment with no final newline is followed by the next line of the part on the same line (the fragment is appended as it is)", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "no newline" },
    parts: { close: `${FENCE}!\n${MEMORY_CALL}\n${FENCE}\nafter\n` },
  });
  assert.deepEqual(out, printed("no newlineafter\n"));
});

test("a closing fence on the last line with no newline still closes the block", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "Update the memory.\n" },
    parts: { close: `before\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}` },
  });
  assert.deepEqual(out, printed("before\nUpdate the memory.\n"));
});

test("a line ending in a carriage return still matches as a fence or a call line, other lines keep theirs", () => {
  const out = run([SKILL, "close"], {
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "Update the memory.\n" },
    parts: { close: `before\r\n${FENCE}!\r\n${MEMORY_CALL}\r\n${FENCE}\r\nafter\r\n` },
  });
  assert.deepEqual(out, printed("before\r\nUpdate the memory.\nafter\r\n"));
});

test("the config is read from the repository root when the cwd is a directory below it", () => {
  const out = run([SKILL, "close"], {
    cwd: `${ROOT}/plugin/skills`,
    config: "build:\n  memory: true\n",
    fragments: { "memory.true.md": "Update the memory.\n" },
    parts: { close: `${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n` },
  });
  assert.deepEqual(out, printed("Update the memory.\n"));
});

for (const [label, block] of [
  ["two body lines", `${FENCE}!\n${MEMORY_CALL}\necho extra\n${FENCE}\n`],
  ["a different command", `${FENCE}!\n"\${CLAUDE_PLUGIN_ROOT}/scripts/config.sh"\n${FENCE}\n`],
  ["an extra argument", `${FENCE}!\n${MEMORY_CALL} extra\n${FENCE}\n`],
  ["a plain fence opening", `${FENCE}\n${MEMORY_CALL}\n${FENCE}\n`],
  ["a bash fence opening", `${FENCE}bash\n${MEMORY_CALL}\n${FENCE}\n`],
  ["an indented fence opening", `  ${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n`],
  ["a blank after the fence opening", `${FENCE}! \n${MEMORY_CALL}\n${FENCE}\n`],
  ["an empty body", `${FENCE}!\n${FENCE}\n`],
  ["a second fence opening as its first body line", `${FENCE}!\n${FENCE}!\n${MEMORY_CALL}\n${FENCE}\n`],
  ["a block never closed", `${FENCE}!\n${MEMORY_CALL}\n`],
  ["a block never closed and no final newline", `${FENCE}!\n${MEMORY_CALL}`],
] as const) {
  test(`a fenced block with ${label} prints unchanged, its placeholders expanded like any other line`, () => {
    const part = `before\n${block}after\n`;
    const out = run([SKILL, "close"], { config: "build:\n  memory: true\n", fragments: { "memory.true.md": "Update the memory.\n" }, parts: { close: part } });
    assert.deepEqual(out, printed(part.replaceAll("${CLAUDE_PLUGIN_ROOT}", `${ROOT}/plugin`).replaceAll("${CLAUDE_SKILL_DIR}", SKILL)));
  });
}

test("a fenced block holding another command prints as text and nothing is written (the core runs no command)", () => {
  const part = `${FENCE}!\ntouch "${ROOT}/ran.txt"\n${FENCE}\n`;
  const fs = fakeFs({ [`${SKILL}/parts/close.md`]: part });
  const out = runSkillPart([SKILL, "close"], ROOT, { fs, git: fakeGit({ root: ROOT, tracked: [] }) });
  assert.deepEqual([out, fs.exists(`${ROOT}/ran.txt`)], [printed(part), false]);
});

const USAGE = "usage: skill-part.sh <skill dir> <part>";

for (const [label, argv, reason] of [
  ["no argument", [], USAGE],
  ["an empty skill dir", ["", "close"], USAGE],
  ["a missing part", [SKILL], USAGE],
  ["an empty part", [SKILL, ""], USAGE],
  ["an uppercase part name", [SKILL, "Close"], "part name must match [a-z0-9-]+: Close"],
  ["a part name with a slash", [SKILL, "../close"], "part name must match [a-z0-9-]+: ../close"],
  ["a part name with a dot", [SKILL, "close.md"], "part name must match [a-z0-9-]+: close.md"],
  ["a part name with a blank", [SKILL, "clo se"], "part name must match [a-z0-9-]+: clo se"],
  ["a part name ending on a newline", [SKILL, "close\n"], "part name must match [a-z0-9-]+: close\n"],
  ["a part file that is absent", [SKILL, "nothere"], `no such part file: ${SKILL}/parts/nothere.md`],
  ["an absent part file under a skill dir with a trailing slash", [`${SKILL}/`, "nothere"], `no such part file: ${SKILL}//parts/nothere.md`],
] as const) {
  test(`${label} exits 1 with one error line on stderr and nothing on stdout`, () => {
    assert.deepEqual(run([...argv], { parts: { close: "text\n" } }), refused(reason));
  });
}

test("a part path that is a directory, and a part file that cannot be read, exit 1 as an absent one does", () => {
  const reason = `no such part file: ${SKILL}/parts/close.md`;
  assert.deepEqual(run([SKILL, "close"], { dirs: [`${SKILL}/parts/close.md`] }), refused(reason));
  assert.deepEqual(run([SKILL, "close"], { unreadable: [`${SKILL}/parts/close.md`] }), refused(reason));
});

test("a third argument is ignored", () => {
  assert.deepEqual(run([SKILL, "close", "extra"], { parts: { close: "text\n" } }), printed("text\n"));
});
