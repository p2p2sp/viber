/*
 * open-page.critical.test.ts - the critical tier of
 * viber/scripts/open-page.sh: the page is handed to open on macOS, to rundll32
 * with the Windows path form under Git Bash, and Git Bash without rundll32
 * reports no browser.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by open-page.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/open-page.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withTempDir } from "../harness/tmp.ts";
import { type Stub, logArgs, run } from "./open-page-fixture.ts";

/** Windows-shaped `cygpath`: `-w` marks the path, `-m` returns it unchanged. */
const CYGPATH: Stub = ["cygpath", 'if [ "$1" = "-w" ]; then echo "WIN:$2"; else echo "$2"; fi'];

test("macOS hands the file to open and reports it opened", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "open.log");
    const result = await run(dir, [["uname", "echo Darwin"], ["open", logArgs(log)]]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "page.html: opened in the browser\n");
    assert.ok(fs.readFileSync(log, "utf8").trim().endsWith(`${path.basename(dir)}/page.html`));
  });
});

test("Git Bash hands rundll32 the file handler and the Windows form of the path", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "rundll32.log");
    const result = await run(dir, [["uname", "echo MINGW64_NT-10.0-26200"], CYGPATH, ["rundll32", logArgs(log)]]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "page.html: opened in the browser\n");
    const [handler, target] = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(handler, "url.dll,FileProtocolHandler");
    assert.ok(target.startsWith("WIN:") && target.endsWith("/page.html"), target);
  });
});

test("Git Bash with no rundll32 reports no browser and the path to open by hand", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const result = await run(dir, [["uname", "echo MINGW64_NT-10.0-26200"], CYGPATH]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^page\.html: no browser to open it - open \S+\/page\.html by hand\n$/);
  });
});
