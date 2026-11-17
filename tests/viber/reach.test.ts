/*
 * reach.test.ts - proves viber/skills/planner/scripts/reach.sh's contract:
 * `reach.sh "<target>" ...` greps the repository for each reach target of the
 * planner and writes the candidates (every line naming the target, never the
 * target's own file) to `.temp/viber/planner/reach-<stamp>.md`, one section per
 * target, then prints `candidates: <absolute path>` and a `hits:` line.
 *
 * The cases pin what a caller of the file relies on: the terms a target
 * expands to (path, file name, file name without extension; a whole-word
 * symbol; the parent directory of a `| new` target), the terms too short to
 * search being named instead, the 200-line cap and its `truncated:` line, the
 * set of files searched (untracked yes, ignored and `.temp/` no) and the two
 * refusals (no target, outside a repository), which exit 2 and write nothing.
 * Every case builds a throwaway repository and reads the written file back.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/reach.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/planner/scripts/reach.sh");
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const TRUNCATED = "truncated: past 200 lines - search this target yourself";

function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function reach(repo: GitRepo, args: string[], cwd: string = repo.dir) {
  return runScript(SUT, args, { cwd, env: repo.env, shell: "bash" });
}

/** Runs reach.sh and returns its stdout lines plus the candidates file it names. */
async function reachFile(repo: GitRepo, args: string[], cwd?: string) {
  const result = await reach(repo, args, cwd);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const lines = result.stdout.trimEnd().split("\n");
  const named = slash(lines[0]).match(
    /^candidates: (.+\/\.temp\/viber\/planner\/reach-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md)$/,
  );
  assert.ok(named, `no candidates line in: ${result.stdout}`);
  return { lines, file: named[1], content: fs.readFileSync(named[1], "utf-8") };
}

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

test("a `| parse` target lists the whole word parse and never parser", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "src/p.ts", "parse(input);\n");
    write(repo.dir, "src/q.ts", "const parser = makeParser();\n");
    await repo.git("add", "src");

    const out = await reachFile(repo, ["src/auth.ts | parse"]);

    assert.equal(out.content, ["## src/auth.ts | parse", "terms: parse", "src/p.ts:1: parse(input);", ""].join("\n"));
  });
});

test("a `| new` target lists the files naming its parent directory", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "docs/y.md", "Add the files under src/new later.\n");
    write(repo.dir, "docs/other.md", "Nothing about it here.\n");
    await repo.git("add", "docs");

    const out = await reachFile(repo, ["src/new/c.ts | new"]);

    assert.equal(
      out.content,
      ["## src/new/c.ts | new", "terms: src/new", "docs/y.md:1: Add the files under src/new later.", ""].join("\n"),
    );
  });
});

test("a term shorter than 3 characters is named on the skipped line and never searched", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, "docs/z.md", "Wire it through io.ts first.\nThe io layer is slow.\n");
    await repo.git("add", "docs");

    const out = await reachFile(repo, ["src/io.ts"]);

    assert.equal(
      out.content,
      ["## src/io.ts", "terms: src/io.ts, io.ts", "skipped: io", "docs/z.md:1: Wire it through io.ts first.", ""].join("\n"),
    );
  });
});

test("a target with more than 200 hit lines keeps 200 and ends its section on the truncated line", async () => {
  await withGitRepo(async (repo) => {
    const lines = Array.from({ length: 250 }, (_, i) => `see auth.ts again ${i + 1}`);
    write(repo.dir, "big.txt", `${lines.join("\n")}\n`);
    await repo.git("add", "big.txt");

    const out = await reachFile(repo, ["src/auth.ts"]);
    const section = out.content.trimEnd().split("\n");

    assert.equal(section.length, 203);
    assert.equal(section[2], "big.txt:1: see auth.ts again 1");
    assert.equal(section[201], "big.txt:200: see auth.ts again 200");
    assert.equal(section[202], TRUNCATED);
  });
});

test("an untracked file the repository does not ignore is searched and an ignored one is not", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, ".gitignore", "ignored.md\n");
    write(repo.dir, "notes/u.md", "Remember src/auth.ts.\n");
    write(repo.dir, "ignored.md", "Also src/auth.ts.\n");
    await repo.git("add", ".gitignore");

    const out = await reachFile(repo, ["src/auth.ts"]);

    assert.equal(
      out.content,
      ["## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "notes/u.md:1: Remember src/auth.ts.", ""].join("\n"),
    );
  });
});

test("a file under .temp/ is never searched, even when the repository does not ignore it", async () => {
  await withGitRepo(async (repo) => {
    write(repo.dir, ".temp/viber/v.md", "Scratch about src/auth.ts.\n");
    write(repo.dir, "docs/x.md", "Real mention of src/auth.ts.\n");
    await repo.git("add", "docs");

    const out = await reachFile(repo, ["src/auth.ts"]);

    assert.equal(
      out.content,
      ["## src/auth.ts", "terms: src/auth.ts, auth.ts, auth", "docs/x.md:1: Real mention of src/auth.ts.", ""].join("\n"),
    );
  });
});

test("no target exits 2 with one error line on stderr and writes nothing", async () => {
  await withGitRepo(async (repo) => {
    const result = await reach(repo, []);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /^error: [^\n]+\n$/);
    assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false);
  });
});

test("a directory outside a git repository exits 2 with one error line on stderr and writes nothing", async () => {
  await withTempDir("p2p2-reach-", async (dir) => {
    const result = await runScript(SUT, ["src/auth.ts"], { cwd: dir, shell: "bash" });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /^error: [^\n]+\n$/);
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});

test("reach.sh is recorded in the git index as an executable (100755)", async () => {
  const result = await runScript("git", ["ls-files", "-s", "--", "viber/skills/planner/scripts/reach.sh"], {
    cwd: REPO_ROOT,
  });

  assert.match(result.stdout, /^100755 /);
});
