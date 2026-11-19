/*
 * app-wait.test.ts - proves viber/skills/e2e/scripts/app-wait.sh (C6): the one-line directive
 * it answers with after probing the application, and its refusals.
 *
 * `curl` is a `withStub` printing the HTTP code the probe would write, and `sleep` a no-op
 * stub, so a wait of hundreds of seconds costs only its probe spawns. The no-curl case runs
 * the script through an absolute `sh` with an empty directory as PATH: `stubDirs` only
 * prepends, and a real curl sits next to grep on most hosts.
 *
 * Integration tier (it spawns the script); run directly by Node's type stripping:
 *   node --test tests/viber/app-wait.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/e2e/scripts/app-wait.sh");

/** Runs `fn` with a `curl` stub answering `code` and a `sleep` that returns at once. */
async function withApp<T>(code: string, fn: (stubDirs: string[]) => Promise<T>): Promise<T> {
  return withStub("curl", `printf '%s' ${code}`, (curlDir) =>
    withStub("sleep", "exit 0", (sleepDir) => fn([curlDir, sleepDir])),
  );
}

function shellOnPath(): string {
  const names = process.platform === "win32" ? ["sh.exe", "sh"] : ["sh"];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error("app-wait.test.ts: no sh on PATH");
}

for (const code of ["200", "404", "401"]) {
  test(`an application answering ${code} prints NEXT: test with that code`, async () => {
    await withApp(code, async (stubDirs) => {
      await withTempDir("p2p2-app-wait-", async (dir) => {
        const result = await runScript(SUT, ["http://localhost:3000", "0"], { cwd: dir, stubDirs });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, `NEXT: test | code: ${code}\n`);
      });
    });
  });
}

test("no answer with 0 seconds prints NEXT: launch with the launch log path under the repository root and creates its directory", async () => {
  await withApp("000", async (stubDirs) => {
    await withGitRepo(async (repo) => {
      const root = slash(fs.realpathSync(repo.dir));
      const result = await runScript(SUT, ["http://localhost:3000", "0"], { cwd: repo.dir, stubDirs });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, `NEXT: launch | log: ${root}/.temp/viber/e2e/launch.log\n`);
      assert.ok(fs.statSync(path.join(repo.dir, ".temp", "viber", "e2e")).isDirectory());
    });
  });
});

test("no answer past 4 seconds prints the ASK line with the doubled wait and no log lines when the launch log is missing", async () => {
  await withApp("000", async (stubDirs) => {
    await withGitRepo(async (repo) => {
      const result = await runScript(SUT, ["http://localhost:3000", "4"], { cwd: repo.dir, stubDirs });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "ASK: no answer after 4 s | wait -> 8 | abort -> abort\n");
    });
  });
});

test("no answer past 300 seconds caps the doubled wait at 540 (the longest wait a Bash call may hold)", async () => {
  await withApp("000", async (stubDirs) => {
    await withGitRepo(async (repo) => {
      const result = await runScript(SUT, ["http://localhost:3000", "300"], { cwd: repo.dir, stubDirs });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stdout, "ASK: no answer after 300 s | wait -> 540 | abort -> abort\n");
    });
  });
});

test("no answer past the wait quotes only the last 10 lines of the launch log as log: lines", async () => {
  await withApp("000", async (stubDirs) => {
    await withGitRepo(async (repo) => {
      const logDir = path.join(repo.dir, ".temp", "viber", "e2e");
      fs.mkdirSync(logDir, { recursive: true });
      const lines = ["l01", "l02", "l03", "l04", "l05", "l06", "l07", "l08", "l09", "l10", "l11", "l12"];
      fs.writeFileSync(path.join(logDir, "launch.log"), `${lines.join("\n")}\n`);
      const result = await runScript(SUT, ["http://localhost:3000", "2"], { cwd: repo.dir, stubDirs });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        [
          "ASK: no answer after 2 s | wait -> 4 | abort -> abort",
          "log: l03",
          "log: l04",
          "log: l05",
          "log: l06",
          "log: l07",
          "log: l08",
          "log: l09",
          "log: l10",
          "log: l11",
          "log: l12",
          "",
        ].join("\n"),
      );
    });
  });
});

const BAD_ARGUMENTS: Array<[string, string[]]> = [
  ["no argument", []],
  ["one argument", ["http://localhost:3000"]],
  ["three arguments", ["http://localhost:3000", "1", "2"]],
  ["seconds that are letters", ["http://localhost:3000", "abc"]],
  ["seconds that are negative", ["http://localhost:3000", "-1"]],
  ["seconds that are empty", ["http://localhost:3000", ""]],
  ["seconds past 540", ["http://localhost:3000", "541"]],
];

for (const [label, args] of BAD_ARGUMENTS) {
  test(`${label} prints one error: line, an empty stdout and exits 2`, async () => {
    await withApp("200", async (stubDirs) => {
      await withTempDir("p2p2-app-wait-", async (dir) => {
        const result = await runScript(SUT, args, { cwd: dir, stubDirs });
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^error: [^\n]+\n$/);
      });
    });
  });
}

test("no curl on PATH prints the install hint as one error: line, an empty stdout and exits 2", async () => {
  await withTempDir("p2p2-app-wait-empty-", async (emptyDir) => {
    const result = await runScript(SUT, ["http://localhost:3000", "0"], {
      cwd: emptyDir,
      shell: shellOnPath(),
      env: { PATH: emptyDir },
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "error: curl not found - install curl, which macOS and Git for Windows ship\n");
  });
});
