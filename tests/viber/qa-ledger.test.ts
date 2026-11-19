/*
 * qa-ledger.test.ts - proves viber/skills/e2e/scripts/qa-ledger.sh (C7, C8): the scenario list a
 * qa.e2e.md handoff gives the e2e skill, the e2e-writer dispatch block of the next scenario
 * to handle, the ASCII table report of every scenario, and the refusals.
 *
 * Integration tier (it spawns the script); run directly by Node's type stripping:
 *   node --test tests/viber/qa-ledger.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/e2e/scripts/qa-ledger.sh");
const REFS = `${slash(path.resolve(import.meta.dirname, "../../viber"))}/references`;

const HEAD = [
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

const AUTOMATION = ["## Automation", "- QA-01: file tests/e2e/qa-01-sign-in.spec.ts", "- QA-02: blocked - the project form returns 500", ""];

const HANDOFF = [...HEAD, ...AUTOMATION].join("\n");

const NEXT_ARGS = ["--spec-dir", "tests/e2e", "--base-url", "http://localhost:3000", "--accounts", "admin admin@example.test - vault"];

/** Writes `text` as qa.e2e.md in a fresh directory, runs the script with `args` after its path. */
async function run(text: string, args: string[]) {
  return withTempDir("p2p2-qa-ledger-", async (dir) => {
    const handoff = path.join(dir, "qa.e2e.md");
    fs.writeFileSync(handoff, text);
    const result = await runScript(SUT, [handoff, ...args], { cwd: dir });
    return { ...result, handoff: slash(handoff) };
  });
}

function block(handoff: string, id: string): string {
  return [
    `NEXT: dispatch | id: ${id} | agent: viber:e2e-writer`,
    `handoff: ${handoff}`,
    `id: ${id}`,
    "spec-dir: tests/e2e",
    "base-url: http://localhost:3000",
    "accounts: admin admin@example.test - vault",
    `refs: ${REFS}`,
    "",
  ].join("\n");
}

test("list prints one id line per automatable scenario in file order with its state and title, none for a not automatable one, then the counts", async () => {
  const result = await run(HANDOFF, ["list"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "id: QA-01 | file | Sign in",
      "id: QA-02 | blocked | Create a project",
      "id: QA-04 | pending | List projects",
      "id: QA-05 | pending | Delete a project",
      "counts: 1 file, 1 blocked, 2 pending",
      "",
    ].join("\n"),
  );
});

test("a handoff with no Automation section lists every scenario pending", async () => {
  const result = await run(HEAD.join("\n"), ["list"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "id: QA-01 | pending | Sign in",
      "id: QA-02 | pending | Create a project",
      "id: QA-04 | pending | List projects",
      "id: QA-05 | pending | Delete a project",
      "counts: 0 file, 0 blocked, 4 pending",
      "",
    ].join("\n"),
  );
});

test("next prints the dispatch block of the first blocked or pending scenario, skipping a file one", async () => {
  const result = await run(HANDOFF, ["next", ...NEXT_ARGS]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, block(result.handoff, "QA-02"));
});

test("next with --after prints the first blocked or pending scenario listed after it", async () => {
  const result = await run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-02"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, block(result.handoff, "QA-04"));
});

test("next --after a scenario already automated still moves on to the next unfinished one (a not automatable ID between them is never offered)", async () => {
  const result = await run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-01"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, block(result.handoff, "QA-02"));
});

test("next prints NEXT: commit when the --after scenario is the last one left", async () => {
  const result = await run(HANDOFF, ["next", ...NEXT_ARGS, "--after", "QA-05"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "NEXT: commit\n");
});

test("next prints NEXT: commit when every scenario already has a file line", async () => {
  const done = [...HEAD, "## Automation", "- QA-01: file a.spec.ts", "- QA-02: file b.spec.ts", "- QA-04: file c.spec.ts", "- QA-05: file d.spec.ts", ""].join("\n");
  const result = await run(done, ["next", ...NEXT_ARGS]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "NEXT: commit\n");
});

test("report draws one ASCII table row per listed scenario in file order, each column as wide as its widest cell, then the counts line", async () => {
  const result = await run(HANDOFF, ["report"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "+-------+---------+---------------------------------+",
      "| ID    | State   | Detail                          |",
      "+-------+---------+---------------------------------+",
      "| QA-01 | file    | tests/e2e/qa-01-sign-in.spec.ts |",
      "| QA-02 | blocked | the project form returns 500    |",
      "| QA-04 | pending | -                               |",
      "| QA-05 | pending | -                               |",
      "+-------+---------+---------------------------------+",
      "counts: 1 file, 1 blocked, 2 pending",
      "",
    ].join("\n"),
  );
});

test("report cuts a blocked reason past 60 characters to 57 and ends it in ... (the Detail column then stops at 60)", async () => {
  const text = [
    "## UI scenarios",
    "### QA-01 Checkout",
    "## Automation",
    "- QA-01: blocked - the checkout form keeps returning a server error after submit",
    "",
  ].join("\n");
  const result = await run(text, ["report"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(
    result.stdout,
    [
      "+-------+---------+--------------------------------------------------------------+",
      "| ID    | State   | Detail                                                       |",
      "+-------+---------+--------------------------------------------------------------+",
      "| QA-01 | blocked | the checkout form keeps returning a server error after su... |",
      "+-------+---------+--------------------------------------------------------------+",
      "counts: 0 file, 1 blocked, 0 pending",
      "",
    ].join("\n"),
  );
});

test("report keeps a blocked reason of exactly 60 characters whole", async () => {
  const text = [
    "## UI scenarios",
    "### QA-01 Checkout",
    "## Automation",
    "- QA-01: blocked - the checkout form keeps returning a server error after save.",
    "",
  ].join("\n");
  const result = await run(text, ["report"]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes("| QA-01 | blocked | the checkout form keeps returning a server error after save. |\n"), result.stdout);
});

const REFUSALS: Array<[string, string[]]> = [
  ["an unknown mode", ["status"]],
  ["a list call with an option", ["list", "--after", "QA-01"]],
  ["a report call with an option", ["report", "--after", "QA-01"]],
  ["an unknown option of next", ["next", ...NEXT_ARGS, "--before", "QA-01"]],
  ["a next call without --spec-dir", ["next", "--base-url", "http://localhost:3000", "--accounts", "admin"]],
  ["a next call without --base-url", ["next", "--spec-dir", "tests/e2e", "--accounts", "admin"]],
  ["a next call without --accounts", ["next", "--spec-dir", "tests/e2e", "--base-url", "http://localhost:3000"]],
  ["an option with no value at the end of the line", ["next", ...NEXT_ARGS, "--after"]],
  ["an option whose value is another option", ["next", "--spec-dir", "--base-url", "http://localhost:3000", "--accounts", "admin"]],
  ["an --after naming no listed scenario", ["next", ...NEXT_ARGS, "--after", "QA-99"]],
  ["an --after naming a not automatable scenario", ["next", ...NEXT_ARGS, "--after", "QA-03"]],
];

for (const [what, args] of REFUSALS) {
  test(`${what} prints one error: line, nothing on stdout, exit 2`, async () => {
    const result = await run(HANDOFF, args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
}

test("a handoff path that does not exist prints one error: line, nothing on stdout, exit 2", async () => {
  await withTempDir("p2p2-qa-ledger-", async (dir) => {
    const result = await runScript(SUT, [path.join(dir, "qa.e2e.md"), "list"], { cwd: dir });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});

test("no argument at all prints one error: line, nothing on stdout, exit 2", async () => {
  await withTempDir("p2p2-qa-ledger-", async (dir) => {
    const result = await runScript(SUT, [], { cwd: dir });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]*\n$/);
  });
});
