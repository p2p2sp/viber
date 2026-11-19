/*
 * pr-reply.critical.test.ts - the critical tier of viber/scripts/pr-reply.sh:
 * a reply is posted once with its marker and body verbatim, an already
 * answered comment posts nothing, a failed post exits 1 with nothing on
 * stdout, and the drive-letter spellings of the invoked path survive on
 * Windows.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by pr-reply.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-reply.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { slash } from "../harness/paths.ts";
import {
  SUT,
  assertPosix,
  REPLY_URL,
  MARKER,
  runInRepo,
  posts,
  EXPECTED_BODY,
  assertOneError,
  runList,
  PLUGIN_ROOT,
  THREE_ITEMS,
} from "./pr-reply-fixture.ts";

test("a reply to the comment opening with its marker prints STATUS=skip and REASON=exists and posts nothing", async () => {
  await assertPosix(async (shell) => {
    const { result, calls } = await runInRepo(shell, ["42", "101", "<file>"], {
      env: { COMMENTS: `300 Looks good\r\n101 ${MARKER}\r\n` },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "STATUS=skip\nREASON=exists\nSAY=The item already holds a viber reply.\n");
    assert.equal(posts(calls).length, 0);
  });
});

test("the posted body is the marker line, a blank line and the reply file verbatim, and stdout is STATUS=posted plus the reply url", async () => {
  await assertPosix(async (shell) => {
    const { result, body } = await runInRepo(shell, ["42", "101", "<file>"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `STATUS=posted\nREPLY_URL=${REPLY_URL}\n`);
    assert.equal(body, EXPECTED_BODY);
  });
});

test("gh failing on the post: exit 1, one ERROR line carrying gh's message, nothing on stdout", async () => {
  await assertPosix(async (shell) => {
    const { result } = await runInRepo(shell, ["42", "101", "<file>"], { env: { POST_FAIL: "1" } });
    assertOneError(result);
    assert.match(result.stderr, /server error/);
  });
});

// The invoked spelling is the contract: a C:\ or C:/ path is printed as C:/, a /c/ path as /c/.
// Neither spelling names a file outside Windows, so the cases skip there.
const WINDOWS_ONLY = process.platform === "win32" ? false : "a C:\\ or /c/ spelling names a file only on Windows";
const MSYS = (p: string) => slash(p).replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

const SPELLINGS: Array<{ label: string; invoked: string; root: string }> = [
  { label: "a C:\\ path", invoked: SUT, root: PLUGIN_ROOT },
  { label: "a C:/ path", invoked: slash(SUT), root: PLUGIN_ROOT },
  { label: "a /c/ path", invoked: MSYS(SUT), root: MSYS(PLUGIN_ROOT) },
];

for (const row of SPELLINGS) {
  test(`--list invoked by ${row.label} prints RUN= under the plugin root in that spelling (AC1)`, { skip: WINDOWS_ONLY }, async () => {
    await assertPosix(async (shell) => {
      const { result } = await runList(shell, "42", { items: [THREE_ITEMS[0]], script: row.invoked });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        `STATUS=ready\nREADY=1 - src/a.ts:10 - 101\nRUN="${row.root}/scripts/pr-reply.sh" --all "42"\n`,
      );
    });
  });
}
