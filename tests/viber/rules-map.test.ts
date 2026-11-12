/*
 * rules-map.test.ts - proves viber/skills/rules/scripts/rules-map.sh's
 * contract: it is the ONE deterministic view the `/viber:rules` command has of
 * `.claude/rules/`, and the ONE gate in front of deleting a rule file.
 *
 * Three properties carry the design. The map mode is a `!` preload, so it
 * ALWAYS exits 0 - a non-zero exit there aborts the whole skill load, which is
 * why even "no repository at all" has to come back as a report rather than as
 * an error. A frozen rule (`_*.md`) is reported and nothing else: never scored
 * against the per-file budget, never called dead, never deleted - it is the
 * user's own file and no writer owns it. And `--reset` refuses the WHOLE call
 * the moment one target is unfit, because a partial delete leaves the layer in
 * a state neither the user nor the command can describe.
 *
 * The caller is trusted to take this output as it stands - the skill never
 * re-derives it - which makes the printed block and the exit codes (2: unusable
 * argv, 3: the reset refused) the whole interface.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/rules-map.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/skills/rules/scripts/rules-map.sh");

/** The run stamp the caller spends as `.temp/viber/<id>/`. */
const ID_SHAPE = /^id: \d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

function run(repo: GitRepo, args: string[] = [], cwd = repo.dir) {
  return runScript(SUT, args, { cwd, env: repo.env, shell: "bash" });
}

/** Writes one file under the repo, creating its directory. */
function write(repo: GitRepo, relative: string, body: string): void {
  const file = path.join(repo.dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** Writes every entry, then commits the lot - the tree a map is taken of. */
async function seed(repo: GitRepo, files: Record<string, string>): Promise<void> {
  for (const [relative, body] of Object.entries(files)) write(repo, relative, body);
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

/** A rule file with a block-sequence `paths:` key, the shape this repo's own
 *  rules use. */
function rule(globs: string[], body = "# rule\n"): string {
  return ["---", "paths:", ...globs.map((glob) => `  - "${glob}"`), "---", "", body].join("\n");
}

/** Every stdout line, separators normalized so a Windows path compares. */
function lines(stdout: string): string[] {
  return slash(stdout).trim().split("\n");
}

/** The lines opening on `<key>: `, that prefix stripped. */
function section(stdout: string, key: string): string[] {
  return lines(stdout)
    .filter((line) => line.startsWith(key + ": "))
    .map((line) => line.slice(key.length + 2));
}

test("map mode reports an empty layer when the rules directory is absent", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "README.md": "# repo\n" });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.equal(lines(result.stdout)[0], "# viber rules map");
    assert.match(lines(result.stdout)[1], ID_SHAPE);
    assert.deepEqual(section(result.stdout, "state"), ["none"]);
    assert.deepEqual(section(result.stdout, "total"), ["0 ok"]);
  });
});

test("map mode scores a rule and counts only the tracked files its globs match", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["src/*.ts"]);
    await seed(repo, {
      "src/a.ts": "a\n",
      "src/b.ts": "b\n",
      "src/deep/c.ts": "c\n",
      "docs/x.md": "x\n",
      ".claude/rules/code.md": body,
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "state"), ["complete"]);
    assert.deepEqual(section(result.stdout, "rule"), [
      `.claude/rules/code.md ${Buffer.byteLength(body)} paths src/*.ts matches 2 ok`,
    ]);
    assert.deepEqual(section(result.stdout, "total"), [`${Buffer.byteLength(body)} ok`]);
  });
});

test("map mode reports a frozen rule without scoring it and leaves the layer empty", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["nothing/*.ts"], "# frozen\n");
    await seed(repo, { "README.md": "# repo\n", ".claude/rules/_frozen.md": body });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "state"), ["none"]);
    assert.deepEqual(section(result.stdout, "rule"), []);
    assert.deepEqual(section(result.stdout, "dead"), []);
    assert.deepEqual(section(result.stdout, "frozen"), [
      `.claude/rules/_frozen.md ${Buffer.byteLength(body)}`,
    ]);
    assert.deepEqual(section(result.stdout, "total"), [`${Buffer.byteLength(body)} ok`]);
  });
});

test("map mode names a rule whose globs match nothing as dead, in alphabetical order", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/live.md": rule(["src/*.ts"]),
      ".claude/rules/gone.md": rule(["legacy/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "dead"), [".claude/rules/gone.md"]);
    assert.deepEqual(section(result.stdout, "rule").map((line) => line.split(" ")[0]), [
      ".claude/rules/gone.md",
      ".claude/rules/live.md",
    ]);
  });
});

test("map mode marks the layer partial for a rule declaring no paths key and never calls it dead", async () => {
  await withGitRepo(async (repo) => {
    const body = "# loose\n\nA rule with no frontmatter at all.\n";
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/live.md": rule(["src/*.ts"]),
      ".claude/rules/loose.md": body,
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "state"), ["partial"]);
    assert.deepEqual(section(result.stdout, "dead"), []);
    assert.equal(
      section(result.stdout, "rule")[1],
      `.claude/rules/loose.md ${Buffer.byteLength(body)} paths none matches 0 ok`,
    );
  });
});

test("map mode treats paths: global as an ordinary glob, so it matches nothing and is dead (Claude Code has no such keyword)", async () => {
  await withGitRepo(async (repo) => {
    const body = ["---", "paths: global", "---", "", "# everywhere", ""].join("\n");
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/all.md": body });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "dead"), [".claude/rules/all.md"]);
    assert.deepEqual(section(result.stdout, "rule"), [
      `.claude/rules/all.md ${Buffer.byteLength(body)} paths global matches 0 ok`,
    ]);
  });
});

test("map mode expands a {a,b} group in every paths spelling, a comma inside it never splitting the list", async () => {
  const spellings: Record<string, string> = {
    block: rule(["src/**/*.{ts,tsx}"]),
    flow: ["---", 'paths: ["src/**/*.{ts,tsx}", "lib/*.js"]', "---", "", "# rule", ""].join("\n"),
    scalar: ["---", 'paths: "src/**/*.{ts,tsx}, lib/*.js"', "---", "", "# rule", ""].join("\n"),
  };
  const shown: Record<string, string> = {
    block: "src/**/*.{ts,tsx}",
    flow: "src/**/*.{ts,tsx},lib/*.js",
    scalar: "src/**/*.{ts,tsx},lib/*.js",
  };
  for (const [name, body] of Object.entries(spellings)) {
    await withGitRepo(async (repo) => {
      await seed(repo, {
        "src/a.ts": "a\n",
        "src/deep/b.tsx": "b\n",
        "src/c.js": "c\n",
        ".claude/rules/code.md": body,
      });

      const result = await run(repo);

      assert.equal(result.status, 0, name);
      assert.deepEqual(section(result.stdout, "dead"), [], name);
      assert.deepEqual(
        section(result.stdout, "rule"),
        [`.claude/rules/code.md ${Buffer.byteLength(body)} paths ${shown[name]} matches 2 ok`],
        name,
      );
    });
  }
});

test("map mode keeps an unclosed brace literal rather than failing the whole map", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["src/{a.ts"]);
    await seed(repo, { "src/{a.ts": "a\n", "src/a.ts": "a\n", ".claude/rules/odd.md": body });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "rule"), [
      `.claude/rules/odd.md ${Buffer.byteLength(body)} paths src/{a.ts matches 1 ok`,
    ]);
  });
});

test("a modified rule whose path holds a space is dirty and a reset refuses it (porcelain quotes such a path)", async () => {
  await withGitRepo(async (repo) => {
    const target = ".claude/rules/my rule.md";
    await seed(repo, { "src/a.ts": "a\n", [target]: rule(["src/*.ts"]) });
    write(repo, target, rule(["src/*.ts"], "# edited\n"));

    const map = await run(repo);
    assert.equal(map.status, 0);
    assert.deepEqual(section(map.stdout, "dirty"), [`${target} modified`]);

    const reset = await run(repo, ["--reset", target]);
    assert.equal(reset.status, 3);
    assert.deepEqual(section(reset.stdout, "refused"), [`${target} modified`]);
    assert.ok(fs.existsSync(path.join(repo.dir, target)));
  });
});

/** Tracked names git quotes in its newline-separated listing: a `"` and a `\`
 *  cannot be spelled on a Windows filesystem, so the cases skip there. */
const QUOTED_NAMES = {
  skip: process.platform === "win32" ? "a double quote or backslash cannot be a Windows file name" : false,
};

async function seedQuotedNames(repo: GitRepo): Promise<void> {
  await seed(repo, {
    'lib/q"x.ts': "q\n",
    "lib/back\\slash.ts": "b\n",
    '.claude/rules/a"b.md': rule(["docs/*.md"]),
    ".claude/rules/lib.md": rule(["lib/*.ts"]),
    "docs/x.md": "x\n",
  });
}

test('map mode counts tracked paths holding " or \\ as tracked and matching (git quotes them in its plain listing)', QUOTED_NAMES, async () => {
  await withGitRepo(async (repo) => {
    await seedQuotedNames(repo);
    const lib = rule(["lib/*.ts"]);

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "dirty"), []);
    assert.deepEqual(section(result.stdout, "dead"), []);
    assert.ok(
      section(result.stdout, "rule").includes(
        `.claude/rules/lib.md ${Buffer.byteLength(lib)} paths lib/*.ts matches 2 ok`,
      ),
    );
  });
});

test('reset deletes a clean tracked rule whose name holds a " (it is tracked, not untracked)', QUOTED_NAMES, async () => {
  await withGitRepo(async (repo) => {
    await seedQuotedNames(repo);
    const target = '.claude/rules/a"b.md';

    const result = await run(repo, ["--reset", target]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [`removed: ${target}`, "removed: 1"]);
  });
});

test("map mode marks a rule past its own 4000 character budget", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["src/*.ts"], "x".repeat(4100));
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/big.md": body });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "rule"), [
      `.claude/rules/big.md ${Buffer.byteLength(body)} paths src/*.ts matches 1 OVER-FILE`,
    ]);
  });
});

test("map mode totals every rule file, frozen included, against the 40000 character budget", async () => {
  await withGitRepo(async (repo) => {
    const frozen = rule(["src/*.ts"], "y".repeat(41000));
    const small = rule(["src/*.ts"], "# small\n");
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/_frozen.md": frozen,
      ".claude/rules/small.md": small,
    });
    const sum = Buffer.byteLength(frozen) + Buffer.byteLength(small);

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.ok(sum > 40000, `the fixture has to cross the budget, got ${sum}`);
    assert.deepEqual(section(result.stdout, "total"), [`${sum} OVER-DIR`]);
    assert.deepEqual(section(result.stdout, "frozen"), [
      `.claude/rules/_frozen.md ${Buffer.byteLength(frozen)}`,
    ]);
  });
});

test("map mode names every rule holding uncommitted work", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/live.md": rule(["src/*.ts"]) });
    write(repo, ".claude/rules/live.md", rule(["src/*.ts"], "# edited\n"));
    write(repo, ".claude/rules/fresh.md", rule(["src/*.ts"]));

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "dirty"), [
      ".claude/rules/fresh.md untracked",
      ".claude/rules/live.md modified",
    ]);
  });
});

/** The body of one archived `failures.md`, one `- <cause> | <source> | <text>`
 *  entry per line. */
function failures(entries: string[]): string {
  return ["# Failures", "", ...entries.map((entry) => `- ${entry}`), ""].join("\n");
}

test("map mode names every archived failures.md alphabetical by path, with its convention count and the count of its other causes", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "README.md": "# repo\n",
      "docs/specs/2026-02-01-00-00-00_b/failures.md": failures([
        "convention | review-T1-1 | uses a hand-rolled parser",
        "task | review-T2-1 | misses DoD.3",
        "task | review-T2-2 | misses DoD.4",
      ]),
      "docs/specs/2026-01-01-00-00-00_a/failures.md": failures([
        "convention | final-review-1 | names a flag differently",
      ]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "trail"), [
      "docs/specs/2026-01-01-00-00-00_a/failures.md convention 1 other 0",
      "docs/specs/2026-02-01-00-00-00_b/failures.md convention 1 other 2",
    ]);
  });
});

test("map mode counts place, plan, task, test and unknown entries of one failures.md as its other causes", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/specs/run-a/failures.md": failures([
        "place | review-T1-1 | a",
        "plan | review-T1-2 | b",
        "task | review-T1-3 | c",
        "test | tests-1 | FAIL d",
        "unknown | review-T1-4 | e",
        "convention | review-T1-5 | f",
      ]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "trail"), ["docs/specs/run-a/failures.md convention 1 other 5"]);
  });
});

test("map mode sums the entries of every archived failures.md into one waiting line by cause", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/specs/run-a/failures.md": failures([
        "convention | review-T1-1 | x",
        "place | review-T1-1 | y",
        "task | review-T1-2 | z",
        "test | tests-1 | FAIL a",
      ]),
      "docs/specs/run-b/failures.md": failures([
        "convention | final-review-1 | x",
        "plan | review-T3-1 | y",
        "test | tests-1 | FAIL b",
        "test | tests-1 | FAIL c",
        "unknown | review-T3-1 | w",
      ]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "waiting"), [
      "convention 2 place 1 plan 1 task 1 test 3 unknown 1",
    ]);
  });
});

test("map mode prints neither trail nor waiting line when no failures.md is archived", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "README.md": "# repo\n", "docs/specs/run-a/outcome.md": "# outcome\n" });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "trail"), []);
    assert.deepEqual(section(result.stdout, "waiting"), []);
  });
});

test("map mode prints a trail line with convention 0 for a failures.md holding only test entries", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/specs/run-a/failures.md": failures(["test | tests-1 | FAIL a", "test | tests-1 | FAIL b"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "trail"), ["docs/specs/run-a/failures.md convention 0 other 2"]);
    assert.deepEqual(section(result.stdout, "waiting"), [
      "convention 0 place 0 plan 0 task 0 test 2 unknown 0",
    ]);
  });
});

test("map mode counts every archived failures.md in one awk process", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/specs/run-a/failures.md": failures(["convention | review-T1-1 | x"]),
      "docs/specs/run-b/failures.md": failures(["task | review-T1-1 | y"]),
      "docs/specs/run-c/failures.md": failures(["test | tests-1 | FAIL z"]),
    });
    const log = path.join(repo.dir, ".git", "awk-trail.log");
    const stub = [
      'case "$*" in',
      '  *failures.md*) echo hit >> "$AWK_LOG" ;;',
      "esac",
      'exec /usr/bin/awk "$@"',
    ].join("\n");

    await withStub("awk", stub, async (stubDir) => {
      const result = await runScript(SUT, [], {
        cwd: repo.dir,
        env: { ...repo.env, AWK_LOG: log },
        shell: "bash",
        stubDirs: [stubDir],
      });

      assert.equal(result.status, 0);
      assert.equal(section(result.stdout, "trail").length, 3);
      assert.equal(fs.readFileSync(log, "utf-8").trim().split("\n").length, 1);
    });
  });
});

test("map mode reads the archive from the directories.specifications value of the project config", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      ".claude/viber.yml": "directories:\n  runs: _specs\n  specifications: archive\n",
      "docs/archive/run-a/failures.md": failures(["convention | review-T1-1 | x"]),
      "docs/specs/run-b/failures.md": failures(["task | review-T1-1 | y", "task | review-T1-2 | z"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "trail"), ["docs/archive/run-a/failures.md convention 1 other 0"]);
    assert.deepEqual(section(result.stdout, "waiting"), [
      "convention 1 place 0 plan 0 task 0 test 0 unknown 0",
    ]);
  });
});

test("map mode falls back to the specs directory when the config call fails, and still exits 0", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      ".claude/viber.yml": "directories:\n  runs: _specs\n  specifications: archive\n",
      "docs/archive/run-a/failures.md": failures(["task | review-T1-1 | x"]),
      "docs/specs/run-b/failures.md": failures(["convention | review-T1-1 | y"]),
    });
    await withTempDir("p2p2-rules-bare-", async (dir) => {
      const lonely = path.join(dir, "viber", "skills", "rules", "scripts", "rules-map.sh");
      fs.mkdirSync(path.dirname(lonely), { recursive: true });
      fs.copyFileSync(SUT, lonely);

      const result = await runScript(lonely, [], { cwd: repo.dir, env: repo.env, shell: "bash" });

      assert.equal(result.status, 0);
      assert.deepEqual(section(result.stdout, "trail"), ["docs/specs/run-b/failures.md convention 1 other 0"]);
      assert.deepEqual(section(result.stdout, "waiting"), [
        "convention 1 place 0 plan 0 task 0 test 0 unknown 0",
      ]);
    });
  });
});

/** Runs a copy of the script whose sibling `scripts/config.sh` is `config`, a
 *  `#!/bin/sh` body, in a repo holding an archive under `docs/archive` and
 *  another under `docs/specs`. */
async function withConfigStub(config: string, check: (stdout: string) => void): Promise<void> {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/archive/run-a/failures.md": failures(["convention | review-T1-1 | x"]),
      "docs/specs/run-b/failures.md": failures(["task | review-T1-1 | y", "task | review-T1-2 | z"]),
    });
    await withTempDir("p2p2-rules-config-", async (dir) => {
      const lonely = path.join(dir, "viber", "skills", "rules", "scripts", "rules-map.sh");
      fs.mkdirSync(path.dirname(lonely), { recursive: true });
      fs.copyFileSync(SUT, lonely);
      const stub = path.join(dir, "viber", "scripts", "config.sh");
      fs.mkdirSync(path.dirname(stub), { recursive: true });
      fs.writeFileSync(stub, `#!/bin/sh\n${config}\n`, { mode: 0o755 });

      const result = await runScript(lonely, [], { cwd: repo.dir, env: repo.env, shell: "bash" });

      assert.equal(result.status, 0);
      check(result.stdout);
    });
  });
}

test("map mode reads the archive directory from the one line config.sh --specifications prints", async () => {
  await withConfigStub('[ "$1" = "--specifications" ] && echo archive', (stdout) => {
    assert.deepEqual(section(stdout, "trail"), ["docs/archive/run-a/failures.md convention 1 other 0"]);
  });
});

test("map mode reads the specs directory when config.sh --specifications prints nothing", async () => {
  await withConfigStub("exit 0", (stdout) => {
    assert.deepEqual(section(stdout, "trail"), ["docs/specs/run-b/failures.md convention 0 other 2"]);
  });
});

test("map mode prints the trail and waiting lines after the dirty lines and before total", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/live.md": rule(["src/*.ts"]),
      "docs/specs/run-a/failures.md": failures(["convention | review-T1-1 | x"]),
    });
    write(repo, ".claude/rules/fresh.md", rule(["src/*.ts"]));

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).map((line) => line.split(":")[0]),
      ["# viber rules map", "id", "state", "rule", "rule", "dirty", "trail", "waiting", "total"],
    );
  });
});

test("map mode scores the rules of every area subdirectory beside the shared root ones (a nested rule is loaded, so it costs the budget)", async () => {
  await withGitRepo(async (repo) => {
    const shared = rule(["**/*.ts"]);
    const api = rule(["server/*.ts"]);
    const frozen = rule(["web/*.ts"]);
    await seed(repo, {
      "server/a.ts": "a\n",
      "web/b.ts": "b\n",
      ".claude/rules/shared.md": shared,
      ".claude/rules/backend/api.md": api,
      ".claude/rules/frontend/_frozen.md": frozen,
      ".claude/rules/frontend/gone.md": rule(["legacy/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "rule").map((line) => line.split(" ")[0]), [
      ".claude/rules/backend/api.md",
      ".claude/rules/frontend/gone.md",
      ".claude/rules/shared.md",
    ]);
    assert.equal(
      section(result.stdout, "rule")[0],
      `.claude/rules/backend/api.md ${Buffer.byteLength(api)} paths server/*.ts matches 1 ok`,
    );
    assert.deepEqual(section(result.stdout, "frozen"), [
      `.claude/rules/frontend/_frozen.md ${Buffer.byteLength(frozen)}`,
    ]);
    assert.deepEqual(section(result.stdout, "dead"), [".claude/rules/frontend/gone.md"]);
  });
});

test("map mode reports outside a git repository, every rule untracked and none dead", async () => {
  await withTempDir("p2p2-rules-", async (dir) => {
    const body = rule(["src/*.ts"]);
    fs.mkdirSync(path.join(dir, ".claude", "rules"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "rules", "live.md"), body);

    const result = await runScript(SUT, [], { cwd: dir, shell: "bash" });

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "state"), ["complete"]);
    assert.deepEqual(section(result.stdout, "dead"), []);
    assert.deepEqual(section(result.stdout, "dirty"), [".claude/rules/live.md untracked"]);
  });
});

test("reset deletes every clean rule it is given", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/one.md": rule(["src/*.ts"]),
      ".claude/rules/two.md": rule(["src/*.ts"]),
    });

    const result = await run(repo, ["--reset", ".claude/rules/one.md", ".claude/rules/two.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [
      "removed: .claude/rules/one.md",
      "removed: .claude/rules/two.md",
      "removed: 2",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "one.md")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "two.md")), false);
  });
});

test("reset deletes a rule inside an area subdirectory and removes the area once it is empty", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/backend/api.md": rule(["src/*.ts"]),
      ".claude/rules/frontend/one.md": rule(["src/*.ts"]),
      ".claude/rules/frontend/two.md": rule(["src/*.ts"]),
    });

    const result = await run(repo, [
      "--reset",
      ".claude/rules/backend/api.md",
      ".claude/rules/frontend/one.md",
    ]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [
      "removed: .claude/rules/backend/api.md",
      "removed: .claude/rules/frontend/one.md",
      "removed: 2",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "backend")), false);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "frontend", "two.md")), true);
  });
});

test("reset refuses a target escaping the rules directory through a parent segment", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "docs/loose.md": "# not a rule\n",
      ".claude/rules/one.md": rule(["docs/*.md"]),
    });

    const result = await run(repo, ["--reset", ".claude/rules/one.md", ".claude/rules/../../docs/loose.md"]);

    assert.equal(result.status, 3);
    assert.deepEqual(lines(result.stdout), ["refused: .claude/rules/../../docs/loose.md not-a-rule"]);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs", "loose.md")), true);
  });
});

test("reset refuses the whole call when one target is frozen", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/one.md": rule(["src/*.ts"]),
      ".claude/rules/_frozen.md": rule(["src/*.ts"]),
    });

    const result = await run(repo, ["--reset", ".claude/rules/one.md", ".claude/rules/_frozen.md"]);

    assert.equal(result.status, 3);
    assert.deepEqual(lines(result.stdout), ["refused: .claude/rules/_frozen.md frozen"]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "one.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "_frozen.md")), true);
  });
});

test("reset names every unfit target and deletes nothing", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      "docs/loose.md": "# not a rule\n",
      ".claude/rules/one.md": rule(["src/*.ts"]),
      ".claude/rules/edited.md": rule(["src/*.ts"]),
    });
    write(repo, ".claude/rules/edited.md", rule(["src/*.ts"], "# edited\n"));
    write(repo, ".claude/rules/fresh.md", rule(["src/*.ts"]));

    const result = await run(repo, [
      "--reset",
      ".claude/rules/one.md",
      ".claude/rules/edited.md",
      ".claude/rules/fresh.md",
      ".claude/rules/gone.md",
      "docs/loose.md",
    ]);

    assert.equal(result.status, 3);
    assert.deepEqual(lines(result.stdout), [
      "refused: .claude/rules/edited.md modified",
      "refused: .claude/rules/fresh.md untracked",
      "refused: .claude/rules/gone.md missing",
      "refused: docs/loose.md not-a-rule",
    ]);
    assert.equal(fs.existsSync(path.join(repo.dir, ".claude", "rules", "one.md")), true);
    assert.equal(fs.existsSync(path.join(repo.dir, "docs", "loose.md")), true);
  });
});

test("reset with no target at all is refused as unusable argv", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/one.md": rule(["src/*.ts"]) });

    const result = await run(repo, ["--reset"]);

    assert.equal(result.status, 2);
    assert.deepEqual(lines(result.stdout), ["refused: - no-target"]);
  });
});

test("an argument that is not a mode is refused as unusable argv", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/one.md": rule(["src/*.ts"]) });

    const result = await run(repo, ["--audit"]);

    assert.equal(result.status, 2);
    assert.deepEqual(lines(result.stdout), ["refused: --audit unknown-mode"]);
  });
});

/** The mode git records for a shipped script. Tracked: straight out of the
 *  index. Not committed yet - which is what it is in the build that creates
 *  it - git derives the bit on the way in, from the `#!` line on Windows
 *  (`core.filemode` is false there) and from the mode bits everywhere else. */
async function indexMode(file: string): Promise<string> {
  const listed = (await runScript("git", ["ls-files", "-s", "--", file], {
    cwd: path.dirname(file),
  })).stdout.trim();
  if (listed) return listed.split(/\s+/)[0];
  const executable =
    process.platform === "win32"
      ? fs.readFileSync(file, "utf-8").startsWith("#!")
      : (fs.statSync(file).mode & 0o111) !== 0;
  return executable ? "100755" : "100644";
}

/** Whichever of `needles` the header does not carry - the caller asserts the
 *  empty list, so a failure names the missing line rather than just "false". */
function missingFrom(header: string, needles: string[]): string[] {
  return needles.filter((needle) => !header.includes(needle));
}

test("the script ships directly invocable, LF-only, its header printing its own stdout", async () => {
  const source = fs.readFileSync(SUT, "utf-8");
  const header = source.slice(0, source.indexOf("\nset -u"));

  assert.equal(source.split("\n", 1)[0], "#!/usr/bin/env bash");
  assert.equal(source.includes("\r\n"), false);
  assert.equal(await indexMode(SUT), "100755");
  assert.deepEqual(
    missingFrom(header, ["Contract:", "argv", "cwd", "env", "stdout", "exit"]),
    [],
  );
  assert.deepEqual(
    missingFrom(header, [
      "# viber rules map",
      "id: <yyyy-mm-dd-HH-mm-ss>",
      "state: none | partial | complete",
      "rule: <path> <chars> paths",
      "frozen: <path> <chars>",
      "dead: <path>",
      "dirty: <path> modified | untracked",
      "trail: <repo-relative path of one archived failures.md> convention <n> other <n>",
      "waiting: convention <n> place <n> plan <n> task <n> test <n> unknown <n>",
      "total: <chars> ok | OVER-DIR",
      "removed: <path>",
      "removed: <n>",
      "refused: <path>",
    ]),
    [],
  );
});

test("the header's reads list names the archived failures.md files and the config.sh call", () => {
  const source = fs.readFileSync(SUT, "utf-8");
  const header = source.slice(0, source.indexOf("\nset -u"));
  const reads = header.slice(header.indexOf("#   reads"), header.indexOf("#   writes"));

  assert.deepEqual(missingFrom(reads, ["failures.md", "scripts/config.sh"]), []);
});
