/*
 * factory.test.ts - proves viber/skills/factory/scripts/factory.sh (C1): `answer` on a one-question
 * single-select dialog and `approve` on a plan approval (the keys they send and the NEXT: lines they
 * answer with), their refusals, and the argument encoding every command passes to factory.ps1.
 *
 * `powershell.exe` is a `withStub` standing in for factory.ps1: it appends every call (command and
 * the base64 argument string) to calls.log beside it, answers `pending` and `screen` from
 * pending.txt and screen.txt, answers the Nth key or type call with after-<N>.txt, and prints
 * fail.txt with exit 1 when that file exists. Each case writes its own stub directory, so the
 * calls a case reads are the ones its own script made. The tests read the calls back decoded
 * (`<command>:<arg>|<arg>`): a key press leaves no state except that call, so the call is the behaviour.
 *
 * Integration tier (it spawns the script); run directly by Node's type stripping:
 *   node --test tests/viber/factory.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/factory/scripts/factory.sh");

// Stub argv: -NoProfile -ExecutionPolicy Bypass -File <ps1> -Command <command> -ArgsB64 <base64>
const STUB = [
  'd="$(dirname "$0")"',
  'echo "$7 $9" >> "$d/calls.log"',
  'if [ -f "$d/fail.txt" ]; then cat "$d/fail.txt"; exit 1; fi',
  'case "$7" in',
  '  pending) cat "$d/pending.txt" ;;',
  '  screen) cat "$d/screen.txt" ;;',
  `  *) n=$(grep -c -v -e '^pending ' -e '^screen ' "$d/calls.log"); cat "$d/after-$n.txt" ;;`,
  "esac",
].join("\n");

const PENDING = [
  "== pending s1: status waiting (dialog)",
  "tool: AskUserQuestion",
  "Q1 [DB] Which database?",
  "  1. Postgres - relational",
  "  2. SQLite - embedded",
  "  3. MySQL - popular",
].join("\n");

const HEAD = "== screen s1 (pid 4242), last 40 lines\n Which database?\n";
const SCREEN_ON_1 = `${HEAD} ❯ 1. Postgres\n   2. SQLite\n   3. MySQL\n   4. Type something.`;
const SCREEN_ON_2 = `${HEAD}   1. Postgres\n ❯ 2. SQLite\n   3. MySQL\n   4. Type something.`;
const SCREEN_ON_3 = `${HEAD}   1. Postgres\n   2. SQLite\n ❯ 3. MySQL\n   4. Type something.`;
const SCREEN_CLOSED = "== screen s1 (pid 4242), last 40 lines\n Thanks, using MySQL.";

type Run = { status: number | null; stdout: string; stderr: string; calls: string[] };

async function drive(args: string[], files: Record<string, string>): Promise<Run> {
  return withStub("powershell.exe", STUB, async (stubDir) => {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(stubDir, name), text);
    const result = await runScript(SUT, args, { cwd: stubDir, stubDirs: [stubDir], shell: "bash" });
    const logPath = path.join(stubDir, "calls.log");
    const lines = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean) : [];
    const calls = lines.map((line) => {
      const [command, b64 = ""] = line.split(" ");
      const decoded = Buffer.from(b64, "base64").toString("utf8").split("\0").slice(0, -1);
      return `${command}:${decoded.join("|")}`;
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
  });
}

test("answer on a label below the cursor sends DOWN for each row, then ENTER, and prints NEXT: done with the keys and the last screen", async () => {
  const run = await drive(["answer", "s1", "MySQL"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_1,
    "after-1.txt": SCREEN_ON_3,
    "after-2.txt": SCREEN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: DOWN,DOWN,ENTER\n${SCREEN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|DOWN,DOWN", "keys:s1|ENTER"]);
});

test("answer on a label above the cursor sends UP for each row, then ENTER", async () => {
  const run = await drive(["answer", "s1", "Postgres"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_3,
    "after-1.txt": SCREEN_ON_1,
    "after-2.txt": SCREEN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: UP,UP,ENTER\n${SCREEN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|UP,UP", "keys:s1|ENTER"]);
});

test("answer on the label the cursor already sits on makes no move call and prints NEXT: done | sent: ENTER", async () => {
  const run = await drive(["answer", "s1", "Postgres"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_1,
    "after-1.txt": SCREEN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: ENTER\n${SCREEN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|ENTER"]);
});

test("answer whose cursor did not land on the label after the moves prints NEXT: keys | mismatch: cursor-moved with the screen read and sends no ENTER", async () => {
  const run = await drive(["answer", "s1", "MySQL"], {
    "pending.txt": PENDING,
    "screen.txt": SCREEN_ON_1,
    "after-1.txt": SCREEN_ON_2,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: keys | mismatch: cursor-moved\n${SCREEN_ON_2}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|DOWN,DOWN"]);
});

const TWO_QUESTIONS = `${PENDING}\nQ2 [Cache] Which cache?\n  1. Redis - fast\n  2. None - skip`;
const MULTI_SELECT = PENDING.replace("Which database?", "Which database? (multiSelect)");
const NOT_ASKING = "== pending s1: status idle\nno unanswered tool call in the transcript";

const MISMATCHES: Array<[string, string, string, string, string]> = [
  ["no pending tool call", NOT_ASKING, SCREEN_ON_1, "MySQL", "not-asking"],
  ["two questions", TWO_QUESTIONS, SCREEN_ON_1, "MySQL", "several-questions"],
  ["a multi-select question", MULTI_SELECT, SCREEN_ON_1, "MySQL", "multi-select"],
  ["a label no option holds", PENDING, SCREEN_ON_1, "Oracle", "no-option"],
  ["a screen showing no option row", PENDING, SCREEN_CLOSED, "MySQL", "no-row"],
];

for (const [name, pending, screen, label, reason] of MISMATCHES) {
  test(`answer with ${name} prints NEXT: keys | mismatch: ${reason} and sends no key`, async () => {
    const run = await drive(["answer", "s1", label], { "pending.txt": pending, "screen.txt": screen });
    assert.equal(run.status, 0, `stderr: ${run.stderr}`);
    assert.equal(run.stdout, `NEXT: keys | mismatch: ${reason}\n${screen}\n`);
    assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40"]);
  });
}

const MISSING: Array<[string, string[]]> = [
  ["no session and no label", ["answer"]],
  ["no label", ["answer", "s1"]],
];

for (const [name, args] of MISSING) {
  test(`answer with ${name} prints one error line on stderr, an empty stdout and exits 2 before powershell.exe is looked for`, async () => {
    const result = await runScript(SUT, args, { shell: "bash" });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: [^\n]+\n$/);
  });
}

test("answer whose factory.ps1 fails prints its ERROR line and exits 1", async () => {
  const run = await drive(["answer", "s1", "MySQL"], { "fail.txt": "ERROR: no enrolled session 's1'" });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "ERROR: no enrolled session 's1'\n");
});

const PLAN_PENDING = ["== pending s1: status waiting (dialog)", "tool: ExitPlanMode", "plan: Add a cache layer"].join("\n");
const PLAN_HEAD = "== screen s1 (pid 4242), last 40 lines\n Ready to code? Here is Claude's plan.\n";
const PLAN_BYPASS_ON_1 = `${PLAN_HEAD} ❯ 1. Yes, manually approve edits\n   2. Yes, clear context and bypass permissions\n   3. No, keep planning`;
const PLAN_BYPASS_ON_2 = `${PLAN_HEAD}   1. Yes, manually approve edits\n ❯ 2. Yes, clear context and bypass permissions\n   3. No, keep planning`;
const PLAN_YES_ON_3 = `${PLAN_HEAD}   1. No, keep planning\n   2. Yes, auto-accept edits\n ❯ 3. Yes, manually approve edits`;
const PLAN_YES_ON_2 = `${PLAN_HEAD}   1. No, keep planning\n ❯ 2. Yes, auto-accept edits\n   3. Yes, manually approve edits`;
const PLAN_CLOSED = "== screen s1 (pid 4242), last 40 lines\n Plan approved.";

test("approve on a plan approval moves to the row holding clear context and bypass permissions, sends ENTER and prints NEXT: done", async () => {
  const run = await drive(["approve", "s1"], {
    "pending.txt": PLAN_PENDING,
    "screen.txt": PLAN_BYPASS_ON_1,
    "after-1.txt": PLAN_BYPASS_ON_2,
    "after-2.txt": PLAN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: DOWN,ENTER\n${PLAN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|DOWN", "keys:s1|ENTER"]);
});

test("approve with the cursor already on the clear context and bypass permissions row makes no move call and prints NEXT: done | sent: ENTER", async () => {
  const run = await drive(["approve", "s1"], {
    "pending.txt": PLAN_PENDING,
    "screen.txt": PLAN_BYPASS_ON_2,
    "after-1.txt": PLAN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: ENTER\n${PLAN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|ENTER"]);
});

test("approve on a screen with no clear context and bypass permissions row takes the first Yes row", async () => {
  const run = await drive(["approve", "s1"], {
    "pending.txt": PLAN_PENDING,
    "screen.txt": PLAN_YES_ON_3,
    "after-1.txt": PLAN_YES_ON_2,
    "after-2.txt": PLAN_CLOSED,
  });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: done | sent: UP,ENTER\n${PLAN_CLOSED}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40", "keys:s1|UP", "keys:s1|ENTER"]);
});

test("approve with no pending ExitPlanMode prints NEXT: keys | mismatch: not-asking and sends no key", async () => {
  const run = await drive(["approve", "s1"], { "pending.txt": PENDING, "screen.txt": PLAN_BYPASS_ON_1 });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, `NEXT: keys | mismatch: not-asking\n${PLAN_BYPASS_ON_1}\n`);
  assert.deepEqual(run.calls, ["pending:s1", "screen:s1|40"]);
});

test("screen still reaches factory.ps1 with its arguments decoded intact, non-ASCII text included", async () => {
  const run = await drive(["screen", "sesja zażółć gęślą", "12"], { "screen.txt": SCREEN_ON_1 });
  assert.equal(run.status, 0, `stderr: ${run.stderr}`);
  assert.equal(run.stdout, SCREEN_ON_1);
  assert.deepEqual(run.calls, ["screen:sesja zażółć gęślą|12"]);
});
