/*
 * extension.critical.test.ts - the critical tier of
 * viber/skills/extension/scripts/extension.sh: with no argument it prints the
 * extension state, and --add writes the new entry while keeping every other
 * line of viber.yml byte-identical.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by extension.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/extension.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { withGitRepo } from "../harness/tmp.ts";
import { run, writeFile, config, readConfig, lines } from "./extension-fixture.ts";

test("with no argument it prints the state, the listed agents that exist and the listed names with no file", async () => {
  await withGitRepo(async (repo) => {
    writeFile(repo.dir, ".claude/viber.yml", config(["  extensions:", "    docs:", "      parallel: false", "    gone:"]));
    writeFile(repo.dir, ".claude/agents/docs.md", "docs agent\n");
    const printed = lines(await run([], repo.dir, repo.env));
    assert.deepEqual(printed.slice(0, 3), ["CONFIG=ok", "LISTED=docs", "MISSING=gone"]);
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
