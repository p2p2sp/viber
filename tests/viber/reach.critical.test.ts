/*
 * reach.critical.test.ts - the critical tier of
 * viber/skills/planner/scripts/reach.sh: a path target lists the files
 * importing or naming it with their lines and prints the candidates path.
 *
 * A case lives here when its failure means lost user work, an open gate, a
 * break only one platform shows or a script that no longer starts; the rest
 * of the contract is proven by reach.test.ts. This file runs on every
 * operating system, under the full shell matrix in CI.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/reach.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { withGitRepo } from "../harness/tmp.ts";
import { write, reachFile } from "./reach-fixture.ts";

test("a path target lists the files importing or naming it with their lines, never the target's own file, and prints the candidates path and the hits line", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "src/auth.ts", "// auth.ts holds the login\nexport const login = 1;\n");
    write(repo.dir, "src/b.ts", 'import { login } from "./auth";\n');
    write(repo.dir, "docs/x.md", "The login flow lives in src/auth.ts.\n");
    await repo.git("add", "src", "docs");

    const out = await reachFile(repo, ["src/auth.ts"], path.join(repo.dir, "src"));

    assert.equal(
      out.content,
      [
        "## src/auth.ts",
        "terms: src/auth.ts, auth.ts, auth",
        'docs/x.md:1: The login flow lives in src/auth.ts.',
        'src/b.ts:1: import { login } from "./auth";',
        "",
      ].join("\n"),
    );
    assert.equal(out.lines[1], "hits: 2 lines in 2 files");
    assert.ok(path.isAbsolute(out.file), out.file);
  });
});
