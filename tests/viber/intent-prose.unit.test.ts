/*
 * intent-prose.unit.test.ts - holds the shipped text of the `intent` skill to its round-based interview wiring.
 * Proves: the round rule and the Explore dispatch, the closed signal list with the attachment sentence, the absence
 * of the fast path and of any spec shape proposal, the `done` part carrying the end-of-interview fragments, the
 * summary file hand-off with its plan mode exception, one prover per question of a round, the cap on the decisions
 * of a round (the `config.sh --questions` preload, its `allowed-tools` entry, `all`, the order, the remaining-count
 * line, the resume reference) and the word cap of the start text.
 * The skill's markdown is the product, so the tests read it as text. The cap is the word count of `SKILL.md` plus
 * `issues-input.false.md` (the fragment the template defaults select) after the rewrite, times 1.1, rounded up; raise
 * it only on purpose.
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const INTENT = path.resolve(import.meta.dirname, "../../viber/skills/intent");

const START_TEXT_WORD_CAP = 1128;
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

for (const heading of ["## Returning to a draft", "## The interview", "## Done"]) {
  test(`SKILL.md keeps the heading ${heading} that the references point at`, () => {
    assert.ok(SKILL.split(/\r?\n/).includes(heading));
  });
}

test("SKILL.md names the closed signal list of five signals", () => {
  assert.match(SKILL, /`Split proposal:`/);
  assert.match(SKILL, /issue reference/);
  assert.match(SKILL, /`roadmap\.md`/);
  assert.match(SKILL, /`Attachment:`/);
  assert.match(SKILL, /`--prove`/);
});

test("SKILL.md turns each .temp/ path the arguments name into an Attachment: line and a path elsewhere into none", () => {
  assert.match(SKILL, /Each path under the repository's `\.temp\/` that the arguments name/);
  assert.match(SKILL, /`Attachment: <absolute path/);
  assert.match(SKILL, /A path elsewhere gets none/);
});

test("SKILL.md reads the summary file a Split proposal: input names and carries its issue, attachment, work and branch lines over unchanged", () => {
  assert.match(SKILL, /`Split proposal:`[^\n]*summary file[^\n]*read/);
  assert.match(SKILL, /`Issue:`, `Attachment:`, `Work:` and `Branch:` lines/);
  assert.match(SKILL, /unchanged/);
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
  assert.match(DONE, /\.temp\/viber\/intent\/summary-<YYYY-MM-DD-HH-MM-SS>\.md`/);
  assert.match(DONE, /`viber:planner`[^\n]*(its|that) absolute path[^\n]*only argument/);
});

test("the hand-off is reached after any issue save and branch re-settle and never after a Stop answer", () => {
  assert.match(DONE, /after any issue save and branch re-settle/);
  assert.match(DONE, /never after a "Stop" answer/);
});

test("inside plan mode the hand-off writes no file and restates the confirmed summary verbatim in the invocation", () => {
  assert.match(DONE, /plan mode[^\n]*writes? no file[^\n]*verbatim/);
});

test("the summary file carries the summary fields and each signal line that applies", () => {
  const tokens = ["problem", "acceptance criteria", "out of scope", "binding constraints", "way to resolve", "`Issue:", "`Attachment:", "`Work:", "`Branch:", "`Roadmap:", "stop at a specification", "draft run key"];
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

test("prove.md dispatches one prover per question of a round in one message", () => {
  const text = read("references/prove.md");
  assert.match(text, /one `Agent` per question of the round/);
  assert.match(text, /in one message/);
});

test("the start text (SKILL.md plus issues-input.false.md) stays within its word cap", () => {
  const count = words(SKILL) + words(read("fragments/issues-input.false.md"));
  assert.ok(count <= START_TEXT_WORD_CAP, `${count} words, cap ${START_TEXT_WORD_CAP}`);
});
