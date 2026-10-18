/*
 * bootstrap.test.ts - proves viber/skills/setup/scripts/bootstrap.sh seeds a
 * host project from the skill's own bundled files and never overwrites a value
 * the project already carries: `.claude/viber.yml` from templates/viber.yml, and
 * `.gitignore` from templates/gitignore.txt when the project has none - otherwise
 * the file stays the user's and its only edits are the `.temp/` rule and the
 * `.claude/viber.local.yml` entry (when no rule ignores that file yet), each
 * appended on its own line even when the file ends without one. `CLAUDE.md` is the one
 * item it only REPORTS, never creates (a skeleton would name no command): the
 * line is `CLAUDE.md: present - <root>/CLAUDE.md`, the absolute path at the
 * repository root, so the skill can judge the content itself, or a plain
 * `CLAUDE.md: missing`. An existing `.claude/settings.json` is only reported
 * too: `matches the template` when byte-identical to templates/settings.json,
 * else `present`.
 *
 * An existing `viber.yml` is MERGED rather than left alone, because a new
 * version ships new switches a file seeded by an older one would never see. The
 * merge runs in one direction: a top-level key the template has and the file
 * lacks is appended with its own comment and default, a missing child of the
 * `planning:`, `build:`, `github:` or `directories:` group is inserted inside
 * that group where a reader looks for it, and every key the file already
 * declares keeps its value, its comment and its position. A legacy flat switch
 * is MOVED into its group with its value (a grouped twin wins), and the
 * `schema:` line is added or raised to the template's, never lowered. Every
 * case asserts the written file, never a resolver's reading of it - save one,
 * which runs `config.sh` over a migrated flat file to prove the move lands
 * where the resolver reads. A file below the template's schema also has its
 * `build.baseline-tests` value `true` rewritten to `full` and `false` to `off`
 * (moved or grouped), each rewrite reported; a file already at the template's
 * schema keeps whatever value it carries.
 *
 * The template's key list is bound to its `schema:` number: a layout change
 * without a new number would leave the session-start note silent.
 *
 * Two properties carry the design. It resolves the REPOSITORY ROOT itself, so a
 * session started in a subdirectory still seeds the root rather than scattering
 * a second .gitignore. And it ALWAYS exits 0, because it runs as a `!` preload
 * where a non-zero exit aborts the whole skill load - a project that refuses one
 * of these files is not a broken setup.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/bootstrap.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { slash } from "../harness/paths.ts";
import { runScript } from "../harness/run.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/setup/scripts/bootstrap.sh");
const CONFIG_SH = path.resolve(import.meta.dirname, "../../viber/scripts/config.sh");
const TEMPLATE_GITIGNORE = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/gitignore.txt");
const TEMPLATE_CONFIG = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/viber.yml");
const TEMPLATE_SETTINGS = path.resolve(import.meta.dirname, "../../viber/skills/setup/templates/settings.json");

/** The key list each schema number stands for, as `templateKeyPaths` spells it.
 *  A layout change records a new number here and raises the template's. */
const SCHEMA_KEYS: Record<string, string[]> = {
  "1": [
    "schema",
    "planning", "planning-adr", "planning-plain-plan-review", "planning-fast-path",
    "build", "build-baseline-tests", "build-final-review", "build-memory", "build-rules", "build-qa", "build-cleanup",
    "github", "github-issues", "github-issue-title", "github-pr-title",
    "directories", "directories-runs", "directories-specifications",
    "tiers", "tiers-min", "tiers-max",
    "branching", "branching-mode", "branching-work",
  ],
  "2": [
    "schema",
    "planning", "planning-adr", "planning-plain-plan-review", "planning-fast-path",
    "build", "build-baseline-tests", "build-final-review", "build-memory", "build-rules", "build-qa", "build-cleanup",
    "github", "github-issues", "github-issue-title", "github-pr-title",
    "directories", "directories-runs", "directories-specifications",
    "tiers", "tiers-min", "tiers-max",
    "branching", "branching-mode", "branching-work",
  ],
  "3": [
    "schema",
    "planning", "planning-adr", "planning-plain-plan-review", "planning-fast-path",
    "build", "build-baseline-tests", "build-final-review", "build-memory", "build-rules", "build-qa", "build-cleanup",
    "build-extensions",
    "github", "github-issues", "github-issue-title", "github-pr-title",
    "directories", "directories-runs", "directories-specifications",
    "tiers", "tiers-min", "tiers-max",
    "branching", "branching-mode", "branching-work",
  ],
};

/** A complete schema-3 config with no comments, the fixture most merge cases edit. */
const GROUPED = [
  "schema: 3",
  "planning:", "  adr: true", "  plain-plan-review: true", "  fast-path: true",
  "build:", "  baseline-tests: off", "  final-review: true", "  memory: true", "  rules: true", "  qa: false", "  cleanup: true",
  "  extensions:",
  "github:", "  issues: false", "  issue-title: '{template-title}{summary}'", "  pr-title: '{type}: {summary}'",
  "directories:", "  runs: _specs", "  specifications: specs",
  "tiers:", "  min: haiku", "  max: opus",
  "branching:", "  mode: off",
  "",
].join("\n");

/** GROUPED as schema 2 left it: no extension key, the layout a pre-extension setup wrote. */
const GROUPED_V2 = GROUPED.replace("schema: 3\n", "schema: 2\n").replace("  extensions:\n", "");

/** The map lines of a filled extension map: two entries, the first one parallel. */
const MAP = "    help-writer:\n      parallel: true\n    notes-writer:\n";

const LOCAL = ".claude/viber.local.yml";

const FLAT_SWITCH =/^(adr|memory|rules|qa|cleanup|final-review|plain-plan-review|issues|fast-path|baseline-tests)[ \t]*:/m;

// A stub gh is always first on PATH, so the gh line never depends on whether
// the machine running the suite has the real one installed.
function run(dir: string, env: Record<string, string> = {}) {
  return withStub("gh", "exit 0", (stubDir) =>
    runScript(SUT, [], { cwd: dir, env, shell: "bash", stubDirs: [stubDir] }),
  );
}

function read(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

function configPath(root: string): string {
  return path.join(root, ".claude", "viber.yml");
}

/** The repository root as `git rev-parse --show-toplevel` spells it: the real
 *  path (macOS /var is /private/var, a Windows temp dir may carry an 8.3 short
 *  name), slash-normalised. */
function repoRoot(dir: string): string {
  return slash(fs.realpathSync.native(dir));
}

/** The value of `<group>:`'s child `<child>` in a written config, CR dropped;
 *  undefined when the group does not hold that child. */
function childValue(text: string, group: string, child: string): string | undefined {
  const body = new RegExp(`^${group}[ \\t]*:[ \\t]*\\r?\\n((?:[ \\t]+\\S.*\\n|#.*\\n)*)`, "m").exec(text);
  const line = new RegExp(`^[ \\t]+${child}[ \\t]*:[ \\t]*(.*?)\\r?$`, "m").exec(body?.[1] ?? "");
  return line?.[1];
}

/** One `<path>` per uncommented template line opening a key at indent 0
 *  (`<key>`) or indent 2 (`<group>-<child>`); deeper lines are not layout. */
function templateKeyPaths(template: string): string[] {
  const paths: string[] = [];
  let group = "";
  for (const line of template.split(/\r?\n/)) {
    const match = /^( *)([A-Za-z][\w-]*)[ \t]*:/.exec(line);
    if (match === null) continue;
    if (match[1].length === 0) {
      group = match[2];
      paths.push(group);
    } else if (match[1].length === 2 && group !== "") {
      paths.push(`${group}-${match[2]}`);
    }
  }
  return paths;
}

/** Empty when the template's key list is the one recorded for its schema number. */
function schemaBindingViolations(template: string, recorded: Record<string, string[]>): string[] {
  const schema = /^schema[ \t]*:[ \t]*(\S*)/m.exec(template)?.[1] ?? "";
  const keys = recorded[schema];
  if (keys === undefined) return [`schema "${schema}" has no recorded key list`];
  const actual = templateKeyPaths(template);
  return JSON.stringify(actual) === JSON.stringify(keys)
    ? []
    : [`the key list changed without a schema change: ${actual.join(", ")}`];
}

/** The printed CLAUDE.md lines, slash-normalised. */
function claudeMdLines(stdout: string): string[] {
  return stdout.split(/\r?\n/).filter((l) => l.startsWith("CLAUDE.md:")).map(slash);
}

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
        "",
      ].join("\n"),
    );
    assert.equal(read(configPath(dir)), read(TEMPLATE_CONFIG));
    assert.equal(read(path.join(dir, ".gitignore")), read(TEMPLATE_GITIGNORE));
  });
});

test("the bundled .gitignore already carries the .temp/ rule, so a fresh seed needs no append", () => {
  // The seeded file IS the template byte for byte (asserted above), so the run's
  // own second step must recognise the rule rather than duplicate it.
  assert.match(read(TEMPLATE_GITIGNORE), /^\.temp\/$/m);
});

test("the template's key list is the one recorded for its schema number (a layout change without a new number leaves the session-start note silent)", () => {
  assert.deepEqual(schemaBindingViolations(read(TEMPLATE_CONFIG), SCHEMA_KEYS), []);
});

test("self-check: a key added to the template without a schema change is a violation", () => {
  const grown = read(TEMPLATE_CONFIG).replace(/^github:\n/m, "github:\n  labels: none\n");

  assert.equal(schemaBindingViolations(grown, SCHEMA_KEYS).length, 1);
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

test("an existing .gitignore with no final newline gets the rule on its own line (a glued '*.log.temp/' would ignore nothing)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "node_modules/\n*.log"); // no trailing newline

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(read(ignore), `node_modules/\n*.log\n.temp/\n${LOCAL}\n`);
  });
});

test("a bare '.temp' rule (no trailing slash) counts as present - no second .temp entry is appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "# mine\n  .temp  \nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: already ignores \.temp\/$/m);
    assert.equal(read(ignore), `${before}${LOCAL}\n`);
  });
});

test("a commented-out .temp line does not count as the rule, so it is still appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "# .temp/\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.temp\/ appended$/m);
    assert.equal(read(ignore), `# .temp/\n.temp/\n${LOCAL}\n`);
  });
});

test("the bundled .gitignore carries the .claude/viber.local.yml entry, so a fresh seed needs no append", () => {
  assert.match(read(TEMPLATE_GITIGNORE), /^\.claude\/viber\.local\.yml$/m);
});

test("an existing .gitignore with no rule for the local file gets it on its own line, reported right after the .temp/ line", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "node_modules/\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.temp\/ appended\n\.gitignore: \.claude\/viber\.local\.yml appended\n/m);
    assert.equal(read(ignore), `node_modules/\n.temp/\n${LOCAL}\n`);
  });
});

test("an existing .gitignore with no final newline gets the local-file entry on its own line when .temp/ is already ruled (a glued 'build/.claude/viber.local.yml' would ignore nothing)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, ".temp/\nbuild/"); // no trailing newline

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.claude\/viber\.local\.yml appended$/m);
    assert.equal(read(ignore), `.temp/\nbuild/\n${LOCAL}\n`);
  });
});

test("an existing .gitignore whose '*.local.yml' rule already ignores the local file is left byte-identical and prints no local-file line", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = ".temp/\n*.local.yml\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /viber\.local\.yml/);
    assert.equal(read(ignore), before);
  });
});

test("a second run after the local-file entry was appended leaves .gitignore byte-identical and prints no local-file line", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "node_modules/\n");
    await run(dir, env);
    const afterFirst = read(ignore);

    const second = await run(dir, env);

    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.doesNotMatch(second.stdout, /viber\.local\.yml/);
    assert.equal(read(ignore), afterFirst);
  });
});

test("three runs with the local file already committed leave exactly one local-file line in .gitignore (a tracked file reads as not ignored, so each run appended another)", async () => {
  await withGitRepo(async ({ dir, env, git }) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, "node_modules/\n");
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, LOCAL), "tiers:\n  min: haiku\n");
    await git("add", LOCAL);

    await run(dir, env);
    await run(dir, env);
    const third = await run(dir, env);

    assert.equal(third.status, 0, `stderr: ${third.stderr}`);
    assert.equal(read(ignore).split("\n").filter((l) => l === LOCAL).length, 1);
  });
});

test("a run from a subdirectory of a fresh repository leaves the seeded .gitignore byte-identical to the template and prints no local-file line", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const nested = path.join(dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await run(nested, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /viber\.local\.yml/);
    assert.equal(read(path.join(dir, ".gitignore")), read(TEMPLATE_GITIGNORE));
  });
});

test("outside a repository an existing .gitignore gets the local-file entry appended when no line reads exactly that path", async () => {
  await withTempDir("p2p2-viber-bootstrap-", async (dir) => {
    const ignore = path.join(dir, ".gitignore");
    fs.writeFileSync(ignore, ".temp/\n*.local.yml\n");

    const result = await run(dir);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.claude\/viber\.local\.yml appended$/m);
    assert.equal(read(ignore), `.temp/\n*.local.yml\n${LOCAL}\n`);
  });
});

test("outside a repository a line reading exactly the local-file path, blanks around it allowed, leaves .gitignore byte-identical and prints no local-file line", async () => {
  await withTempDir("p2p2-viber-bootstrap-", async (dir) => {
    const ignore = path.join(dir, ".gitignore");
    const before = `.temp/\n  ${LOCAL}  \n`;
    fs.writeFileSync(ignore, before);

    const result = await run(dir);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /viber\.local\.yml/);
    assert.equal(read(ignore), before);
  });
});

test("a flat config moves `adr: false` and `memory: false` into `planning:` and `build:`, leaves no flat switch line and reports the move", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "adr: false\nmemory: false\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: migrated to schema 3: adr, memory moved into their groups \(your own values kept\)$/m);
    const after = read(cfg);
    // A move that wrote the template default would silently re-enable what the user turned off.
    assert.equal(childValue(after, "planning", "adr"), "false");
    assert.equal(childValue(after, "build", "memory"), "false");
    assert.doesNotMatch(after, FLAT_SWITCH);
  });
});

test("a flat config gains every group the template adds, each child the file did not set at its default, and `schema: 3`", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "adr: false\nmemory: false\nrules: false\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: merged from the template: planning, build, github, directories, tiers, branching \(your own values kept\)$/m);
    const after = read(cfg);
    assert.match(after, /^schema: 3$/m);
    assert.equal(childValue(after, "build", "rules"), "false");
    assert.equal(childValue(after, "build", "extensions"), "");
    assert.doesNotMatch(after, /extensions-parallel/);
    assert.equal(childValue(after, "build", "qa"), "false");
    assert.equal(childValue(after, "build", "cleanup"), "true");
    assert.equal(childValue(after, "planning", "fast-path"), "true");
    assert.equal(childValue(after, "github", "pr-title"), "'[{issue-number}] {summary}'");
    assert.match(after, /^directories:\n {2}runs: _specs\n {2}specifications: specs$/m);
    assert.match(after, /^tiers:\n {2}min: haiku\n {2}max: opus$/m);
    assert.match(
      after,
      /^branching:\n {2}mode: off\n {2}work:\n {4}main:\n {6}base: main\n {6}name: '\{type\}\/\{slug\}'\n {6}target: main\n {2}# issue-type-mappings:\n {2}# {3}bug: main$/m,
    );
  });
});

test("a flat config migrated by setup resolves through config.sh to the flat file's own values, each switch it did not set at the template default, as dotted lines", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "# my own switches\nadr: false\nmemory: false\nqa: true\nissues: true\nfast-path: false\n");
    await run(dir, env);

    const resolved = await runScript(CONFIG_SH, [], { cwd: dir, env, shell: "bash" });

    assert.equal(resolved.status, 0, `stderr: ${resolved.stderr}`);
    assert.deepEqual(resolved.stdout.split("\n").slice(1, 11), [
      "planning.adr: false",
      "planning.plain-plan-review: true",
      "planning.fast-path: false",
      "build.baseline-tests: off",
      "build.final-review: true",
      "build.memory: false",
      "build.rules: true",
      "build.qa: true",
      "build.cleanup: true",
      "github.issues: true",
    ]);
  });
});

test("a flat switch and the comment block directly above it are both removed by the move, every other line kept", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("  qa: false\n", "") + "\n# my qa note\n# second line\nqa: true\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const after = read(cfg);
    assert.doesNotMatch(after, /my qa note|second line/);
    assert.equal(childValue(after, "build", "qa"), "true");
  });
});

test("a flat `memory: true` beside a grouped `memory: false` ends with `build:` holding `memory: false` and no flat line (the grouped value is the one that counts)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "memory: true\n" + GROUPED.replace("  memory: true\n", "  memory: false\n"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const after = read(cfg);
    assert.equal(childValue(after, "build", "memory"), "false");
    assert.doesNotMatch(after, /^memory[ \t]*:/m);
  });
});

test("a config missing `build:`'s `qa` child gets it restored inside the group at its default", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("  qa: false\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: merged from the template: build\.qa \(your own values kept\)$/m);
    assert.equal(childValue(read(cfg), "build", "qa"), "false");
  });
});

test("a config missing `planning:`'s `fast-path` child gets it restored on, every other value kept", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("  adr: true\n", "  adr: false\n").replace("  fast-path: true\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const after = read(cfg);
    assert.equal(childValue(after, "planning", "fast-path"), "true");
    assert.equal(childValue(after, "planning", "adr"), "false");
  });
});

test("a config missing `github:`'s `pr-title` child gets it restored at the template's pattern", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("  pr-title: '{type}: {summary}'\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(childValue(read(cfg), "github", "pr-title"), "'[{issue-number}] {summary}'");
  });
});

test("the template ships `schema: 3`, `build.baseline-tests: off` and an empty `build.extensions`, and no `extensions-parallel` line", () => {
  const template = read(TEMPLATE_CONFIG);

  assert.match(template, /^schema: 3$/m);
  assert.equal(childValue(template, "build", "baseline-tests"), "off");
  assert.equal(childValue(template, "build", "extensions"), "");
  assert.doesNotMatch(template, /extensions-parallel/);
});

test("the template's comment above `extensions` names `.claude/agents/` and `parallel: true`", () => {
  const above = /((?:^ *#.*\n)+) *extensions:/m.exec(read(TEMPLATE_CONFIG))?.[1] ?? "";

  assert.match(above, /\.claude\/agents\/[\s\S]*parallel: true/);
});

test("the template's opening comment calls `build.extensions` no switch but a map of agent entries", () => {
  const opening = read(TEMPLATE_CONFIG).split("\n\n")[0];

  assert.match(opening, /`build\.extensions` is no switch but a map[\s#]+of agent entries/);
});

test("a schema-2 config gains `build.extensions` alone inside `build:`, reaches schema 3 and keeps the user's values", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED_V2.replace("  qa: false\n", "  qa: true\n").replace("  runs: _specs", "  runs: builds"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: merged from the template: build\.extensions \(your own values kept\)$/m);
    const after = read(cfg);
    assert.match(after, /^schema: 3$/m);
    assert.equal(childValue(after, "build", "extensions"), "");
    assert.doesNotMatch(after, /extensions-parallel/);
    assert.equal(childValue(after, "build", "qa"), "true");
    assert.equal(childValue(after, "directories", "runs"), "builds");
  });
});

test("a config whose extension map holds an entry named `qa` while `build:` lacks `qa:` gets `qa: false` restored after the map, the map's lines unchanged", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const map = "    qa:\n      parallel: true\n    # run it first\n\n    memory:\n";
    fs.writeFileSync(cfg, GROUPED.replace("  qa: false\n", "").replace("  extensions:\n", `  extensions:\n${map}`));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: merged from the template: build\.qa \(your own values kept\)$/m);
    const after = read(cfg);
    assert.equal(after.includes(`  extensions:\n${map}`), true);
    assert.match(after, /^ {4}memory:\n(?: *#.*\n)+ {2}qa: false\n/m);
  });
});

test("a config at the template's schema with a filled extension map is left byte-identical and unreported", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = GROUPED.replace("  extensions:\n", `  extensions:\n${MAP}`);
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a schema-2 config keeps the extension entries it already carries, whatever the schema line says", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", "schema: 2\n").replace("  extensions:\n", `  extensions:\n${MAP}`));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(read(cfg), GROUPED.replace("  extensions:\n", `  extensions:\n${MAP}`));
  });
});

test("the template's comment above `baseline-tests` names off, fast and full, and its opening comment names the switch as the exception to true and false", () => {
  const template = read(TEMPLATE_CONFIG);
  const above = /((?:^ *#.*\n)+) *baseline-tests:/m.exec(template)?.[1] ?? "";
  const opening = template.split("\n\n")[0];

  assert.match(above, /`off`[\s\S]*`fast`[\s\S]*`full`/);
  assert.match(opening, /baseline-tests/);
});

test("a grouped config with no `schema:` line gains `schema: 3` and reports only the schema", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: schema set to 3$/m);
    assert.match(read(cfg), /^schema: 3$/m);
  });
});

test("a config at a lower schema has its one `schema:` line raised, never a second one added", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", "schema: 0\n"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(read(cfg), GROUPED);
  });
});

test("a grouped `baseline-tests: true` in a schema-1 file becomes `full`, is reported and the schema is raised", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", "schema: 1\n").replace("baseline-tests: off", "baseline-tests: true"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: build\.baseline-tests true -> full \(the switch takes off, fast or full\)$/m);
    assert.equal(read(cfg), GROUPED.replace("baseline-tests: off", "baseline-tests: full"));
  });
});

test("a grouped `baseline-tests: false` in a schema-1 file becomes `off` and is reported", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", "schema: 1\n").replace("baseline-tests: off", "baseline-tests: false"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: build\.baseline-tests false -> off \(the switch takes off, fast or full\)$/m);
    assert.equal(read(cfg), GROUPED);
  });
});

test("a grouped `baseline-tests: True # mine` keeps its trailing comment when it becomes `full` (config.sh reads the value in any letter case)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED.replace("schema: 3\n", "schema: 1\n").replace("baseline-tests: off", "baseline-tests: True # mine"));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(read(cfg), GROUPED.replace("baseline-tests: off", "baseline-tests: full # mine"));
  });
});

test("a column-0 `baseline-tests: true` moves into `build:` as `full`, reported on the move line and on the rewrite line", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "baseline-tests: true\n" + GROUPED.replace("schema: 3\n", "schema: 1\n").replace("  baseline-tests: off\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: migrated to schema 3: baseline-tests moved into their groups \(your own values kept\)$/m);
    assert.match(result.stdout, /^viber\.yml: build\.baseline-tests true -> full \(the switch takes off, fast or full\)$/m);
    const after = read(cfg);
    assert.equal(childValue(after, "build", "baseline-tests"), "full");
    assert.doesNotMatch(after, FLAT_SWITCH);
  });
});

test("a schema-3 file whose `baseline-tests` is `off` is left byte-identical and unreported", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, GROUPED);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), GROUPED);
  });
});

test("a schema-3 file whose `baseline-tests` is `fast` is left byte-identical and unreported", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = GROUPED.replace("baseline-tests: off", "baseline-tests: fast");
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a schema-3 file whose `baseline-tests` is `full` is left byte-identical and unreported", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = GROUPED.replace("baseline-tests: off", "baseline-tests: full");
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a config at a higher schema than the template keeps its number and is left byte-identical", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = GROUPED.replace("schema: 3\n", "schema: 4\n");
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(read(cfg), before);
  });
});

test("migrating is idempotent: a second run over a migrated flat file prints `already present and complete` and changes nothing", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "# my header\n\n# the adr switch\nadr: false\n\nqa: true\ndirectories:\n  runs: _specs\n");
    await run(dir, env);
    const merged = read(cfg);

    const second = await run(dir, env);

    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.match(second.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), merged);
  });
});

test("a missing child of the directories group is inserted INSIDE the group, not appended past it", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    // A second top-level key after the group proves the insertion point: appending
    // the child at the end of the file would put it outside the group, where the
    // three readers that parse that group would never see it.
    fs.writeFileSync(cfg, GROUPED.replace("  specifications: specs\n", ""));

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: merged from the template: directories\.specifications \(your own values kept\)$/m);
    assert.equal(read(cfg), GROUPED);
  });
});

test("a directories key carrying a value instead of a group is left exactly as it is", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = GROUPED.replace("directories:\n  runs: _specs\n  specifications: specs\n", "directories: nonsense\n");
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a flat `qa: true` moves into a `build:` header carrying a trailing comment, and config.sh then reads `build.qa` on and the restored children at their defaults", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "qa: true\nbuild: # switches\n  memory: true\n");

    await run(dir, env);
    const resolved = await runScript(CONFIG_SH, [], { cwd: dir, env, shell: "bash" });

    assert.equal(resolved.status, 0, `stderr: ${resolved.stderr}`);
    assert.match(resolved.stdout, /^build\.qa: true$/m);
    assert.match(resolved.stdout, /^build\.final-review: true$/m);
    assert.match(resolved.stdout, /^build\.rules: true$/m);
    assert.match(resolved.stdout, /^build\.cleanup: true$/m);
    assert.doesNotMatch(read(cfg), /^qa[ \t]*:/m);
  });
});

test("a `qa: true` declared in a second `build:` block keeps config.sh printing `build.qa: true`, and no `qa:` line lands in the first block (the children of every block of a group count)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "build:\n  memory: true\nplanning:\n  adr: true\nbuild:\n  qa: true\n");

    await run(dir, env);
    const resolved = await runScript(CONFIG_SH, [], { cwd: dir, env, shell: "bash" });

    assert.equal(resolved.status, 0, `stderr: ${resolved.stderr}`);
    assert.match(resolved.stdout, /^build\.qa: true$/m);
    const after = read(cfg);
    assert.equal(after.match(/^[ \t]+qa[ \t]*:/gm)?.length, 1, `config: ${after}`);
    assert.match(after, /^build:\n {2}memory: true\n(?! {2}qa)/m);
  });
});

test("a `build: true` key carrying a value is still left alone, its flat switch standing (only a bare or commented header is a group)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "qa: true\nbuild: true # not a group\n");

    await run(dir, env);

    const after = read(cfg);
    assert.match(after, /^qa: true$/m);
    assert.match(after, /^build: true # not a group$/m);
    assert.doesNotMatch(after, /^[ \t]+(final-review|rules|cleanup)[ \t]*:/m);
  });
});

test("a key written with blanks before its colon counts as declared, so the file is left byte-identical (a second copy appended at its default would override the value the user set)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    const before = "schema : 3\nplanning :\n  adr: true\n  plain-plan-review : false\n  fast-path\t: true\nbuild\t:\n  baseline-tests\t: off\n  final-review\t: true\n  memory: true\n  rules: true\n  qa: true\n  cleanup: true\n  extensions\t:\n    a:\ngithub :\n  issues\t: true\n  issue-title : 'x'\n  pr-title\t: 'y'\ndirectories :\n  runs : builds\n  specifications\t: archive\ntiers:\n  min: haiku\n  max: opus\nbranching:\n  mode: off\n";
    fs.writeFileSync(cfg, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^viber\.yml: already present and complete \(left untouched\)$/m);
    assert.equal(read(cfg), before);
  });
});

test("a CRLF config comes back with ONE ending throughout, never a mix of the two", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    fs.writeFileSync(cfg, "adr: true\r\nmemory: true\r\nrules: true\r\ncleanup: true\r\ndirectories:\r\n  runs: _specs\r\n");

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const after = read(cfg);
    // Which ending survives is the platform's: an awk that reads in text mode
    // (Git-Bash) hands the merge LF-only lines and the file is rewritten LF.
    // A MIXED file is the defect either way - a line-based reader takes the
    // stray CR as part of the value, so `specs` would silently become `specs\r`.
    const crlf = (after.match(/\r\n/g) ?? []).length;
    const lf = (after.match(/\n/g) ?? []).length;
    assert.equal(crlf === 0 || crlf === lf, true, `mixed line endings: ${crlf} CRLF of ${lf} lines`);
    assert.match(after.replace(/\r/g, ""), /^ {2}specifications: specs$/m);
    assert.match(after.replace(/\r/g, ""), /^ {2}qa: false$/m);
    assert.match(after.replace(/\r/g, ""), /^ {2}memory: true$/m);
  });
});

test("a config already carrying every template key is byte-identical after a run", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const cfg = configPath(dir);
    fs.mkdirSync(path.dirname(cfg), { recursive: true });
    // The user's own wording and ordering, not the template's: the merge reads
    // which keys are declared, never how the file is written.
    const before = "# my own header\nbuild:\n  cleanup: false\n  final-review: false\n  baseline-tests: fast\n  qa: true\n  rules: true\n  memory: true\n  extensions:\n    a:\n      parallel: true\n    b:\ngithub:\n  pr-title: '{type}/{summary}'\n  issues: false\n  issue-title: 'x'\nplanning:\n  fast-path: false\n  plain-plan-review: false\n  adr: true\nschema: 3\n\ndirectories:\n  specifications: archive\n  runs: open\ntiers:\n  max: sonnet\n  min: sonnet\nbranching:\n  name: '{type}/{issue}-{slug}'\n  base: develop\n  mode: required\n";
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

test("a rooted '/.temp/' rule counts as present - no second .temp entry is appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "node_modules/\n/.temp/\nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: already ignores \.temp\/$/m);
    assert.equal(read(ignore), `${before}${LOCAL}\n`);
  });
});

test("a '.temp/**' glob rule counts as present - no second .temp entry is appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "node_modules/\n.temp/**\nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: already ignores \.temp\/$/m);
    assert.equal(read(ignore), `${before}${LOCAL}\n`);
  });
});

test("a '.temp/*' glob rule counts as present - no second .temp entry is appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "node_modules/\n.temp/*\nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: already ignores \.temp\/$/m);
    assert.equal(read(ignore), `${before}${LOCAL}\n`);
  });
});

test("an unanchored '**/.temp/' rule counts as present - no second .temp entry is appended", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "node_modules/\n**/.temp/\nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: already ignores \.temp\/$/m);
    assert.equal(read(ignore), `${before}${LOCAL}\n`);
  });
});

test("a negated '!.temp/' rule does NOT count as present - the entry is still appended (a negation un-ignores, it does not ignore)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const ignore = path.join(dir, ".gitignore");
    const before = "node_modules/\n!.temp/\nbuild/\n";
    fs.writeFileSync(ignore, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^\.gitignore: \.temp\/ appended$/m);
    assert.equal(read(ignore), `${before}.temp/\n${LOCAL}\n`);
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

test("an existing .claude/settings.json byte-identical to the template is reported as matching and left byte-unchanged (the skill skips the reset-or-merge question on this line)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const settings = path.join(dir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    const before = read(TEMPLATE_SETTINGS);
    fs.writeFileSync(settings, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^settings\.json: matches the template \(left untouched\)$/m);
    assert.doesNotMatch(result.stdout, /^settings\.json: present$/m);
    assert.equal(read(settings), before);
  });
});

test("an existing .claude/settings.json differing from the template only in formatting is reported present (a byte compare never passes a file it has not proven identical)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const settings = path.join(dir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    const before = JSON.stringify(JSON.parse(read(TEMPLATE_SETTINGS)));
    fs.writeFileSync(settings, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^settings\.json: present$/m);
    assert.equal(read(settings), before);
  });
});

test("a project with a CLAUDE.md gets the absolute path of the file at the repository root, and the file is left byte-unchanged (the skill reads it through that path)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const memory = path.join(dir, "CLAUDE.md");
    const before = "# project\n\nBuild: make\nTest: make test\n";
    fs.writeFileSync(memory, before);

    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      claudeMdLines(result.stdout).includes(`CLAUDE.md: present - ${repoRoot(dir)}/CLAUDE.md`),
      `stdout: ${result.stdout}`,
    );
    assert.equal(read(memory), before);
  });
});

test("a project without a CLAUDE.md gets a plain 'CLAUDE.md: missing' and no skeleton (a created file would name no command)", async () => {
  await withGitRepo(async ({ dir, env }) => {
    const result = await run(dir, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^CLAUDE\.md: missing$/m);
    assert.equal(fs.existsSync(path.join(dir, "CLAUDE.md")), false);
  });
});

test("the CLAUDE.md check resolves at the repository root, and the printed path names the root, not the cwd it was called from", async () => {
  await withGitRepo(async ({ dir, env }) => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# root\n");
    const nested = path.join(dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await run(nested, env);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(
      claudeMdLines(result.stdout).includes(`CLAUDE.md: present - ${repoRoot(dir)}/CLAUDE.md`),
      `stdout: ${result.stdout}`,
    );
  });
});

test("a gh on PATH is reported present and never run (the stub would fail the run if it were)", async () => {
  await withTempDir("p2p2-viber-bootstrap-gh-", async (dir) => {
    const result = await withStub("gh", "exit 1", (stubDir) =>
      runScript(SUT, [], { cwd: dir, env: {}, shell: "bash", stubDirs: [stubDir] }),
    );

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /^gh: present$/m);
  });
});

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((d) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(d, n))));

test(
  "no gh on PATH is reported as missing with the install hint, and the exit is still 0",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await withTempDir("p2p2-viber-bootstrap-nogh-", async (dir) => {
      const result = await runScript(SUT, [], { cwd: dir, env: { PATH: coreUtilsPath() }, shell: "bash" });

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(result.stdout, /^gh: missing - install the GitHub CLI \(https:\/\/cli\.github\.com\), then run gh auth login$/m);
    });
  },
);

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

test("outside a repository the cwd is the base - the seeding still happens and the exit is still 0", async () => {
  await withTempDir("p2p2-viber-bootstrap-", async (dir) => {
    const result = await run(dir);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(fs.existsSync(configPath(dir)));
    assert.ok(fs.existsSync(path.join(dir, ".gitignore")));
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

test("a read-only project root still exits 0 (fail-soft on every mutation)", async () => {
  await withTempDir("p2p2-viber-bootstrap-readonly-", async (scratch) => {
    const projectRoot = path.join(scratch, "project");
    fs.mkdirSync(projectRoot);
    // Best-effort: on POSIX this actually blocks writes into the directory; on
    // platforms where chmod does not enforce it (Windows, or a root-run CI
    // container) the seeding simply succeeds instead - either way the script's
    // contract is "exit 0 always", which is what we assert.
    fs.chmodSync(projectRoot, 0o555);
    try {
      const result = await run(projectRoot);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    } finally {
      fs.chmodSync(projectRoot, 0o755);
    }
  });
});
