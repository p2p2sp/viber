/*
 * bootstrap.critical.test.ts - the critical tier of
 * viber/skills/setup/scripts/bootstrap.sh: a fresh repository is seeded once,
 * reruns are byte-identical, an existing .gitignore, config values and
 * settings.json are never overwritten, flat configs migrate without loss, and
 * Windows path spellings stay correct.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by bootstrap.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/bootstrap.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { withStub } from "../harness/stub.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  TEMPLATE_GITIGNORE,
  TEMPLATE_CONFIG,
  LOCAL,
  PLUGIN_ROOT,
  MERGE_SETTINGS,
  SETTINGS_TEMPLATE,
  HELP_RUN,
  FLAT_SWITCH,
  run,
  read,
  configPath,
  childValue,
  claudeMdLines,
} from "./bootstrap-fixture.ts";

const MERGE_RUN = `RUN: ${MERGE_SETTINGS} ${SETTINGS_TEMPLATE}`;

test("a fresh repository seeds both files from the bundled ones and prints one line each, exit 0", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      result.stdout,
      [
        "viber.yml: seeded from template - every switch is commented in it",
        ".gitignore: created from template (ignores .temp/)",
        "settings.json: absent",
        "CLAUDE.md: missing",
        "gh: present",
        MERGE_RUN,
        HELP_RUN,
        "",
      ].join("\n"),
    );
    assert.equal(read(configPath(dir)), read(TEMPLATE_CONFIG));
    assert.equal(read(path.join(dir, ".gitignore")), read(TEMPLATE_GITIGNORE));
  });
});

test("running twice leaves both files byte-identical and reports them as already present", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const first = await run(dir, env);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    const afterFirstConfig = read(configPath(dir));
    const afterFirstIgnore = read(path.join(dir, ".gitignore"));

    const second = await run(dir, env);

    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.equal(
      second.stdout,
      [
        "viber.yml: already present and complete (left untouched)",
        ".gitignore: already ignores .temp/",
        "settings.json: absent",
        "CLAUDE.md: missing",
        "gh: present",
        MERGE_RUN,
        HELP_RUN,
        "",
      ].join("\n"),
    );
    assert.equal(read(configPath(dir)), afterFirstConfig);
    assert.equal(read(path.join(dir, ".gitignore")), afterFirstIgnore);
  });
});

test("a project that already has a .gitignore keeps it: only the .temp/ rule is appended, the bundled one is never copied over it", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "node_modules/\n*.log\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.temp\/ appended$/m);
    assert.equal(read(ignore), `node_modules/\n*.log\n.temp/\n${LOCAL}\n`);
  });
});

test("a flat config moves `adr: false` and `memory: false` into `planning:` and `build:`, leaves no flat switch line and reports the move", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "adr: false\nmemory: false\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: migrated to schema 6: adr, memory moved into their groups \(your own values kept\)$/m);
    const after = read(cfg);
    // A move that wrote the template default would silently re-enable what the user turned off.
    assert.equal(childValue(after, "planning", "adr"), "false");
    assert.equal(childValue(after, "build", "memory"), "false");
    assert.doesNotMatch(after, FLAT_SWITCH);
  });
});

test("a key written with blanks before its colon counts as declared, so the file is left byte-identical (a second copy appended at its default would override the value the user set)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = "schema : 6\nplanning :\n  adr: true\n  outside-plan-review\t: false\n  questions-per-round : 5\nbuild\t:\n  baseline-tests\t: off\n  final-review\t: true\n  memory: true\n  rules: true\n  qa: true\n  cleanup: true\n  red-check: true\n  extensions\t:\n    a:\ngithub :\n  issues\t: true\n  issue-title : 'x'\n  pr-title\t: 'y'\ndirectories :\n  runs : builds\n  specifications\t: archive\ntiers:\n  min: haiku\n  max: opus\nbranching:\n  mode: off\n";
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a config already carrying every template key is byte-identical after a run", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    // The user's own wording and ordering, not the template's: the merge reads
    // which keys are declared, never how the file is written.
    const before = "# my own header\nbuild:\n  cleanup: false\n  red-check: false\n  final-review: false\n  baseline-tests: fast\n  qa: true\n  rules: true\n  memory: true\n  extensions:\n    a:\n      parallel: true\n    b:\ngithub:\n  pr-title: '{type}/{summary}'\n  issues: false\n  issue-title: 'x'\nplanning:\n  outside-plan-review: false\n  adr: true\n  questions-per-round: 3\nschema: 6\n\ndirectories:\n  specifications: archive\n  runs: open\ntiers:\n  max: sonnet\n  min: sonnet\nbranching:\n  name: '{type}/{issue}-{slug}'\n  base: develop\n  mode: required\n";
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    // final-review: false survives the merge byte-for-byte, same as every other
    // switch the user set - a merge that reset it to the template default would
    // silently re-enable the reviewer.
    assert.equal(read(cfg), before);
  });
});

test("an existing .claude/settings.json at the repository root is reported present and left byte-unchanged (the skill asks reset or merge on this line)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const settings = path.join(dir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    const before = '{ "permissions": {} }\n';
    fs.writeFileSync(settings, before);
    const nested = path.join(dir, "src");
    fs.mkdirSync(nested);

    const result = await run(nested, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^settings\.json: present$/m);
    assert.equal(read(settings), before);
  });
});

test("run from a subdirectory: both files land at the repository root, not in the subdirectory", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const nested = path.join(dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await run(nested, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(fs.existsSync(configPath(dir)), "viber.yml should be seeded at the repository root");
    assert.ok(fs.existsSync(path.join(dir, ".gitignore")), ".gitignore should be seeded at the repository root");
    assert.equal(fs.existsSync(path.join(nested, ".gitignore")), false);
    assert.equal(fs.existsSync(configPath(nested)), false);
  });
});

test("outside a repository the CLAUDE.md line names a path the reader opens as written (Git Bash /c/... is no path to a Windows reader)", async () => {
  await withTempDir("p2p2-viber-bootstrap-", async (dir) => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# project\n");
    const result = await run(dir);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const line = claudeMdLines(result.stdout).find((l) => l.startsWith("CLAUDE.md: present - "));
    assert.ok(line, `stdout: ${result.stdout}`);
    const printed = line.slice("CLAUDE.md: present - ".length);
    assert.equal(fs.realpathSync.native(printed), fs.realpathSync.native(path.join(dir, "CLAUDE.md")));
  });
});

/** The spellings Git Bash is invoked by on Windows: the root the directive lines name follows the invoked path. */
const INVOKED_SPELLINGS = [
  { name: "a /c/ path", script: slash(SUT).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`), root: slash(PLUGIN_ROOT).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`) },
  { name: "a C:\\ path", script: SUT, root: PLUGIN_ROOT },
];

for (const spelling of INVOKED_SPELLINGS) {
  test(`invoked by ${spelling.name}, the merge-settings.sh and open-page.sh RUN: lines name the plugin root in that spelling (AC1)`, { skip: process.platform === "win32" ? false : "the /c/ and C:\\ spellings are a Windows Git Bash matter" }, async () => {
    await withGitRepo(async ({ dir, env }) => {
      const result = await withStub("gh", "exit 0", (stubDir) =>
        runScript(spelling.script, [], { cwd: dir, env, shell: "bash", stubDirs: [stubDir] }),
      );

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(result.stdout.split("\n").slice(-3), [
        `RUN: "${spelling.root}/skills/setup/scripts/merge-settings.sh" "${spelling.root}/skills/setup/templates/settings.json"`,
        `RUN: "${spelling.root}/scripts/open-page.sh" "${spelling.root}/skills/setup/assets/help.html"`,
        "",
      ]);
    });
  });
}
