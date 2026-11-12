/*
 * harness.test.ts - proves the shared subprocess/git/stub harness itself
 * (tests/harness/) before any script test relies on it: runScript (including
 * its win32 transport for an argument no command line survives), withTempDir,
 * withGitRepo, withStub, forEachShell, denyRead/restoreRead and writePng each
 * get one assertion of their documented behaviour.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is
 * run directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/harness.test.ts
 */

import { test } from "./harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { runScript } from "./harness/run.ts";
import { withTempDir, withGitRepo } from "./harness/tmp.ts";
import { canDenyRead, denyRead, restoreRead } from "./harness/perms.ts";
import { withStub } from "./harness/stub.ts";
import { FULL_SHELL_MATRIX, forEachShell, shellBin } from "./harness/shells.ts";
import { writePng } from "./harness/png.ts";
import { section } from "./harness/markdown.ts";

test("runScript round-trips stdout and stderr and reports the real exit status", async () => {
  await withTempDir("p2p2-harness-run-", async (dir) => {
    const scriptPath = path.join(dir, "echo-both.sh");
    fs.writeFileSync(scriptPath, "#!/bin/sh\necho out-line\necho err-line 1>&2\nexit 7\n", { mode: 0o755 });
    fs.chmodSync(scriptPath, 0o755);

    const result = await runScript(scriptPath, []);

    assert.equal(result.stdout, "out-line\n");
    assert.equal(result.stderr, "err-line\n");
    assert.equal(result.status, 7);
  });
});

test("runScript delivers an argument containing a newline and a CR to the script's argv", async () => {
  await withTempDir("p2p2-harness-argv-", async (dir) => {
    const scriptPath = path.join(dir, "echo-argv.sh");
    fs.writeFileSync(scriptPath, '#!/bin/sh\nprintf "[%s]" "$1"\n', { mode: 0o755 });
    fs.chmodSync(scriptPath, 0o755);

    const result = await runScript(scriptPath, ["Line1\nLine2\rLine3"]);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, "[Line1\nLine2\rLine3]");
  });
});

test(
  "denyRead makes a file unreadable for this account and restoreRead hands it back",
  { skip: canDenyRead() ? false : "this machine cannot deny its own account read access" },
  async () => {
    await withTempDir("p2p2-harness-perms-", (dir) => {
      const file = path.join(dir, "locked.txt");
      fs.writeFileSync(file, "secret\n");

      assert.ok(denyRead(file), "denyRead should report success on a machine that can do it");
      assert.throws(() => fs.readFileSync(file), "the file must really be unreadable, not just marked");

      restoreRead(file);
      assert.equal(fs.readFileSync(file, "utf-8"), "secret\n");
    });
  },
);

test("withTempDir removes its directory once the callback returns", async () => {
  let capturedDir = "";
  await withTempDir("p2p2-harness-tmp-", (dir) => {
    capturedDir = dir;
    assert.ok(fs.existsSync(dir), "temp dir should exist inside the callback");
  });
  assert.equal(fs.existsSync(capturedDir), false, "temp dir should be gone after the callback returns");
});

test("withGitRepo pins the git identity and HOME away from the developer's real ones", async () => {
  await withGitRepo(async (repo) => {
    const email = await repo.git("config", "user.email");
    assert.equal(email.status, 0, `git config user.email should succeed: ${email.stderr}`);
    assert.equal(email.stdout.trim(), "test@p2p2.invalid");
    assert.notEqual(repo.env.HOME, os.homedir(), "withGitRepo's HOME must not be the developer's real HOME");

    const status = await repo.git("status", "--porcelain");
    assert.equal(status.status, 0, `git status should succeed in the throwaway repo: ${status.stderr}`);
  });
});

test("withGitRepo hands every call its own repo on branch main (a commit in one never reaches the next copy of the template)", async () => {
  await withGitRepo(async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "a.txt"), "a\n");
    await repo.git("add", "a.txt");
    const commit = await repo.git("commit", "-m", "first");
    assert.equal(commit.status, 0, `git commit should succeed: ${commit.stderr}`);
  });
  await withGitRepo(async (repo) => {
    const head = await repo.git("rev-parse", "--verify", "-q", "HEAD");
    assert.notEqual(head.status, 0, "a fresh repo must have no commit");
    assert.equal((await repo.git("symbolic-ref", "--short", "HEAD")).stdout.trim(), "main");
  });
});

test("withStub shadows a real binary on PATH", async () => {
  await withStub("git", "echo stubbed-git", async (stubDir) => {
    const result = await runScript("git", ["--version"], { stubDirs: [stubDir] });
    assert.equal(result.status, 0, `stubbed git should succeed: ${result.stderr}`);
    assert.equal(result.stdout, "stubbed-git\n");
  });
});

test('forEachShell("posix", ...) yields at least one shell and never throws when one is absent', async () => {
  let calls = 0;
  const skips = await forEachShell("posix", (shell) => {
    calls += 1;
    assert.ok(fs.existsSync(shellBin(shell)), `resolved shell ${shellBin(shell)} should exist`);
  });
  assert.ok(calls > 0, "expected at least one POSIX shell on this machine (/bin/sh at minimum)");
  if (!FULL_SHELL_MATRIX) assert.equal(calls, 1, "outside CI only the first shell present runs");
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
});

test("section returns the text from its heading line up to, excluding, the next ## line", () => {
  const text = "# Title\n\n## One\nfirst\n### Sub\nsecond\n\n## Two\nthird\n";
  assert.equal(section(text, "One"), "## One\nfirst\n### Sub\nsecond\n\n");
});

test("section of the last heading runs to the end of the text", () => {
  const text = "## One\nfirst\n## Two\nthird\nfourth\n";
  assert.equal(section(text, "Two"), "## Two\nthird\nfourth\n");
});

test("section matches a heading by its leading text, so a numbered heading is found by its number", () => {
  const text = "## 5. Close\nfinal run\n## 6. Record\nmemory\n";
  assert.equal(section(text, "5."), "## 5. Close\nfinal run\n");
});

test("section throws an Error naming the heading when no line starts with it", () => {
  assert.throws(() => section("## One\nfirst\n", "Missing"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes("Missing"));
    return true;
  });
});

test("section does not take a heading mentioned mid-line for a heading line", () => {
  assert.throws(() => section("text with ## Two inside\n", "Two"), Error);
});

test("writePng emits a decodable 8-bit RGBA PNG carrying the pixels it was given", () => {
  const width = 3;
  const height = 2;
  const rgba = new Uint8Array(width * height * 4);
  const pixels: Array<[number, number, number, number]> = [
    [255, 0, 0, 255],
    [0, 255, 0, 128],
    [0, 0, 255, 0],
    [255, 255, 0, 255],
    [0, 255, 255, 64],
    [255, 0, 255, 200],
  ];
  pixels.forEach(([r, g, b, a], i) => {
    rgba.set([r, g, b, a], i * 4);
  });

  const png = writePng(width, height, rgba);

  // Decoded here rather than through a plugin's decoder: the harness must not
  // depend on any one plugin's scripts, and writePng only ever emits the
  // simplest form - 8-bit depth, color type 6, non-interlaced, filter 0.
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "the file should open with the PNG signature",
  );
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR", "IHDR should be the first chunk");
  assert.equal(png.readUInt32BE(16), width, "IHDR should carry the requested width");
  assert.equal(png.readUInt32BE(20), height, "IHDR should carry the requested height");
  assert.equal(png[24], 8, "bit depth should be 8");
  assert.equal(png[25], 6, "color type should be 6 (RGBA)");
  assert.equal(png[28], 0, "interlace should be off");

  // Walk the chunks, concatenate every IDAT payload, inflate it, then strip
  // the leading per-scanline filter byte (always 0 here).
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  assert.ok(idat.length > 0, "the file should carry at least one IDAT chunk");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert.equal(raw.length, height * (stride + 1), "each scanline should carry one filter byte");

  pixels.forEach(([r, g, b, a], i) => {
    const row = Math.floor(i / width);
    const at = row * (stride + 1) + 1 + (i % width) * 4;
    assert.equal(raw[row * (stride + 1)], 0, `scanline ${row} should use filter 0 (None)`);
    assert.deepEqual(
      [raw[at], raw[at + 1], raw[at + 2], raw[at + 3]],
      [r, g, b, a],
      `pixel ${i} should round-trip all four channels`,
    );
  });
});
