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
import { withStub } from "../harness/stub.ts";
import { withGitRepo, withTempDir } from "../harness/tmp.ts";
import {
  SUT,
  run,
  write,
  seed,
  rule,
  lines,
  section,
  QUOTED_NAMES,
  seedQuotedNames,
  findings,
  ANY_TS,
} from "./rules-map-fixture.ts";

/** The run stamp the caller spends as `.temp/viber/<id>/`. */
const ID_SHAPE = /^id: \d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

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
      ".claude/rules/live.md": rule(["**/*.ts"]),
      "docs/specs/run-a/failures.md": failures(["convention | review-T1-1 | x"]),
    });
    write(repo, ".claude/rules/fresh.md", rule(["**/*.ts"]));

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

test("map mode names a root rule whose globs all open on one literal directory as misplaced there", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/api.md": rule(["server/*.ts", "server/lib/**/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), [".claude/rules/api.md server"]);
  });
});

test("map mode names no root rule misplaced when its globs hold no shared literal first segment and its name opens on no area", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/mixed.md": rule(["server/*.ts", "web/*.ts"]),
      ".claude/rules/flat.md": rule(["*.ts"]),
      ".claude/rules/slashless.md": rule(["server/*.ts", "README.md"]),
      ".claude/rules/everywhere.md": rule(["**/*.ts"]),
      ".claude/rules/braced.md": rule(["{server,web}/*.ts"]),
      ".claude/rules/classed.md": rule(["ser[v]er/*.ts"]),
      ".claude/rules/backend-db.md": rule(["**/*.ts"]),
      ".claude/rules/frontend-ui.md": "# loose\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), []);
  });
});

test("map mode names a root rule opening on an existing area's name as misplaced in that area, whatever its globs", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/backend/api.md": rule(["server/*.ts"]),
      ".claude/rules/backend-db.md": rule(["**/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), [".claude/rules/backend-db.md backend"]);
  });
});

test("map mode names a root rule declaring no scope misplaced in the area its name opens on", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/backend/api.md": rule(["server/*.ts"]),
      ".claude/rules/backend-misc.md": "# loose\n",
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), [".claude/rules/backend-misc.md backend"]);
  });
});

test("map mode names an area rule whose name opens on its own area as misplaced there", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/backend/api.md": rule(["server/*.ts"]),
      ".claude/rules/backend/backend-db.md": rule(["server/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), [".claude/rules/backend/backend-db.md backend"]);
  });
});

test("map mode never names a frozen rule misplaced", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/backend/api.md": rule(["server/*.ts"]),
      ".claude/rules/_server.md": rule(["server/*.ts"]),
      ".claude/rules/backend/_backend-db.md": rule(["server/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(section(result.stdout, "misplaced"), []);
  });
});

test("map mode prints the misplaced lines after the dead lines and before total, alphabetical by path", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      ".claude/rules/zeta.md": rule(["server/*.ts"]),
      ".claude/rules/alpha.md": rule(["gone/*.ts"]),
      ".claude/rules/backend/backend-x.md": rule(["server/*.ts"]),
    });

    const result = await run(repo);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).map((line) => line.split(":")[0]),
      ["# viber rules map", "id", "state", "rule", "rule", "rule", "dead", "misplaced", "misplaced", "misplaced", "total"],
    );
    assert.deepEqual(section(result.stdout, "misplaced"), [
      ".claude/rules/alpha.md gone",
      ".claude/rules/backend/backend-x.md backend",
      ".claude/rules/zeta.md server",
    ]);
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

/** The labelled lines of every `NEXT: rules-auditor` block of a brief, one
 *  array per block, the directive line itself dropped. */
function blocks(stdout: string): string[][] {
  const found: string[][] = [];
  for (const line of lines(stdout)) {
    if (line.startsWith("NEXT: ")) found.push([]);
    else if (found.length > 0) found[found.length - 1].push(line);
  }
  return found;
}

/** The `refs:` value of a brief block names the plugin's references directory
 *  as an absolute path; only its tail is compared, the root being the checkout. */
const REFS_TAIL = /^refs: .+\/viber\/references$/;

test("brief prints one rules-auditor block for a rule whose globs match tracked files", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      "src/b.ts": "b\n",
      "lib/c.ts": "c\n",
      ".claude/rules/code.md": rule(["src/*.ts", "lib/*.ts"]),
    });

    const result = await run(repo, ["--brief", "2026-11-19-05-28-48", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    assert.equal(lines(result.stdout)[0], "NEXT: rules-auditor");
    const [block] = blocks(result.stdout);
    assert.deepEqual(block.slice(0, 4), [
      "target: .claude/rules/code.md",
      "scope: src/*.ts,lib/*.ts",
      "matches: 3",
      "out: .temp/viber/2026-11-19-05-28-48/",
    ]);
    assert.match(block[4], REFS_TAIL);
    assert.equal(block.length, 5);
    assert.equal(blocks(result.stdout).length, 1);
  });
});

test("brief gives a rule declaring no scope the scope ** and no match count", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/loose.md": "# loose\n\nNo frontmatter at all.\n",
    });

    const result = await run(repo, ["--brief", "run1", ".claude/rules/loose.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(blocks(result.stdout)[0].slice(0, 4), [
      "target: .claude/rules/loose.md",
      "scope: **",
      "matches: none",
      "out: .temp/viber/run1/",
    ]);
  });
});

test("brief writes the GONE findings file for a rule matching no tracked file and prints its AUDIT line with no block", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/area/old.md": rule(["legacy/*.ts"]),
    });

    const result = await run(repo, ["--brief", "run1", ".claude/rules/area/old.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [
      "AUDIT: .claude/rules/area/old.md stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> .temp/viber/run1/area--old-audit.md",
      "NEXT: none",
    ]);
    assert.equal(
      fs.readFileSync(path.join(repo.dir, ".temp/viber/run1/area--old-audit.md"), "utf-8"),
      "GONE: the rule's globs match no tracked file\n",
    );
  });
});

test("brief hands a directory target to the auditor as a scope with no rule", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", "src/deep/b.ts": "b\n" });

    const result = await run(repo, ["--brief", "run1", "src/"]);

    assert.equal(result.status, 0);
    assert.deepEqual(blocks(result.stdout)[0].slice(0, 4), [
      "target: none",
      "scope: src",
      "matches: none",
      "out: .temp/viber/run1/",
    ]);
  });
});

test("brief hands the trail target the archived failures.md files holding a convention entry, and no others", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "README.md": "# repo\n",
      "docs/specs/2026-02-01-00-00-00_b/failures.md": failures(["convention | final-review-1 | a"]),
      "docs/specs/2026-01-01-00-00-00_a/failures.md": failures([
        "convention | review-T1-1 | b",
        "task | review-T2-1 | c",
      ]),
      "docs/specs/2026-03-01-00-00-00_c/failures.md": failures(["task | review-T3-1 | d"]),
    });

    const result = await run(repo, ["--brief", "run1", "trail"]);

    assert.equal(result.status, 0);
    assert.deepEqual(blocks(result.stdout)[0].slice(0, 4), [
      "target: trail",
      "scope: docs/specs/2026-01-01-00-00-00_a/failures.md,docs/specs/2026-02-01-00-00-00_b/failures.md",
      "matches: none",
      "out: .temp/viber/run1/",
    ]);
  });
});

test("brief prints no block for a trail target when no failures.md holds a convention entry, closing on NEXT: none", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "README.md": "# repo\n",
      "docs/specs/2026-03-01-00-00-00_c/failures.md": failures(["task | review-T3-1 | d"]),
    });

    const result = await run(repo, ["--brief", "run1", "trail"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), ["NEXT: none"]);
  });
});

test("brief prints the AUDIT lines first, then the blocks in the order the targets were given, and no NEXT: none beside a block", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/code.md": rule(["src/*.ts"]),
      ".claude/rules/gone.md": rule(["legacy/*.ts"]),
    });

    const result = await run(repo, [
      "--brief",
      "run1",
      "src",
      ".claude/rules/gone.md",
      ".claude/rules/code.md",
    ]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => !line.startsWith("refs: ")),
      [
        "AUDIT: .claude/rules/gone.md stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> .temp/viber/run1/gone-audit.md",
        "NEXT: rules-auditor",
        "target: none",
        "scope: src",
        "matches: none",
        "out: .temp/viber/run1/",
        "NEXT: rules-auditor",
        "target: .claude/rules/code.md",
        "scope: src/*.ts",
        "matches: 1",
        "out: .temp/viber/run1/",
      ],
    );
  });
});

test("brief refuses a frozen rule with one error line, an empty stdout and no file written", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/_frozen.md": rule(["src/*.ts"]),
      ".claude/rules/gone.md": rule(["legacy/*.ts"]),
    });

    const result = await run(repo, ["--brief", "run1", ".claude/rules/gone.md", ".claude/rules/_frozen.md"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^error: [^\n]+$/);
    assert.equal(fs.existsSync(path.join(repo.dir, ".temp")), false);
  });
});

test("brief refuses a path that is neither a rule, a directory nor trail with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/code.md": rule(["src/*.ts"]) });

    const result = await run(repo, ["--brief", "run1", "src/a.ts"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^error: [^\n]+$/);
  });
});

test("brief refuses a directory target escaping the repository through a parent segment", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });

    const result = await run(repo, ["--brief", "run1", "src/.."]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^error: [^\n]+$/);
  });
});

const STOP_LINE = "STOP: rules: the layer already holds, no writer dispatched";
const ASK_LINE = "ASK: fold in -> write | stop -> stop";

test("confirm prints the stop line alone when no findings file exists, each counter reading 0", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/code.md": rule([ANY_TS]) });

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [STOP_LINE]);
  });
});

test("confirm names a rule's counters, asks to fold in and hands the writer the map lines of the kept rule", async () => {
  await withGitRepo(async (repo) => {
    const body = rule([ANY_TS]);
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/code.md": body });
    findings(
      repo,
      "run1",
      "code-audit.md",
      'STALE: "a" -> b\nDROP: "c" -> d\nMISS: e\nMISS: f\nUSED: g\nOK: h\n',
    );

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    const out = lines(result.stdout);
    assert.deepEqual(out.slice(0, -1), [
      "confirm: .claude/rules/code.md stale 1 gone 0 drop 1 miss 2",
      ASK_LINE,
      "NEXT: rules-writer",
      "map:",
      "id: run1",
      "state: complete",
      `rule: .claude/rules/code.md ${Buffer.byteLength(body)} paths **/*.ts matches 1 ok`,
      `total: ${Buffer.byteLength(body)} ok`,
      "notes: .temp/viber/run1/",
    ]);
    assert.match(out[out.length - 1], REFS_TAIL);
  });
});

test("confirm hands the writer the rule and dead lines of the kept rules only, a dead rule counted gone from its findings file", async () => {
  await withGitRepo(async (repo) => {
    const kept = rule([ANY_TS]);
    const dead = rule(["**/legacy/*.ts"]);
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/kept.md": kept,
      ".claude/rules/left.md": rule([ANY_TS], "# left\n"),
      ".claude/rules/old.md": dead,
      ".claude/rules/dropped.md": rule(["**/vendor/*.ts"]),
    });
    findings(repo, "run1", "kept-audit.md", "STALE: x -> y\n");
    findings(repo, "run1", "old-audit.md", "GONE: the rule's globs match no tracked file\n");

    const result = await run(repo, [
      "--confirm",
      "run1",
      ".claude/rules/old.md",
      ".claude/rules/kept.md",
    ]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|rule|dead): /.test(line)),
      [
        "confirm: .claude/rules/old.md stale 0 gone 1 drop 0 miss 0",
        "confirm: .claude/rules/kept.md stale 1 gone 0 drop 0 miss 0",
        `rule: .claude/rules/kept.md ${Buffer.byteLength(kept)} paths **/*.ts matches 1 ok`,
        `rule: .claude/rules/old.md ${Buffer.byteLength(dead)} paths **/legacy/*.ts matches 0 ok`,
        "dead: .claude/rules/old.md",
      ],
    );
  });
});

test("confirm reads a directory target's counters from new--<path> with each separator doubled", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/deep/a.ts": "a\n" });
    findings(repo, "run1", "new--src--deep-audit.md", "MISS: a convention\nUSED: u\n");

    const result = await run(repo, ["--confirm", "run1", "src/deep"]);

    assert.equal(result.status, 0);
    assert.equal(lines(result.stdout)[0], "confirm: src/deep stale 0 gone 0 drop 0 miss 1");
    assert.equal(lines(result.stdout)[1], ASK_LINE);
  });
});

test("confirm reads the repository root target's counters from new--root", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });
    findings(repo, "run1", "new--root-audit.md", "MISS: one\nMISS: two\n");

    const result = await run(repo, ["--confirm", "run1", "."]);

    assert.equal(result.status, 0);
    assert.equal(lines(result.stdout)[0], "confirm: . stale 0 gone 0 drop 0 miss 2");
  });
});

test("brief prints a directory scope with one leading ./ and the trailing / removed", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });

    const result = await run(repo, ["--brief", "run1", "./src/"]);

    assert.equal(result.status, 0);
    assert.deepEqual(blocks(result.stdout)[0].slice(0, 2), ["target: none", "scope: src"]);
  });
});

test("brief prints the repository root target as scope . whether it is given as . or ./", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });

    for (const target of [".", "./"]) {
      const result = await run(repo, ["--brief", "run1", target]);

      assert.equal(result.status, 0, target);
      assert.deepEqual(blocks(result.stdout)[0].slice(0, 2), ["target: none", "scope: ."], target);
    }
  });
});

test("a MISS written under the slug of the brief's scope counts in the confirm of the same ./ target (the auditor names its file from the scope it was briefed with)", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });

    const brief = await run(repo, ["--brief", "run1", "./src/"]);
    const scope = blocks(brief.stdout)[0][1].slice("scope: ".length);
    findings(repo, "run1", `new--${scope.replaceAll("/", "--")}-audit.md`, "MISS: a convention\nUSED: u\n");
    const result = await run(repo, ["--confirm", "run1", "./src/"]);

    assert.equal(result.status, 0);
    assert.equal(lines(result.stdout)[0], "confirm: ./src/ stale 0 gone 0 drop 0 miss 1");
  });
});

test("confirm names the trail's miss, ignored and rejected counts and hands the writer every trail line", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "README.md": "# repo\n",
      "docs/specs/2026-01-01-00-00-00_a/failures.md": failures(["convention | review-T1-1 | a"]),
      "docs/specs/2026-02-01-00-00-00_b/failures.md": failures(["convention | review-T1-1 | b"]),
    });
    findings(
      repo,
      "run1",
      "_trail-audit.md",
      "MISS: m | runs a, b\nUSED: u\nIGNORED: i\nREJECTED: r1\nREJECTED: r2\n",
    );

    const result = await run(repo, ["--confirm", "run1", "trail"]);

    assert.equal(result.status, 0);
    const out = lines(result.stdout);
    assert.deepEqual(out.slice(0, -1), [
      "confirm: trail miss 1 ignored 1 rejected 2",
      ASK_LINE,
      "NEXT: rules-writer",
      "map:",
      "id: run1",
      "state: none",
      "trail: docs/specs/2026-01-01-00-00-00_a/failures.md convention 1 other 0",
      "trail: docs/specs/2026-02-01-00-00-00_b/failures.md convention 1 other 0",
      "total: 0 ok",
      "notes: .temp/viber/run1/",
    ]);
    assert.match(out[out.length - 1], REFS_TAIL);
  });
});

test("confirm sends the writer a kept trail holding other entries though every counter reads 0", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "README.md": "# repo\n",
      "docs/specs/2026-01-01-00-00-00_a/failures.md": failures([
        "task | review-T1-1 | a",
        "plan | review-T2-1 | b",
      ]),
    });

    const result = await run(repo, ["--confirm", "run1", "trail"]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|ASK|NEXT|trail): /.test(line)),
      [
        "confirm: docs/specs/2026-01-01-00-00-00_a/failures.md other 2",
        ASK_LINE,
        "NEXT: rules-writer",
        "trail: docs/specs/2026-01-01-00-00-00_a/failures.md convention 0 other 2",
      ],
    );
  });
});

test("confirm ignores the other entries of a trail that is not kept and stops", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/code.md": rule([ANY_TS]),
      "docs/specs/2026-01-01-00-00-00_a/failures.md": failures(["task | review-T1-1 | a"]),
    });

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [STOP_LINE]);
  });
});

test("confirm names a kept rule that is misplaced or past its file budget though every counter reads 0", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      "src/a.ts": "a\n",
      ".claude/rules/server-x.md": rule(["server/*.ts"]),
      ".claude/rules/big.md": rule([ANY_TS], "y".repeat(4100)),
    });

    const result = await run(repo, [
      "--confirm",
      "run1",
      ".claude/rules/server-x.md",
      ".claude/rules/big.md",
    ]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|ASK): /.test(line)),
      [
        "confirm: .claude/rules/server-x.md misplaced server",
        "confirm: .claude/rules/big.md OVER-FILE",
        ASK_LINE,
      ],
    );
  });
});

test("confirm names a rule it was not given neither misplaced nor over budget", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "server/a.ts": "a\n",
      "src/a.ts": "a\n",
      ".claude/rules/server-x.md": rule(["server/*.ts"]),
      ".claude/rules/big.md": rule([ANY_TS], "y".repeat(4100)),
      ".claude/rules/code.md": rule([ANY_TS]),
    });

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(lines(result.stdout), [STOP_LINE]);
  });
});

test("confirm names OVER-DIR on the total when the layer is past its directory budget", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/code.md": rule([ANY_TS]),
      ".claude/rules/_big.md": "z".repeat(41000),
    });

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/code.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|ASK|total): /.test(line)),
      ["confirm: total OVER-DIR", ASK_LINE, `total: ${41000 + Buffer.byteLength(rule([ANY_TS]))} OVER-DIR`],
    );
  });
});

test("confirm names a kept rule whose path holds a space misplaced and hands the writer its rule line (a map line is matched as a whole-path prefix, never cut at its first space)", async () => {
  await withGitRepo(async (repo) => {
    const body = rule(["src/**"]);
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/my rule.md": body });
    findings(repo, "run1", "my rule-audit.md", "STALE: x -> y\n");

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/my rule.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|rule): /.test(line)),
      [
        "confirm: .claude/rules/my rule.md stale 1 gone 0 drop 0 miss 0",
        "confirm: .claude/rules/my rule.md misplaced src",
        `rule: .claude/rules/my rule.md ${Buffer.byteLength(body)} paths src/** matches 1 ok`,
      ],
    );
  });
});

test("confirm gives a kept my.md none of the map lines of my rule.md or my.md rule.md (a kept path is never a prefix of a longer name)", async () => {
  await withGitRepo(async (repo) => {
    const kept = rule([ANY_TS]);
    await seed(repo, {
      "src/a.ts": "a\n",
      ".claude/rules/my.md": kept,
      ".claude/rules/my rule.md": rule(["src/*.ts"]),
      ".claude/rules/my.md rule.md": rule(["src/*.ts"]),
    });
    findings(repo, "run1", "my-audit.md", "STALE: x -> y\n");

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/my.md"]);

    assert.equal(result.status, 0);
    assert.deepEqual(
      lines(result.stdout).filter((line) => /^(confirm|rule|dead): /.test(line)),
      [
        "confirm: .claude/rules/my.md stale 1 gone 0 drop 0 miss 0",
        `rule: .claude/rules/my.md ${Buffer.byteLength(kept)} paths **/*.ts matches 1 ok`,
      ],
    );
  });
});

test("confirm refuses a frozen rule with one error line and an empty stdout", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n", ".claude/rules/_frozen.md": rule(["src/*.ts"]) });

    const result = await run(repo, ["--confirm", "run1", ".claude/rules/_frozen.md"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^error: [^\n]+$/);
  });
});

test("confirm refuses a call with no target, as brief does", async () => {
  await withGitRepo(async (repo) => {
    await seed(repo, { "src/a.ts": "a\n" });

    const result = await run(repo, ["--confirm", "run1"]);

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^error: [^\n]+$/);
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
