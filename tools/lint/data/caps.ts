/*
 * caps.ts - the word caps of the shipped prompts and the byte caps of the role read sets.
 * Growing a file past its cap fails the lint until the cap is raised on purpose. Each cap sits
 * below the size its file held before the prompt was moved into scripts.
 */

import type { RuleInstance } from "../engine.ts";

const V = "viber/";
const TEST_STRATEGY = "viber/references/test-strategy.md";
const SYNTHESIS = "viber/skills/code-auditor/references/synthesis.md";

function words(name: string, file: string, max: number, why: string): RuleInstance {
  return { id: `cap/${name}`, type: "cap", params: { files: [{ path: V + file }], unit: "words", max }, why };
}

function bytes(role: string, max: number, files: Array<{ path: string; sections?: string[] }>, why: string): RuleInstance {
  return { id: `cap/${role}-read-set`, type: "cap", params: { files, unit: "bytes", max }, why };
}

const IMPLEMENTOR = "the file is read on every start and re-read through the whole build; its words count against the user's usage limits";
const MEMORY = "the file is read on every /viber:memory or /viber:rules run; the mechanical steps live in scripts, so it sits below its count before them (memory skill 2053, memory-auditor 736, rules skill 1848, rules-auditor 1463)";
const PLANNER = "the file is read on every plan and review round; the cap sits below the 2100 words before the scripted review rounds and the 1800 before the scripted steps of intent, fixer and e2e";
const REVIEWER = "a plan reviewer reads its whole file on every review round; the cap sits below its count before the scripted plan checks";
const SKILL = "a skill reads its whole file on every run; the cap sits below its count before the scripted steps";
const AUDITOR = "the file is read on every audit run; the cap sits below its count before the scripted pipeline";
const BUDGET = "the text a role reads on a dispatch counts against the user's usage limits; raised only on purpose";

export const rules: RuleInstance[] = [
  words("implementor-skill", "skills/implementor/SKILL.md", 2837, `${IMPLEMENTOR}; the cap sits below the 2867 words of the cap of part 1 (task loop scripted)`),
  words("implementor-close", "skills/implementor/parts/close.md", 1312, `${IMPLEMENTOR}; the cap sits below the 1325 words held before the scripted close`),
  words("closeout", "agents/closeout.md", 914, `${IMPLEMENTOR}; the cap sits below the 1431 words held before the scripted close`),
  words("test-runner", "agents/test-runner.md", 1233, `${IMPLEMENTOR}; the cap sits below the 1257 words held before the scripted close`),

  words("memory-skill", "skills/memory/SKILL.md", 1900, MEMORY),
  words("memory-auditor", "agents/memory-auditor.md", 732, MEMORY),
  words("rules-skill", "skills/rules/SKILL.md", 1700, MEMORY),
  words("rules-auditor", "agents/rules-auditor.md", 1460, MEMORY),

  words("planner-skill", "skills/planner/SKILL.md", 1490, `${PLANNER}; the code reading and the plan text live in plan-writer (1775 before)`),
  words("plan-writer", "agents/plan-writer.md", 1520, "the plan writer reads its whole file on every plan, and its words count against the user's usage limits; raised only on purpose"),
  words("planner-review", "agents/planner-review.md", 1033, `${REVIEWER} (1056 before)`),
  words("planner-spec-review", "agents/planner-spec-review.md", 790, `${REVIEWER} (797 before)`),
  words("planner-graph-review", "agents/planner-graph-review.md", 616, `${REVIEWER} (618 before)`),
  words("planner-task-review", "agents/planner-task-review.md", 733, `${REVIEWER} (735 before)`),
  words("outside-plan-review", "agents/outside-plan-review.md", 470, `${REVIEWER} (490 before)`),

  words("fixer-skill", "skills/fixer/SKILL.md", 1180, `${SKILL} (1191 before)`),
  words("e2e-skill", "skills/e2e/SKILL.md", 1189, `${SKILL} (1213 before)`),
  words("prototype-skill", "skills/prototype/SKILL.md", 820, `${SKILL} (821 before)`),
  words("pr-feedback-skill", "skills/pr-feedback/SKILL.md", 664, `${SKILL} (667 before)`),
  words("pr-feedback-reply-skill", "skills/pr-feedback-reply/SKILL.md", 363, `${SKILL} (433 before)`),
  words("issue-create-skill", "skills/issue-create/SKILL.md", 180, `${SKILL} (195 before)`),
  words("factory-skill", "skills/factory/SKILL.md", 777, `${SKILL} (789 before)`),
  words("commit-skill", "skills/commit/SKILL.md", 322, `${SKILL} (397 before)`),
  words("pr-create-skill", "skills/pr-create/SKILL.md", 745, `${SKILL} (824 before)`),
  words("setup-skill", "skills/setup/SKILL.md", 466, `${SKILL} (470 before)`),
  words("idea-validator-skill", "skills/idea-validator/SKILL.md", 1006, `${SKILL} (1016 before)`),

  words("code-auditor-skill", "skills/code-auditor/SKILL.md", 900, `${AUDITOR} (1655 before)`),
  words("code-auditor-synthesis", "skills/code-auditor/references/synthesis.md", 700, `${AUDITOR} (1489 before)`),
  words("critic", "agents/critic.md", 610, `${AUDITOR} (613 before)`),
  words("scout", "agents/scout.md", 306, `${AUDITOR} (308 before)`),
  words("hunter", "agents/hunter.md", 854, `${AUDITOR} (877 before)`),
  words("mapper", "agents/mapper.md", 760, `${AUDITOR} (882 before)`),

  bytes("planner", 44200, [
    { path: "viber/agents/plan-writer.md" },
    { path: "viber/references/plan-rules.md" },
    { path: "viber/references/plan-rules-script.md" },
    { path: "viber/skills/planner/templates/spec-full.md" },
    { path: "viber/skills/planner/templates/tasks.md" },
    { path: TEST_STRATEGY, sections: ["Layers", "Proves", "Ports"] },
  ], BUDGET),
  bytes("planner-review", 31223, [
    { path: "viber/agents/planner-review.md" },
    { path: "viber/references/plan-rules.md" },
    { path: TEST_STRATEGY, sections: ["Layers", "Proves", "Ports"] },
  ], `${BUDGET}; the cap carries the room of the two plan rules a restructuring task and a mechanical change add to plan-rules.md`),
  bytes("task-coder", 26199, [
    { path: "viber/agents/task-coder.md" },
    { path: "viber/references/tdd.md" },
    { path: TEST_STRATEGY },
  ], BUDGET),
  bytes("task-reviewer", 18135, [
    { path: "viber/agents/task-reviewer.md" },
    { path: TEST_STRATEGY, sections: ["Layers", "Proves", "Writing"] },
  ], `${BUDGET}; the cap carries the room of the red check verdicts a review receives`),
  bytes("hunter", 18463, [
    { path: "viber/agents/hunter.md" },
    { path: "viber/skills/code-auditor/references/lenses/tests.md" },
    { path: SYNTHESIS, sections: ["Hunter report schema", "Claim sidecar schema"] },
    { path: TEST_STRATEGY, sections: ["Proves"] },
  ], BUDGET),
];
