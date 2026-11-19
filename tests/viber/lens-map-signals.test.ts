/*
 * lens-map-signals.test.ts - proves every map-signal command a lens signals
 * file (`<lens>.signals.md` in viber/skills/code-auditor/references/lenses/)
 * tells the mapper to run is one bash actually executes: each ```bash block is
 * lifted from the signals file verbatim, its `<scope>` placeholder replaced by `.`, and run with empty stdin
 * from the root of a throwaway repository holding a few source files and a
 * fix history. A command passes on exit 0, or on exit 1 with empty stderr (a
 * grep or git grep matching nothing); anything else is a broken command.
 *
 * It also proves the window of the bugs signals file's first block, the
 * fix-history command: git answers a `--since` value it cannot parse with exit 0 and an
 * empty log, so only running it shows a 5-day-old fix listed and a
 * 400-day-old fix and a non-fix commit left out.
 *
 * It also runs blocks on a directory scope holding a space, on a non-ASCII
 * file name (git quotes such a path unless core.quotePath is off), and the
 * web-performance framework blocks on a scope below the app root.
 *
 * One case per signals file carries the file name, so
 * `--test-name-pattern "bugs\.signals"` selects that lens alone.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/lens-map-signals.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";

import { type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { type Shell } from "../harness/shells.ts";
import {
  LENSES,
  assertBash,
  mapSignalCommands,
  commitAt,
  write,
  buildHistory,
  runCommand,
} from "./lens-map-signals-fixture.ts";

/** `ok` for exit 0, or exit 1 with empty stderr; otherwise what went wrong. */
function verdict(result: RunResult): string {
  const accepted = result.status === 0 || (result.status === 1 && result.stderr === "");
  return accepted ? "ok" : `exit ${result.status}, stderr: ${result.stderr}`;
}

async function verdicts(shell: Shell, repo: GitRepo, commands: string[]): Promise<{ command: string; verdict: string }[]> {
  const results = await Promise.all(commands.map((command) => runCommand(shell, repo, command)));
  return results.map((result, i) => ({ command: commands[i], verdict: verdict(result) }));
}

function allOk(commands: string[]): { command: string; verdict: string }[] {
  return commands.map((command) => ({ command, verdict: "ok" }));
}

const SIGNALS_FILES = fs.readdirSync(LENSES).filter((name) => name.endsWith(".signals.md")).sort();

for (const file of SIGNALS_FILES) {
  test(`every map-signal command of the signals file ${file} runs under bash in a throwaway repository and exits 0, or 1 with empty stderr`, async () => {
    const commands = mapSignalCommands(file);
    await withGitRepo(async (repo) => {
      await buildHistory(repo);
      await assertBash(async (shell) => {
        assert.deepEqual(await verdicts(shell, repo, commands), allOk(commands));
      });
    });
  });
}

test("on the directory scope 'src/my app' the fix-history and error-swallowing commands of bugs.signals.md list src/my app/inside.js and never app/outside.js (an unquoted scope splits into two pathspecs)", async () => {
  const commands = mapSignalCommands("bugs.signals.md", "src/my app");
  const picked = [commands[0], commands[3]];
  await withGitRepo(async (repo) => {
    write(repo, "src/my app/inside.js", "try { run(); } catch (e) {}\n");
    write(repo, "app/outside.js", "try { go(); } catch (e) {}\n");
    await commitAt(repo, 5, "fix: crash in both");
    await assertBash(async (shell) => {
      for (const command of picked) {
        const result = await runCommand(shell, repo, command);
        assert.equal(result.status, 0, `${command}\nstderr=${result.stderr}`);
        assert.match(result.stdout, /src\/my app\/inside\.js/, `the scope's own file must be listed:\n${command}\n${result.stdout}`);
        assert.doesNotMatch(result.stdout, /outside\.js/, `a file outside the scope must not be listed:\n${command}\n${result.stdout}`);
      }
    });
  });
});

test("a non-ASCII source file src/żródło.js is listed by the first command of tests.signals.md, ends a row of the churn-times-size command of design.signals.md and is counted by the error-swallowing command of bugs.signals.md (git quotes such a path unless core.quotePath is off)", async () => {
  const noTest = mapSignalCommands("tests.signals.md")[0];
  const churnSize = mapSignalCommands("design.signals.md")[1];
  const swallowed = mapSignalCommands("bugs.signals.md")[3];
  await withGitRepo(async (repo) => {
    write(repo, "src/plain.js", "export const a = 1;\n");
    write(repo, "src/żródło.js", "export const b = 1;\n");
    await commitAt(repo, 10, "feat: two sources");
    write(repo, "src/plain.js", "export const a = 2;\n");
    write(repo, "src/żródło.js", "try { run(); } catch (e) {}\n");
    await commitAt(repo, 5, "feat: change both");
    await assertBash(async (shell) => {
      const listed = await runCommand(shell, repo, noTest);
      assert.equal(listed.status, 0, `stderr=${listed.stderr}`);
      assert.match(listed.stdout, /^src\/żródło\.js$/m, `a source file with no test must be listed:\n${listed.stdout}`);
      const rows = await runCommand(shell, repo, churnSize);
      assert.equal(rows.status, 0, `stderr=${rows.stderr}`);
      assert.match(rows.stdout, /^\d+ \d+ src\/żródło\.js$/m, `a churned file must hold a row:\n${rows.stdout}`);
      const counted = await runCommand(shell, repo, swallowed);
      assert.equal(counted.status, 0, `stderr=${counted.stderr}`);
      assert.match(counted.stdout, /^src\/żródło\.js:1$/m, `a swallowed error must be counted:\n${counted.stdout}`);
    });
  });
});

test("on the directory scope src the first two commands of web-performance.signals.md find next.config.js and package.json at the repository root (a framework is configured at the app root, above the scope)", async () => {
  const [configs, dependencies] = mapSignalCommands("web-performance.signals.md", "src");
  await withGitRepo(async (repo) => {
    write(repo, "package.json", '{ "dependencies": { "next": "14.0.0", "react": "18.2.0" } }\n');
    write(repo, "next.config.js", "module.exports = {};\n");
    write(repo, "src/components/Hero.tsx", 'import moment from "moment";\nexport default function Hero() { return <img src="/hero.png" />; }\n');
    await commitAt(repo, 5, "feat: app");
    await assertBash(async (shell) => {
      const found = await runCommand(shell, repo, configs);
      assert.equal(found.status, 0, `stderr=${found.stderr}`);
      assert.match(found.stdout, /^next\.config\.js$/m, `the framework config must be found:\n${found.stdout}`);
      const deps = await runCommand(shell, repo, dependencies);
      assert.equal(deps.status, 0, `stderr=${deps.stderr}`);
      assert.match(deps.stdout, /^package\.json$/m, `the framework dependency must be found:\n${deps.stdout}`);
    });
  });
});

test("the I/O-near-a-loop command of runtime-performance.signals.md lists src/loader.js, whose loop awaits a fetch, and leaves out src/executor.js, whose loop does no I/O (a filter run over the whole row matches exec in the path)", async () => {
  const loopIo = mapSignalCommands("runtime-performance.signals.md")[2];
  await withGitRepo(async (repo) => {
    write(repo, "src/executor.js", "export function sum(xs) {\n  let total = 0;\n  for (const x of xs) {\n    total += x;\n  }\n  return total;\n}\n");
    write(repo, "src/loader.js", "export async function load(urls) {\n  for (const url of urls) {\n    await fetch(url);\n  }\n}\n");
    write(repo, "src/latest.js", "export async function latest(urls) {\n  for (const url of urls) {\n    await fetch(url);\n  }\n}\n");
    write(repo, "tests/loader.test.js", "export async function t(urls) {\n  for (const url of urls) {\n    await fetch(url);\n  }\n}\n");
    await commitAt(repo, 5, "feat: loops");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, loopIo);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^src\/loader\.js-3-.*await fetch/m, `a loop awaiting a fetch must be listed:\n${result.stdout}`);
      assert.match(result.stdout, /^src\/latest\.js-3-.*await fetch/m, `a production file whose name holds test as a substring must be listed:\n${result.stdout}`);
      assert.doesNotMatch(result.stdout, /executor/, `a loop with no I/O must be left out:\n${result.stdout}`);
      assert.doesNotMatch(result.stdout, /tests\/loader\.test\.js/, `a test file must be left out:\n${result.stdout}`);
    });
  });
});

async function listsLatestNotTests(file: string, index: number, source: string): Promise<void> {
  const command = mapSignalCommands(file)[index];
  await withGitRepo(async (repo) => {
    write(repo, "src/latest.js", source);
    write(repo, "src/inspector.js", source);
    write(repo, "tests/latest.test.js", source);
    await commitAt(repo, 5, "feat: sources");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, command);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /src\/latest\.js/, `src/latest.js must be listed:\n${result.stdout}`);
      assert.match(result.stdout, /src\/inspector\.js/, `src/inspector.js must be listed:\n${result.stdout}`);
      assert.doesNotMatch(result.stdout, /tests\/latest\.test\.js/, `a test file must be left out:\n${result.stdout}`);
    });
  });
}

test("the per-call setup block of runtime-performance.signals.md lists src/latest.js and src/inspector.js and leaves out tests/latest.test.js (a substring test filter drops production files)", async () => {
  await listsLatestNotTests("runtime-performance.signals.md", 5, "export function f() {\n  const c = new PrismaClient();\n  return c;\n}\n");
});

test("the unbounded-fetch block of runtime-performance.signals.md lists src/latest.js and src/inspector.js and leaves out tests/latest.test.js (a substring test filter drops production files)", async () => {
  await listsLatestNotTests("runtime-performance.signals.md", 6, "export function f(db) {\n  return db.user.findMany();\n}\n");
});

test("the hazard-idiom block of bugs.signals.md lists src/latest.js and src/inspector.js and leaves out tests/latest.test.js (a substring test filter drops production files)", async () => {
  await listsLatestNotTests("bugs.signals.md", 5, "export function f(xs) {\n  return xs.sort();\n}\n");
});

test("the literals block of design.signals.md counts a literal in src/latest.js, src/inspector.js and src/contest.js as 3 copies and ignores tests/latest.test.js (a substring test filter drops production files)", async () => {
  const command = mapSignalCommands("design.signals.md")[3];
  await withGitRepo(async (repo) => {
    write(repo, "src/latest.js", "export const a = 'some/long-literal-value';\n");
    write(repo, "src/inspector.js", "export const a = 'some/long-literal-value';\n");
    write(repo, "src/contest.js", "export const a = 'some/long-literal-value';\n");
    write(repo, "tests/latest.test.js", "export const a = 'some/long-literal-value';\n");
    await commitAt(repo, 5, "feat: literals");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, command);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^ *3 .*some\/long-literal-value/m, `the three production copies must count, the test file's copy must not:\n${result.stdout}`);
    });
  });
});

test("the no-test command of tests.signals.md lists src/latest.ts, src/inspector.ts and src/żródło.js, none of them tested (a substring test|spec filter drops latest and inspector)", async () => {
  const noTest = mapSignalCommands("tests.signals.md")[0];
  await withGitRepo(async (repo) => {
    write(repo, "src/latest.ts", "export const latest = 1;\n");
    write(repo, "src/inspector.ts", "export const inspector = 1;\n");
    write(repo, "src/żródło.js", "export const zrodlo = 1;\n");
    await commitAt(repo, 5, "feat: three sources");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, noTest);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^src\/latest\.ts$/m, `an untested src/latest.ts must be listed:\n${result.stdout}`);
      assert.match(result.stdout, /^src\/inspector\.ts$/m, `an untested src/inspector.ts must be listed:\n${result.stdout}`);
      assert.match(result.stdout, /^src\/żródło\.js$/m, `an untested src/żródło.js must be listed:\n${result.stdout}`);
    });
  });
});

test("the flake command of tests.signals.md lists a setTimeout( line of tests/retry.js and leaves out a setTimeout( line of src/app.js whose comment holds the word test (a test file is decided by its path, never by the line content)", async () => {
  const flake = mapSignalCommands("tests.signals.md")[7];
  await withGitRepo(async (repo) => {
    write(repo, "tests/retry.js", "await new Promise((resolve) => setTimeout(resolve, 50));\n");
    write(repo, "src/app.js", "setTimeout(run, 100); // test the retry\n");
    await commitAt(repo, 5, "feat: retry");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, flake);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^tests\/retry\.js:1:.*setTimeout\(/m, `a sleep inside a test file must be listed:\n${result.stdout}`);
      assert.doesNotMatch(result.stdout, /src\/app\.js/, `a production line must be left out:\n${result.stdout}`);
    });
  });
});

test("the template command of web-performance.signals.md lists views/index.html.erb in a repository with no package.json (a server-rendered site is browser-delivered without a JS framework)", async () => {
  const templates = mapSignalCommands("web-performance.signals.md")[2];
  await withGitRepo(async (repo) => {
    write(repo, "app/controllers/home_controller.rb", "class HomeController < ApplicationController\nend\n");
    write(repo, "views/index.html.erb", "<img src=\"/hero.png\">\n");
    await commitAt(repo, 5, "feat: rails page");
    await assertBash(async (shell) => {
      const result = await runCommand(shell, repo, templates);
      assert.equal(result.status, 0, `stderr=${result.stderr}`);
      assert.match(result.stdout, /^views\/index\.html\.erb$/m, `a server template must be listed:\n${result.stdout}`);
    });
  });
});
