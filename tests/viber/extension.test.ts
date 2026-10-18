/*
 * extension.test.ts - proves viber/skills/extension/scripts/extension.sh's
 * contract: with no argument it reports the configuration state, the listed
 * agents (a plain comma list of names in run order), the listed names with no
 * file, and one AGENT= line per project agent saying whether it carries the
 * extension marker; with `--add <name>` it registers a name once as an entry of
 * the `extensions:` map under `build:`.
 *
 * Two properties carry the design. It always exits 0 (a refusal is a STATUS=
 * line, never a failure), and a refusal - no config, a config without the key,
 * an invalid name, a name that already has an entry - leaves every file
 * untouched. A written entry is two lines inserted below the map's last
 * content line, in the file's own line ending; every other line stays
 * byte-identical.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/extension.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/extension/scripts/extension.sh");

const MARKER = "<!-- viber:extension -->";

async function run(args: string[], cwd: string, env: Record<string, string>): Promise<RunResult> {
  const result = await runScript(SUT, args, { cwd, env, shell: "bash" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  return result;
}

function writeFile(root: string, rel: string, body: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** A viber.yml whose `build:` group carries the given extension-map lines, a key after them and a group after that. */
function config(extensionLines: string[]): string {
  return ["schema: 3", "build:", "  memory: true", ...extensionLines, "  rules: true", "github:", "  issues: false", ""].join("\n");
}

function readConfig(root: string): string {
  return fs.readFileSync(path.join(root, ".claude", "viber.yml"), "utf8");
}

function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((line) => line !== "");
}

test("with no argument it prints the state, the listed agents that exist and the listed names with no file", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:", "    docs:", "      parallel: false", "    gone:"]));
    writeFile(repo.dir, ".claude/agents/docs.md", "docs agent\n");
    const printed = lines(await run([], repo.dir, repo.env));
    assert.deepEqual(printed.slice(0, 3), ["CONFIG=ok", "LISTED=docs", "MISSING=gone"]);
  });
});

test("with entries a and b both parallel and both found, LISTED is the plain list `a, b`", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: true"]));
    writeFile(repo.dir, ".claude/agents/a.md", "a agent\n");
    writeFile(repo.dir, ".claude/agents/b.md", "b agent\n");
    const printed = lines(await run([], repo.dir, repo.env));
    assert.equal(printed[1], "LISTED=a, b");
  });
});

test("with no argument it prints one AGENT= line per agent file, sorted by name, contract only for a file holding the marker line", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:"]));
    writeFile(repo.dir, ".claude/agents/zeta.md", `intro\n${MARKER}\nbody\n`);
    writeFile(repo.dir, ".claude/agents/alpha.md", `plain agent\nmentions ${MARKER} inside a sentence\n`);
    writeFile(repo.dir, ".claude/agents/mid.md", `${MARKER}\n`);
    const printed = lines(await run([], repo.dir, repo.env));
    assert.deepEqual(printed.slice(3), ["AGENT=alpha | plain", "AGENT=mid | contract", "AGENT=zeta | contract"]);
  });
});

test("--add x on an empty map writes `    x:` and `      parallel: false` right below `  extensions:`", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:"]));
    const result = await run(["--add", "x"], repo.dir, repo.env);
    assert.deepEqual([lines(result), readConfig(repo.dir)], [["STATUS=added"], config(["  extensions:", "    x:", "      parallel: false"])]);
  });
});

test("--add y after entries writes it below the last entry's last option line at the entry depth, before a trailing comment", async () => {
  await withGitRepo(async (repo) => {
    const map = ["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: false", "", "    # trailing note"];
    writeFile(repo.dir, ".claude/viber.yml", config(map));
    await run(["--add", "y"], repo.dir, repo.env);
    const expected = ["  extensions:", "    a:", "      parallel: true", "    b:", "      parallel: false", "    y:", "      parallel: false", "", "    # trailing note"];
    assert.equal(readConfig(repo.dir), config(expected));
  });
});

test("--add keeps a comment on the extensions line and every other line byte-identical", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:   # run order", "    # first the docs", "    a:   # docs", "      parallel: true   # safe"]));
    await run(["--add", "y"], repo.dir, repo.env);
    const expected = ["  extensions:   # run order", "    # first the docs", "    a:   # docs", "      parallel: true   # safe", "    y:", "      parallel: false"];
    assert.equal(readConfig(repo.dir), config(expected));
  });
});

test("--add on a CRLF file writes the two new lines in CRLF", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:", "    a:", "      parallel: true"]).replace(/\n/g, "\r\n"));
    await run(["--add", "y"], repo.dir, repo.env);
    const expected = config(["  extensions:", "    a:", "      parallel: true", "    y:", "      parallel: false"]).replace(/\n/g, "\r\n");
    assert.equal(readConfig(repo.dir), expected);
  });
});

test("--add of a name that already has an entry prints STATUS=present and leaves the file byte-identical (whatever its agent file or option)", async () => {
  await withGitRepo(async (repo) => {
    const before = config(["  extensions:   # run order", "    x:", "      parallel: true", "    y:"]);
    writeFile(repo.dir, ".claude/viber.yml", before);
    const result = await run(["--add", "x"], repo.dir, repo.env);
    assert.deepEqual([lines(result), readConfig(repo.dir)], [["STATUS=present"], before]);
  });
});

test("--add with no .claude/viber.yml prints STATUS=no-config and creates no file", async () => {
  await withGitRepo(async (repo) => {
    const result = await run(["--add", "x"], repo.dir, repo.env);
    assert.deepEqual([lines(result), fs.existsSync(path.join(repo.dir, ".claude"))], [["STATUS=no-config"], false]);
  });
});

test("--add on a config with no extensions: key under build: prints STATUS=stale and leaves the file untouched", async () => {
  await withGitRepo(async (repo) => {
    const before = ["schema: 2", "build:", "  memory: true", "github:", "  extensions:", "    x:", ""].join("\n");
    writeFile(repo.dir, ".claude/viber.yml", before);
    const result = await run(["--add", "x"], repo.dir, repo.env);
    assert.deepEqual([lines(result), readConfig(repo.dir)], [["STATUS=stale"], before]);
  });
});

test("--add under an extensions: key carrying an inline value prints STATUS=stale and leaves the file byte-identical", async () => {
  await withGitRepo(async (repo) => {
    const before = config(["  extensions: {}"]);
    writeFile(repo.dir, ".claude/viber.yml", before);
    const result = await run(["--add", "doc-writer"], repo.dir, repo.env);
    assert.deepEqual([lines(result), readConfig(repo.dir)], [["STATUS=stale"], before]);
  });
});

test("--add of the same name twice under a bare extensions: key prints STATUS=added, then STATUS=present", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:"]));
    const first = lines(await run(["--add", "doc-writer"], repo.dir, repo.env));
    const second = lines(await run(["--add", "doc-writer"], repo.dir, repo.env));
    assert.deepEqual([first, second], [["STATUS=added"], ["STATUS=present"]]);
  });
});

for (const name of ["Docs", "-docs", "../escape", "a b", ""]) {
  test(`--add of the invalid name ${JSON.stringify(name)} prints STATUS=invalid-name and leaves the file untouched`, async () => {
    await withGitRepo(async (repo) => {
      const before = config(["  extensions:"]);
      writeFile(repo.dir, ".claude/viber.yml", before);
      const result = await run(["--add", name], repo.dir, repo.env);
      assert.deepEqual([lines(result), readConfig(repo.dir)], [["STATUS=invalid-name"], before]);
    });
  });
}

test("with no argument and no .claude/viber.yml it prints CONFIG=no-config with nothing listed", async () => {
  await withGitRepo(async (repo) => {
    const printed = lines(await run([], repo.dir, repo.env));
    assert.deepEqual(printed, ["CONFIG=no-config", "LISTED=none", "MISSING=none"]);
  });
});

test("with no argument and no extensions: key under build: it prints CONFIG=stale", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", ["schema: 2", "build:", "  memory: true", ""].join("\n"));
    const printed = lines(await run([], repo.dir, repo.env));
    assert.equal(printed[0], "CONFIG=stale");
  });
});
