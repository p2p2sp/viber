/*
 * strip-tag.test.ts - proves strip-tag.sh's `sh strip-tag.sh <file>...` contract
 * (C9): a last line that is a bare closing tag (optional spaces, optional
 * carriage return) is deleted from each file and every other byte stays; a file
 * with no such last line is left byte-identical; a missing path is skipped; the
 * script prints nothing and exits 0 in every case.
 *
 * strip-tag.sh is `#!/bin/sh` and the skill invokes it through `sh`, so every
 * case runs through forEachShell("posix", ...) via opts.shell. Each case builds
 * its own temp directory. Every closing-tag fixture is built from an escape
 * (`\x3c`), so no line of this file is a bare closing tag and
 * orphan-tags.unit.test.ts stays green over it.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/strip-tag.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { type Shell } from "../harness/shells.ts";
import { SUT, CONTENT, PARAMETER, assertPosix, assertQuietSuccess } from "./strip-tag-fixture.ts";

/** Writes `before` to a fresh file, runs the script on it, returns the bytes left. */
async function stripOne(shell: Shell, before: string): Promise<string> {
  return await withTempDir("strip-tag-", async (dir) => {
    const file = path.join(dir, "notes.md");
    fs.writeFileSync(file, before);
    assertQuietSuccess(await runScript(SUT, [file], { shell, cwd: dir }));
    return fs.readFileSync(file, "latin1");
  });
}

const stripped: Array<[string, string, string]> = [
  ["a closing content tag on a last line ended by a newline", `# Title\n\nbody\n${CONTENT}\n`, "# Title\n\nbody\n"],
  ["a closing parameter tag on a last line ended by a newline", `body\n${PARAMETER}\n`, "body\n"],
  ["a closing content tag on a last line with no newline", `body\n${CONTENT}`, "body\n"],
  ["a closing content tag followed by a carriage return", `a\r\nb\r\n${CONTENT}\r\n`, "a\r\nb\r\n"],
  ["a closing parameter tag with spaces around it", `body\n  ${PARAMETER}  \n`, "body\n"],
  ["a closing tag that is the only line of the file", `${CONTENT}\n`, ""],
];

for (const [name, before, after] of stripped) {
  test(`a file whose last line is ${name} loses that line and keeps every byte before it`, async () => {
    await assertPosix(async (shell) => {
      assert.equal(await stripOne(shell, before), after);
    });
  });
}

const untouched: Array<[string, string]> = [
  ["no closing tag at all", "# Title\n\nbody\n"],
  ["a closing tag inside a line of prose", `see ${CONTENT} in the guard\n`],
  ["text before the closing tag on its line", `body ${CONTENT}\n`],
  ["a closing tag on a line that is not the last", `a\n${CONTENT}\nb\n`],
  ["an opening tag on the last line", "a\n\x3ccontent>\n"],
  ["an empty content", ""],
];

for (const [name, content] of untouched) {
  test(`a file with ${name} is left byte-identical`, async () => {
    await assertPosix(async (shell) => {
      assert.equal(await stripOne(shell, content), content);
    });
  });
}
