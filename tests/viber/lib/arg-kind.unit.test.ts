/*
 * arg-kind.unit.test.ts - the arg-kind core in process: `issue <word> [--more]`
 * answers `NEXT: issue | ref: <word>` or `NEXT: text`, `pr <word>` answers
 * `NEXT: pr | ref: <word>` or `STOP: usage`, by exactly the shapes
 * issue-facts.sh and pr-threads.sh accept, and a malformed call exits 2 with
 * one `error:` line and an empty stdout.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { runArgKind } from "../../../viber/lib/arg-kind.ts";

const ISSUE_URL = "https://github.com/acme/widgets/issues/42";
const PULL_URL = "https://github.com/acme/widgets/pull/7";

const ISSUE_REFS: { name: string; word: string }[] = [
  { name: "a bare number", word: "42" },
  { name: "a #number", word: "#42" },
  { name: "an issues url", word: ISSUE_URL },
  { name: "an issues url with a # fragment", word: `${ISSUE_URL}#issuecomment-1` },
  { name: "an issues url with a ? query", word: `${ISSUE_URL}?notification_referrer_id=1` },
  { name: "an issues url behind one leading #", word: `#${ISSUE_URL}` },
];

for (const row of ISSUE_REFS) {
  test(`issue ${row.name}: NEXT: issue with the word as given as ref`, () => {
    assert.deepEqual(runArgKind(["issue", row.word]), { stdout: `NEXT: issue | ref: ${row.word}\n`, stderr: "", exit: 0 });
  });
}

const ISSUE_TEXT: { name: string; args: string[] }[] = [
  { name: "an owner/repo#N word", args: ["owner/repo#4"] },
  { name: "an empty word", args: [""] },
  { name: "a lone hash", args: ["#"] },
  { name: "a sentence", args: ["login is broken"] },
  { name: "a number with a suffix", args: ["42a"] },
  { name: "a number behind two leading #", args: ["##42"] },
  { name: "a number ended by a newline", args: ["42\n"] },
  { name: "a plain http issues url", args: ["http://github.com/acme/widgets/issues/42"] },
  { name: "a pull url", args: [PULL_URL] },
  { name: "an issues url with no number", args: ["https://github.com/acme/widgets/issues/"] },
  { name: "an issues url whose number is only a fragment", args: ["https://github.com/acme/widgets/issues/#issuecomment-1"] },
  { name: "an issues url without a repository", args: ["https://github.com/acme/issues/42"] },
  { name: "an issues url with a deeper path", args: ["https://github.com/a/b/c/issues/42"] },
  { name: "an issues url with an empty owner", args: ["https://github.com//widgets/issues/42"] },
  { name: "an issues url with an empty host", args: ["https:///acme/widgets/issues/42"] },
  { name: "a url whose issues segment sits only in its fragment", args: ["https://issues/5#/issues/"] },
  { name: "a number with --more", args: ["42", "--more"] },
  { name: "an issues url with --more", args: [ISSUE_URL, "--more"] },
];

for (const row of ISSUE_TEXT) {
  test(`issue ${row.name}: NEXT: text`, () => {
    assert.deepEqual(runArgKind(["issue", ...row.args]), { stdout: "NEXT: text\n", stderr: "", exit: 0 });
  });
}

const PR_REFS: { name: string; word: string }[] = [
  { name: "a bare number", word: "7" },
  { name: "a #number", word: "#7" },
  { name: "a pull url", word: PULL_URL },
  { name: "a pull url with a # fragment", word: `${PULL_URL}#discussion_r1` },
  { name: "a pull url with a ? query", word: `${PULL_URL}?notification_referrer_id=1` },
  { name: "a pull url behind one leading #", word: `#${PULL_URL}` },
];

for (const row of PR_REFS) {
  test(`pr ${row.name}: NEXT: pr with the word as given as ref`, () => {
    assert.deepEqual(runArgKind(["pr", row.word]), { stdout: `NEXT: pr | ref: ${row.word}\n`, stderr: "", exit: 0 });
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
  test(`pr ${row.name}: STOP: usage`, () => {
    assert.deepEqual(runArgKind(["pr", row.word]), { stdout: "STOP: usage\n", stderr: "", exit: 0 });
  });
}

const MALFORMED: { name: string; args: string[]; reason: string }[] = [
  { name: "no argument", args: [], reason: "usage: arg-kind.sh issue <first word> [--more] | arg-kind.sh pr <first word>" },
  { name: "an unknown kind", args: ["text", "42"], reason: "unknown kind: text" },
  { name: "a kind and no word (issue)", args: ["issue"], reason: "usage: arg-kind.sh issue <first word> [--more] | arg-kind.sh pr <first word>" },
  { name: "a kind and no word (pr)", args: ["pr"], reason: "usage: arg-kind.sh issue <first word> [--more] | arg-kind.sh pr <first word>" },
  { name: "--more under pr", args: ["pr", "7", "--more"], reason: "too many arguments" },
  { name: "a further argument after --more under issue", args: ["issue", "42", "--more", "x"], reason: "too many arguments" },
  { name: "a further argument that is not --more under issue", args: ["issue", "42", "x"], reason: "unknown argument: x" },
  { name: "a further argument under pr", args: ["pr", "7", "8"], reason: "too many arguments" },
];

for (const row of MALFORMED) {
  test(`${row.name}: exit 2 with one error: line and an empty stdout`, () => {
    assert.deepEqual(runArgKind(row.args), { stdout: "", stderr: `error: arg-kind.sh: ${row.reason}\n`, exit: 2 });
  });
}
