/*
 * plan-index-fixture.ts - the helpers plan-index.test.ts and
 * plan-index.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/plan-index.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plan-index.sh");

/** The dated run directory plan-path.sh owns; the decomposition lands beside the plan. */
export const PLAN_DIR = "docs/_specs/2026-09-20-10-00-00_add-login";
export const PLAN_REL = `${PLAN_DIR}/plan.md`;

export function run(dir: string, env: Record<string, string>, args: string[]) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash" });
}

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export interface TaskFields {
  id?: string;
  title?: string;
  tdd?: string;
  /** Omitted entirely unless set - an absent line is what an ordinary task looks like. */
  exclusive?: string;
  /** Omitted entirely unless set - only a fixing task carries the fixer's RED test. */
  repro?: string;
  /** Omitted entirely unless set - the plan marks only a task whose design it cannot settle. */
  hard?: string;
  covers?: string;
  /** `null` omits the line entirely - the shape a plan written before `Uses:` has. */
  uses?: string | null;
  deps?: string;
  files?: string;
  /** The whole Verification value; the default names no file. */
  verification?: string;
  /** Semicolon-separated clauses; the decomposition numbers them one per line. */
  dod?: string;
  /** The whole Delivers value; the default names no contract block. */
  delivers?: string;
}

/** The `## Contracts` appendix every default task names through `Uses: C1`. It
 *  sits BELOW the tasks, so it never reaches spec.md - only the task files whose
 *  `Uses:` line asks for it. Its `File:` line says `none` - a wire shape declared
 *  in no file of this plan - which keeps the ownership rules out of every case
 *  that is not about them; the cases that are build their own appendix. */
export const CONTRACT = [
  "### C1 - Login endpoint",
  "",
  "File: none",
  "",
  "POST /login -> 200 | 401",
  "",
  "Body: `{ user, pass }`",
];

/** The acceptance criteria both spec shapes carry: two of them, the first
 *  wrapped over two lines - a criterion's continuation is part of its text and
 *  has to reach the task file with it. */
export function criteriaLines(criteria: number): string[] {
  return [
    "1. A user with valid credentials gets a session.",
    "   The session survives a reload.",
    "2. An invalid password is rejected.",
  ].slice(0, criteria === 1 ? 2 : 3);
}

/** The head of a plan built from `templates/spec-lite.md`. */
export function liteHead(criteria: number): string[] {
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "The session is durable.",
    "",
    "## Acceptance criteria",
    "",
    ...criteriaLines(criteria),
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/login.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "- OAuth.",
    "",
  ];
}

/** The head of a plan built from `templates/spec-full.md`: the same four
 *  anchors, wrapped in the sections the big shape adds around them. */
export function fullHead(criteria: number): string[] {
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "The session is durable.",
    "",
    "## Problem",
    "",
    "Anyone can read another person's orders.",
    "",
    "## Current behaviour",
    "",
    "Every page is public.",
    "",
    "### Must not change",
    "",
    "- The public catalogue stays reachable without an account.",
    "",
    "## Behaviour",
    "",
    "### S1 - Signing in [NEW]",
    "",
    "A returning customer reaches their own orders.",
    "",
    "Given a registered customer",
    "When they submit their credentials",
    "Then they see their own orders",
    "",
    "### Edge cases",
    "",
    "- An empty password -> the form is rejected before anything is checked.",
    "",
    "## Glossary",
    "",
    "- Session - the proof that this visitor signed in, held until they leave.",
    "",
    "## Acceptance criteria",
    "",
    ...criteriaLines(criteria),
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/login.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "- OAuth.",
    "",
    "## Solution requirements",
    "",
    "- The existing session cookie name has to survive.",
    "",
  ];
}

/** A plan in the template's shape: one of the two spec heads, then the task
 *  half every shape shares. */
export function planBody(
  tasks: TaskFields[],
  criteria = 2,
  contracts: string[] = CONTRACT,
  shape: "lite" | "full" = "lite",
): string {
  return [
    ...(shape === "full" ? fullHead(criteria) : liteHead(criteria)),
    "## Tasks",
    "",
    ...tasks.flatMap((t) => [
      "<!-- TASK -->",
      `### ${t.id ?? "T1"} - ${t.title ?? "do the thing"}`,
      `- TDD: ${t.tdd ?? "required"}`,
      ...(t.exclusive === undefined ? [] : [`- Exclusive: ${t.exclusive}`]),
      ...(t.repro === undefined ? [] : [`- Repro: ${t.repro}`]),
      ...(t.hard === undefined ? [] : [`- Hard: ${t.hard}`]),
      `- Covers: ${t.covers ?? "AC1"}`,
      ...(t.uses === null ? [] : [`- Uses: ${t.uses ?? "C1"}`]),
      `- Depends-on: ${t.deps ?? "none"}`,
      `- Files: ${t.files ?? "src/a.ts"}`,
      `- Delivers: ${t.delivers ?? "the thing"}`,
      `- Verification: ${t.verification ?? "npm test -> green"}`,
      `- DoD: ${t.dod ?? "it works"}`,
      "<!-- /TASK -->",
      "",
    ]),
    ...(contracts.length ? ["## Contracts", "", ...contracts, ""] : []),
  ].join("\n");
}

/** T1 names the one contract block, T2 names none: the split has to be selective. */
export const TWO_TASKS: TaskFields[] = [
  { id: "T1", title: "Add the login handler", files: "src/login.ts" },
  {
    id: "T2",
    title: "Reject a bad password",
    covers: "AC2",
    uses: "none",
    deps: "T1",
    files: "src/reject.ts",
  },
];

export function seed(dir: string, body: string): void {
  write(dir, PLAN_REL, body);
}

/** The run's state file, as --split writes it and commit-task.sh advances it.
 *  Every key is optional here: what the file does not carry is simply not set. */
export function seedStatus(dir: string, entries: Record<string, string>): void {
  write(
    dir,
    `${PLAN_DIR}/status.md`,
    ["# status", "", ...Object.entries(entries).map(([k, v]) => `${k}: ${v}`), ""].join("\n"),
  );
}

export function readRun(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, PLAN_DIR, rel), "utf-8");
}

export function taskFiles(dir: string): string[] {
  const tasks = path.join(dir, PLAN_DIR, "tasks");
  return fs.existsSync(tasks) ? fs.readdirSync(tasks).sort() : [];
}

export async function subjects(repo: GitRepo): Promise<string[]> {
  return (await repo.git("log", "--format=%s")).stdout.trim().split("\n").filter(Boolean);
}

/** T1 and T4 are done, T2 is still open, T3 is the task under review. T1 claims
 *  two files, so one task can hold several paths of the coder's extras file. */
export const SCOPE_TASKS: TaskFields[] = [
  { id: "T1", files: "src/done-a.ts,src/done-a2.ts" },
  { id: "T2", files: "src/todo.ts" },
  { id: "T3", files: "src/own.ts" },
  { id: "T4", files: "src/done-b.ts" },
];

export const EXTRA_CODER = `${PLAN_DIR}/work/T3-extra.md`;

/** A run with SCOPE_TASKS, T1 and T4 done, and the coder's extras file for T3 holding `coder`. */
export function seedScope(dir: string, coder: string | null): void {
  seed(dir, planBody(SCOPE_TASKS, 1));
  seedStatus(dir, { progress: "2/4", done: "T1 T4" });
  if (coder !== null) write(dir, EXTRA_CODER, coder);
}

export async function scope(dir: string, id = "T3") {
  return run(dir, {}, [PLAN_REL, "--extra", id]);
}

/** T3 depends on T2, which depends on T1; T4 stands alone. */
export const DISPATCH_TASKS: TaskFields[] = [
  { id: "T1", files: "src/one.ts" },
  { id: "T2", deps: "T1", files: "src/two.ts" },
  { id: "T3", deps: "T2", files: "src/three.ts" },
  { id: "T4", files: "src/four.ts" },
];

export const DISPATCH_ROOT = slash(SUT).replace(/\/scripts\/plan-index\.sh$/, "");

export function seedDispatch(dir: string, status: string[] = [], tasks: TaskFields[] = DISPATCH_TASKS): void {
  seed(dir, planBody(tasks, 1));
  write(dir, `${PLAN_DIR}/status.md`, ["# status", "", "progress: 0/4", "done: none", ...status, ""].join("\n"));
}
