/*
 * config.test.ts - proves viber/scripts/config.sh's contract: it resolves the
 * `.claude/viber.yml` keys into the block a skill preloads.
 *
 * Two properties carry the whole design. It is FAIL-OPEN and always exits 0,
 * because it runs as a `!` preload where a non-zero exit aborts the entire skill
 * load - a project with no config file must simply build with every layer off.
 * And it resolves the file against the REPOSITORY ROOT, not the caller's cwd: a
 * preload runs wherever the session started, so a session opened in a
 * subdirectory would otherwise silently report every switch off and turn off
 * every layer the user configured.
 *
 * Every key lives inside its group, and the group is a contract rather than a
 * presentation: a same-named key outside it is ignored. A SWITCH is a child of
 * `planning:`, `build:` or `github:` and is on only when it literally says
 * `true`; a legacy flat switch at column 0 resolves off until setup moves it. A
 * TITLE pattern is a child of `github:`, printed whole - a quoted value keeps
 * everything inside its quotes, an unquoted one loses a trailing comment. A
 * DIRECTORY key lives inside `directories:` and names one directory under docs/,
 * never a path - `runs` alone reads like a count and `specs` like a switch. Its
 * value is sanitized, because the invariant that "docs/ is the one home for
 * persisted knowledge" rests on it: a slash, a traversal or an absolute path
 * leaves the default standing.
 *
 * An optional `.claude/viber.local.yml` overrides four keys for one person only
 * (`tiers.min`, `tiers.max`, `build.baseline-tests`, `github.issues`); every
 * other key in it is ignored and named on one comment line of the block.
 *
 * `--branching` prints the branching report instead of the block: the mode, the
 * valid work entries and issue type mappings in file order, then one `error:`
 * line per configuration problem - still exit 0 whatever the file holds.
 * `--red-check` prints exactly two lines, the `build.red-check-tests` and
 * `build.red-check-links` lists joined by one space, each at its default when
 * empty, a comment alone or absent.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/config.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { canDenyRead, denyRead, restoreRead } from "../harness/perms.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/config.sh");

/** Every switch off and both directory keys at their default - what a project
 *  with no config file, and every unusable value, resolves to. */
const OFF = {
  "planning.adr": "false",
  "planning.plain-plan-review": "false",
  "planning.fast-path": "false",
  "build.baseline-tests": "off",
  "build.final-review": "false",
  "build.memory": "false",
  "build.rules": "false",
  "build.qa": "false",
  "build.cleanup": "false",
  "build.red-check": "false",
  "github.issues": "false",
};
const DEFAULT_DIRS = { runs: "_specs", specifications: "specs" };
const DEFAULT_TITLES = { issue: "{summary}", pr: "[{issue-number}] {summary}" };

function run(dir: string, env: Record<string, string> = {}) {
  return runScript(SUT, [], { cwd: dir, env, shell: "bash" });
}

function writeConfig(root: string, body: string): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "viber.yml"), body);
}

/** The `directories:` group as the template writes it. */
function group(entries: Record<string, string>): string {
  return ["directories:", ...Object.entries(entries).map(([key, value]) => `  ${key}: ${value}`), ""].join("\n");
}

/** One group holding the given child lines, each indented two blanks. */
function inGroup(name: string, ...children: string[]): string {
  return [`${name}:`, ...children.map((child) => `  ${child}`), ""].join("\n");
}

/** Every key the script printed, in the fixed order it prints them; a value is
 *  everything after the first colon, since a title pattern holds colons of its own. */
function config(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.trim().split("\n").slice(1)) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/** The eleven switches alone, so a case about a switch need not restate the
 *  titles, directory names, tiers and branching mode. */
function switches(stdout: string): Record<string, string | undefined> {
  const all = config(stdout);
  return Object.fromEntries(Object.keys(OFF).map((key) => [key, all[key]]));
}

/** The printed line of one key, verbatim, or undefined when none was printed. */
function printedLine(stdout: string, key: string): string | undefined {
  return stdout.split(/\r?\n/).find((line) => line.startsWith(`${key}: `));
}

/** The two title patterns alone, under short names. */
function titles(stdout: string): Record<string, string> {
  const all = config(stdout);
  return { issue: all["github.issue-title"], pr: all["github.pr-title"] };
}

/** The two tier keys alone, under their short names. */
function tiers(stdout: string): Record<string, string> {
  const all = config(stdout);
  return { min: all["tiers.min"], max: all["tiers.max"] };
}

const DEFAULT_TIERS = { min: "haiku", max: "opus" };

/** The two directory keys alone, under their short names. The script prints
 *  them dotted, which is itself asserted below. */
function dirs(stdout: string): Record<string, string> {
  const all = config(stdout);
  return { runs: all["directories.runs"], specifications: all["directories.specifications"] };
}

test("no config file: the block is every switch off, both title defaults, no extension, then the directory, tier and branching defaults, in the fixed order, and the exit is still 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "# viber config (resolved)",
      "planning.adr: false",
      "planning.plain-plan-review: false",
      "planning.fast-path: false",
      "build.baseline-tests: off",
      "build.final-review: false",
      "build.memory: false",
      "build.rules: false",
      "build.qa: false",
      "build.cleanup: false",
      "build.red-check: false",
      "github.issues: false",
      "github.issue-title: {summary}",
      "github.pr-title: [{issue-number}] {summary}",
      "build.extensions: none",
      "build.extensions-missing: none",
      "directories.runs: _specs",
      "directories.specifications: specs",
      "tiers.min: haiku",
      "tiers.max: opus",
      "branching.mode: off",
    ]);
  });
});

test("the group keys are printed dotted, so no reader can take one for a switch", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const printed = (await run(dir)).stdout.trim().split("\n");
    assert.deepEqual(printed.slice(-5, -1), [
      "directories.runs: _specs",
      "directories.specifications: specs",
      "tiers.min: haiku",
      "tiers.max: opus",
    ]);
  });
});

for (const value of ["true", "TRUE", "True"]) {
  test(`\`fast-path: ${value}\` inside \`planning:\` resolves to true, matched in any letter case`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, inGroup("planning", `fast-path: ${value}`));

      assert.deepEqual(switches((await run(dir)).stdout), { ...OFF, "planning.fast-path": "true" });
    });
  });
}

for (const [label, body] of [
  ["the key absent", inGroup("planning", "adr: true")],
  ["another value", inGroup("planning", "adr: true", "fast-path: enabled")],
  ["the value false", inGroup("planning", "fast-path: false")],
] as const) {
  test(`a config with ${label} resolves \`planning.fast-path\` to false`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, body);

      assert.equal(switches((await run(dir)).stdout)["planning.fast-path"], "false");
    });
  });
}

for (const value of ["fast", "FAST", "Fast"]) {
  test(`\`baseline-tests: ${value}\` inside \`build:\` prints \`build.baseline-tests: fast\`, matched in any letter case`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, inGroup("build", `baseline-tests: ${value}`));

      assert.equal(printedLine((await run(dir)).stdout, "build.baseline-tests"), "build.baseline-tests: fast");
    });
  });
}

for (const value of ["full", "FULL", "Full", "true", "TRUE", "True"]) {
  test(`\`baseline-tests: ${value}\` inside \`build:\` prints \`build.baseline-tests: full\`, matched in any letter case`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, inGroup("build", `baseline-tests: ${value}`));

      assert.equal(printedLine((await run(dir)).stdout, "build.baseline-tests"), "build.baseline-tests: full");
    });
  });
}

for (const [label, body] of [
  ["the key absent", inGroup("build", "memory: true")],
  ["another value", inGroup("build", "memory: true", "baseline-tests: enabled")],
  ["the value false", inGroup("build", "baseline-tests: false")],
  ["a column-0 key", "baseline-tests: fast\n"],
  ["the key under another group", inGroup("planning", "baseline-tests: full")],
] as const) {
  test(`a config with ${label} prints \`build.baseline-tests: off\``, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, body);

      assert.equal(printedLine((await run(dir)).stdout, "build.baseline-tests"), "build.baseline-tests: off");
    });
  });
}

test("`build.baseline-tests` still sits between `planning.fast-path` and `build.final-review`", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "baseline-tests: fast"));

    const keys = (await run(dir)).stdout.trim().split("\n").slice(1).map((line) => line.slice(0, line.indexOf(":")));
    const at = keys.indexOf("build.baseline-tests");
    assert.deepEqual(keys.slice(at - 1, at + 2), ["planning.fast-path", "build.baseline-tests", "build.final-review"]);
  });
});

test("only `true` counts as on - false, a missing key, a commented-out line and a near-miss value are all off", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("planning", "adr: false") + inGroup("build", "# memory: true", "rules: truthy", "qa: yes", "cleanup: on", "extra: true"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), OFF);
  });
});

test("a grouped config turns its switches on, comments, blank lines and case notwithstanding", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      [
        "# viber switches",
        "planning:",
        "  adr: true  # the decisions worth keeping",
        "",
        "# a column-0 comment inside the group",
        "  plain-plan-review: true",
        "build:",
        "  # the close",
        "  memory: TRUE",
        "  rules: true",
        "  qa: true",
        "  cleanup: true",
        "github:",
        "  issues: true",
        "",
      ].join("\n"),
    );

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), {
      ...OFF,
      "planning.adr": "true",
      "planning.plain-plan-review": "true",
      "build.memory": "true",
      "build.rules": "true",
      "build.qa": "true",
      "build.cleanup": "true",
      "github.issues": "true",
    });
  });
});

test("an indented `qa: true` under a group that is not `build:` stays off", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("some_group", "qa: true"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), OFF);
  });
});

test("a switch under the wrong one of the three groups stays off (a key counts only inside its own group)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("planning", "memory: true") + inGroup("github", "adr: true") + inGroup("build", "issues: true"));

    assert.deepEqual(switches((await run(dir)).stdout), OFF);
  });
});

test("`memory: false` inside `build:` prints `build.memory: false`, a sibling set on still read", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "memory: false", "rules: true"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), { ...OFF, "build.rules": "true" });
  });
});

test("`memory: TRUE` inside `build:` resolves to on - the value is matched in any letter case", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "memory: TRUE"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), { ...OFF, "build.memory": "true" });
  });
});

test("`MEMORY: true` inside `build:` resolves to off - the key itself is matched case-sensitively", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "MEMORY: true"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(switches(result.stdout), OFF);
  });
});

for (const key of ["adr", "plain-plan-review", "fast-path", "baseline-tests", "final-review", "memory", "rules", "qa", "cleanup", "red-check", "issues"]) {
  test(`a flat \`${key}: true\` at column 0 resolves off (a legacy key counts only once setup moves it into its group)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, `${key}: true\n`);

      assert.deepEqual(switches((await run(dir)).stdout), OFF);
    });
  });
}

test("a flat `memory: true` beside a `build:` group without it still prints `build.memory: false`", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "memory: true\n" + inGroup("build", "rules: true"));

    assert.equal(printedLine((await run(dir)).stdout, "build.memory"), "build.memory: false");
  });
});

test("the shipped template resolves to its own defaults: every switch, both titles, both directories and both tiers", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const template = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/viber.yml");
    writeConfig(dir, fs.readFileSync(template, "utf-8"));

    const result = await run(dir);
    assert.deepEqual(switches(result.stdout), {
      "planning.adr": "true",
      "planning.plain-plan-review": "true",
      "planning.fast-path": "true",
      "build.baseline-tests": "off",
      "build.final-review": "true",
      "build.memory": "true",
      "build.rules": "true",
      "build.qa": "false",
      "build.cleanup": "true",
      "build.red-check": "true",
      "github.issues": "false",
    });
    assert.deepEqual(titles(result.stdout), DEFAULT_TITLES);
    assert.deepEqual(dirs(result.stdout), DEFAULT_DIRS);
    assert.deepEqual(tiers(result.stdout), DEFAULT_TIERS);
  });
});

test("the file is resolved against the repository root, so a session started in a subdirectory reads the same config", async () => {
  await withGitRepo(async (repo) => {
    writeConfig(repo.dir, inGroup("build", "memory: true") + group({ specifications: "archive" }));
    const nested = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await runScript(SUT, [], { cwd: nested, env: repo.env, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(switches(result.stdout), { ...OFF, "build.memory": "true" });
    assert.deepEqual(dirs(result.stdout), { runs: "_specs", specifications: "archive" });
  });
});

test("an unreadable or malformed config never fails the preload", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "\u0000\u0001 not: yaml: at: all\n");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(switches(result.stdout), OFF);
    assert.deepEqual(titles(result.stdout), DEFAULT_TITLES);
    assert.deepEqual(dirs(result.stdout), DEFAULT_DIRS);
  });
});

// --- the github titles ---

for (const [label, value] of [
  ["single", "'{type}: {summary} #x'"],
  ["double", '"{type}: {summary} #x"'],
] as const) {
  test(`a ${label}-quoted pr-title keeps everything inside its quotes, colon and \` #\` included`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, inGroup("github", `pr-title: ${value}`));

      assert.equal(printedLine((await run(dir)).stdout, "github.pr-title"), "github.pr-title: {type}: {summary} #x");
    });
  });
}

test("a quoted title followed by a comment keeps the quoted text alone", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("github", "issue-title: '[{type}] {summary}'  # our style"));

    assert.equal(printedLine((await run(dir)).stdout, "github.issue-title"), "github.issue-title: [{type}] {summary}");
  });
});

test("an unquoted title keeps its inner spaces and drops a trailing ` # comment` with the blanks before it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("github", "issue-title: Bug  {summary} from {type}   # our style"));

    assert.equal(printedLine((await run(dir)).stdout, "github.issue-title"), "github.issue-title: Bug  {summary} from {type}");
  });
});

for (const [label, line] of [
  ["an empty quoted value", "pr-title: ''"],
  ["no value at all", "pr-title:"],
  ["a comment alone", "pr-title:   # none yet"],
] as const) {
  test(`a pr-title with ${label} prints the default pattern`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, inGroup("github", line));

      assert.deepEqual(titles((await run(dir)).stdout), DEFAULT_TITLES);
    });
  });
}

test("a CRLF config yields both titles without a stray CR", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "github:\r\n  issue-title: plain {summary}\r\n  pr-title: '{type} - {summary}'\r\n");

    assert.deepEqual(titles((await run(dir)).stdout), { issue: "plain {summary}", pr: "{type} - {summary}" });
  });
});

test("the first title assignment inside `github:` wins, so a later duplicate cannot quietly override it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("github", "pr-title: first {summary}", "pr-title: second {summary}"));

    assert.equal(titles((await run(dir)).stdout).pr, "first {summary}");
  });
});

test("a title outside `github:` is not a title, so both defaults stand", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "pr-title: flat {summary}\n" + inGroup("build", "issue-title: nested {summary}"));

    assert.deepEqual(titles((await run(dir)).stdout), DEFAULT_TITLES);
  });
});

// --- the directories group ---

test("a directory key takes the name it was given, extra indentation and a trailing comment notwithstanding", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      ["directories:", "    runs: work-in-progress   # where an open run lives", "  specifications: docs_archive.v2", ""].join("\n"),
    );

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(dirs(result.stdout), { runs: "work-in-progress", specifications: "docs_archive.v2" });
  });
});

test("the group is a contract: a same-named key at the top level is NOT this key", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "runs: builds\nspecifications: archive\n");

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(dirs(result.stdout), DEFAULT_DIRS);
  });
});

test("the group ends at the next top-level key, so an indented line below one is out of it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["directories:", "  runs: builds", "build:", "  specifications: archive", ""].join("\n"));

    const result = await run(dir);
    assert.equal(result.status, 0);
    assert.deepEqual(dirs(result.stdout), { runs: "builds", specifications: "specs" });
  });
});

test("a blank line and a column-0 comment leave the group open, because that is how it gets written", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      ["directories:", "  runs: builds", "", "# where the archive lands", "  specifications: archive", ""].join("\n"),
    );

    assert.deepEqual(dirs((await run(dir)).stdout), { runs: "builds", specifications: "archive" });
  });
});

test("a value that is a path rather than a name is refused, and the default stands", async () => {
  const refused = ["../escape", "/absolute", "a/b", "./here", ".", "..", "", "   ", "two;words", "quoted'name"];
  for (const value of refused) {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, group({ runs: value, specifications: value }));

      const result = await run(dir);
      assert.equal(result.status, 0, `stderr for "${value}": ${result.stderr}`);
      assert.deepEqual(dirs(result.stdout), DEFAULT_DIRS, `"${value}" must not name a directory`);
    });
  }
});

test("a directory value is cut at the first space, the way a trailing comment is - the first word is the name", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, group({ runs: "work in progress" }));

    assert.deepEqual(dirs((await run(dir)).stdout), { runs: "work", specifications: "specs" });
  });
});

test("the first assignment inside the group wins, so a later duplicate cannot quietly override it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["directories:", "  runs: first", "  runs: second", ""].join("\n"));

    assert.deepEqual(dirs((await run(dir)).stdout), { runs: "first", specifications: "specs" });
  });
});

test("a commented-out directory key is not an assignment, so the default stands", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["directories:", "  # runs: commented", "  specifications: kept", ""].join("\n"));

    assert.deepEqual(dirs((await run(dir)).stdout), { runs: "_specs", specifications: "kept" });
  });
});

// --- the tiers group ---

test("the tiers group narrows the range, case and a trailing comment notwithstanding", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["tiers:", "  min: Sonnet  # never haiku", "  max: sonnet", ""].join("\n"));

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(tiers(result.stdout), { min: "sonnet", max: "sonnet" });
  });
});

test("fable is a tier above opus, reached only when the project names it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["tiers:", "  min: sonnet", "  max: Fable", ""].join("\n"));

    assert.deepEqual(tiers((await run(dir)).stdout), { min: "sonnet", max: "fable" });
  });
});

test("an unknown tier falls back to that key's default alone", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["tiers:", "  min: sonnet", "  max: mythos", ""].join("\n"));

    assert.deepEqual(tiers((await run(dir)).stdout), { min: "sonnet", max: "opus" });
  });
});

test("fable as min above the default max is an inverted range, so both reset", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["tiers:", "  min: fable", ""].join("\n"));

    assert.deepEqual(tiers((await run(dir)).stdout), DEFAULT_TIERS);
  });
});

test("an inverted range resets both keys to the full range, so no dispatch is left without a model", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["tiers:", "  min: opus", "  max: haiku", ""].join("\n"));

    assert.deepEqual(tiers((await run(dir)).stdout), DEFAULT_TIERS);
  });
});

test("tier keys outside the tiers group are not tier keys", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["min: sonnet", "max: sonnet", group({ min: "sonnet" })].join("\n"));

    assert.deepEqual(tiers((await run(dir)).stdout), DEFAULT_TIERS);
  });
});

test("a CRLF config still yields its tiers (a stray CR is not part of the value)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "tiers:\r\n  min: sonnet\r\n  max: sonnet\r\n");

    assert.deepEqual(tiers((await run(dir)).stdout), { min: "sonnet", max: "sonnet" });
  });
});

// --- the branching group ---

/** The one branching line of the block, the last line the script prints. */
function branching(stdout: string): string {
  return stdout.trim().split("\n").slice(-1)[0];
}

test("no config file: the output ends with branching.mode: off, right after the tiers", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split("\n").slice(-2), ["tiers.max: opus", "branching.mode: off"]);
  });
});

test("the branching group gives the block its mode alone, a mixed-case mode lowered and a trailing comment dropped", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["branching:", "  mode: Required  # every run on its own branch", "  work:", "    fix:", "      base: release/2.x", "      name: 'fix/{slug}'", "      target: release/2.x", ""].join("\n"));

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(branching(result.stdout), "branching.mode: required");
  });
});

test("no config file: the block names only the branching mode, no branching.base or branching.name line (a skill reads its branch from the work entries)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const printed = result.stdout.trim().split("\n");
    assert.deepEqual(printed.filter((line) => line.startsWith("branching.")), ["branching.mode: off"]);
    assert.equal(printed.at(-1), "branching.mode: off");
  });
});

for (const [label, body] of [
  ["the flat keys", ["branching:", "  mode: allowed", "  base: develop", "  name: 'feature/{slug}'", ""].join("\n")],
  ["a work entry", ["branching:", "  mode: allowed", "  work:", "    feature:", "      base: develop", "      name: 'feature/{slug}'", "      target: develop", ""].join("\n")],
]) {
  test(`a file holding ${label}: the block names only the branching mode, no branching.base or branching.name line (a skill reads its branch from the work entries)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, body);

      const result = await run(dir);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const printed = result.stdout.trim().split("\n");
      assert.deepEqual(printed.filter((line) => line.startsWith("branching.")), ["branching.mode: allowed"]);
      assert.equal(printed.at(-1), "branching.mode: allowed");
    });
  });
}

for (const mode of ["on", "true", "gitflow", `"allowed"`]) {
  test(`an unknown mode ${mode} resolves to off (only off, allowed and required are modes)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, ["branching:", `  mode: ${mode}`, ""].join("\n"));

      assert.equal(branching((await run(dir)).stdout), "branching.mode: off");
    });
  });
}

test("branching keys outside the branching group are not branching keys", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["mode: required", "base: develop", group({ name: "feat/{slug}" })].join("\n"));

    assert.equal(branching((await run(dir)).stdout), "branching.mode: off");
  });
});

test("`build.cleanup` is a switch like the others and nothing about it is special", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "cleanup: true"));

    assert.deepEqual(switches((await run(dir)).stdout), { ...OFF, "build.cleanup": "true" });
  });
});

test("`build.red-check` prints right after `build.cleanup`, on only when `build:` says `true` and off when absent", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.equal(printedLine((await run(dir)).stdout, "build.red-check"), "build.red-check: false");

    writeConfig(dir, inGroup("build", "red-check: True  # sealed"));
    const keys = (await run(dir)).stdout.trim().split("\n").slice(1).map((line) => line.slice(0, line.indexOf(":")));
    const at = keys.indexOf("build.red-check");
    assert.deepEqual(keys.slice(at - 1, at + 2), ["build.cleanup", "build.red-check", "github.issues"]);
    assert.deepEqual(switches((await run(dir)).stdout), { ...OFF, "build.red-check": "true" });

    writeConfig(dir, inGroup("build", "red-check: false"));
    assert.deepEqual(switches((await run(dir)).stdout), OFF);
  });
});

test("`final-review: TRUE` inside `build:` resolves to true, matched in any letter case", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "final-review: TRUE"));

    assert.deepEqual(switches((await run(dir)).stdout), { ...OFF, "build.final-review": "true" });
  });
});

test("a `build.final-review` with any other value resolves to false", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("planning", "adr: true") + inGroup("build", "final-review: enabled"));

    assert.deepEqual(switches((await run(dir)).stdout), { ...OFF, "planning.adr": "true" });
  });
});

// --- config.sh --branching: work entries and issue type mappings ---

function runBranching(dir: string) {
  return runScript(SUT, ["--branching"], { cwd: dir, shell: "bash" });
}

/** Every line `--branching` printed, the exit asserted 0 first: no input may break the preload. */
async function report(dir: string): Promise<string[]> {
  const result = await runBranching(dir);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  return result.stdout.trim().split("\n");
}

test("--branching with no config file prints only the mode, off, and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.deepEqual(await report(dir), ["mode: off"]);
  });
});

/** A valid GitFlow-shaped group: its mappings written BEFORE its work entries, a quoted issue type holding a space. */
const GITFLOW = [
  "branching:",
  "  mode: Required  # every run on its own branch",
  "  issue-type-mappings:",
  "    Bug: hotfix",
  '    "Feature Request": feature',
  "    Feature: feature",
  "  work:",
  "    feature:",
  "      base: develop",
  "      name: 'feature/{issue-number}-{slug}'",
  "      target: develop",
  "    hotfix:",
  "      base: main",
  '      name: "hotfix/{slug}"',
  "      target: main",
  "qa: true",
  "",
];

test("--branching prints the mode, then every valid work entry and every mapping in file order, with no error line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, GITFLOW.join("\n"));

    assert.deepEqual(await report(dir), [
      "mode: required",
      "entry: feature | base: develop | name: feature/{issue-number}-{slug} | target: develop",
      "entry: hotfix | base: main | name: hotfix/{slug} | target: main",
      "map: Bug | hotfix",
      "map: Feature Request | feature",
      "map: Feature | feature",
    ]);
  });
});

const LEGACY = "error: branching.base and branching.name are no longer read - move them into a branching.work entry";

for (const legacy of ["base: develop", "name: 'feature/{issue}-{slug}'"]) {
  test(`--branching refuses the flat ${legacy.split(":")[0]} directly under branching: with the move message, the entries still printed`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, ["branching:", "  mode: allowed", `  ${legacy}`, "  work:", "    fix:", "      base: main", "      name: fix/{slug}", "      target: main", ""].join("\n"));

      assert.deepEqual(await report(dir), ["mode: allowed", "entry: fix | base: main | name: fix/{slug} | target: main", LEGACY]);
    });
  });
}

/** One `fix` entry beside a valid `feature` one, its three fields as given (a null field is left out). */
function withFix(fields: { base: string | null; name: string | null; target: string | null }): string {
  const fix = Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `      ${key}: ${value}`);
  return ["branching:", "  mode: allowed", "  work:", "    feature:", "      base: main", "      name: feat/{slug}", "      target: main", "    fix:", ...fix, ""].join("\n");
}

const FEATURE = "entry: feature | base: main | name: feat/{slug} | target: main";

test("--branching drops an entry whose name uses the old {issue} placeholder and says it is now {issue-number}", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, withFix({ base: "main", name: "'fix/{issue}-{slug}'", target: "main" }));

    assert.deepEqual(await report(dir), ["mode: allowed", FEATURE, "error: work entry fix: {issue} is now {issue-number}"]);
  });
});

for (const missing of ["base", "name", "target"] as const) {
  test(`--branching drops an entry missing its ${missing} and names the missing field`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, withFix({ base: "main", name: "fix/{slug}", target: "main", [missing]: null }));

      assert.deepEqual(await report(dir), ["mode: allowed", FEATURE, `error: work entry fix: missing ${missing}`]);
    });
  });
}

const INVALID: Array<[string, { base: string; name: string; target: string }, string]> = [
  ["a base read as an option", { base: "-main", name: "fix/{slug}", target: "main" }, "invalid base: -main"],
  ["an absolute base", { base: "/main", name: "fix/{slug}", target: "main" }, "invalid base: /main"],
  ["a base holding a range", { base: "main..develop", name: "fix/{slug}", target: "main" }, "invalid base: main..develop"],
  ["a target with a shell metacharacter", { base: "main", name: "fix/{slug}", target: "rel;ease" }, "invalid target: rel;ease"],
  ["a target read as an option", { base: "main", name: "fix/{slug}", target: "-x" }, "invalid target: -x"],
  ["a name with a variable", { base: "main", name: "fix/$USER", target: "main" }, "invalid name: fix/$USER"],
  ["a name with a tilde", { base: "main", name: "'fix/{slug}~1'", target: "main" }, "invalid name: fix/{slug}~1"],
];

for (const [label, fields, reason] of INVALID) {
  test(`--branching drops an entry with ${label} and names the field and its value`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, withFix(fields));

      assert.deepEqual(await report(dir), ["mode: allowed", FEATURE, `error: work entry fix: ${reason}`]);
    });
  });
}

test("--branching drops an entry whose key is not a plain name", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["branching:", "  work:", "    fix;rm:", "      base: main", "      name: fix/{slug}", "      target: main", ""].join("\n"));

    assert.deepEqual(await report(dir), ["mode: off", "error: work entry fix;rm: invalid key: fix;rm"]);
  });
});

test("--branching drops a mapping naming no work entry, and one naming a dropped entry, each with its own line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      [withFix({ base: "main", name: null, target: "main" }), "  issue-type-mappings:", "    Feature: feature", "    Bug: fix", "    Task: chore", ""].join("\n"),
    );

    assert.deepEqual(await report(dir), [
      "mode: allowed",
      FEATURE,
      "map: Feature | feature",
      "error: work entry fix: missing name",
      "error: issue-type-mappings: Bug names no work entry: fix",
      "error: issue-type-mappings: Task names no work entry: chore",
    ]);
  });
});

for (const [mode, printed] of [["allowed", "allowed"], ["REQUIRED", "required"]]) {
  test(`--branching under mode ${mode} with no valid work entry says so`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, ["branching:", `  mode: ${mode}`, "  work:", "    fix:", "      base: main", ""].join("\n"));

      assert.deepEqual(await report(dir), [
        `mode: ${printed}`,
        "error: work entry fix: missing name",
        "error: work entry fix: missing target",
        "error: no valid branching.work entry",
      ]);
    });
  });
}

test("--branching reads a CRLF config the same way (a stray CR is not part of any value)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, GITFLOW.join("\r\n"));

    assert.deepEqual(await report(dir), [
      "mode: required",
      "entry: feature | base: develop | name: feature/{issue-number}-{slug} | target: develop",
      "entry: hotfix | base: main | name: hotfix/{slug} | target: main",
      "map: Bug | hotfix",
      "map: Feature Request | feature",
      "map: Feature | feature",
    ]);
  });
});

test("--branching reads no work entry outside the branching group", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, ["branching:", "  mode: allowed", "qa: true", "  work:", "    fix:", "      base: main", "      name: fix/{slug}", "      target: main", ""].join("\n"));

    assert.deepEqual(await report(dir), ["mode: allowed", "error: no valid branching.work entry"]);
  });
});

test("--branching over a malformed config still exits 0 with the mode off", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "\u0000\u0001 not: yaml: at: all\n");

    assert.deepEqual(await report(dir), ["mode: off"]);
  });
});

for (const mode of ["off", "gitflow"]) {
  test(`--branching under mode ${mode} asks for no work entry (only a mode other than off needs one)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, ["branching:", `  mode: ${mode}`, ""].join("\n"));

      assert.deepEqual(await report(dir), ["mode: off"]);
    });
  });
}

// --- the build extensions ---

/** An agent file `.claude/agents/<name>.md`, or any other file under `.claude/`, as the host writes one. */
function writeAgent(root: string, relative: string): void {
  const file = path.join(root, ".claude", relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "---\nname: x\n---\n");
}

/** One agent file per name, `.claude/agents/<name>.md`. */
function writeAgents(root: string, ...names: string[]): void {
  for (const name of names) writeAgent(root, `agents/${name}.md`);
}

/** A `build:` group holding the extension map: each line given sits under `extensions:`, an
 *  entry as `<name>:` and its option as `  parallel: <value>`, both relative to the entry depth. */
function extensionMap(...lines: string[]): string {
  return ["build:", "  extensions:", ...lines.map((line) => `    ${line}`), ""].join("\n");
}

/** The two extension lines alone, under short names. */
function extensions(stdout: string): Record<string, string | undefined> {
  const all = config(stdout);
  return { found: all["build.extensions"], missing: all["build.extensions-missing"] };
}

test("a map naming two existing agents prints both on `build.extensions` in listed order, not sorted (the map is the run order)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "write-help", "audit-docs");
    writeConfig(dir, extensionMap("write-help:", "audit-docs:"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "write-help, audit-docs", missing: "none" });
  });
});

test("a map entry with no agent file prints on `build.extensions-missing` alone, an existing sibling still on `build.extensions`", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "write-help");
    writeConfig(dir, extensionMap("ghost:", "write-help:"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "write-help", missing: "ghost" });
  });
});

test("three found entries `a` and `b` parallel and `c` with no option print `build.extensions: a + b, c` (consecutive parallel entries share one step)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b", "c");
    writeConfig(dir, extensionMap("a:", "  parallel: true", "b:", "  parallel: true", "c:"));

    assert.equal(printedLine((await run(dir)).stdout, "build.extensions"), "build.extensions: a + b, c");
  });
});

test("`parallel: TRUE` joins its `parallel: true` neighbour while `parallel: yes` stands alone and splits the run after it (only `true`, in any letter case, is parallel)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b", "c", "d");
    writeConfig(dir, extensionMap("a:", "  parallel: TRUE", "b:", "  parallel: true  # with a", "c:", "  parallel: yes", "d:", "  parallel: true"));

    assert.equal(printedLine((await run(dir)).stdout, "build.extensions"), "build.extensions: a + b, c, d");
  });
});

test("two parallel runs split by a `parallel: false` entry print as two joined steps around it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b", "c", "d", "e");
    writeConfig(dir, extensionMap("a:", "  parallel: true", "b:", "  parallel: true", "c:", "  parallel: false", "d:", "  parallel: true", "e:", "  parallel: true"));

    assert.equal(printedLine((await run(dir)).stdout, "build.extensions"), "build.extensions: a + b, c, d + e");
  });
});

test("a missing name between two parallel entries prints on `build.extensions-missing` while its neighbours stay one step (a missing name never splits a run)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b");
    writeConfig(dir, extensionMap("a:", "  parallel: true", "ghost:", "b:", "  parallel: true"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "a + b", missing: "ghost" });
  });
});

test("a duplicate entry counts once, at its first place, with its first option (a later `parallel: true` cannot make it join a run)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b");
    writeConfig(dir, extensionMap("a:", "b:", "  parallel: true", "a:", "  parallel: true"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "a, b", missing: "none" });
  });
});

test("a CRLF map resolves like an LF one, no stray CR in a name or an option", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "a", "b");
    writeConfig(dir, extensionMap("a:", "  parallel: true", "b:", "  parallel: true", "ghost:").split("\n").join("\r\n"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "a + b", missing: "ghost" });
  });
});

test("`extensions-parallel: true` inside `build:` prints no `build.extensions-parallel` line (each entry carries its own option)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "extensions-parallel: true"));

    assert.equal(printedLine((await run(dir)).stdout, "build.extensions-parallel"), undefined);
  });
});

for (const [label, body, expected] of [
  ["`memory: true` written below the map", extensionMap("memory:", "  parallel: true") + "  memory: true\n", "build.memory: true"],
  ["no `memory:` line", extensionMap("memory:", "  parallel: true"), "build.memory: false"],
] as const) {
  test(`an entry named \`memory\` under the map, with ${label}, prints \`${expected}\` (a map line is never a \`build:\` switch)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, body);

      assert.equal(printedLine((await run(dir)).stdout, "build.memory"), expected);
    });
  });
}

for (const [name, file] of [
  ["Upper", "agents/Upper.md"],
  ["-lead", "agents/-lead.md"],
  ["snake_case", "agents/snake_case.md"],
  ["../escape", "escape.md"],
] as const) {
  test(`an invalid name \`${name}\` prints on \`build.extensions-missing\` even when \`.claude/agents/${name}.md\` resolves to a file (a name is never a path)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeAgent(dir, file);
      writeConfig(dir, extensionMap(`${name}:`));

      assert.deepEqual(extensions((await run(dir)).stdout), { found: "none", missing: name });
    });
  });
}

test("a name entered twice prints once on its line, found and missing alike", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "write-help");
    writeConfig(dir, extensionMap("write-help:", "ghost:", "write-help:", "ghost:"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "write-help", missing: "ghost" });
  });
});

for (const [label, body] of [
  ["the key absent", inGroup("build", "memory: true")],
  ["an empty map", inGroup("build", "extensions:")],
  ["a comment alone after the key", inGroup("build", "extensions:   # none yet")],
  ["an inline `extensions: write-help, audit-docs` value", inGroup("build", "extensions: write-help, audit-docs")],
  ["an inline value above map entries", inGroup("build", "extensions: write-help", "  audit-docs:")],
  ["the map under another group", ["planning:", "  extensions:", "    write-help:", ""].join("\n")],
] as const) {
  test(`a config with ${label} prints \`none\` on both extension lines`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeAgents(dir, "write-help", "audit-docs");
      writeConfig(dir, body);

      assert.deepEqual(extensions((await run(dir)).stdout), { found: "none", missing: "none" });
    });
  });
}

test("a comment after the map key and after an entry stays out of every name", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "write-help", "audit-docs");
    writeConfig(dir, ["build:", "  extensions:   # run these last", "    write-help:  # first", "    # ghost:", "    audit-docs:", ""].join("\n"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "write-help, audit-docs", missing: "none" });
  });
});

test("the first `extensions` key inside `build:` owns the map, so a later duplicate key cannot quietly add entries", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeAgents(dir, "write-help", "audit-docs");
    writeConfig(dir, ["build:", "  extensions:", "    write-help:", "  extensions:", "    audit-docs:", ""].join("\n"));

    assert.deepEqual(extensions((await run(dir)).stdout), { found: "write-help", missing: "none" });
  });
});

test("the agent files are looked up under the repository root, so a session started in a subdirectory finds them", async () => {
  await withGitRepo(async (repo) => {
    writeAgent(repo.dir, "agents/write-help.md");
    writeConfig(repo.dir, extensionMap("write-help:"));
    const nested = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await runScript(SUT, [], { cwd: nested, env: repo.env, shell: "bash" });
    assert.deepEqual(extensions(result.stdout), { found: "write-help", missing: "none" });
  });
});

// --- the local overrides file ---

function writeLocal(root: string, body: string): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "viber.local.yml"), body);
}

/** The block's lines after the header and the C2 comment line. */
function keyLines(stdout: string): string[] {
  return stdout.trim().split("\n").slice(2);
}

/** The local comment line, or undefined when none was printed. */
function localLine(stdout: string): string | undefined {
  return stdout.split(/\r?\n/).find((line) => line.startsWith("# local: "));
}

const DEFAULT_BLOCK = [
  "planning.adr: false",
  "planning.plain-plan-review: false",
  "planning.fast-path: false",
  "build.baseline-tests: off",
  "build.final-review: false",
  "build.memory: false",
  "build.rules: false",
  "build.qa: false",
  "build.cleanup: false",
  "build.red-check: false",
  "github.issues: false",
  "github.issue-title: {summary}",
  "github.pr-title: [{issue-number}] {summary}",
  "build.extensions: none",
  "build.extensions-missing: none",
  "directories.runs: _specs",
  "directories.specifications: specs",
  "tiers.min: haiku",
  "tiers.max: opus",
  "branching.mode: off",
];

test("a local file setting all four keys prints the local value on those four lines and the shared value on every other line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      inGroup("planning", "adr: true") + inGroup("build", "baseline-tests: full", "memory: true") + inGroup("github", "issues: false") + inGroup("tiers", "min: haiku", "max: opus"),
    );
    writeLocal(dir, inGroup("tiers", "min: Sonnet", "max: fable") + inGroup("build", "baseline-tests: fast") + inGroup("github", "issues: TRUE"));

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split("\n"), [
      "# viber config (resolved)",
      "# local: build.baseline-tests, github.issues, tiers.min, tiers.max | ignored: none",
      "planning.adr: true",
      "planning.plain-plan-review: false",
      "planning.fast-path: false",
      "build.baseline-tests: fast",
      "build.final-review: false",
      "build.memory: true",
      "build.rules: false",
      "build.qa: false",
      "build.cleanup: false",
      "build.red-check: false",
      "github.issues: true",
      "github.issue-title: {summary}",
      "github.pr-title: [{issue-number}] {summary}",
      "build.extensions: none",
      "build.extensions-missing: none",
      "directories.runs: _specs",
      "directories.specifications: specs",
      "tiers.min: sonnet",
      "tiers.max: fable",
      "branching.mode: off",
    ]);
  });
});

test("a local `tiers.max` alone leaves the shared `tiers.min` standing", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("tiers", "min: sonnet"));
    writeLocal(dir, inGroup("tiers", "max: fable"));

    assert.deepEqual(tiers((await run(dir)).stdout), { min: "sonnet", max: "fable" });
  });
});

for (const [label, shared, local, key, expected] of [
  ["tiers.max: gpt", inGroup("tiers", "max: sonnet"), inGroup("tiers", "max: gpt"), "tiers.max", "tiers.max: sonnet"],
  ["github.issues: maybe", inGroup("github", "issues: true"), inGroup("github", "issues: maybe"), "github.issues", "github.issues: true"],
  ["build.baseline-tests: half", inGroup("build", "baseline-tests: fast"), inGroup("build", "baseline-tests: half"), "build.baseline-tests", "build.baseline-tests: fast"],
  ["tiers.min with no value", inGroup("tiers", "min: sonnet"), inGroup("tiers", "min:   # none"), "tiers.min", "tiers.min: sonnet"],
] as const) {
  test(`an invalid local value (${label}) leaves the shared value on that line and names the key under ignored`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, shared);
      writeLocal(dir, local);

      const stdout = (await run(dir)).stdout;
      assert.equal(printedLine(stdout, key), expected);
      assert.equal(localLine(stdout), `# local: none | ignored: ${key}`);
    });
  });
}

for (const [key, shared, local, expected] of [
  ["build.memory", inGroup("build", "memory: true"), inGroup("build", "memory: false"), "build.memory: true"],
  ["planning.adr", inGroup("planning", "adr: true"), inGroup("planning", "adr: false"), "planning.adr: true"],
  ["directories.runs", group({ runs: "builds" }), group({ runs: "elsewhere" }), "directories.runs: builds"],
] as const) {
  test(`a local ${key} leaves that line at the shared value and is named under ignored`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeConfig(dir, shared);
      writeLocal(dir, local);

      const stdout = (await run(dir)).stdout;
      assert.equal(printedLine(stdout, key), expected);
      assert.equal(localLine(stdout), `# local: none | ignored: ${key}`);
    });
  });
}

test("a key repeated in the local file is named once, at its first occurrence", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, inGroup("build", "memory: true", "qa: true", "memory: false"));

    assert.equal(localLine((await run(dir)).stdout), "# local: none | ignored: build.memory, build.qa");
  });
});

test("a local `branching:` group names `branching.work` and not the entry lines nested under it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, ["branching:", "  work:", "    fix:", "      base: main", "      name: fix/{slug}", "      target: main", ""].join("\n"));

    assert.equal(localLine((await run(dir)).stdout), "# local: none | ignored: branching.work");
  });
});

test("a column-0 key carrying a value is named under ignored, a group header is not", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, ["memory: true", "schema: 3", inGroup("tiers", "max: fable")].join("\n"));

    assert.equal(localLine((await run(dir)).stdout), "# local: tiers.max | ignored: memory, schema");
  });
});

test("the first assignment of a local key wins, so an invalid first one is ignored even when a valid one follows", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, inGroup("tiers", "max: gpt", "max: fable"));

    const stdout = (await run(dir)).stdout;
    assert.equal(printedLine(stdout, "tiers.max"), "tiers.max: opus");
    assert.equal(localLine(stdout), "# local: none | ignored: tiers.max");
  });
});

test("a CRLF local file takes its values without a stray CR", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, "tiers:\r\n  max: fable\r\ngithub:\r\n  issues: true\r\n");

    const stdout = (await run(dir)).stdout;
    assert.equal(printedLine(stdout, "tiers.max"), "tiers.max: fable");
    assert.equal(localLine(stdout), "# local: github.issues, tiers.max | ignored: none");
  });
});

test("a merged range with min above max resets both tiers", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("tiers", "min: sonnet", "max: opus"));
    writeLocal(dir, inGroup("tiers", "max: haiku"));

    assert.deepEqual(tiers((await run(dir)).stdout), { min: "haiku", max: "opus" });
  });
});

test("with a local file present the comment line is the second line and the key lines follow in the existing order", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeLocal(dir, inGroup("build", "memory: true"));

    const stdout = (await run(dir)).stdout;
    assert.equal(stdout.trim().split("\n")[1], "# local: none | ignored: build.memory");
    assert.deepEqual(keyLines(stdout), DEFAULT_BLOCK);
  });
});

test("a local file in the repository root is read from a session started in a subdirectory", async () => {
  await withGitRepo(async (repo) => {
    writeLocal(repo.dir, inGroup("tiers", "max: fable"));
    const nested = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await runScript(SUT, [], { cwd: nested, env: repo.env, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(printedLine(result.stdout, "tiers.max"), "tiers.max: fable");
  });
});

test("a malformed local file still exits 0 and leaves the shared values", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("tiers", "max: sonnet"));
    writeLocal(dir, "\u0000\u0001 not: yaml: at: all\n");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(tiers(result.stdout), { min: "haiku", max: "sonnet" });
  });
});

test("an unreadable local file still exits 0 and leaves the shared values", { skip: canDenyRead() ? false : "this account cannot make a file unreadable" }, async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("tiers", "max: sonnet"));
    writeLocal(dir, inGroup("tiers", "max: fable"));
    const local = path.join(dir, ".claude", "viber.local.yml");
    denyRead(local);
    try {
      const result = await run(dir);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(tiers(result.stdout), { min: "haiku", max: "sonnet" });
    } finally {
      restoreRead(local);
    }
  });
});

test("--branching prints the same report with and without a local file carrying a branching group", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, GITFLOW.join("\n"));
    const without = await report(dir);
    writeLocal(dir, ["branching:", "  mode: off", "  work:", "    fix:", "      base: other", "      name: x/{slug}", "      target: other", ""].join("\n"));

    assert.deepEqual(await report(dir), without);
  });
});

// --- config.sh --red-check: the test patterns and the worktree links ---

const RED_CHECK_TESTS = "__tests__/ tests/ test/ *.Tests/ *.UnitTests/ *.IntegrationTests/ *.test.* *.spec.* test_*.py *_test.py *_test.go *Test.java *Test.kt";
const RED_CHECK_DEFAULTS = [`red-check.tests: ${RED_CHECK_TESTS}`, "red-check.links: node_modules"];

/** Every line `--red-check` printed, the exit asserted 0 first: no input may break the call. */
async function redCheck(dir: string): Promise<string[]> {
  const result = await runScript(SUT, ["--red-check"], { cwd: dir, shell: "bash" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  return result.stdout.replace(/\r/g, "").trimEnd().split("\n");
}

test("--red-check with no config file prints exactly the two default lines and exits 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    assert.deepEqual(await redCheck(dir), RED_CHECK_DEFAULTS);
  });
});

test("--red-check prints the shipped template as the two defaults (its list settings are commented out)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const template = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/viber.yml");
    writeConfig(dir, fs.readFileSync(template, "utf-8"));

    assert.deepEqual(await redCheck(dir), RED_CHECK_DEFAULTS);
  });
});

test("--red-check prints custom lists of build: with their entries joined by one space, blanks and tabs between them dropped", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "red-check: true", "red-check-tests:   spec/ \t *.cy.ts  ", "red-check-links: node_modules .venv"));

    assert.deepEqual(await redCheck(dir), ["red-check.tests: spec/ *.cy.ts", "red-check.links: node_modules .venv"]);
  });
});

test("--red-check cuts a list at the first blank followed by #, keeping a # inside an entry", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "red-check-tests: tests/ a#b.spec.ts # our two suites", "red-check-links: vendor\t# linked"));

    assert.deepEqual(await redCheck(dir), ["red-check.tests: tests/ a#b.spec.ts", "red-check.links: vendor"]);
  });
});

test("--red-check falls back to the default for an empty value and for a comment alone", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, inGroup("build", "red-check-tests:", "red-check-links: # none"));

    assert.deepEqual(await redCheck(dir), RED_CHECK_DEFAULTS);
  });
});

test("--red-check reads a list only as a child of build: (column 0, another group and an extension entry of that name leave the default)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(
      dir,
      "red-check-tests: flat/\n" + inGroup("planning", "red-check-links: wrong") + inGroup("build", "extensions:", "  red-check-tests: x/", "  red-check-links: y"),
    );

    assert.deepEqual(await redCheck(dir), RED_CHECK_DEFAULTS);
  });
});

test("--red-check takes the first assignment, ignores a CRLF ending and never reads the local file", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeConfig(dir, "build:\r\n  red-check-links: deps\r\n  red-check-links: other\r\n");
    writeLocal(dir, inGroup("build", "red-check-tests: mine/"));

    assert.deepEqual(await redCheck(dir), [`red-check.tests: ${RED_CHECK_TESTS}`, "red-check.links: deps"]);
  });
});
