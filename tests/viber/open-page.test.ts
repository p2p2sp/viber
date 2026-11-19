/*
 * open-page.test.ts - proves viber/scripts/open-page.sh picks the
 * opener for the platform `uname -s` names, hands it the file, and prints its
 * one-line report, exit 0 on every report line and 2 only on a missing argument.
 *
 * No real browser ever opens: every case pins PATH to the harness's minimal one
 * (`coreUtilsPath`), stubs `uname` onto the platform it tests, and stubs the
 * opener that platform uses, so a real `open` or `xdg-open` in /usr/bin is
 * either shadowed or never reached. Each opener stub writes its argv to a log
 * file the test reads back.
 *
 * Repo reality: no build, no lint, no npm, no package.json (for THIS repo) -
 * this file is run directly by Node's native test runner + TypeScript type
 * stripping:
 *   node --test tests/viber/open-page.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";
import { coreUtilsPath } from "../harness/stub.ts";
import { SUT, logArgs, run } from "./open-page-fixture.ts";

/** Polls for `file` up to 5 s: the Linux desktop branch starts its opener in the background. */
function waitFor(file: string): string {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 50 && !fs.existsSync(file); i++) Atomics.wait(pause, 0, 0, 100);
  return fs.readFileSync(file, "utf8");
}

test("no argument exits 2 with a usage line on stderr and nothing on stdout (a wiring bug, never a report line)", async () => {
  const result = await runScript(SUT, [], { env: { PATH: coreUtilsPath() } });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /usage: open-page\.sh <file>/);
});

test("a file that does not exist reports it missing at an absolute path, and the exit is still 0", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const result = await runScript(SUT, ["gone/page.html"], { cwd: dir, env: { PATH: coreUtilsPath() } });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^page\.html: missing at \S+\/gone\/page\.html\n$/);
    assert.ok(!result.stdout.includes("missing at gone/"), result.stdout);
  });
});

test("an opener that fails reports the browser did not open, with the path to open by hand", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "open.log");
    const result = await run(dir, [["uname", "echo Darwin"], ["open", logArgs(log, 1)]]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^page\.html: the browser did not open - open \S+\/page\.html by hand\n$/);
  });
});

test("WSL hands the file to wslview ahead of xdg-open", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "wslview.log");
    const other = path.join(dir, "xdg.log");
    const result = await run(
      dir,
      [["uname", "echo Linux"], ["wslview", logArgs(log)], ["xdg-open", logArgs(other)]],
      { DISPLAY: ":0" },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "page.html: opened in the browser\n");
    assert.ok(fs.readFileSync(log, "utf8").trim().endsWith("/page.html"));
    assert.ok(!fs.existsSync(other));
  });
});

const BACKGROUND_SKIP =
  process.platform === "win32"
    ? "a win32 spawn ends the script's background child with it; this branch only ever runs on Linux"
    : false;

test("a Linux desktop starts xdg-open with the file and reports it opened", { skip: BACKGROUND_SKIP }, async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "xdg.log");
    let logged = "";
    const result = await run(
      dir,
      [["uname", "echo Linux"], ["xdg-open", logArgs(log)]],
      { WAYLAND_DISPLAY: "wayland-0" },
      () => { logged = waitFor(log); },
    );
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "page.html: opened in the browser\n");
    assert.ok(logged.trim().endsWith("/page.html"));
  });
});

test("Linux with no display never runs xdg-open and reports no browser (a headless or remote session)", async () => {
  await withTempDir("p2p2-viber-open-", async (dir) => {
    const log = path.join(dir, "xdg.log");
    const result = await run(dir, [["uname", "echo Linux"], ["xdg-open", logArgs(log)]]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^page\.html: no browser to open it - open \S+\/page\.html by hand\n$/);
    assert.ok(!fs.existsSync(log));
  });
});
