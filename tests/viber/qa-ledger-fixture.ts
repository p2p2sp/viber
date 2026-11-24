/*
 * qa-ledger-fixture.ts - what qa-ledger.critical.test.ts uses to seed a
 * handoff and run viber/skills/e2e/scripts/qa-ledger.sh. It holds no case of
 * its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/e2e/scripts/qa-ledger.sh");
export const REFS = `${slash(path.resolve(import.meta.dirname, "../../viber"))}/references`;

export const HEAD = [
  "Base: http://localhost:3000",
  "Launch: npm run dev",
  "Accounts: admin admin@example.test - vault",
  "",
  "## UI scenarios",
  "",
  "### QA-01 Sign in",
  "- Covers: AC1 A user signs in",
  "- Role: admin",
  "- Route: /login",
  "- Seed: none",
  "- Steps:",
  "  1. Open the login page",
  "- Assert: the dashboard shows",
  "- Files: src/login.tsx",
  "",
  "### QA-02 Create a project",
  "- Covers: AC2 A project is created",
  "",
  "### QA-03 Print an invoice",
  "- Covers: AC3 An invoice prints",
  "",
  "## API scenarios",
  "",
  "### QA-04 List projects",
  "- Covers: AC4 Projects are listed",
  "",
  "### QA-05 Delete a project",
  "- Covers: AC5 A project is deleted",
  "",
  "## Not automatable",
  "- QA-03 - the printer is physical",
  "",
  "## Out of scope",
  "- AC6 Billing - no scenario",
  "",
];

export const AUTOMATION = ["## Automation", "- QA-01: file tests/e2e/qa-01-sign-in.spec.ts", "- QA-02: blocked - the project form returns 500", ""];

export const HANDOFF = [...HEAD, ...AUTOMATION].join("\n");

export const NEXT_ARGS = ["--spec-dir", "tests/e2e", "--base-url", "http://localhost:3000", "--accounts", "admin admin@example.test - vault"];

/** Writes `text` as qa.e2e.md in a fresh directory, runs the script with `args` after its path. */
export async function run(text: string, args: string[]) {
  return withTempDir("p2p2-qa-ledger-", async (dir) => {
    const handoff = path.join(dir, "qa.e2e.md");
    fs.writeFileSync(handoff, text);
    const result = await runScript(SUT, [handoff, ...args], { cwd: dir });
    return { ...result, handoff: slash(handoff) };
  });
}

export function block(handoff: string, id: string, refs: string = REFS): string {
  return [
    `NEXT: dispatch | id: ${id} | agent: viber:e2e-writer`,
    `handoff: ${handoff}`,
    `id: ${id}`,
    "spec-dir: tests/e2e",
    "base-url: http://localhost:3000",
    "accounts: admin admin@example.test - vault",
    `refs: ${refs}`,
    "",
  ].join("\n");
}
