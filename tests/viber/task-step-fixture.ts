/*
 * task-step-fixture.ts - the helpers task-step.test.ts and
 * task-step.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/task-step.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/task-step.sh");

export const PLAN_DIR = "docs/_specs/2026-11-18-10-00-00_scripted-step";
export const PLAN_REL = `${PLAN_DIR}/plan.md`;
export const ROOT = slash(SUT).replace(/\/scripts\/task-step\.sh$/, "");

/** T2 depends on T1 and T3 on T2; T4 stands alone. T1 and T3 are TDD tasks. */
export const TASKS = [
  { id: "T1", tdd: "required", deps: "none" },
  { id: "T2", tdd: "none", deps: "T1" },
  { id: "T3", tdd: "required", deps: "T2" },
  { id: "T4", tdd: "none", deps: "none" },
];

/** A task's Files and Verification, where a case needs the red check to run for real. */
export type Overrides = Record<string, { files: string; verify: string }>;

export function planText(overrides: Overrides = {}): string {
  return [
    "# Scripted step",
    "",
    "## Goal",
    "",
    "A task steps through its attempts.",
    "",
    "## Acceptance criteria",
    "",
    "1. A coder return is answered.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/one.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Everything else.",
    "",
    "## Tasks",
    "",
    ...TASKS.flatMap((t) => [
      "<!-- TASK -->",
      `### ${t.id} - do the thing`,
      `- TDD: ${t.tdd}`,
      "- Covers: AC1",
      "- Uses: C1",
      `- Depends-on: ${t.deps}`,
      `- Files: ${overrides[t.id]?.files ?? `src/${t.id}.ts`}`,
      "- Delivers: the thing",
      `- Verification: ${overrides[t.id]?.verify ?? "npm test"} -> green`,
      "- DoD: it works",
      "<!-- /TASK -->",
      "",
    ]),
    "## Contracts",
    "",
    "### C1 - Login endpoint",
    "",
    "File: none",
    "",
    "POST /login -> 200 | 401",
    "",
  ].join("\n");
}

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function seedPlan(repo: GitRepo, config = "", overrides: Overrides = {}): void {
  write(repo.dir, PLAN_REL, planText(overrides));
  write(repo.dir, `${PLAN_DIR}/status.md`, "# status\n\nprogress: 0/4\ndone: none\n");
  if (config !== "") write(repo.dir, ".claude/viber.yml", config);
}

/** One call: the task id, the started mark, then the event and its flags. */
export type Call = string[];

export function step(repo: GitRepo, call: Call, sut = SUT) {
  const [id, mark, ...rest] = call;
  return runScript(sut, [PLAN_REL, id, mark, ...rest], { cwd: repo.dir, env: repo.env, shell: "bash", timeout: 120000 });
}

/** Earlier calls of the same task, run one after another. */
export async function arrange(repo: GitRepo, calls: Call[]): Promise<void> {
  for (const call of calls) {
    const result = await step(repo, call);
    assert.equal(result.status, 0, `arranging ${call.join(" ")} failed: ${result.stderr}`);
  }
}

export function lines(...parts: string[]): string {
  return `${parts.join("\n")}\n`;
}

export function coderLines(id: string, extra: string[] = []): string[] {
  return [
    `task: ${PLAN_DIR}/tasks/${id}.md`,
    `notes: ${PLAN_DIR}/work/${id}-coder.md`,
    `out: .temp/viber/${id}/`,
    `refs: ${ROOT}/references`,
    `extras: ${PLAN_DIR}/work/${id}-extra.md`,
    `decide-file: ${PLAN_DIR}/work/${id}-options.md`,
    ...extra,
  ];
}

export const START_T1: Call = ["T1", "100", "start", "--tier", "sonnet", "--review", "opus"];
export const START_T4_WAIVED: Call = ["T4", "100", "start", "--tier", "sonnet", "--review", "waived"];
export const T1_FAIL: Call = ["T1", "100", "coder", "FAIL"];

export const T1_PASS: Call = ["T1", "100", "coder", "PASS", "--dod", "3/3", "--red", "2"];
