/*
 * archive-run.test.ts - proves viber/scripts/archive-run.sh's contract: it is
 * the ONE place a finished run leaves `docs/<runs>/` for `docs/<specs>/`, and
 * the one place the scaffolding a build needed only while it ran is dropped.
 *
 * Three properties carry the design. The two GATES refuse rather than correct -
 * a path outside `docs/<runs>/`, one carrying a `..` segment and one holding no
 * `status.md` are all signals that the caller is outside the contract (an
 * absolute path inside the repository is only another spelling, read as its
 * relative form), and an
 * unfinished run still resumes from exactly the files this script would delete.
 * The move is a `git mv` of the WHOLE directory, so the caller's edit of
 * `spec.md` lands in the history as rename plus modification rather than as an
 * add and a delete - that diff is what replaces a changelog. And the removal
 * list is ENUMERATED (`plan.md`, `status.md`, `tasks/`, `work/`), so anything
 * else the run left behind travels into the archive without this script having
 * to know what it is.
 *
 * The caller is an agent that takes the printed line as it stands and never
 * re-verifies it, which makes stdout (exactly one line, all git noise on
 * stderr) and the exit codes (2: unusable argv, 3: the destination exists,
 * 4: the run is unfinished, 5: a git step failed) the whole interface.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/archive-run.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/archive-run.sh");

const KEY = "2026-09-19-17-30-00_add-login";

/** A specification long enough for git's rename detection to have something to
 *  work with - a one-line file edited by one word falls under the similarity
 *  threshold and would report an add plus a delete for reasons that have
 *  nothing to do with this script. */
const SPEC_BODY = [
  "# Add Login",
  "",
  "## Goal",
  "",
  "Let people sign in.",
  "",
  "## Acceptance criteria",
  "",
  "1. A wrong password is rejected.",
  "2. A changed role takes effect on the next request.",
  "3. The session survives a reload.",
  "4. A locked account cannot sign in.",
  "",
].join("\n");

interface RunOpts {
  runs?: string;
  tasks?: string[];
  done?: string;
  skipped?: string;
  /** Extra files, relative to the run directory. */
  extra?: Record<string, string>;
}

/** A finished run directory, exactly as a build leaves one: the plan, the state
 *  file, the decomposition, the trail and the two documents worth keeping. */
function seedRun(root: string, key: string, opts: RunOpts = {}): string {
  const runs = opts.runs ?? "_specs";
  const tasks = opts.tasks ?? ["T1", "T2"];
  const dir = path.join(root, "docs", runs, key);
  fs.mkdirSync(path.join(dir, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "work"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "plan.md"),
    [
      "# Add Login",
      "",
      "## Tasks",
      "",
      ...tasks.flatMap((id) => ["<!-- TASK -->", `### ${id} - do ${id}`, `- Files: src/${id}.ts`, "<!-- /TASK -->", ""]),
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, "status.md"),
    [
      "# status",
      "",
      `progress: ${tasks.length}/${tasks.length}`,
      `done: ${opts.done ?? tasks.join(" ")}`,
      `skipped: ${opts.skipped ?? "none"}`,
      "unreviewed: none",
      "deferred: none",
      "closed: memory rules qa",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(dir, "spec.md"), SPEC_BODY);
  fs.writeFileSync(path.join(dir, "qa.md"), "# QA\n\n## QA-01 Sign in\n");
  fs.writeFileSync(path.join(dir, "qa.e2e.md"), "# Handoff\n\n### QA-01 Sign in\n");
  for (const id of tasks) fs.writeFileSync(path.join(dir, "tasks", `${id}.md`), `### ${id}\n`);
  fs.writeFileSync(path.join(dir, "work", "T1-coder.md"), "- narrowed the cache to 5s\n");
  for (const [rel, body] of Object.entries(opts.extra ?? {})) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return `docs/${runs}/${key}`;
}

/** `.claude/viber.yml` carrying the `directories:` group, which is the only
 *  place either name is read from. */
function writeDirs(root: string, entries: Record<string, string>): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claude", "viber.yml"),
    ["directories:", ...Object.entries(entries).map(([key, value]) => `  ${key}: ${value}`), ""].join("\n"),
  );
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash" });
}

/** A repo whose run directory is already committed, which is what every real
 *  call sees: `plan-index.sh --split` commits the decomposition. */
async function withSeededRepo<T>(fn: (repo: GitRepo, runDir: string) => T, opts: RunOpts = {}, key = KEY): Promise<T> {
  return await withGitRepo(async (repo) => {
    const runDir = seedRun(repo.dir, key, opts);
    await repo.git("add", "-A");
    const commit = await repo.git("commit", "-m", "docs(viber): decomposition");
    assert.equal(commit.status, 0, `seed commit failed: ${commit.stderr}`);
    return fn(repo, runDir);
  });
}

/** Every path under a directory, repo-relative and slash-separated. */
function filesUnder(root: string, rel: string): string[] {
  const base = path.join(root, rel);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(slash(path.relative(base, full)));
    }
  };
  walk(base);
  return out.sort();
}

// --- the safety gate ---

test("no argument, and more than one, are both refused with the usage line and exit 2", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const none = await run(dir, []);
    assert.equal(none.status, 2);
    assert.equal(none.stdout, "");
    assert.match(none.stderr, /usage: archive-run\.sh <run-dir>/);

    const two = await run(dir, ["docs/_specs/a", "docs/_specs/b"]);
    assert.equal(two.status, 2);
    assert.equal(two.stdout, "");
  });
});

test("a path outside docs/<runs>/ is refused, an absolute one inside the repository included, and nothing is touched", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, "docs", "other", "run"), { recursive: true });
    for (const bad of ["docs/other/run", "src/thing", path.join(repo.dir, "docs", "other", "run")]) {
      const result = await run(repo.dir, [bad], repo.env);
      assert.equal(result.status, 2, `expected a refusal for ${bad}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /lives under docs\/_specs\//);
    }
    assert.ok(fs.existsSync(path.join(repo.dir, runDir)), "the run directory must be untouched");
    assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
  });
});

test("a '..' segment is refused even under docs/<runs>/, because the prefix alone would let it through", async () => {
  await withSeededRepo(async (repo) => {
    const result = await run(repo.dir, [`docs/_specs/${KEY}/../../..`], repo.env);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /carries no '\.\.' segment/);
  });
});

test("an absolute path carrying a '..' segment is refused before it is resolved, even when it names the run itself", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [`${slash(repo.dir)}/docs/_specs/${KEY}/../${KEY}`], repo.env);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /carries no '\.\.' segment/);
    assert.ok(fs.existsSync(path.join(repo.dir, runDir)), "the run directory must be untouched");
  });
});

test("an absolute path to the run inside the repository archives it as its relative form would", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [path.join(repo.dir, "docs", "_specs", KEY)], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
    assert.ok(!fs.existsSync(path.join(repo.dir, runDir)));
  });
});

test("an absolute path to a run directory outside the repository is refused, and nothing is touched", async () => {
  await withSeededRepo(async (repo, runDir) => {
    await withTempDir("p2p2-viber-", async (outside) => {
      const outsideRun = path.join(outside, seedRun(outside, KEY));
      const result = await run(repo.dir, [outsideRun], repo.env);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /lives under docs\/_specs\//);
      assert.ok(fs.existsSync(outsideRun), "the outside directory must be untouched");
      assert.ok(fs.existsSync(path.join(repo.dir, runDir)), "the run directory must be untouched");
    });
  });
});

test("a leading './' and a trailing '/' are how a path is typed, so the run still archives", async () => {
  for (const spelling of [`./docs/_specs/${KEY}`, `docs/_specs/${KEY}/`, `./docs/_specs/${KEY}/`]) {
    await withSeededRepo(async (repo) => {
      const result = await run(repo.dir, [spelling], repo.env);
      assert.equal(result.status, 0, `${spelling}: ${result.stderr}`);
      assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
    });
  }
});

test("a run path typed with several trailing slashes archives the run, and only spec.md rides in the commit", async () => {
  await withGitRepo(async (repo) => {
    const runDir = seedRun(repo.dir, KEY);
    fs.rmSync(path.join(repo.dir, runDir, "qa.md"));
    fs.rmSync(path.join(repo.dir, runDir, "qa.e2e.md"));
    await repo.git("add", "-A");
    const seeded = await repo.git("commit", "-m", "docs(viber): decomposition");
    assert.equal(seeded.status, 0, `seed commit failed: ${seeded.stderr}`);

    const result = await run(repo.dir, [`${runDir}//`], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (1 files)`);
    const archived = (await repo.git("ls-tree", "-r", "--name-only", "HEAD", "docs/specs")).stdout.trim();
    assert.equal(slash(archived), `docs/specs/${KEY}/spec.md`);
  });
});

/** An argument naming no run key is refused with the C3 line before anything moves. */
async function assertNoRunKey(arg: string): Promise<void> {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [arg], repo.env);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), `error: refused ${arg} - no run key`);
    assert.ok(fs.existsSync(path.join(repo.dir, runDir, "plan.md")), "the run directory must be untouched");
    assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
  });
}

test("a '.' argument has no run key, so it is refused with exit 2 and nothing is moved", async () => {
  await assertNoRunKey(".");
});

test("a './' argument has no run key once its slash is stripped, so it is refused with exit 2 and nothing is moved", async () => {
  await assertNoRunKey("./");
});

test("an argument of slashes alone has an empty run key, so it is refused with exit 2 and nothing is moved", async () => {
  await assertNoRunKey("//");
});

test("a directory that does not exist, and one holding no status.md, are both exit 2", async () => {
  await withSeededRepo(async (repo) => {
    const missing = await run(repo.dir, ["docs/_specs/2026-01-01-00-00-00_nothing"], repo.env);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /run directory not found/);

    fs.mkdirSync(path.join(repo.dir, "docs", "_specs", "loose"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "docs", "_specs", "loose", "notes.md"), "stray\n");
    const loose = await run(repo.dir, ["docs/_specs/loose"], repo.env);
    assert.equal(loose.status, 2);
    assert.match(loose.stderr, /no status\.md/);
    assert.ok(fs.existsSync(path.join(repo.dir, "docs", "_specs", "loose", "notes.md")));
  });
});

// --- the completeness gate ---

test("a run with a task in neither done: nor skipped: is exit 4 and nothing is moved", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      const result = await run(repo.dir, [runDir], repo.env);
      assert.equal(result.status, 4);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /unfinished: 1 of 3 tasks settled/);
      assert.ok(fs.existsSync(path.join(repo.dir, runDir, "plan.md")));
      assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
    },
    { tasks: ["T1", "T2", "T3"], done: "T1" },
  );
});

test("an unknown id in place of a real task's id does not count toward settled, so the run is still refused as unfinished", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      const result = await run(repo.dir, [runDir], repo.env);
      assert.equal(result.status, 4);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /unfinished: 1 of 2 tasks settled/);
      assert.equal(filesUnder(repo.dir, "docs/specs").length, 0);
    },
    { tasks: ["T1", "T2"], done: "T1 BOGUS" },
  );
});

test("a task the user dropped counts as settled, so a run closed by skipping its last task archives", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      const result = await run(repo.dir, [runDir], repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(slash(result.stdout), /^ARCHIVED: docs\/specs\//);
    },
    { tasks: ["T1", "T2", "T3"], done: "T1 T2", skipped: "T3" },
  );
});

test("a TASK marker mentioned inside prose opens no block, so a heading that follows it is never mistaken for a task", async () => {
  await withGitRepo(async (repo) => {
    const key = KEY;
    const runDir = seedRun(repo.dir, key, { tasks: ["T1"] });
    const plan = path.join(repo.dir, runDir, "plan.md");
    fs.writeFileSync(
      plan,
      fs.readFileSync(plan, "utf-8") +
        [
          "",
          "See the <!-- TASK --> marker syntax explained above.",
          "",
          "### T2 - a heading that is not a task, just documentation",
          "",
          "More text about the marker shape.",
          "",
          "<!-- /TASK -->",
          "",
        ].join("\n"),
    );
    await repo.git("add", "-A");
    const commit = await repo.git("commit", "-m", "seed with a prose mention");
    assert.equal(commit.status, 0, `seed commit failed: ${commit.stderr}`);

    // the plan's real total is 1 (T1, already done); an unanchored count would
    // read the prose mention as opening a block, capture "T2" off the
    // documentation heading that follows it, and refuse this finished run as
    // though a second, unsettled task existed
    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(slash(result.stdout).trim(), new RegExp(`^ARCHIVED: docs/specs/${key} `));
  });
});

// --- the archive itself ---

test("the run moves to docs/specs/<same key>, keeps everything that is not scaffolding, and prints one line", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
    assert.equal(result.stdout.trim().split("\n").length, 1, "stdout is exactly one line");

    assert.ok(!fs.existsSync(path.join(repo.dir, runDir)), "the run directory is gone");
    assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), ["qa.e2e.md", "qa.md", "spec.md"]);
  });
});

test("a file the run left outside the enumerated scaffolding rides into the archive on its own", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
      assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), [
        "notes/handover.md",
        "qa.e2e.md",
        "qa.md",
        "spec.md",
      ]);
    },
    { extra: { "notes/handover.md": "kept\n" } },
  );
});

test("roadmap.md seeded in the run directory is archived", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
      assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), [
        "qa.e2e.md",
        "qa.md",
        "roadmap.md",
        "spec.md",
      ]);
    },
    { extra: { "roadmap.md": "# Roadmap\n\nNext part describes what follows.\n" } },
  );
});

test("a committed rulings.md rides into the archive commit (the register outlives the run)", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
      assert.equal((await repo.git("show", `HEAD:docs/specs/${KEY}/rulings.md`)).stdout, "# Rulings\n\n- tests: rerun once\n");
    },
    { extra: { "rulings.md": "# Rulings\n\n- tests: rerun once\n" } },
  );
});

test("a rulings.md still uncommitted when the run is archived lands in the archive commit, leaving the tree clean", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.writeFileSync(path.join(repo.dir, runDir, "rulings.md"), "# Rulings\n\n- commit: split it\n");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("show", `HEAD:docs/specs/${KEY}/rulings.md`)).stdout, "# Rulings\n\n- commit: split it\n");
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
  });
});

test("a outcome.md written uncommitted just before the call lands in the archive commit, leaving the tree clean", async () => {
  await withSeededRepo(async (repo, runDir) => {
    // what closeout does just before calling: the build summary, beside spec.md
    fs.writeFileSync(path.join(repo.dir, runDir, "outcome.md"), "3/3 tasks committed\nDrift: none\n");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("show", `HEAD:docs/specs/${KEY}/outcome.md`)).stdout, "3/3 tasks committed\nDrift: none\n");
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
  });
});

test("a finished run holding attachments/<name> and outcome.md leaves both under the archive directory", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
      assert.deepEqual(filesUnder(repo.dir, `docs/specs/${KEY}`), [
        "attachments/findings.md",
        "outcome.md",
        "qa.e2e.md",
        "qa.md",
        "spec.md",
      ]);
    },
    { extra: { "attachments/findings.md": "# Findings\n", "outcome.md": "3/3 tasks committed\n" } },
  );
});

test("an attachments/<name> file still uncommitted when the run is archived lands in the archive commit, leaving the tree clean", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, runDir, "attachments"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, runDir, "attachments", "mockup.html"), "<h1>Login</h1>\n");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("show", `HEAD:docs/specs/${KEY}/attachments/mockup.html`)).stdout, "<h1>Login</h1>\n");
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
  });
});

test("the move is one commit, and a spec.md edited before the call lands as a rename plus a modification", async () => {
  await withSeededRepo(async (repo, runDir) => {
    // what closeout does just before calling: the drift, marked in place
    const spec = path.join(repo.dir, runDir, "spec.md");
    fs.writeFileSync(
      spec,
      fs
        .readFileSync(spec, "utf-8")
        .replace("on the next request.", "on the next request. [D1]")
        .concat("\n## Deviations\n\nD1 (AC2): a 5s cache holds the old role.\n"),
    );

    const before = (await repo.git("rev-parse", "HEAD")).stdout.trim();
    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);

    const log = (await repo.git("log", "--format=%s", `${before}..HEAD`)).stdout.trim().split("\n");
    assert.deepEqual(log, [`docs(viber): archive run ${KEY}`]);

    // rename detection, read off --name-status rather than --stat: the stat
    // line abbreviates a long path to "..." and would hide the very thing
    // being asserted
    const shown = slash((await repo.git("show", "-M", "--name-status", "--format=", "HEAD")).stdout).trim().split("\n");
    assert.ok(
      shown.some((line) => /^R\d+\t/.test(line) && line.endsWith(`docs/specs/${KEY}/spec.md`)),
      `spec.md must be a rename, not an add plus a delete:\n${shown.join("\n")}`,
    );
    assert.ok(
      shown.some((line) => line === `D\tdocs/_specs/${KEY}/plan.md`),
      `the scaffolding must be deleted in the same commit:\n${shown.join("\n")}`,
    );

    // the working tree is clean: the removal rode in the same commit
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "");
    assert.match(fs.readFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "utf-8"), /\[D1\]/);
  });
});

test("the last run leaving docs/<runs>/ removes that directory too (git tracks no directory, so it would linger empty)", async () => {
  await withSeededRepo(async (repo, runDir) => {
    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.ok(!fs.existsSync(path.join(repo.dir, "docs", "_specs")), "an empty runs directory must be gone");
  });
});

test("docs/<runs>/ still holding something else is kept, a sibling run or a stray file alike", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const sibling = seedRun(repo.dir, "2026-09-20-10-00-00_other");
    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.ok(fs.existsSync(path.join(repo.dir, sibling, "status.md")), "the sibling run must be untouched");
  });
  await withTempDir("p2p2-viber-", async (dir) => {
    const runDir = seedRun(dir, KEY);
    fs.writeFileSync(path.join(dir, "docs", "_specs", "stray.md"), "kept\n");
    assert.equal((await run(dir, [runDir])).status, 0);
    assert.ok(fs.existsSync(path.join(dir, "docs", "_specs", "stray.md")));
  });
});

test("outside a git repository the empty docs/<runs>/ is removed the same way", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const runDir = seedRun(dir, KEY);
    assert.equal((await run(dir, [runDir])).status, 0);
    assert.ok(!fs.existsSync(path.join(dir, "docs", "_specs")));
  });
});

test("a path staged beside the run stays in the index: the commit's pathspec is the archive and the run alone", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.writeFileSync(path.join(repo.dir, "unrelated.ts"), "export const a = 1;\n");
    await repo.git("add", "unrelated.ts");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "A  unrelated.ts");
  });
});

test("a run holding attachments/run.sh staged 100755 over a 0644 file archives it at 100755 under core.fileMode=false, leaving the tree clean (a pathspec commit took the mode from HEAD)", async () => {
  await withSeededRepo(
    async (repo, runDir) => {
      await repo.git("config", "core.fileMode", "false");
      const script = path.join(runDir, "attachments", "run.sh").split(path.sep).join("/");
      fs.chmodSync(path.join(repo.dir, script), 0o644);
      await repo.git("update-index", "--chmod=+x", "--", script);

      const result = await run(repo.dir, [runDir], repo.env);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match((await repo.git("ls-tree", "HEAD", `docs/specs/${KEY}/attachments/run.sh`)).stdout, /^100755 blob /);
      assert.equal((await repo.git("status", "--short")).stdout.trim(), "");
    },
    { extra: { "attachments/run.sh": "#!/bin/sh\necho hi\n" } },
  );
});

test("a path staged beside the run stays staged under core.fileMode=false while the run archives", async () => {
  await withSeededRepo(async (repo, runDir) => {
    await repo.git("config", "core.fileMode", "false");
    fs.writeFileSync(path.join(repo.dir, "tool.sh"), "#!/bin/sh\n");
    await repo.git("add", "--chmod=+x", "tool.sh");

    assert.equal((await run(repo.dir, [runDir], repo.env)).status, 0);
    assert.equal((await repo.git("status", "--porcelain")).stdout.trim(), "A  tool.sh");
    assert.match((await repo.git("ls-files", "-s", "tool.sh")).stdout, /^100755 /);
  });
});

test("an existing destination is exit 3, and the run is left exactly where it was", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, "docs", "specs", KEY), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "an earlier archive\n");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.match(slash(result.stderr), /docs\/specs\/.* already exists/);
    assert.ok(fs.existsSync(path.join(repo.dir, runDir, "plan.md")));
    assert.equal(fs.readFileSync(path.join(repo.dir, "docs", "specs", KEY, "spec.md"), "utf-8"), "an earlier archive\n");
  });
});

// --- a failing git step ---

test("a failing 'git rm' on the scaffold removal exits 5, leaving the mv done and nothing committed", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf-8" }).stdout.trim();
    assert.ok(realGit.length > 0, "a real git must be resolvable on PATH to build the passthrough stub");

    await withStub(
      "git",
      `if [ "$1" = "rm" ]; then exit 1; fi\nexec "${realGit}" "$@"`,
      async (stubDir) => {
        const result = await runScript(SUT, [runDir], { cwd: repo.dir, env: repo.env, shell: "bash", stubDirs: [stubDir] });
        assert.equal(result.status, 5);
        assert.equal(result.stdout, "");

        // git mv already ran through the passthrough, so the directory sits at
        // its new name with the scaffolding not yet stripped and no commit made
        assert.ok(!fs.existsSync(path.join(repo.dir, runDir)));
        assert.ok(fs.existsSync(path.join(repo.dir, "docs", "specs", KEY, "plan.md")));
        assert.equal((await repo.git("log", "--format=%s", "-1")).stdout.trim(), "docs(viber): decomposition");
      },
    );
  });
});

// --- configuration ---

test("the directories group moves both ends of the move, and the gate follows directories.runs", async () => {
  await withGitRepo(async (repo) => {
    writeDirs(repo.dir, { runs: "builds", specifications: "archive" });
    const runDir = seedRun(repo.dir, KEY, { runs: "builds" });
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/archive/${KEY} (3 files)`);
    assert.deepEqual(filesUnder(repo.dir, `docs/archive/${KEY}`), ["qa.e2e.md", "qa.md", "spec.md"]);
    assert.ok(!fs.existsSync(path.join(repo.dir, "docs", "builds", KEY)));
  });
});

test("an unusable directory key is ignored, so the defaults still name both ends", async () => {
  await withSeededRepo(async (repo, runDir) => {
    writeDirs(repo.dir, { runs: "../escape", specifications: "/absolute" });

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
  });
});

test("a directory key outside the group is not this key, so the defaults name both ends", async () => {
  await withSeededRepo(async (repo, runDir) => {
    fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), "runs: builds\nspecifications: archive\n");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
  });
});

// --- the literal pathspec ---

test("a bracket in the run's name is one exact path, never a character class git expands", async () => {
  const bracketKey = "2026-09-19-17-30-00_route-x[ab]";
  await withGitRepo(async (repo) => {
    const runDir = seedRun(repo.dir, bracketKey);
    // a sibling a wildmatch "x[ab]" would cover, left with an uncommitted edit
    const decoy = path.join(repo.dir, "docs", "_specs", "route-xa");
    fs.mkdirSync(decoy, { recursive: true });
    fs.writeFileSync(path.join(decoy, "keep.md"), "original\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-m", "seed");
    fs.writeFileSync(path.join(decoy, "keep.md"), "edited, and not this script's business\n");

    const result = await run(repo.dir, [runDir], repo.env);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${bracketKey} (3 files)`);
    assert.deepEqual(filesUnder(repo.dir, `docs/specs/${bracketKey}`), ["qa.e2e.md", "qa.md", "spec.md"]);

    assert.equal(fs.readFileSync(path.join(decoy, "keep.md"), "utf-8"), "edited, and not this script's business\n");
    assert.equal(slash((await repo.git("status", "--porcelain")).stdout).trim(), "M docs/_specs/route-xa/keep.md".trim());
  });
});

// --- outside a repository ---

test("outside a git repository the same move happens, without a commit, and the line says so", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const runDir = seedRun(dir, KEY);

    const result = await run(dir, [runDir]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files - no git repository)`);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.ok(!fs.existsSync(path.join(dir, runDir)));
    assert.deepEqual(filesUnder(dir, `docs/specs/${KEY}`), ["qa.e2e.md", "qa.md", "spec.md"]);
  });
});

// --- the caller's cwd ---

test("the argument is repository-relative whatever the cwd, so a call from a subdirectory archives the same run", async () => {
  await withSeededRepo(async (repo, runDir) => {
    const nested = path.join(repo.dir, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });

    const result = await runScript(SUT, [runDir], { cwd: nested, env: repo.env, shell: "bash" });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout).trim(), `ARCHIVED: docs/specs/${KEY} (3 files)`);
  });
});
