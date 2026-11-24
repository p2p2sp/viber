/*
 * intent-prose.unit.test.ts - holds the shipped text of the `intent` skill to its round-based interview wiring.
 * Proves: the round rule and the Explore dispatch, the closed signal list with the attachment sentence, the split
 * proposal pointer of `SKILL.md` and the rules it points at in `references/split.md`, the absence
 * of the fast path and of any spec shape proposal, the `done` part carrying the end-of-interview fragments, the
 * summary file hand-off with its plan mode exception, the cap on the decisions
 * of a round (the `config.sh --questions` preload, its `allowed-tools` entry, `all`, the order, the remaining-count
 * line, the resume reference) and the word cap of the start text.
 * The skill's markdown is the product, so the tests read it as text. The cap is the word count of `SKILL.md` plus
 * `issues-input.false.md` (the fragment the template defaults select) with the split proposal rules in
 * `references/split.md`, counted by whitespace split, and sits below the count the text held before the scripted
 * steps; raise it only on purpose.
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const INTENT = path.resolve(import.meta.dirname, "../../viber/skills/intent");

const START_TEXT_WORD_CAP = 922;
const START_TEXT_WORDS_BEFORE_SCRIPTED_STEPS = 968;
const START_TEXT_WORDS_BEFORE_CAP_RULE = 1027;

function read(rel: string): string {
  return fs.readFileSync(path.join(INTENT, rel), "utf8");
}

function frontmatter(text: string): string {
  return text.split(/\r?\n---\r?\n/)[0];
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const SKILL = read("SKILL.md");
const DONE = read("parts/done.md");
const HEAD = frontmatter(SKILL);

test("SKILL.md asks every decision whose prerequisites are settled in one numbered round, recommendation first, 'yes' accepting it", () => {
  assert.match(SKILL, /every decision whose prerequisites are settled/);
  assert.match(SKILL, /three options/);
  assert.match(SKILL, /recommendation first/);
  assert.match(SKILL, /"yes"/);
  assert.match(SKILL, /later round/);
});

const ROUND_BULLET = SKILL.split(/\r?\n/).find((line) => line.startsWith("- One message carries")) ?? "";

test("the round bullet closes on the inline preload of config.sh --questions", () => {
  assert.match(ROUND_BULLET, /!`"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/config\.sh" --questions`$/);
});

test("allowed-tools lists the config.sh Bash entry the preload runs", () => {
  assert.match(HEAD, /allowed-tools:[^\n]*Bash\(\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/config\.sh:\*\)/);
});

test("the round bullet lets `all` lift the cap", () => {
  assert.match(ROUND_BULLET, /`all` lifts it/);
});

test("the round bullet orders a capped round prerequisites first, then the cover order", () => {
  assert.match(ROUND_BULLET, /prerequisites first, then the cover order/);
});

test("the round ends on one line counting the decisions that wait, written only when some wait", () => {
  assert.match(ROUND_BULLET, /when some wait, end on one line counting them/);
});

test("resume.md asks its questions in the rounds of the skill's interview", () => {
  assert.match(read("references/resume.md"), /in the rounds of the skill's `## The interview`/);
});

test("the start text grows by at most 30 words over its count before the cap rule", () => {
  const count = words(SKILL) + words(read("fragments/issues-input.false.md"));
  assert.ok(count <= START_TEXT_WORDS_BEFORE_CAP_RULE + 30, `${count} words, allowed ${START_TEXT_WORDS_BEFORE_CAP_RULE + 30}`);
});

test("SKILL.md gets repository facts from the built-in Explore agent with no model while only dependent questions wait", () => {
  assert.match(SKILL, /`subagent_type: Explore`/);
  assert.match(SKILL, /no `model:`/);
  assert.match(SKILL, /only the questions that need it wait/);
});

for (const heading of ["## Returning to a roadmap", "## The interview", "## Done"]) {
  test(`SKILL.md keeps the heading ${heading} that the references point at`, () => {
    assert.ok(SKILL.split(/\r?\n/).includes(heading));
  });
}

test("SKILL.md names the closed signal list of four signals", () => {
  assert.match(SKILL, /`Split proposal:`/);
  assert.match(SKILL, /issue reference/);
  assert.match(SKILL, /`roadmap\.md`/);
  assert.match(SKILL, /`Attachment:`/);
});

const ATTACH_RULE = SKILL.split(/\r?\n/).find((line) => line.includes("attach-lines.sh\"")) ?? "";

test("SKILL.md runs attach-lines.sh with every path the arguments name and carries its Attachment: lines unless the conversation already does", () => {
  assert.match(ATTACH_RULE, /^Run `"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/attach-lines\.sh" <every path the arguments name>`/);
  assert.match(ATTACH_RULE, /carry each `Attachment:` line it prints unless the conversation already carries it/);
});

test("SKILL.md makes no attach-lines.sh call when the arguments name no path and writes no Attachment: line on an exit 2", () => {
  assert.match(ATTACH_RULE, /no path named, no call/);
  assert.match(ATTACH_RULE, /on an exit 2 write no `Attachment:` line/);
});

test("allowed-tools lists the attach-lines.sh Bash entry the call needs", () => {
  assert.match(HEAD, /allowed-tools:[^\n]*Bash\(\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/attach-lines\.sh:\*\)/);
});

const FROM_PROPOSAL = read("references/split.md").split(/\r?\n## /).find((part) => part.startsWith("From a split proposal")) ?? "";

test("SKILL.md sends a Split proposal: input to split.md before any other step and holds none of its rules (they are read only on that path, never in every start text)", () => {
  assert.match(SKILL, /`Split proposal:`[^\n]*references\/split\.md` before any other step/);
  assert.doesNotMatch(SKILL, /summary file/);
});

test("split.md takes a Split proposal: input as sized, skips the branch start and issue steps, reads the summary file it names and carries its issue, attachment, work and branch lines over unchanged", () => {
  assert.match(FROM_PROPOSAL, /already sized: estimate no scope/);
  assert.match(FROM_PROPOSAL, /Skip the skill's branch start step and every issue step of its `## Done`/);
  assert.match(FROM_PROPOSAL, /summary file[^\n]*read it/);
  assert.match(FROM_PROPOSAL, /`Issue:`, `Attachment:`, `Work:` and `Branch:` lines[^\n]*unchanged/);
});

test("SKILL.md proposes no spec shape section", () => {
  assert.doesNotMatch(SKILL, /^## Propose the spec shape/m);
  assert.doesNotMatch(SKILL, /spec-full|spec-lite/);
});

test("SKILL.md makes no planning.fast-path call", () => {
  assert.doesNotMatch(SKILL, /planning\.fast-path/);
  assert.doesNotMatch(SKILL, /fast.path/i);
});

test("SKILL.md holds no one-question-per-message rule", () => {
  assert.doesNotMatch(SKILL, /one question/i);
  assert.doesNotMatch(SKILL, /more than one question/i);
});

test("the fast-path fragment and its prose test are deleted", () => {
  assert.equal(fs.existsSync(path.join(INTENT, "fragments/fast-path.true.md")), false);
  assert.equal(fs.existsSync(path.join(import.meta.dirname, "fast-path-prose.unit.test.ts")), false);
});

test("the frontmatter description does not say 'one question at a time'", () => {
  assert.doesNotMatch(HEAD, /one question at a time/i);
});

test("the frontmatter description does not suggest plain plan mode", () => {
  assert.doesNotMatch(HEAD, /plain plan/i);
});

test("## Done runs skill-part.sh once, for the done part", () => {
  const calls = SKILL.match(/skill-part\.sh" "\$\{CLAUDE_SKILL_DIR\}" "done"/g) ?? [];
  assert.equal(calls.length, 1);
  assert.match(SKILL, /Bash\(\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/skill-part\.sh:\*\)/);
});

test("parts/done.md holds the issues-done and branching-handoff fragment calls", () => {
  assert.match(DONE, /switch-text\.sh" github\.issues "\$\{CLAUDE_SKILL_DIR\}" issues-done/);
  assert.match(DONE, /switch-text\.sh" branching\.""mode "\$\{CLAUDE_SKILL_DIR\}" branching-handoff/);
});

test("SKILL.md holds neither the issues-done nor the branching-handoff fragment call", () => {
  assert.doesNotMatch(SKILL, /issues-done/);
  assert.doesNotMatch(SKILL, /branching-handoff/);
});

test("the hand-off writes the summary file with Write and passes its absolute path alone to viber:planner outside plan mode", () => {
  assert.match(HEAD, /allowed-tools:[^\n]*\bWrite\b/);
  assert.match(DONE, /"\$\{CLAUDE_SKILL_DIR\}\/scripts\/summary-path\.sh"/);
  assert.match(DONE, /`Write` the content to its `path:`/);
  assert.match(DONE, /`viber:planner`[^\n]*(its|that) absolute path[^\n]*only argument/);
  assert.doesNotMatch(DONE, /date \+%Y/);
});

test("allowed-tools lists the summary-path.sh entry of the hand-off and keeps Bash(date:*) for the issue save", () => {
  assert.match(HEAD, /allowed-tools:[^\n]*Bash\(\$\{CLAUDE_SKILL_DIR\}\/scripts\/summary-path\.sh:\*\)/);
  assert.match(HEAD, /allowed-tools:[^\n]*Bash\(date:\*\)/);
});

test("the hand-off is reached after any issue save and branch re-settle and never after a Stop answer", () => {
  assert.match(DONE, /after any issue save and branch re-settle/);
  assert.match(DONE, /never after a "Stop" answer/);
});

test("inside plan mode the hand-off writes no file and restates the confirmed summary verbatim in the invocation", () => {
  assert.match(DONE, /plan mode[^\n]*writes? no file[^\n]*verbatim/);
});

test("the summary file carries the summary fields and each signal line that applies", () => {
  const tokens = ["problem", "acceptance criteria", "out of scope", "binding constraints", "way to resolve", "`Issue:", "`Attachment:", "`Work:", "`Branch:", "`Roadmap:"];
  assert.deepEqual(tokens.filter((token) => !DONE.includes(token)), []);
});

test("issues-input.false.md forbids only issue bodies and comments", () => {
  const text = read("fragments/issues-input.false.md");
  assert.match(text, /write no issue body and no issue comment/);
  assert.doesNotMatch(text, /no file/);
});

test("issues-input.true.md names the summary file among the files written", () => {
  assert.match(read("fragments/issues-input.true.md"), /an issue body, an issue comment and the summary file/);
});

for (const value of ["true", "false"]) {
  test(`issues-input.${value}.md classifies the argument with the arg-kind.sh issue call, adding --more when other words follow, and holds no shape rule`, () => {
    const text = read(`fragments/issues-input.${value}.md`);
    assert.match(text, /"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/arg-kind\.sh" issue "<first word>"/);
    assert.match(text, /`--more`[^\n]*other words follow/);
    assert.match(text, /`NEXT: issue`/);
    assert.doesNotMatch(text, /token that is a number/);
  });
}

test("issues-input.true.md runs issue-facts.sh with the ref: value on NEXT: issue and takes the argument as input on NEXT: text", () => {
  const text = read("fragments/issues-input.true.md");
  assert.match(text, /`NEXT: issue`[^\n]*issue-facts\.sh" "<ref>"` with the `ref:` value/);
  assert.match(text, /`NEXT: text` -> the argument is the input to interview/);
});

test("issues-input.false.md says in one line that issue handling is off on NEXT: issue", () => {
  assert.match(read("fragments/issues-input.false.md"), /on `NEXT: issue` say in one line issue handling is off/);
});

test("allowed-tools lists the arg-kind.sh Bash entry the issue check needs", () => {
  assert.match(HEAD, /allowed-tools:[^\n]*Bash\(\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/arg-kind\.sh:\*\)/);
});

test("the start text (SKILL.md plus issues-input.false.md) ends below 968 words after the scripted argument check", () => {
  const count = words(SKILL) + words(read("fragments/issues-input.false.md"));
  assert.ok(count < 968, `${count} words, must stay below 968`);
});

test("START_TEXT_WORD_CAP sits below the 968 words the start text held before the scripted steps (a cap at or above them lets the prose grow back)", () => {
  assert.ok(START_TEXT_WORD_CAP < START_TEXT_WORDS_BEFORE_SCRIPTED_STEPS);
});

test("the start text (SKILL.md plus issues-input.false.md) stays within its word cap", () => {
  const count = words(SKILL) + words(read("fragments/issues-input.false.md"));
  assert.ok(count <= START_TEXT_WORD_CAP, `${count} words, cap ${START_TEXT_WORD_CAP}`);
});
