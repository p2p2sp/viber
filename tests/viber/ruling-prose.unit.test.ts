/*
 * ruling-prose.unit.test.ts - pins the prose that lets the arbiter write its
 * ruling file and the coder its options file, and `implementor` record rulings and
 * decisions from those files without escaping any text.
 *
 * `arbiter` carries `Write`, takes a `ruling` input line and writes its four output
 * lines to that file; `task-coder` writes its `DECIDE:` line to the file its
 * `decide-file` line names; `implementor` dispatches both lines and records through
 * the `--from`, `--first-of` and fixed-words forms of `commit-task.sh`, whose usage
 * text carries each form. The files read here are shipped prompts and a script
 * usage line, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/ruling-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const RULING_LINE = "ruling: <dir>/work/ruling-<subject>.md";
const DECIDE_FILE_LINE = "decide-file: <dir>/work/<id>-options.md";
const RECORD = '"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh"';
const RULE_FROM = `${RECORD} --rule "<plan>" "<subject>" --from "<dir>/work/ruling-<subject>.md"`;
const DECIDE_FROM = `${RECORD} --decide "<plan>" "<id>" --from "<dir>/work/ruling-<id>.md"`;
const DECIDE_FIRST_OF = `${RECORD} --decide "<plan>" "<id>" --first-of "<dir>/work/<id>-options.md"`;
const RULE_REFUSED = `${RECORD} --rule "<plan>" "<subject>" "<first option>" "the arbiter was refused" "not assessed - the arbiter was refused"`;

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  return text.slice(start, end);
}

function inputBullet(text: string, label: string): string {
  return lines(text).find((line) => line.startsWith(`- A \`${label}\``) || line.startsWith(`- \`${label}:`)) ?? "";
}

const SKILL = `${read("skills/implementor/SKILL.md")}\n${read("skills/implementor/parts/close.md")}`;
const ARBITER = read("agents/arbiter.md");
const CODER = read("agents/task-coder.md");
const COMMIT_TASK = read("scripts/commit-task.sh");

const CODER_DISPATCH = between(SKILL, "Coder dispatch:", "Reviewer dispatch:");
const ARBITER_DISPATCH = between(SKILL, "Arbiter dispatch:", "Commit outside a task:");

function recordingLines(): string[] {
  return lines(SKILL).filter((line) => /commit-task\.sh" --(rule|decide)/.test(line));
}

test("arbiter lists the tools Read, Grep, Glob, Write", () => {
  assert.ok(lines(ARBITER).includes("tools: Read, Grep, Glob, Write"));
});

test("arbiter's tools paragraph names Read, Grep, Glob and Write", () => {
  assert.ok(ARBITER.includes("Your tools are Read, Grep, Glob and Write, every one of them loaded"));
});

test("arbiter names the ruling input line and reads that path first when it exists", () => {
  const bullet = inputBullet(ARBITER, "ruling");
  assert.ok(bullet.startsWith("- `ruling: <path>`"));
  assert.ok(bullet.includes("when it exists, read it first"));
});

test("arbiter writes its four output lines whole to the ruling path before returning them", () => {
  assert.ok(ARBITER.includes("`Write` these four lines whole to your `ruling` path before you return them"));
  const output = between(ARBITER, "## Output", "A tool call the harness refuses");
  for (const prefix of ["`VERDICT: RULED`", "`RULING: ", "`WHY: ", "`COST: "]) {
    assert.ok(output.includes(`- ${prefix}`), prefix);
  }
});

test("arbiter writes no other file and no longer says it changes no files", () => {
  assert.ok(ARBITER.includes("and write no other file"));
  assert.ok(!ARBITER.includes("you change no files"));
  assert.ok(!ARBITER.includes("Read-only"));
});

test("task-coder names the decide-file input line", () => {
  assert.ok(inputBullet(CODER, "decide-file").startsWith("- A `decide-file` line"));
});

test("task-coder reads its options file first when it exists", () => {
  assert.ok(inputBullet(CODER, "decide-file").includes("when it exists, read it first"));
});

test("task-coder writes its DECIDE line to the options file whole whenever it returns one", () => {
  const bullet = inputBullet(CODER, "decide-file");
  assert.ok(bullet.includes("whenever you return a `DECIDE:` line, write that line there whole"));
});

test("the arbiter dispatch of implementor carries the C7 ruling line", () => {
  assert.ok(ARBITER_DISPATCH.includes(`\`${RULING_LINE}\``));
  assert.equal(lines(SKILL).filter((line) => line.includes("viber:arbiter")).length, 1);
});

test("the coder dispatch of implementor carries the C7 decide-file line", () => {
  assert.ok(lines(CODER_DISPATCH).includes(DECIDE_FILE_LINE));
  assert.equal(lines(SKILL).filter((line) => line.startsWith("Coder dispatch:")).length, 1);
});

test("an accepted refused arbiter records the first option word of its case through fixed words", () => {
  assert.ok(ARBITER_DISPATCH.includes(`\`${RULE_REFUSED}\``));
  for (const word of ["`accept`", "`skip`", "`continue`", "`leave uncommitted`", "`the coder's first option`"]) {
    assert.ok(ARBITER_DISPATCH.includes(word), word);
  }
  for (const caseName of ["`cap`", "`baseline`", "`tests`", "`final-review`", "`commit`", "`decide`"]) {
    assert.ok(ARBITER_DISPATCH.includes(caseName), caseName);
  }
});

test("the accept answer records an accepted refused arbiter through the fixed-words call", () => {
  const accept = lines(SKILL).find((line) => line.startsWith("- `accept`: the user overrides the gate.")) ?? "";
  assert.ok(accept.includes("recorded through the fixed-words `--rule` call of step 4"));
});

test("implementor records rulings and decisions only through the --from, --first-of and fixed-words forms", () => {
  const forms = [RULE_FROM, DECIDE_FROM, DECIDE_FIRST_OF, RULE_REFUSED];
  const found = recordingLines();
  assert.ok(found.length >= 4);
  for (const line of found) {
    assert.ok(forms.some((form) => line.includes(form)), line);
  }
  for (const form of forms) {
    assert.ok(SKILL.includes(form), form);
  }
});

test("each recording form of implementor appears in the usage text of commit-task.sh", () => {
  const usage = lines(COMMIT_TASK).find((line) => line.startsWith('  echo "error: usage:')) ?? "";
  assert.ok(usage.includes("--decide <plan-file> <task-id> --from <ruling-file>"));
  assert.ok(usage.includes("--decide <plan-file> <task-id> --first-of <options-file>"));
  assert.ok(usage.includes("--rule <plan-file> <subject> --from <ruling-file>"));
  assert.ok(usage.includes("--rule <plan-file> <subject> <ruling> <why> <cost>"));
});

test("implementor holds no instruction to rewrite a quote, dollar sign, backtick or backslash", () => {
  assert.ok(!/dollar sign/i.test(SKILL));
  assert.ok(!/rewritten into words/i.test(SKILL));
  assert.ok(!/escaped as for/i.test(SKILL));
  assert.ok(!/\bescap/i.test(SKILL));
});

test("a decide ruling naming no listed option is recorded through the --first-of call", () => {
  const stall = lines(SKILL).find((line) => line.startsWith("- Coder failure on attempt 1 to 4")) ?? "";
  assert.ok(stall.includes(DECIDE_FROM));
  assert.ok(stall.includes("or the `--first-of` call above when its `RULING` names no listed option"));
});

test("an accepted refused arbiter on case decide is recorded through the --first-of call", () => {
  const bullet = lines(ARBITER_DISPATCH).find((line) => line.includes(`\`${DECIDE_FIRST_OF}\``)) ?? "";
  assert.ok(bullet.includes("an accepted refused arbiter on case `decide`"));
  assert.ok(bullet.includes("a `decide` ruling naming no listed option"));
});

test("a ruling naming no listed option is carried out as the first option with the mismatch in the final summary", () => {
  assert.ok(
    lines(ARBITER_DISPATCH).includes(
      "- A `RULING` naming no listed option -> carry out the first option, the mismatch named in the final summary.",
    ),
  );
});
