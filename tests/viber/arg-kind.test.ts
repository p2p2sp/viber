/*
 * arg-kind.test.ts - proves viber/scripts/arg-kind.sh's classification of the
 * first word of a skill argument: `issue <word> [--more]` answers `NEXT: issue
 * | ref: <word>` or `NEXT: text`, `pr <word>` answers `NEXT: pr | ref: <word>`
 * or `STOP: usage`, by exactly the shapes issue-facts.sh and pr-threads.sh
 * accept, and a malformed call exits 2 with one `error:` line and an empty
 * stdout.
 *
 * arg-kind.sh is `#!/bin/sh` and touches no file and no other command, so every
 * case runs through forEachShell("posix", ...) via opts.shell with no fixture.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/arg-kind.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/arg-kind.sh");

const ISSUE_URL = "https://github.com/acme/widgets/issues/42";
const PULL_URL = "https://github.com/acme/widgets/pull/7";

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

async function run(shell: Shell, args: string[]): Promise<RunResult> {
  return await runScript(SUT, args, { shell });
}

// --- issue (DoD 1) ----------------------------------------------------------------------

const ISSUE_REFS: { name: string; word: string }[] = [
  { name: "a bare number", word: "42" },
  { name: "a #number", word: "#42" },
  { name: "an issues url", word: ISSUE_URL },
  { name: "an issues url with a # fragment", word: `${ISSUE_URL}#issuecomment-1` },
  { name: "an issues url with a ? query", word: `${ISSUE_URL}?notification_referrer_id=1` },
  { name: "an issues url behind one leading #", word: `#${ISSUE_URL}` },
];

for (const row of ISSUE_REFS) {
  test(`issue ${row.name}: NEXT: issue with the word as given as ref`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, ["issue", row.word]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `NEXT: issue | ref: ${row.word}\n`);
    });
  });
}

const ISSUE_TEXT: { name: string; args: string[] }[] = [
  { name: "an owner/repo#N word", args: ["owner/repo#4"] },
  { name: "an empty word", args: [""] },
  { name: "a lone hash", args: ["#"] },
  { name: "a sentence", args: ["login is broken"] },
  { name: "a number with a suffix", args: ["42a"] },
  { name: "a plain http issues url", args: ["http://github.com/acme/widgets/issues/42"] },
  { name: "a pull url", args: [PULL_URL] },
  { name: "an issues url with no number", args: ["https://github.com/acme/widgets/issues/"] },
  { name: "an issues url whose number is only a fragment", args: ["https://github.com/acme/widgets/issues/#issuecomment-1"] },
  { name: "an issues url without a repository", args: ["https://github.com/acme/issues/42"] },
  { name: "an issues url with a deeper path", args: ["https://github.com/a/b/c/issues/42"] },
  { name: "an issues url with an empty owner", args: ["https://github.com//widgets/issues/42"] },
  { name: "a number with --more", args: ["42", "--more"] },
  { name: "an issues url with --more", args: [ISSUE_URL, "--more"] },
];

for (const row of ISSUE_TEXT) {
  test(`issue ${row.name}: NEXT: text`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, ["issue", ...row.args]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "NEXT: text\n");
    });
  });
}

// --- pr (DoD 2) -------------------------------------------------------------------------

const PR_REFS: { name: string; word: string }[] = [
  { name: "a bare number", word: "7" },
  { name: "a #number", word: "#7" },
  { name: "a pull url", word: PULL_URL },
  { name: "a pull url with a # fragment", word: `${PULL_URL}#discussion_r1` },
  { name: "a pull url with a ? query", word: `${PULL_URL}?notification_referrer_id=1` },
  { name: "a pull url behind one leading #", word: `#${PULL_URL}` },
];

for (const row of PR_REFS) {
  test(`pr ${row.name}: NEXT: pr with the word as given as ref`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, ["pr", row.word]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `NEXT: pr | ref: ${row.word}\n`);
    });
  });
}

const PR_USAGE: { name: string; word: string }[] = [
  { name: "an empty word", word: "" },
  { name: "a lone hash", word: "#" },
  { name: "a word", word: "abc" },
  { name: "a number with a suffix", word: "7x" },
  { name: "an issues url", word: ISSUE_URL },
  { name: "a pull url without a repository", word: "https://github.com/acme/pull/7" },
  { name: "a pull url with a non-numeric number", word: "https://github.com/acme/widgets/pull/x" },
  { name: "a plain http pull url", word: "http://github.com/acme/widgets/pull/7" },
  { name: "a pull url with a deeper path", word: "https://github.com/a/b/c/pull/7" },
  { name: "a pull url with an empty owner", word: "https://github.com//widgets/pull/7" },
];

for (const row of PR_USAGE) {
  test(`pr ${row.name}: STOP: usage`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, ["pr", row.word]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "STOP: usage\n");
    });
  });
}

// --- malformed calls (DoD 3) ------------------------------------------------------------

const MALFORMED: { name: string; args: string[] }[] = [
  { name: "no argument", args: [] },
  { name: "an unknown kind", args: ["text", "42"] },
  { name: "a kind and no word (issue)", args: ["issue"] },
  { name: "a kind and no word (pr)", args: ["pr"] },
  { name: "--more under pr", args: ["pr", "7", "--more"] },
  { name: "a further argument after --more under issue", args: ["issue", "42", "--more", "x"] },
  { name: "a further argument that is not --more under issue", args: ["issue", "42", "x"] },
  { name: "a further argument under pr", args: ["pr", "7", "8"] },
];

for (const row of MALFORMED) {
  test(`${row.name}: exit 2 with one error: line and an empty stdout`, async () => {
    await assertPosix(async (shell) => {
      const result = await run(shell, row.args);
      assert.equal(result.status, 2, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: [^\n]+\n?$/);
    });
  });
}
