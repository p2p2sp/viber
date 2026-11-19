/*
 * review-round-fixture.ts - the helpers review-round.test.ts and
 * review-round.critical.test.ts share: what both tiers need to seed a case and
 * run viber/skills/planner/scripts/review-round.sh. It holds no case of its
 * own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/planner/scripts/review-round.sh");
export const REFS = slash(path.resolve(import.meta.dirname, "../../viber/references"));

export const PLAN_REL = "docs/_specs/2026-09-20-10-00-00_add-login/plan.md";

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A lite plan of `count` independent tasks T1..Tcount, each on its own `add` file. */
export function litePlan(count: number): string {
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "",
    "## Acceptance criteria",
    "",
    "1. A user with valid credentials gets a session.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    ...ids.map((n) => `- add - src/t${n}.ts - the part ${n}`),
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "",
    "## Tasks",
    "",
    ...ids.flatMap((n) => [
      "<!-- TASK -->",
      `### T${n} - Do thing ${n}`,
      "- TDD: required",
      "- Covers: AC1",
      "- Uses: C1",
      "- Depends-on: none",
      `- Files: src/t${n}.ts`,
      "- Delivers: the thing",
      "- Verification: npm test -> green",
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

export function review(repo: GitRepo, args: string[]) {
  return runScript(SUT, args, { cwd: repo.dir, env: repo.env, shell: "bash" });
}

export function start(repo: GitRepo, plan: string, ...flags: string[]) {
  return review(repo, [plan, "start", ...flags]);
}
