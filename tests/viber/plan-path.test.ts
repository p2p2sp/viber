/*
 * plan-path.test.ts - proves viber/scripts/plan-path.sh's contract: it is the
 * ONE place a plan path is formed AND the one place the approved plan is put
 * there, so every rule about the run directory
 * `docs/_specs/<yyyy-mm-dd-HH-mm-ss>_<slug>/` lives here and nowhere else.
 *
 * Three properties carry the design. The stamp is taken when the plan LANDS,
 * so a second run of the same slug can never overwrite an earlier plan - it
 * either reports the open run as `state: existing` or mints a fresh stamp. The
 * key it prints also names `.temp/viber/<plan-key>/` and the decomposition
 * beside the plan, so anything but `[a-z0-9-]` leaking out of the slug
 * normalization would reach a directory name and a git path. And `--land`
 * COPIES: plan mode writes the plan into a user-level `plansDirectory`,
 * normally outside the repository, so the source must survive untouched and
 * the landed plan - whose progress lives in the status.md beside it - must
 * never be written over. On the way in the copy loses the template's guidance
 * comments, keeping only the markers the run itself reads.
 *
 * Every resolution also lists, as `open:` lines, the OTHER runs still holding a
 * task that is neither done nor skipped: that is what tells the orchestrator a
 * fresh plan is being landed on top of unfinished work.
 *
 * The caller is trusted to take this output as it stands - the skill never
 * re-verifies it - which makes the printed block and the exit codes (2:
 * unusable argv, 3: nothing to resume, 4: an --into target that is not a
 * draft, 5: the copy failed, 6: the run branch could not be set, 7: the
 * plan's attachments map is unusable) the whole interface. The files the map
 * names land under the run's attachments/ directory.
 *
 * Under a `branching:` mode other than off, a first landing puts HEAD on the
 * run branch before anything is copied and prints a `branch:` line after
 * `state:`; those cases run in throwaway git repositories. `--start` is the
 * plan-less, read-only start report of the same situation; `--checkout` puts
 * HEAD on an existing local branch and never creates one.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/plan-path.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plan-path.sh");

/** The run directory's name: the landing stamp, then the normalized slug. */
const KEY_SHAPE = /^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function run(dir: string, args: string[] = [], stubDirs?: string[]) {
  return runScript(SUT, args, { cwd: dir, shell: "bash", stubDirs });
}

interface Resolved {
  path: string;
  key: string;
  state: string;
}

function parse(stdout: string): Resolved {
  const out: Record<string, string> = {};
  for (const line of slash(stdout).trim().split("\n")) {
    // the open: lines are a list, not a field - openLines() reads those
    if (line.startsWith("open: ")) continue;
    const at = line.indexOf(": ");
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 2);
  }
  return out as unknown as Resolved;
}

/** The slug half of a key, asserting the whole key shape on the way through -
 *  a key is a directory name, so a stray character is a broken path. */
function slugOf(key: string): string {
  const match = KEY_SHAPE.exec(key);
  assert.ok(match, `key is not <stamp>_<slug>: ${key}`);
  return match[2];
}

/** How long ago the key's stamp was, in milliseconds. The script stamps with
 *  `date`, i.e. LOCAL time, which is the clock Node reads here too. */
function stampAge(key: string): number {
  const match = KEY_SHAPE.exec(key);
  assert.ok(match, `key is not <stamp>_<slug>: ${key}`);
  const [y, mo, d, h, mi, s] = match[1].split("-").map(Number);
  return Date.now() - new Date(y, mo - 1, d, h, mi, s).getTime();
}

/** A landed plan: the run directory plus its plan.md, with a pinned mtime so
 *  "most recently worked on" is decided by the test, not by the filesystem. */
function landPlan(root: string, key: string, mtime = "2026-01-01T00:00:00Z", body?: string): string {
  const file = path.join(root, "docs", "_specs", key, "plan.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body ?? planWithTasks(key, ["T1"]));
  const seconds = Date.parse(mtime) / 1000;
  fs.utimesSync(file, seconds, seconds);
  return file;
}

/** A source plan the way plan mode leaves one: any directory, any file name,
 *  its title on the first H1. Returned as an absolute path, because that is
 *  what a `plansDirectory` outside the repository hands over. */
function sourcePlan(dir: string, name: string, body: string): string {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
}

/** The `open:` lines of one resolution, in the order printed. */
function openLines(stdout: string): string[] {
  return slash(stdout)
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("open: "))
    .map((line) => line.slice("open: ".length));
}

/** A run's state file, as --split writes it and commit-task.sh advances it. */
function landStatus(root: string, key: string, entries: Record<string, string>, mtime?: string): void {
  const file = path.join(root, "docs", "_specs", key, "status.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ["# status", "", ...Object.entries(entries).map(([k, v]) => `${k}: ${v}`), ""].join("\n"));
  if (mtime) {
    const seconds = Date.parse(mtime) / 1000;
    fs.utimesSync(file, seconds, seconds);
  }
}

/** A landed plan carrying N task blocks, so a run has something to be open about. */
function planWithTasks(title: string, ids: string[]): string {
  return [
    `# ${title}`,
    "",
    "## Tasks",
    "",
    ...ids.flatMap((id) => ["<!-- TASK -->", `### ${id} - do ${id}`, `- Files: src/${id}.ts`, "<!-- /TASK -->", ""]),
  ].join("\n");
}

/** The run directories on disk, so a test can assert that a second one was -
 *  or was not - minted. */
function runDirs(root: string): string[] {
  const specs = path.join(root, "docs", "_specs");
  return fs.existsSync(specs) ? fs.readdirSync(specs).sort() : [];
}

/** A plan the way one lands for a build: a head, then the task half. A plan
 *  carrying no TASK block at all is a draft, which is its own state. */
const PLAN_BODY = [
  "# Add Login",
  "",
  "## Goal",
  "",
  "Let people sign in.",
  "",
  "## Tasks",
  "",
  "<!-- TASK -->",
  "### T1 - do T1",
  "- Files: src/T1.ts",
  "<!-- /TASK -->",
  "",
].join("\n");

/** The same plan with its task half left off: the shape of a landed draft. */
const DRAFT_BODY = ["# Add Login", "", "## Goal", "", "Let people sign in.", ""].join("\n");

// --- no argument: resume the run in progress ---

test("no argument and nothing under docs/_specs: exit 3, an empty stdout and the next step on stderr", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const result = await run(dir);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no plan under docs\/_specs/);
    // The dead end this exit used to be is the whole reason --land exists, so
    // the message has to name the way out.
    assert.match(result.stderr, /--land/);
  });
});

test("no argument and one landed plan: the three-line block, verbatim and in order", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "path: docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
        "key: 2026-09-19-17-30-00_add-login",
        "state: existing",
        "",
      ].join("\n"),
    );
  });
});

test("no argument: the plan touched most recently wins, not the first on disk and not the newest stamp", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-01-01-09-00-00_alpha", "2026-01-01T09:00:00Z");
    landPlan(dir, "2026-02-01-09-00-00_beta", "2026-09-01T09:00:00Z");
    landPlan(dir, "2026-03-01-09-00-00_gamma", "2026-02-01T09:00:00Z");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), {
      path: "docs/_specs/2026-02-01-09-00-00_beta/plan.md",
      key: "2026-02-01-09-00-00_beta",
      state: "existing",
    });
  });
});

test("a run directory with no plan.md, and a plan.md that is a directory, are both skipped (neither is a plan to resume)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, "docs", "_specs", "2026-09-01-09-00-00_abandoned"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs", "_specs", "2026-09-02-09-00-00_not-a-file", "plan.md"), { recursive: true });

    const empty = await run(dir);
    assert.equal(empty.status, 3, `stdout: ${empty.stdout}`);
    assert.equal(empty.stdout, "");

    landPlan(dir, "2026-08-01-09-00-00_real", "2026-08-01T09:00:00Z");
    const found = await run(dir);
    assert.equal(found.status, 0, `stderr: ${found.stderr}`);
    assert.equal(parse(found.stdout).key, "2026-08-01-09-00-00_real");
  });
});

test("--land beside an aborted run of the same slug mints a fresh stamp rather than adopting the empty directory", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const aborted = "2026-09-01-09-00-00_abandoned";
    fs.mkdirSync(path.join(dir, "docs", "_specs", aborted), { recursive: true });

    const src = sourcePlan(dir, "outside/abandoned.md", planWithTasks("Abandoned", ["T1"]));
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const resolved = parse(result.stdout);
    assert.equal(resolved.state, "new");
    assert.equal(slugOf(resolved.key), "abandoned");
    assert.notEqual(resolved.key, aborted);
    assert.deepEqual(runDirs(dir), [aborted, resolved.key].sort());
  });
});

test("an empty argument is no argument: it resolves the plan most recently worked on rather than failing as a usage error", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login");

    const result = await run(dir, [""]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), {
      path: "docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
      key: "2026-09-19-17-30-00_add-login",
      state: "existing",
    });
  });
});

test("a host whose stat is missing, or answers with something that is not a timestamp, still resolves a plan", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z");
    landPlan(dir, "2026-09-25-11-00-00_other-thing", "2026-09-25T11:00:00Z");
    const landed = [
      "docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
      "docs/_specs/2026-09-25-11-00-00_other-thing/plan.md",
    ];

    for (const body of ["exit 1", "echo not-a-timestamp"]) {
      await withStub("stat", body, async (stubDir) => {
        const result = await run(dir, [], [stubDir]);
        assert.equal(result.status, 0, `${body} -> stderr: ${result.stderr}`);
        assert.ok(landed.includes(parse(result.stdout).path), `stdout: ${result.stdout}`);
      });
    }
  });
});

// --- --land: the approved plan into the run directory ---

test("--land copies a plan from outside the repository into a freshly stamped directory and leaves the source untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    await withTempDir("p2p2-plans-", async (plans) => {
      const src = sourcePlan(plans, "2026-09-20-fancy-name.md", PLAN_BODY);

      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);

      const resolved = parse(result.stdout);
      assert.equal(resolved.state, "new");
      assert.equal(slugOf(resolved.key), "add-login");
      assert.equal(resolved.path, `docs/_specs/${resolved.key}/plan.md`);

      // The landed plan is the source, byte for byte - the orchestrator never
      // retypes it out of its context.
      assert.equal(fs.readFileSync(path.join(dir, resolved.path), "utf-8"), PLAN_BODY);
      // ... and the source is still where plan mode left it.
      assert.equal(fs.readFileSync(src, "utf-8"), PLAN_BODY);

      // The stamp is taken NOW, which is the whole reason a second run of one
      // slug cannot overwrite an earlier plan. The window is wide on purpose:
      // it has to catch a fixed or epoch-derived stamp (off by years), not to
      // measure the clock, and a DST-ambiguous local hour must never flip it.
      assert.ok(Math.abs(stampAge(resolved.key)) < 90 * 60_000, `the stamp must be the landing moment: ${resolved.key}`);
    });
  });
});

test("--land takes the slug from the plan's own first H1, never from its file name and never from an H2", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/scratch-plan-7.md", "## Not The Title\n\n# Add Login\n\n## Goal\n");

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slugOf(parse(result.stdout).key), "add-login");
  });
});

test("--land falls back to the file name when the plan carries no H1 at all", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/Add Login.md", "## Goal\n\nNo title line here.\n");

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slugOf(parse(result.stdout).key), "add-login");
  });
});

test("the title is normalized here, so no caller ever has to form a slug", async () => {
  const cases: Array<[string, string]> = [
    ["Add Login", "add-login"],
    ["  --Add / LOGIN!!  ", "add-login"],
    ["add__login", "add-login"],
    ["Add-Login", "add-login"],
    ["...add...login...", "add-login"],
    ["Refactor 2 Auth", "refactor-2-auth"],
  ];
  // One repository per case: two titles that normalize alike would otherwise
  // have the second resume the first's run instead of landing its own.
  for (const [title, expected] of cases) {
    await withTempDir("p2p2-viber-", async (dir) => {
      const src = sourcePlan(dir, "outside/plan.md", planWithTasks(title, ["T1"]));
      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `${title} -> stderr: ${result.stderr}`);
      assert.equal(parse(result.stdout).state, "new", `title: ${title}`);
      assert.equal(slugOf(parse(result.stdout).key), expected, `title: ${title}`);
    });
  }
});

test("a CRLF plan yields the same slug as an LF one (the title carries the carriage return)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/crlf.md", "# Add Login\r\n\r\n## Goal\r\n");

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slugOf(parse(result.stdout).key), "add-login");
  });
});

test("a non-ASCII title still yields an ASCII-only slug (the key becomes a directory name and a git path)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/pl.md", "# Dodaj obsługę płatności\n");

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    // slugOf asserts the [a-z0-9-] shape; the leading word proves the title
    // was carried over rather than dropped.
    const slug = slugOf(parse(result.stdout).key);
    assert.ok(slug.startsWith("dodaj"), `slug: ${slug}`);
  });
});

test("a title longer than 60 characters is cut to 60 and never keeps a trailing hyphen", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const long = sourcePlan(dir, "outside/long.md", `# ${"b".repeat(70)}\n`);
    const midWord = await run(dir, ["--land", long]);
    assert.equal(midWord.status, 0, `stderr: ${midWord.stderr}`);
    assert.equal(slugOf(parse(midWord.stdout).key), "b".repeat(60));

    // The cut lands exactly on the separator: 59 a's, then "-bbb".
    const edge = sourcePlan(dir, "outside/edge.md", `# ${"A".repeat(59)} bbb\n`);
    const onSeparator = await run(dir, ["--land", edge]);
    assert.equal(onSeparator.status, 0, `stderr: ${onSeparator.stderr}`);
    assert.equal(slugOf(parse(onSeparator.stdout).key), "a".repeat(59));
  });
});

test("a title that normalizes to nothing, over a file name that does too: exit 2, an empty stdout and nothing landed", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // The file name is the fallback, so it has to normalize to nothing as
    // well for the rejection to be the title's. No bare "*" here: on Git-Bash
    // the MSYS runtime expands it against the cwd before argv ever reaches the
    // script. A glob character that survives into the slug is covered by the
    // whole-slug case below.
    for (const [index, title] of ["!!!", "---", "   "].entries()) {
      const src = sourcePlan(dir, path.join("outside", String(index), "!!!.md"), `# ${title}\n`);
      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 2, `${title} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "", `a rejected title must resolve to no path: ${title}`);
      assert.match(result.stderr, /slug is empty after normalization/);
      assert.deepEqual(runDirs(dir), [], `a rejected title must land nothing: ${title}`);
    }
  });
});

test("a whitespace-only H1 is no title, so the file name answers instead", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/Add Login.md", "#    \n\n## Goal\n");

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slugOf(parse(result.stdout).key), "add-login");
  });
});

test("an H1 in a non-Latin script normalizes to nothing, so the file name answers instead (such a plan must still land and build)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    for (const [index, title] of ["Добавить вход", "Προσθήκη σύνδεσης", "添加登录"].entries()) {
      const src = sourcePlan(dir, path.join("outside", String(index), "tingly-discovering-gizmo.md"), planWithTasks(title, ["T1"]));
      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `${title} -> stderr: ${result.stderr}`);
      const resolved = parse(result.stdout);
      assert.equal(resolved.state, "new", `title: ${title}`);
      assert.equal(slugOf(resolved.key), "tingly-discovering-gizmo", `title: ${title}`);
      fs.rmSync(path.join(dir, "docs"), { recursive: true, force: true });
    }
  });
});

test("a run already open for that slug comes back existing, and its progress is not written over", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const inProgress = [planWithTasks("Add Login", ["T1", "T2"]), "<!-- done: T1 -->", ""].join("\n");
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", inProgress);
    landPlan(dir, "2026-09-20-08-00-00_other-thing", "2026-09-20T08:00:00Z");

    // The same plan, edited after the build started: the landed copy is the
    // state, so the edit must NOT reach it.
    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), {
      path: "docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
      key: "2026-09-19-17-30-00_add-login",
      state: "existing",
    });
    assert.equal(
      fs.readFileSync(path.join(dir, "docs", "_specs", "2026-09-19-17-30-00_add-login", "plan.md"), "utf-8"),
      inProgress,
    );
  });
});

test("a finished run of the same slug is not resumed: the plan lands as new beside it and the old plan is left alone (a finished run would otherwise build nothing)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const finished = planWithTasks("Add Login", ["T1", "T2"]);
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", finished);
    landStatus(dir, "2026-09-19-17-30-00_add-login", { progress: "1/2", done: "T1", skipped: "T2" });

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const resolved = parse(result.stdout);
    assert.equal(resolved.state, "new");
    assert.notEqual(resolved.key, "2026-09-19-17-30-00_add-login");
    assert.equal(slugOf(resolved.key), "add-login");
    assert.equal(
      fs.readFileSync(path.join(dir, "docs", "_specs", "2026-09-19-17-30-00_add-login", "plan.md"), "utf-8"),
      finished,
    );
  });
});

test("a plan carrying tasks lands as a new run beside a draft of the same slug, the draft untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const draftKey = "2026-09-19-17-30-00_add-login";
    landPlan(dir, draftKey, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const draftPath = path.join(dir, "docs", "_specs", draftKey, "plan.md");
    const draftBefore = fs.readFileSync(draftPath, "utf-8");

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const out = parse(result.stdout);
    assert.equal(out.state, "new");
    assert.notEqual(out.key, draftKey);
    assert.match(out.key, /_add-login$/);
    assert.equal(runDirs(dir).length, 2);
    assert.equal(fs.readFileSync(draftPath, "utf-8"), draftBefore);

    // landing the same source again finds the new run, not the draft
    const again = parse((await run(dir, ["--land", src])).stdout);
    assert.deepEqual(again, { ...out, state: "existing" });
  });
});

test("a draft landed beside a draft of the same slug still answers as that draft rather than minting a second run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", DRAFT_BODY);

    const src = sourcePlan(dir, "outside/add-login.md", DRAFT_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), {
      path: "docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
      key: "2026-09-19-17-30-00_add-login",
      state: "draft",
    });
    assert.deepEqual(runDirs(dir), ["2026-09-19-17-30-00_add-login"]);
  });
});

test("--land pointed at a plan that is already landed is a no-op, so re-running the orchestrator never forks a second run", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const first = parse((await run(dir, ["--land", src])).stdout);

    for (const again of [first.path, path.join(dir, first.path)]) {
      const result = await run(dir, ["--land", again]);
      assert.equal(result.status, 0, `${again} -> stderr: ${result.stderr}`);
      assert.deepEqual(parse(result.stdout), { path: first.path, key: first.key, state: "existing" });
      assert.deepEqual(runDirs(dir), [first.key], `${again} minted a second run`);
    }
  });
});

test("an open run answers for its whole slug only, so neither a longer name nor a glob character can hand back a foreign run", async () => {
  // One repository per case: landing writes, so a case that shares a tree
  // with the one before it would resume that one's fresh run instead of
  // proving the glob is inert.
  for (const title of ["add-login", "add*login", "add?login"]) {
    await withTempDir("p2p2-viber-", async (dir) => {
      landPlan(dir, "2026-09-19-17-30-00_add-login-v2");
      landPlan(dir, "2026-09-19-18-00-00_add-zzz-login");

      const src = sourcePlan(dir, "outside/glob.md", planWithTasks(title, ["T1"]));
      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `${title} -> stderr: ${result.stderr}`);
      const resolved = parse(result.stdout);
      assert.equal(resolved.state, "new", `${title} must not resume a foreign run`);
      assert.equal(slugOf(resolved.key), "add-login");
    });
  }
});

test("two runs open for one slug: the one touched most recently is the one resumed", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-30T09:00:00Z");
    landPlan(dir, "2026-09-25-11-00-00_add-login", "2026-09-26T09:00:00Z");

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-09-19-17-30-00_add-login");
  });
});

// --- unusable argv, and a copy the filesystem refused ---

test("--land with no source: exit 2, the usage line, nothing created", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    for (const args of [["--land"], ["--land", ""]]) {
      const result = await run(dir, args);
      assert.equal(result.status, 2, `${args.join(" ")} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /usage: plan-path\.sh --land <src>/);
      assert.equal(fs.existsSync(path.join(dir, "docs")), false);
    }
  });
});

test("--land with a source that is not a file: exit 2, the path echoed back", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, "outside"), { recursive: true });

    for (const src of ["outside/nope.md", "outside"]) {
      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 2, `${src} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /plan file not found/);
      assert.ok(result.stderr.includes(src), `stderr must echo the source: ${src}`);
    }
  });
});

test("a bare first argument is a usage error, not a slug (the slug form is gone, and guessing one would land the wrong plan)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    for (const argument of ["add-login", "--split", "-land"]) {
      const result = await run(dir, [argument]);
      assert.equal(result.status, 2, `${argument} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /usage: plan-path\.sh \[--land <src>\]/);
      assert.equal(fs.existsSync(path.join(dir, "docs")), false);
    }
  });
});

test("a copy the filesystem refuses: exit 5, nothing on stdout and no half-made run directory left behind", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);

    await withStub("cp", "exit 1", async (stubDir) => {
      const result = await run(dir, ["--land", src], [stubDir]);
      assert.equal(result.status, 5, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /could not land the plan/);
      assert.deepEqual(runDirs(dir), [], "a failed copy must not leave an empty run directory");
    });
  });
});

// --- the guidance the template carries for whoever writes the plan ----------

test("--land keeps the markers the run reads and drops the template's guidance, leaving the source untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const body = [
      "# Add Login",
      "",
      "<!-- source: /elsewhere/plans/drifting-dolphin.md -->",
      "",
      "Build: skill `implementor`",
      "",
      "<!-- two parts: everything above \"## Tasks\" is the specification",
      "     and is split off as spec.md -->",
      "",
      "## Tasks",
      "",
      "<!-- TASK -->",
      "### T1 - do the thing",
      "- Files: src/a.ts",
      "<!-- /TASK -->",
      "",
      "<!--",
      "One TASK block per unit of work; leave every HTML marker intact.",
      "-->",
      "",
    ].join("\n");
    const src = sourcePlan(dir, "outside/drifting-dolphin.md", body);

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const landed = fs.readFileSync(path.join(dir, parse(result.stdout).path), "utf-8");
    assert.match(landed, /<!-- source: \/elsewhere\/plans\/drifting-dolphin\.md -->/);
    assert.match(landed, /<!-- TASK -->/);
    assert.match(landed, /<!-- \/TASK -->/);
    assert.doesNotMatch(landed, /two parts/);
    assert.doesNotMatch(landed, /One TASK block per unit of work/);
    assert.doesNotMatch(landed, /\n\n\n/, "a dropped comment must not leave a double blank line behind");

    // the plans directory is the user's, and a re-land has to find it as it was
    assert.equal(fs.readFileSync(src, "utf-8"), body);
  });
});

/** The landed copy's frontmatter `source:` value. */
function sourceLine(text: string): string {
  const match = /^---\r?\nsource: (.*)\r?\n/.exec(text);
  assert.ok(match, `no frontmatter source: line in\n${text}`);
  return match[1];
}

/** Two paths naming one file, however each spells it (short names, symlinked
 *  temp roots, a C:/ form against a native one). */
function sameFile(a: string, b: string): boolean {
  return fs.realpathSync.native(a) === fs.realpathSync.native(b);
}

test("--land keeps the frontmatter and points its source: at the landed copy, since the plan-mode file is gone by the next round", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // The comment stripper only ever looks at comments, so the block the plan
    // opens with comes through untouched, above the H1 the slug is read from.
    // plan-index.sh --split is what keeps it out of spec.md.
    const body = [
      "---",
      "source: /elsewhere/plans/drifting-dolphin.md",
      "---",
      "",
      "# Add Login",
      "",
      "<!-- guidance that has done its work by now -->",
      "",
      "## Tasks",
      "",
      "<!-- TASK -->",
      "### T1 - do the thing",
      "- Files: src/a.ts",
      "<!-- /TASK -->",
      "",
    ].join("\n");
    const src = sourcePlan(dir, "outside/drifting-dolphin.md", body);

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const parsed = parse(result.stdout);
    // the slug still comes off the H1, which the frontmatter above it does not move
    assert.match(parsed.key!, /_add-login$/);

    const landed = fs.readFileSync(path.join(dir, parsed.path), "utf-8");
    assert.match(landed, /^---\nsource: [^\n]+\n---\n/);
    const source = sourceLine(landed);
    assert.ok(path.isAbsolute(source), source);
    assert.ok(sameFile(source, path.join(dir, parsed.path)), source);
    assert.doesNotMatch(landed, /guidance that has done its work/);
    assert.doesNotMatch(landed, /\n\n\n/);
  });
});

for (const [fence, other] of [["```", "~~~"], ["~~~", "```"]] as const) {
  test(`--land copies a ${fence} fenced block under ## Contracts through whole, its comment and blank lines included, and still strips the guidance outside it (a slot in a contract shape is content, not guidance)`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      const block = [
        `${fence}md`,
        "<!-- slot -->",
        "",
        "",
        other,
        "<!-- still inside: the other fence character closes nothing -->",
        `${fence}`,
      ].join("\n");
      const body = [
        "# Add Login",
        "",
        "## Tasks",
        "",
        "<!-- TASK -->",
        "### T1 - do the thing",
        "- Files: src/a.ts",
        "<!-- /TASK -->",
        "",
        "## Contracts",
        "",
        "### C1 - Page shape",
        "",
        "File: none",
        "",
        block,
        "",
        "<!-- guidance below the shape -->",
        "",
      ].join("\n");
      const src = sourcePlan(dir, "outside/fenced.md", body);

      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);

      const landed = fs.readFileSync(path.join(dir, parse(result.stdout).path), "utf-8");
      assert.ok(landed.includes(`\n${block}\n`), landed);
      assert.doesNotMatch(landed, /guidance below the shape/);
    });
  });
}

test("--land still drops a comment opened outside any fence whole, a fence line inside it included (a fence inside guidance opens nothing)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const body = [
      "# Add Login",
      "",
      "<!-- guidance that runs on",
      "```",
      "an example inside the guidance",
      "-->",
      "",
      "Kept after the guidance.",
      "",
      "## Tasks",
      "",
      "<!-- TASK -->",
      "### T1 - do the thing",
      "- Files: src/a.ts",
      "<!-- /TASK -->",
      "",
      "<!-- trailing guidance -->",
      "",
    ].join("\n");
    const src = sourcePlan(dir, "outside/unclosed.md", body);

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);

    const landed = fs.readFileSync(path.join(dir, parse(result.stdout).path), "utf-8");
    assert.match(landed, /^# Add Login\n\nKept after the guidance\.\n\n## Tasks\n/);
    assert.doesNotMatch(landed, /guidance that runs on|```|an example inside|trailing guidance/);
  });
});

// --- open runs: unfinished work the caller cannot see for itself ------------

test("landing a fresh plan while another run is unfinished reports that run as an open: line", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-01-09-00-00_earlier", "2026-09-01T09:00:00Z", planWithTasks("Earlier", ["T1", "T2", "T3"]));
    landStatus(dir, "2026-09-01-09-00-00_earlier", { progress: "1/3", done: "T1" });

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).state, "new");
    assert.deepEqual(openLines(result.stdout), ["docs/_specs/2026-09-01-09-00-00_earlier/plan.md | 1/3"]);
  });
});

test("a plan mentioning the TASK marker in prose keeps its real task count (C3: the marker must stand alone on its line)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const withProse = [
      "# Earlier",
      "",
      "## Goal",
      "",
      "Each block opens with a `<!-- TASK -->` comment.",
      "",
      "## Tasks",
      "",
      "<!-- TASK -->",
      "### T1 - do T1",
      "- Files: src/T1.ts",
      "<!-- /TASK -->",
      "",
      "<!-- TASK -->",
      "### T2 - do T2",
      "- Files: src/T2.ts",
      "<!-- /TASK -->",
      "",
    ].join("\n");
    landPlan(dir, "2026-09-01-09-00-00_earlier", "2026-09-01T09:00:00Z", withProse);
    landStatus(dir, "2026-09-01-09-00-00_earlier", { progress: "1/2", done: "T1" });

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(openLines(result.stdout), ["docs/_specs/2026-09-01-09-00-00_earlier/plan.md | 1/2"]);
  });
});

test("an unknown id or a duplicate id in done: does not settle a task - the run still reports as open", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-01-09-00-00_earlier", "2026-09-01T09:00:00Z", planWithTasks("Earlier", ["T1", "T2"]));
    // T1 listed twice, plus an id the plan never declared - neither settles T2
    landStatus(dir, "2026-09-01-09-00-00_earlier", { done: "T1 T1 T9" });

    const src = sourcePlan(dir, "outside/add-login.md", PLAN_BODY);
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(openLines(result.stdout), ["docs/_specs/2026-09-01-09-00-00_earlier/plan.md | 1/2"]);
  });
});

test("a run whose tasks are all done or all skipped is not open, and the resolved run is never listed as one", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-01-09-00-00_finished", "2026-09-01T09:00:00Z", planWithTasks("Finished", ["T1", "T2"]));
    landStatus(dir, "2026-09-01-09-00-00_finished", { progress: "2/2", done: "T1 T2" }, "2026-09-01T10:00:00Z");
    landPlan(dir, "2026-09-02-09-00-00_dropped", "2026-09-02T09:00:00Z", planWithTasks("Dropped", ["T1", "T2"]));
    landStatus(dir, "2026-09-02-09-00-00_dropped", { progress: "1/2", done: "T1", skipped: "T2" }, "2026-09-02T10:00:00Z");
    landPlan(dir, "2026-09-03-09-00-00_current", "2026-09-03T09:00:00Z", planWithTasks("Current", ["T1", "T2"]));
    landStatus(dir, "2026-09-03-09-00-00_current", { progress: "0/2", done: "none" }, "2026-09-03T10:00:00Z");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-09-03-09-00-00_current");
    assert.deepEqual(openLines(result.stdout), []);
  });
});

test("a run that never reached its first commit carries no status file and is open with nothing done", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-01-09-00-00_untouched", "2026-09-01T09:00:00Z", planWithTasks("Untouched", ["T1", "T2"]));
    landPlan(dir, "2026-09-02-09-00-00_current", "2026-09-02T09:00:00Z", planWithTasks("Current", ["T1"]));
    landStatus(dir, "2026-09-02-09-00-00_current", { progress: "1/1", done: "T1" });

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-09-02-09-00-00_current");
    assert.deepEqual(openLines(result.stdout), ["docs/_specs/2026-09-01-09-00-00_untouched/plan.md | 0/2"]);
  });
});

test("no argument: a frozen plan.md does not age its run out - the status file beside it is what counts as worked on", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    // both plans landed long ago and are never written to again; only one run
    // has been committing since
    landPlan(dir, "2026-01-01-09-00-00_older", "2026-01-01T09:00:00Z", planWithTasks("Older", ["T1"]));
    landStatus(dir, "2026-01-01-09-00-00_older", { progress: "1/1", done: "T1" }, "2026-09-20T18:00:00Z");
    landPlan(dir, "2026-02-01-09-00-00_newer", "2026-02-01T09:00:00Z", planWithTasks("Newer", ["T1"]));
    landStatus(dir, "2026-02-01-09-00-00_newer", { progress: "0/1", done: "none" }, "2026-02-01T09:00:00Z");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-01-01-09-00-00_older");
    assert.deepEqual(openLines(result.stdout), ["docs/_specs/2026-02-01-09-00-00_newer/plan.md | 0/1"]);
  });
});

// --- the draft state, and the round that lands into it ---------------------

/** A run's plan file, as a native path. */
function planIn(root: string, key: string): string {
  return path.join(root, "docs", "_specs", key, "plan.md");
}

test("a plan carrying no TASK block is a draft, in every path the script answers on", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", DRAFT_BODY);

    // resolved with no argument, where a plan with tasks reads "existing"
    assert.equal(parse((await run(dir)).stdout).state, "draft");

    // and on the landing that creates it, where one reads "new"
    const src = sourcePlan(dir, "outside/other.md", DRAFT_BODY.replace("# Add Login", "# Other Thing"));
    const landed = await run(dir, ["--land", src]);
    assert.equal(landed.status, 0, `stderr: ${landed.stderr}`);
    assert.equal(parse(landed.stdout).state, "draft");
  });
});

test("a plan mentioning the TASK marker in prose is still a draft (C3: the marker must stand alone on its line)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const prose = [
      "# Add Login",
      "",
      "## Goal",
      "",
      "Each block opens with a `<!-- TASK -->` comment and closes with `<!-- /TASK -->`.",
      "",
    ].join("\n");
    landPlan(dir, "2026-09-19-17-30-00_add-login", "2026-09-19T17:30:00Z", prose);

    assert.equal(parse((await run(dir)).stdout).state, "draft");

    const src = sourcePlan(dir, "outside/other.md", prose.replace("# Add Login", "# Other Thing"));
    const landed = await run(dir, ["--land", src]);
    assert.equal(landed.status, 0, `stderr: ${landed.stderr}`);
    assert.equal(parse(landed.stdout).state, "draft");
  });
});

test("a draft is not an open run: there is no task in it to resume, and the user points at it by name", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    landPlan(dir, "2026-09-01-09-00-00_still-talking", "2026-09-01T09:00:00Z", DRAFT_BODY);
    landPlan(dir, "2026-09-02-09-00-00_current", "2026-09-02T09:00:00Z", planWithTasks("Current", ["T1"]));

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-09-02-09-00-00_current");
    assert.deepEqual(openLines(result.stdout), []);
  });
});

test("--into lands the next round into the named draft, keeping its directory and dropping the guidance", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);

    const round2 = [
      "# Add Login",
      "",
      "<!-- 2-4 sentences: what gets built and why -->",
      "",
      "## Goal",
      "",
      "Let people sign in, and stay signed in.",
      "",
    ].join("\n");
    const src = sourcePlan(dir, "outside/round-2.md", round2);

    const result = await run(dir, ["--land", src, "--into", key]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "draft" });

    // the round replaced the draft in place: one directory, the same stamp
    assert.deepEqual(runDirs(dir), [key]);
    const landed = fs.readFileSync(planIn(dir, key), "utf-8");
    assert.match(landed, /stay signed in/);
    assert.doesNotMatch(landed, /2-4 sentences/);
    // the plans directory is the user's and is never written to
    assert.equal(fs.readFileSync(src, "utf-8"), round2);
  });
});

test("--into landing a plan that carries its task half turns the draft into a run the build can take", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);

    const src = sourcePlan(dir, "outside/full.md", PLAN_BODY);
    const result = await run(dir, ["--land", src, "--into", key]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "new" });
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), PLAN_BODY);
  });
});

test("--into refuses a target that is not a draft: exit 4, nothing on stdout and the plan left alone", async () => {
  const cases: Array<[string, (root: string, key: string) => void | Promise<void>]> = [
    ["a plan carrying a task block", (root, key) => fs.writeFileSync(planIn(root, key), PLAN_BODY)],
    [
      "a decomposition",
      (root, key) => fs.mkdirSync(path.join(root, "docs", "_specs", key, "tasks"), { recursive: true }),
    ],
    ["a status file", (root, key) => landStatus(root, key, { progress: "0/1", done: "none" })],
  ];
  for (const [what, start] of cases) {
    await withTempDir("p2p2-viber-", async (dir) => {
      const key = "2026-09-19-17-30-00_add-login";
      landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
      await start(dir, key);
      const before = fs.readFileSync(planIn(dir, key), "utf-8");

      const src = sourcePlan(dir, "outside/round-2.md", DRAFT_BODY);
      const result = await run(dir, ["--land", src, "--into", key]);
      assert.equal(result.status, 4, `${what} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "", what);
      assert.match(result.stderr, /not a draft/, what);
      assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), before, what);
    });
  }
});

test("--into takes one existing directory name and nothing else: exit 2, nothing on stdout and nothing written", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const before = fs.readFileSync(planIn(dir, key), "utf-8");
    const src = sourcePlan(dir, "outside/round-2.md", DRAFT_BODY);

    const keys = ["", "2026-01-01-00-00-00_never-landed", ".", "..", "a/b", `../${key}`];
    for (const bad of keys) {
      const result = await run(dir, ["--land", src, "--into", bad]);
      assert.equal(result.status, 2, `"${bad}" -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "", `"${bad}"`);
      assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), before, `"${bad}"`);
    }

    // the flag itself has one spelling, and it never stands without --land
    for (const args of [["--land", src, "--onto", key], ["--land", src, "--into"], ["--into", key]]) {
      const result = await run(dir, args);
      assert.equal(result.status, 2, `${args.join(" ")} -> stdout: ${result.stdout}`);
      assert.equal(result.stdout, "", args.join(" "));
    }

    assert.deepEqual(runDirs(dir), [key]);
  });
});

/** A round continuing a draft, the way the planner writes it: the draft's key
 *  in the frontmatter, so no argument has to survive a cleared context. */
function roundInto(key: string, body: string): string {
  return ["---", "source: /elsewhere/plans/round.md", `into: ${key}`, "---", "", body].join("\n");
}

test("a frontmatter into: key lands the round into that draft as --into would, and the copy's source: points at it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const src = sourcePlan(dir, "outside/round-2.md", roundInto(key, DRAFT_BODY.replace("sign in.", "sign in, and stay.")));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(parse(result.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "draft" });
    assert.deepEqual(runDirs(dir), [key]);

    const landed = fs.readFileSync(planIn(dir, key), "utf-8");
    assert.match(landed, /and stay/);
    assert.ok(sameFile(sourceLine(landed), planIn(dir, key)), sourceLine(landed));

    // the landed plan, carrying its task half and its into: line, lands again
    // as the run it already is rather than tripping the not-a-draft refusal
    fs.writeFileSync(planIn(dir, key), roundInto(key, PLAN_BODY));
    const again = await run(dir, ["--land", planIn(dir, key)]);
    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.deepEqual(parse(again.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "existing" });
  });
});

test("a frontmatter into: key on a target that is not a draft: exit 4, nothing on stdout and the plan left alone", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", PLAN_BODY);
    const src = sourcePlan(dir, "outside/round-2.md", roundInto(key, DRAFT_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 4, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /not a draft/);
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), PLAN_BODY);
    assert.deepEqual(runDirs(dir), [key]);
  });
});

test("landing the same into: source twice reports the second round as existing and leaves the target untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    // a round that turns the draft into a run, landed through its own
    // frontmatter "into:" key rather than the run's own landed copy
    const src = sourcePlan(dir, "outside/round-2.md", roundInto(key, PLAN_BODY));

    const first = await run(dir, ["--land", src]);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    assert.deepEqual(parse(first.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "new" });
    const landedAfterFirst = fs.readFileSync(planIn(dir, key), "utf-8");

    // the exact same outside file, landed again: the target already holds
    // this plan (identical apart from its own source: line), so nothing is
    // copied a second time and nothing is lost from having started building
    const second = await run(dir, ["--land", src]);
    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.deepEqual(parse(second.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "existing" });
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), landedAfterFirst);
    assert.equal(fs.readFileSync(src, "utf-8"), roundInto(key, PLAN_BODY));
    assert.deepEqual(runDirs(dir), [key]);
  });
});

test("a round landed through into: and then decomposed lands again as existing, the run left untouched (a build resumed through the plan's source: line must not stop on exit 4)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const src = sourcePlan(dir, "outside/round-2.md", roundInto(key, PLAN_BODY));

    const first = await run(dir, ["--land", src]);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    assert.deepEqual(parse(first.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "new" });
    const landedAfterFirst = fs.readFileSync(planIn(dir, key), "utf-8");

    fs.mkdirSync(path.join(dir, "docs", "_specs", key, "tasks"), { recursive: true });
    landStatus(dir, key, { progress: "0/1", done: "none" });

    const second = await run(dir, ["--land", src]);
    assert.equal(second.status, 0, `stderr: ${second.stderr}`);
    assert.deepEqual(parse(second.stdout), { path: `docs/_specs/${key}/plan.md`, key, state: "existing" });
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), landedAfterFirst);
    assert.deepEqual(runDirs(dir), [key]);
  });
});

test("a different round landed through into: over a decomposed run is still refused with exit 4 and the run left untouched", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const src = sourcePlan(dir, "outside/round-2.md", roundInto(key, PLAN_BODY));

    const first = await run(dir, ["--land", src]);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);
    const landedAfterFirst = fs.readFileSync(planIn(dir, key), "utf-8");

    fs.mkdirSync(path.join(dir, "docs", "_specs", key, "tasks"), { recursive: true });
    landStatus(dir, key, { progress: "0/1", done: "none" });

    const changed = sourcePlan(dir, "outside/round-3.md", roundInto(key, PLAN_BODY.replace("sign in.", "sign in, and stay.")));
    const second = await run(dir, ["--land", changed]);
    assert.equal(second.status, 4, `stdout: ${second.stdout}`);
    assert.equal(second.stdout, "");
    assert.match(second.stderr, /not a draft/);
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), landedAfterFirst);
    assert.deepEqual(runDirs(dir), [key]);
  });
});

test("a changed source onto a decomposed draft still exits 4, even though the draft used to match it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    fs.mkdirSync(path.join(dir, "docs", "_specs", key, "tasks"), { recursive: true });
    const before = fs.readFileSync(planIn(dir, key), "utf-8");

    const src = sourcePlan(dir, "outside/round-2.md", DRAFT_BODY.replace("sign in.", "sign in, and stay."));
    const result = await run(dir, ["--land", src, "--into", key]);
    assert.equal(result.status, 4, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /not a draft/);
    assert.equal(fs.readFileSync(planIn(dir, key), "utf-8"), before);
    assert.deepEqual(runDirs(dir), [key]);
  });
});

// --- the plan's attachments ride into the run as attachments/<name> ---

/** A plan whose frontmatter carries the given lines after `source:`, and the
 *  draft it lands into when `into` is given. */
function withFrontmatter(lines: string[], body: string, into?: string): string {
  return ["---", "source: /elsewhere/plans/round.md", ...(into ? [`into: ${into}`] : []), ...lines, "---", "", body].join("\n");
}

/** A plan whose frontmatter lists `name: path` attachments, indented under `attachments:`. */
function withAttachments(entries: string[], body: string, into?: string): string {
  return withFrontmatter(["attachments:", ...entries.map((entry) => `  ${entry}`)], body, into);
}

/** A file under the host's `.temp/`, where the skills write the files a plan is built from. */
function attachment(root: string, name: string, content: string | Buffer): string {
  const file = path.join(root, ".temp", "viber", "attach", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** The POSIX spelling of an absolute path: as is off Windows, `/c/...` on it. */
function posixForm(file: string): string {
  return process.platform === "win32" ? slash(file).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`) : file;
}

test("a plan naming two attachments lands both under attachments/<name> byte for byte, its frontmatter keeping the source values", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const page = posixForm(attachment(dir, "login.html", "<p>accepted</p>\n"));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0xff]);
    const shot = posixForm(attachment(dir, "shot.png", bytes));
    const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`mockup.html: ${page}`, `screen.png: ${shot}`], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    const resolved = parse(result.stdout);
    assert.equal(resolved.state, "new");

    const runDir = path.join(dir, path.dirname(resolved.path));
    assert.deepEqual(fs.readFileSync(path.join(runDir, "attachments", "mockup.html")), Buffer.from("<p>accepted</p>\n"));
    assert.deepEqual(fs.readFileSync(path.join(runDir, "attachments", "screen.png")), bytes);
    const landed = fs.readFileSync(path.join(dir, resolved.path), "utf-8");
    assert.ok(landed.includes(["attachments:", `  mockup.html: ${page}`, `  screen.png: ${shot}`].join("\n")), landed);
  });
});

test("a whitespace-only line between two attachment entries lands both files, exit 0", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const a = posixForm(attachment(dir, "a.html", "<p>a</p>\n"));
    const b = posixForm(attachment(dir, "b.html", "<p>b</p>\n"));
    const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`a.html: ${a}`, "", `b.html: ${b}`], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    const landed = path.join(dir, path.dirname(parse(result.stdout).path), "attachments");
    assert.equal(fs.readFileSync(path.join(landed, "a.html"), "utf-8"), "<p>a</p>\n");
    assert.equal(fs.readFileSync(path.join(landed, "b.html"), "utf-8"), "<p>b</p>\n");
  });
});

test("a name repeated after a whitespace-only line still exits 7 with duplicate name (the line does not reset the map)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/add-login.md", withAttachments(["a.html: /x/one", "", "b.html: /x/two", "b.html: /x/three"], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 7, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "error: unusable attachments: duplicate name b.html");
  });
});

for (const name of ["bench-llm", "bench.v2"]) {
  test(`a directory attachment named ${name} lands recursively under attachments/${name}/`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      const root = path.dirname(attachment(dir, "bench/results/run.json", "{}\n"));
      fs.writeFileSync(path.join(root, "..", "notes.md"), "# notes\n");
      const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`${name}: ${posixForm(path.dirname(root))}`], PLAN_BODY));

      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(result.stderr, "");
      const landed = path.join(dir, path.dirname(parse(result.stdout).path), "attachments", name);
      assert.equal(fs.readFileSync(path.join(landed, "notes.md"), "utf-8"), "# notes\n");
      assert.equal(fs.readFileSync(path.join(landed, "results", "run.json"), "utf-8"), "{}\n");
    });
  });
}

test("a file attachment with no extension lands under attachments/<name>", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const file = posixForm(attachment(dir, "Makefile", "all:\n"));
    const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`Makefile: ${file}`], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    const landed = path.join(dir, path.dirname(parse(result.stdout).path), "attachments", "Makefile");
    assert.equal(fs.readFileSync(landed, "utf-8"), "all:\n");
  });
});

for (const form of ["mixed", "native"] as const) {
  test(
    `an attachment source in the ${form === "mixed" ? "C:/" : "C:\\"} form lands too (cygpath normalizes it)`,
    { skip: process.platform === "win32" ? false : "a drive-letter path exists only on Windows" },
    async () => {
      await withTempDir("p2p2-viber-", async (dir) => {
        const file = attachment(dir, "login.html", `<p>${form}</p>\n`);
        const source = form === "mixed" ? slash(file) : path.win32.normalize(file);
        const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`mockup.html: ${source}`], PLAN_BODY));

        const result = await run(dir, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stderr, "");
        const landed = path.join(dir, path.dirname(parse(result.stdout).path), "attachments", "mockup.html");
        assert.equal(fs.readFileSync(landed, "utf-8"), `<p>${form}</p>\n`);
      });
    },
  );
}

for (const [what, frontmatter, reason] of [
  ["a repeated name", ["attachments:", "  a.png: /x/one", "  a.png: /x/two"], "duplicate name a.png"],
  ["a name with a slash", ["attachments:", "  sub/a.png: /x/one"], "invalid name sub/a.png"],
  ["a name that is a ..", ["attachments:", "  ..: /x/one"], "invalid name .."],
  ["a name with a .. segment before the extension", ["attachments:", "  ../a.png: /x/one"], "invalid name ../a.png"],
  ["a name with a leading dot", ["attachments:", "  .a.png: /x/one"], "invalid name .a.png"],
  ["a name with a space", ["attachments:", "  a b.png: /x/one"], "invalid name a b.png"],
  ["an entry with an empty path", ["attachments:", "  a.png:"], "entry without a path: a.png"],
  ["an entry with no colon", ["attachments:", "  a.png"], "entry without a path: a.png"],
  ["an attachments: line carrying a value", ["attachments: a.png"], "attachments: carries a value"],
] as const) {
  test(`${what} in the attachments map exits 7 naming the entry, with empty stdout and no run directory created`, async () => {
    await withTempDir("p2p2-viber-", async (dir) => {
      const src = sourcePlan(dir, "outside/add-login.md", withFrontmatter([...frontmatter], PLAN_BODY));

      const result = await run(dir, ["--land", src]);
      assert.equal(result.status, 7, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr.trim(), `error: unusable attachments: ${reason}`);
      assert.equal(fs.existsSync(path.join(dir, "docs")), false);
    });
  });
}

test("an attachment source that is missing warns once on stderr and still lands the plan, exit 0 and stdout unchanged (fail-open)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const gone = posixForm(path.join(dir, ".temp", "viber", "attach", "gone.html"));
    const src = sourcePlan(dir, "outside/add-login.md", withAttachments([`mockup.html: ${gone}`], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr.trim(), `warning: attachment not found, not landed: ${gone}`);
    const resolved = parse(result.stdout);
    assert.deepEqual(Object.keys(resolved), ["path", "key", "state"]);
    assert.equal(resolved.state, "new");
    assert.deepEqual(fs.readdirSync(path.join(dir, path.dirname(resolved.path))), ["plan.md"]);
  });
});

test("an --into draft round replaces the former round's attachments with its own", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const landed = path.join(dir, "docs", "_specs", key, "attachments");

    const old = posixForm(attachment(dir, "old.html", "<p>round 1</p>\n"));
    const round1 = sourcePlan(dir, "outside/round-1.md", withAttachments([`old.html: ${old}`], DRAFT_BODY, key));
    const one = await run(dir, ["--land", round1]);
    assert.equal(one.status, 0, `stderr: ${one.stderr}`);

    const fresh = posixForm(attachment(dir, "fresh.html", "<p>round 2</p>\n"));
    const round2 = sourcePlan(dir, "outside/round-2.md", withAttachments([`fresh.html: ${fresh}`], PLAN_BODY, key));
    const two = await run(dir, ["--land", round2]);
    assert.equal(two.status, 0, `stderr: ${two.stderr}`);
    assert.equal(parse(two.stdout).state, "new");
    assert.deepEqual(fs.readdirSync(landed), ["fresh.html"]);
    assert.equal(fs.readFileSync(path.join(landed, "fresh.html"), "utf-8"), "<p>round 2</p>\n");
  });
});

test("an --into draft round whose attachment source is gone keeps the former attachments/<name> and warns once", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const landed = path.join(dir, "docs", "_specs", key, "attachments");

    const page = posixForm(attachment(dir, "login.html", "<p>round 1</p>\n"));
    const round1 = sourcePlan(dir, "outside/round-1.md", withAttachments([`login.html: ${page}`], DRAFT_BODY, key));
    const one = await run(dir, ["--land", round1]);
    assert.equal(one.status, 0, `stderr: ${one.stderr}`);
    fs.rmSync(path.join(dir, ".temp"), { recursive: true, force: true });

    const round2 = sourcePlan(dir, "outside/round-2.md", withAttachments([`login.html: ${page}`], PLAN_BODY, key));
    const two = await run(dir, ["--land", round2]);
    assert.equal(two.status, 0, `stderr: ${two.stderr}`);
    assert.equal(parse(two.stdout).state, "new");
    assert.equal(two.stderr.trim(), `warning: attachment not found, not landed: ${page}`);
    assert.equal(fs.readFileSync(path.join(landed, "login.html"), "utf-8"), "<p>round 1</p>\n");
  });
});

test("an --into draft round whose map drops an entry removes that entry's former copy while a kept entry with a gone source survives", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const landed = path.join(dir, "docs", "_specs", key, "attachments");

    const keep = posixForm(attachment(dir, "keep.html", "<p>keep</p>\n"));
    const drop = posixForm(attachment(dir, "drop.html", "<p>drop</p>\n"));
    const round1 = sourcePlan(dir, "outside/round-1.md", withAttachments([`keep.html: ${keep}`, `drop.html: ${drop}`], DRAFT_BODY, key));
    const one = await run(dir, ["--land", round1]);
    assert.equal(one.status, 0, `stderr: ${one.stderr}`);
    fs.rmSync(path.join(dir, ".temp"), { recursive: true, force: true });

    const round2 = sourcePlan(dir, "outside/round-2.md", withAttachments([`keep.html: ${keep}`], PLAN_BODY, key));
    const two = await run(dir, ["--land", round2]);
    assert.equal(two.status, 0, `stderr: ${two.stderr}`);
    assert.deepEqual(fs.readdirSync(landed), ["keep.html"]);
  });
});

test("an attachment source that is missing with no former copy lands nothing and warns once", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const gone = posixForm(path.join(dir, ".temp", "viber", "attach", "gone.html"));
    const round = sourcePlan(dir, "outside/round-2.md", withAttachments([`mockup.html: ${gone}`], PLAN_BODY, key));

    const result = await run(dir, ["--land", round]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr.trim(), `warning: attachment not found, not landed: ${gone}`);
    assert.equal(fs.existsSync(path.join(dir, "docs", "_specs", key, "attachments")), false);
  });
});

test("an --into draft round with no attachments: key removes the attachments directory a former round landed", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const landed = path.join(dir, "docs", "_specs", key, "attachments");

    const old = posixForm(attachment(dir, "old.html", "<p>round 1</p>\n"));
    const round1 = sourcePlan(dir, "outside/round-1.md", withAttachments([`old.html: ${old}`], DRAFT_BODY, key));
    const one = await run(dir, ["--land", round1]);
    assert.equal(one.status, 0, `stderr: ${one.stderr}`);
    assert.ok(fs.existsSync(landed));

    const round2 = sourcePlan(dir, "outside/round-2.md", withFrontmatter([], PLAN_BODY, key));
    const two = await run(dir, ["--land", round2]);
    assert.equal(two.status, 0, `stderr: ${two.stderr}`);
    assert.equal(two.stderr, "");
    assert.equal(parse(two.stdout).state, "new");
    assert.equal(fs.existsSync(landed), false);
  });
});

test("landing the same --into round again answers existing and copies nothing (a source edited since does not reach the run)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    const file = attachment(dir, "login.html", "<p>round 2</p>\n");
    const round = sourcePlan(dir, "outside/round-2.md", withAttachments([`mockup.html: ${posixForm(file)}`], PLAN_BODY, key));
    const first = await run(dir, ["--land", round]);
    assert.equal(first.status, 0, `stderr: ${first.stderr}`);

    fs.writeFileSync(file, "<p>edited later</p>\n");
    const again = await run(dir, ["--land", round]);
    assert.equal(again.status, 0, `stderr: ${again.stderr}`);
    assert.equal(parse(again.stdout).state, "existing");
    assert.equal(fs.readFileSync(path.join(dir, "docs", "_specs", key, "attachments", "mockup.html"), "utf-8"), "<p>round 2</p>\n");
  });
});

test("a plan carrying a prototype: key lands neither prototype.html nor attachments/", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const page = posixForm(attachment(dir, "login.html", "<p>accepted</p>\n"));
    const src = sourcePlan(dir, "outside/add-login.md", withFrontmatter([`prototype: ${page}`], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.deepEqual(fs.readdirSync(path.join(dir, path.dirname(parse(result.stdout).path))), ["plan.md"]);
  });
});

test("a plan with no attachments: key lands only plan.md", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    const src = sourcePlan(dir, "outside/add-login.md", withFrontmatter([], PLAN_BODY));

    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.deepEqual(fs.readdirSync(path.join(dir, path.dirname(parse(result.stdout).path))), ["plan.md"]);
  });
});

// --- the runs directory is configurable ---

/** `.claude/viber.yml` carrying the `directories:` group, read here relative to
 *  the cwd - which the contract pins to the repository root. The group is where
 *  the name has to sit: a `runs:` key at the top level is a different key. */
function writeRunsDir(root: string, value: string): void {
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "viber.yml"), ["directories:", `  runs: ${value}`, ""].join("\n"));
}

/** A landed plan under an arbitrary runs directory, with a pinned mtime so
 *  "most recently worked on" is decided by the test, not by the filesystem. */
function landUnder(root: string, runs: string, key: string, body: string, mtime = "2026-01-01T00:00:00Z"): string {
  const file = path.join(root, "docs", runs, key, "plan.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  const seconds = Date.parse(mtime) / 1000;
  fs.utimesSync(file, seconds, seconds);
  return file;
}

test("directories.runs renames the directory: both the resolution and --land follow it", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeRunsDir(dir, "builds");
    landUnder(dir, "builds", "2026-09-19-17-30-00_add-login", planWithTasks("Add Login", ["T1"]));

    const resolved = await run(dir);
    assert.equal(resolved.status, 0, `stderr: ${resolved.stderr}`);
    assert.equal(parse(resolved.stdout).path, "docs/builds/2026-09-19-17-30-00_add-login/plan.md");

    const src = sourcePlan(dir, "src/other-thing.md", planWithTasks("Other Thing", ["T1"]));
    const landed = await run(dir, ["--land", src]);
    assert.equal(landed.status, 0, `stderr: ${landed.stderr}`);
    const info = parse(landed.stdout);
    assert.equal(info.state, "new");
    assert.equal(slugOf(info.key), "other-thing");
    assert.equal(info.path, `docs/builds/${info.key}/plan.md`);
    assert.ok(fs.existsSync(path.join(dir, "docs", "builds", info.key, "plan.md")));
    assert.ok(!fs.existsSync(path.join(dir, "docs", "_specs")));
  });
});

test("directories.runs is the ONLY place the script looks, so a plan under the old default is not resolved", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeRunsDir(dir, "builds");
    landPlan(dir, "2026-09-19-17-30-00_add-login");

    const result = await run(dir);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no plan under docs\/builds/);
  });
});

test("an unusable directories.runs value is ignored and docs/_specs stands, the way config.sh ignores one", async () => {
  for (const value of ["../escape", "/absolute", "a/b", "..", ""]) {
    await withTempDir("p2p2-viber-", async (dir) => {
      writeRunsDir(dir, value);
      landPlan(dir, "2026-09-19-17-30-00_add-login");

      const result = await run(dir);
      assert.equal(result.status, 0, `stderr for "${value}": ${result.stderr}`);
      assert.equal(parse(result.stdout).path, "docs/_specs/2026-09-19-17-30-00_add-login/plan.md");
    });
  }
});

test("the open: lines are listed from the configured runs directory too", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    writeRunsDir(dir, "builds");
    landUnder(dir, "builds", "2026-09-01-09-00-00_earlier", planWithTasks("Earlier", ["T1", "T2"]), "2026-09-01T09:00:00Z");
    landUnder(dir, "builds", "2026-09-02-09-00-00_current", planWithTasks("Current", ["T1"]), "2026-09-02T09:00:00Z");
    fs.writeFileSync(
      path.join(dir, "docs", "builds", "2026-09-02-09-00-00_current", "status.md"),
      ["# status", "", "progress: 1/1", "done: T1", ""].join("\n"),
    );

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).key, "2026-09-02-09-00-00_current");
    assert.deepEqual(openLines(result.stdout), ["docs/builds/2026-09-01-09-00-00_earlier/plan.md | 0/2"]);
  });
});

test("a top-level runs: key is not directories.runs, so the default still names the directory", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "viber.yml"), "runs: builds\n");
    landPlan(dir, "2026-09-19-17-30-00_add-login");

    const result = await run(dir);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).path, "docs/_specs/2026-09-19-17-30-00_add-login/plan.md");
  });
});

// --- the run branch: a first landing puts HEAD on it before anything lands ---

/** A repository on `main` with one commit carrying the branching group, so the
 *  base exists and the tree starts clean. The group's lines are the test's. */
async function withBranchRepo(branching: string[], fn: (repo: GitRepo) => void | Promise<void>): Promise<void> {
  await withGitRepo(async (repo) => {
    fs.mkdirSync(path.join(repo.dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, ".claude", "viber.yml"), ["branching:", ...branching.map((l) => `  ${l}`), ""].join("\n"));
    fs.writeFileSync(path.join(repo.dir, "README.md"), "hello\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "init");
    await fn(repo);
  });
}

/** One `branching.work` entry, indented as a child of `work:` inside the group. */
function workEntry(key: string, base: string, name: string, target: string): string[] {
  return [`  ${key}:`, `    base: ${base}`, `    name: '${name}'`, `    target: ${target}`];
}

/** The work entries a landing case runs against unless it names its own: one
 *  entry cut from and returning to main, named from the plan type and slug. */
const ON_MAIN = ["work:", ...workEntry("feature", "main", "{type}/{slug}", "main")];

/** GitFlow for a landing: features from develop, hotfixes from main. */
const TWO_BASES = [
  "work:",
  ...workEntry("feature", "develop", "feature/{slug}", "develop"),
  ...workEntry("hotfix", "main", "hotfix/{slug}", "main"),
];

/** plan-path.sh run inside the throwaway repository, with its pinned git identity. */
function runIn(repo: GitRepo, args: string[] = [], stubDirs?: string[]) {
  return runScript(SUT, args, { cwd: repo.dir, shell: "bash", env: repo.env, stubDirs });
}

/** The branch HEAD names, or "HEAD" when it is detached. */
async function headOf(repo: GitRepo): Promise<string> {
  return (await repo.git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();
}

/** The commit a revision points at. */
async function commitOf(repo: GitRepo, rev = "HEAD"): Promise<string> {
  return (await repo.git("rev-parse", rev)).stdout.trim();
}

/** `git status --porcelain`, so a test can assert the tree came through as it was. */
async function treeOf(repo: GitRepo): Promise<string> {
  return (await repo.git("status", "--porcelain")).stdout;
}

/** A second commit on a new branch, HEAD back where it was: a branch at another commit. */
async function branchAhead(repo: GitRepo, name: string): Promise<void> {
  const from = await headOf(repo);
  await repo.git("checkout", "-q", "-b", name);
  fs.writeFileSync(path.join(repo.dir, `${name.replace(/\//g, "-")}.txt`), "ahead\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-q", "-m", `ahead on ${name}`);
  await repo.git("checkout", "-q", from);
}

/** An approved plan with frontmatter lines of the test's choosing, written to a
 *  plans directory outside the repository - as plan mode leaves one - so the
 *  source itself never dirties the tree. */
async function withSource(frontmatter: string[], fn: (src: string) => void | Promise<void>, body = PLAN_BODY): Promise<void> {
  await withTempDir("p2p2-plans-", async (plans) => {
    const text = frontmatter.length ? ["---", ...frontmatter, "---", "", body].join("\n") : body;
    await fn(sourcePlan(plans, "approved.md", text));
  });
}

/** The `branch:` line of one resolution, or undefined when none was printed. */
function branchLine(stdout: string): string | undefined {
  return slash(stdout)
    .split("\n")
    .find((line) => line.startsWith("branch: "));
}

/** The line printed right after `branch:`, or undefined when there is none. */
function afterBranch(stdout: string): string | undefined {
  const lines = slash(stdout).split("\n");
  const at = lines.findIndex((line) => line.startsWith("branch: "));
  return at < 0 ? undefined : lines[at + 1];
}

/** The `target:` lines of one resolution, in the order printed. */
function targetLines(stdout: string): string[] {
  return slash(stdout)
    .split("\n")
    .filter((line) => line.startsWith("target: "));
}

test("an unusable attachments map exits 7 before the run branch step: HEAD stays on main and the branch is not created", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: feature/login", "attachments:", "  a.png: /x/one", "  a.png: /x/two"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 7, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.equal(await headOf(repo), "main");
      assert.equal((await repo.git("branch", "--list", "feature/login")).stdout.trim(), "");
    });
  });
});

test("branching off in a repository: a plan naming a branch lands on the current one and stdout carries no branch line", async () => {
  await withBranchRepo(["mode: off"], async (repo) => {
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const key = parse(result.stdout).key;
      assert.equal(slash(result.stdout), [`path: docs/_specs/${key}/plan.md`, `key: ${key}`, "state: new", ""].join("\n"));
      assert.equal(await headOf(repo), "main");
    });
  });
});

test("a plan naming a new branch while HEAD is on the base lands on it, created from the base, with the uncommitted files carried along", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    fs.writeFileSync(path.join(repo.dir, "repro.test.ts"), "red\n");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const key = parse(result.stdout).key;
      assert.equal(
        slash(result.stdout),
        [`path: docs/_specs/${key}/plan.md`, `key: ${key}`, "state: new", "branch: feature/login (created)", "target: main", ""].join("\n"),
      );
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), await commitOf(repo, "main"));
      assert.equal(fs.readFileSync(path.join(repo.dir, "README.md"), "utf-8"), "changed\n");
      assert.ok(fs.existsSync(path.join(repo.dir, "repro.test.ts")));
    });
  });
});

test("a plan naming the current non-base branch reports it kept and switches nothing", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "feature/login");
    await repo.git("checkout", "-q", "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (kept)");
      assert.equal(await headOf(repo), "feature/login");
    });
  });
});

test("a plan naming an existing branch at another commit switches to it on a clean tree, never recreating it", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "feature/login");
    const tip = await commitOf(repo, "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (switched)");
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), tip);
    });
  });
});

test("allowed and a plan recording no branch: the current branch is kept", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: main (kept)");
      assert.equal(await headOf(repo), "main");
    });
  });
});

test("required, a plan recording no branch and HEAD on the base: the single entry's pattern branch is created", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/add-login (created)");
      assert.equal(await headOf(repo), "feature/add-login");
    });
  });
});

test("required and a plan carrying a Repro: line and an issue: URL: the entry pattern takes the fix type and the issue number", async () => {
  const body = PLAN_BODY.replace("- Files: src/T1.ts", "- Files: src/T1.ts\n- Repro: tests/login.test.ts");
  await withBranchRepo(["mode: required", "work:", ...workEntry("any", "main", "{type}/{issue-number}-{slug}", "main")], async (repo) => {
    await withSource(
      ["issue: https://github.com/acme/app/issues/42"],
      async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(branchLine(result.stdout), "branch: fix/42-add-login (created)");
      },
      body,
    );
  });
});

test("required reads branch: none as no branch recorded, so HEAD on the base still gets the pattern branch", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await withSource(["branch: none"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(await headOf(repo), "feature/add-login");
    });
  });
});

test("required, a plan recording no branch and HEAD on a non-base branch: that branch is kept", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: work (kept)");
      assert.equal(await headOf(repo), "work");
    });
  });
});

for (const [name, expected] of [
  ["/{slug}", "add-login"],
  ["{slug}/", "add-login"],
] as const) {
  test(`an entry name pattern ${name} with a separator at its edge never leaves a leading or trailing / on landing`, async () => {
    await withBranchRepo(["mode: required", "work:", ...workEntry("edge", "main", name, "main")], async (repo) => {
      await withSource([], async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(branchLine(result.stdout), `branch: ${expected} (created)`);
        assert.equal(await headOf(repo), expected);
      });
    });
  });
}

test("an entry name pattern that expands to nothing at all makes the landing refuse the run branch, exit 6, HEAD unchanged and a reason naming the empty name", async () => {
  await withBranchRepo(["mode: required", "work:", ...workEntry("dash", "main", "-/_", "main")], async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /empty/);
      assert.equal(await headOf(repo), "main");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("required and a plan naming the base: exit 6, nothing on stdout, nothing landed and HEAD where it was", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["branch: main"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /base/);
      assert.equal(await headOf(repo), "work");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("required, a detached HEAD and a plan recording no branch: exit 6, since a detached HEAD is no branch to stay on", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "--detach");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.match(result.stderr, /detached/);
      assert.equal(await headOf(repo), "HEAD");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("allowed, a detached HEAD and a plan recording no branch: reported as detached and kept", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "--detach");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: detached (kept)");
      assert.equal(await headOf(repo), "HEAD");
    });
  });
});

test("a switch to a branch at another commit on a dirty tree: exit 6, no run directory, HEAD and the tree unchanged", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "feature/login");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    const tree = await treeOf(repo);
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /uncommitted/);
      assert.equal(await headOf(repo), "main");
      assert.equal(await treeOf(repo), tree);
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("creating the run branch from a base at another commit on a dirty tree: exit 6 and HEAD stays on its branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await branchAhead(repo, "work");
    await repo.git("checkout", "-q", "work");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(await headOf(repo), "work");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("an entry base missing locally: exit 6 naming the base, nothing landed and HEAD where it was", async () => {
  await withBranchRepo(["mode: allowed", "work:", ...workEntry("feature", "develop", "feature/{slug}", "develop")], async (repo) => {
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.match(result.stderr, /base branch develop does not exist locally/);
      assert.equal(await headOf(repo), "main");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("a plan naming an invalid branch name: exit 6 naming it, nothing landed and HEAD where it was", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: bad..name"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.match(result.stderr, /invalid run branch name: bad\.\.name/);
      assert.equal(await headOf(repo), "main");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("a plan naming the previous-branch shorthand is an invalid name, never a switch to wherever HEAD was before (git would expand @{-1})", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await repo.git("checkout", "-q", "main");
    await withSource(["branch: @{-1}"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.match(result.stderr, /invalid run branch name/);
      assert.equal(await headOf(repo), "main");
    });
  });
});

/** A run already landed in the repository, its plan naming a run branch. */
function landedWithBranch(repo: GitRepo, key: string, branch: string): string {
  const file = path.join(repo.dir, "docs", "_specs", key, "plan.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ["---", `branch: ${branch}`, "---", "", PLAN_BODY].join("\n"));
  return file;
}

test("a landed run plan given as source reports the current branch kept and switches nothing, whatever branch it records", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    const plan = landedWithBranch(repo, "2026-09-19-17-30-00_add-login", "feature/login");
    const result = await runIn(repo, ["--land", plan]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(parse(result.stdout).state, "existing");
    assert.equal(branchLine(result.stdout), "branch: main (kept)");
    assert.equal(await headOf(repo), "main");
  });
});

test("the no-argument form reports the current branch kept, right after state:, and switches nothing", async () => {
  await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
    landedWithBranch(repo, "2026-09-19-17-30-00_add-login", "feature/login");
    const result = await runIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(
      slash(result.stdout),
      [
        "path: docs/_specs/2026-09-19-17-30-00_add-login/plan.md",
        "key: 2026-09-19-17-30-00_add-login",
        "state: existing",
        "branch: main (kept)",
        "target: main",
        "",
      ].join("\n"),
    );
    assert.equal(await headOf(repo), "main");
  });
});

test("the approved plan re-landed from the base answers existing from the run branch instead of minting a second run", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: feature/login"], async (src) => {
      const first = parse((await runIn(repo, ["--land", src])).stdout);
      await repo.git("add", "-A");
      await repo.git("commit", "-q", "-m", "land the run");
      await repo.git("checkout", "-q", "main");

      const again = await runIn(repo, ["--land", src]);
      assert.equal(again.status, 0, `stderr: ${again.stderr}`);
      assert.deepEqual(parse(again.stdout), {
        path: first.path,
        key: first.key,
        state: "existing",
        branch: "feature/login (switched)",
        target: "main",
      });
      assert.deepEqual(runDirs(repo.dir), [first.key]);
    });
  });
});

test("a draft round landed through into: runs the branch step before the copy, carrying the uncommitted draft to the new branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(repo.dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    await withSource(
      ["branch: feature/login", `into: ${key}`],
      async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(branchLine(result.stdout), "branch: feature/login (created)");
        assert.equal(await headOf(repo), "feature/login");
        assert.deepEqual(runDirs(repo.dir), [key]);
      },
      DRAFT_BODY,
    );
  });
});

test("a landing refused with exit 2 for its --into key leaves HEAD where it was and creates no branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src, "--into", "2026-01-01-00-00-00_never-landed"]);
      assert.equal(result.status, 2, `stdout: ${result.stdout}`);
      assert.equal(await headOf(repo), "main");
      assert.equal((await repo.git("show-ref", "--verify", "--quiet", "refs/heads/feature/login")).status, 1);
    });
  });
});

test("a landing refused with exit 2 for a slug that normalizes to nothing leaves HEAD where it was", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withTempDir("p2p2-plans-", async (plans) => {
      const src = sourcePlan(plans, "!!!.md", ["---", "branch: feature/login", "---", "", "# !!!", ""].join("\n"));
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 2, `stdout: ${result.stdout}`);
      assert.equal(await headOf(repo), "main");
    });
  });
});

test("a landing refused with exit 4 for a target that is not a draft leaves HEAD where it was and creates no branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(repo.dir, key, "2026-09-19T17:30:00Z", PLAN_BODY);
    await withSource(["branch: feature/login", `into: ${key}`], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 4, `stdout: ${result.stdout}`);
      assert.equal(await headOf(repo), "main");
      assert.equal((await repo.git("show-ref", "--verify", "--quiet", "refs/heads/feature/login")).status, 1);
    });
  });
});

test("a decomposed round re-landed through into: from the base branch switches back to the run branch", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(repo.dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    await withSource(["branch: feature/login", `into: ${key}`], async (src) => {
      const first = await runIn(repo, ["--land", src]);
      assert.equal(first.status, 0, `stderr: ${first.stderr}`);
      assert.equal(branchLine(first.stdout), "branch: feature/login (created)");

      fs.mkdirSync(path.join(repo.dir, "docs", "_specs", key, "tasks"), { recursive: true });
      landStatus(repo.dir, key, { progress: "0/1", done: "none" });
      // the same commit, so the untracked run directory follows HEAD back
      await repo.git("checkout", "-q", "main");

      const again = await runIn(repo, ["--land", src]);
      assert.equal(again.status, 0, `stderr: ${again.stderr}`);
      assert.equal(parse(again.stdout).state, "existing");
      assert.equal(branchLine(again.stdout), "branch: feature/login (switched)");
      assert.equal(await headOf(repo), "feature/login");
    });
  });
});

test("a matching into: round re-landed before any split switches back to the run branch too", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    const key = "2026-09-19-17-30-00_add-login";
    landPlan(repo.dir, key, "2026-09-19T17:30:00Z", DRAFT_BODY);
    await withSource(["branch: feature/login", `into: ${key}`], async (src) => {
      const first = await runIn(repo, ["--land", src]);
      assert.equal(first.status, 0, `stderr: ${first.stderr}`);
      await repo.git("checkout", "-q", "main");

      const again = await runIn(repo, ["--land", src]);
      assert.equal(again.status, 0, `stderr: ${again.stderr}`);
      assert.equal(parse(again.stdout).state, "existing");
      assert.equal(branchLine(again.stdout), "branch: feature/login (switched)");
      assert.equal(await headOf(repo), "feature/login");
    });
  });
});

test("outside a git repository branching acts as off: no branch line, whatever the mode", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "viber.yml"), "branching:\n  mode: required\n");
    const src = sourcePlan(dir, "outside/add-login.md", ["---", "branch: feature/login", "---", "", PLAN_BODY].join("\n"));
    const result = await run(dir, ["--land", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(branchLine(result.stdout), undefined);
  });
});

test("allowed and a plan recording branch: none keeps the current branch rather than creating one called none", async () => {
  await withBranchRepo(["mode: allowed", ...ON_MAIN], async (repo) => {
    await withSource(["branch: none"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: main (kept)");
      assert.equal(await headOf(repo), "main");
    });
  });
});

test("a plan naming its work entry and a new branch creates that branch from the entry base, not from main (DoD.1)", async () => {
  await withBranchRepo(["mode: allowed", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await withSource(["work: feature", "branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (created)");
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), await commitOf(repo, "develop"));
    });
  });
});

test("required, a plan naming its work entry and no branch, HEAD on that entry base: the entry pattern branch is created there (DoD.1)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await repo.git("checkout", "-q", "develop");
    await withSource(["work: feature"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/add-login (created)");
      assert.equal(await commitOf(repo), await commitOf(repo, "develop"));
    });
  });
});

for (const [mode, frontmatter] of [
  ["allowed", ["branch: feature/login"]],
  ["required", []],
] as const) {
  test(`${mode}, several entries and a plan recording no work: key: a branch to create exits 6 naming the ambiguity, nothing landed and HEAD where it was (DoD.2)`, async () => {
    await withBranchRepo([`mode: ${mode}`, ...TWO_BASES], async (repo) => {
      await repo.git("branch", "develop");
      await withSource([...frontmatter], async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 6, `stdout: ${result.stdout}`);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /the plan records no branching\.work entry and several exist/);
        assert.equal(await headOf(repo), "main");
        assert.equal((await repo.git("show-ref", "--verify", "--quiet", "refs/heads/feature/login")).status, 1);
        assert.deepEqual(runDirs(repo.dir), []);
      });
    });
  });
}

test("several entries and a plan recording no work: key but a branch that exists: the landing switches to it, since nothing has to be created (DoD.2)", async () => {
  await withBranchRepo(["mode: allowed", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (switched)");
    });
  });
});

test("required and an entry named from {issue-number} while the plan has no issue: exit 6 naming the entry, nothing landed and HEAD where it was (DoD.3)", async () => {
  await withBranchRepo(["mode: required", "work:", ...workEntry("hotfix", "main", "hotfix/issue.{issue-number}", "main")], async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /work entry hotfix needs an issue for \{issue-number\}/);
      assert.equal(await headOf(repo), "main");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("required and an entry based on develop: HEAD on main is not that base, so it is kept rather than branched from (DoD.4)", async () => {
  await withBranchRepo(["mode: required", "work:", ...workEntry("feature", "develop", "feature/{slug}", "develop")], async (repo) => {
    await repo.git("branch", "develop");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: main (kept)");
      assert.equal(await headOf(repo), "main");
    });
  });
});

test("required and an entry based on develop: a plan naming develop as its branch is refused as the base itself, HEAD where it was (DoD.4)", async () => {
  await withBranchRepo(["mode: required", "work:", ...workEntry("feature", "develop", "feature/{slug}", "develop")], async (repo) => {
    await repo.git("branch", "develop");
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["branch: develop"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.match(result.stderr, /branching is required and the run branch is a work entry base: develop/);
      assert.equal(await headOf(repo), "work");
    });
  });
});

test("entry base under required: a plan recording another entry's base as its branch exits 6 with the base message and lands nothing (DoD.1)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["work: hotfix", "branch: develop"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 6, `stdout: ${result.stdout}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /branching is required and the run branch is a work entry base: develop/);
      assert.equal(await headOf(repo), "work");
      assert.deepEqual(runDirs(repo.dir), []);
    });
  });
});

test("entry base under required: no branch recorded and HEAD on another entry's base creates the entry's pattern branch from the entry base (DoD.2)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await repo.git("checkout", "-q", "develop");
    await withSource(["work: hotfix"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: hotfix/add-login (created)");
      assert.equal(await headOf(repo), "hotfix/add-login");
      assert.equal(await commitOf(repo), await commitOf(repo, "main"));
    });
  });
});

test("entry base under required: no branch recorded and HEAD on a branch that is no entry base keeps that branch (DoD.3)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    await repo.git("branch", "develop");
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["work: hotfix"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: work (kept)");
      assert.equal(await headOf(repo), "work");
    });
  });
});

test("entry base under allowed: a plan recording another entry's base as its branch still lands on it (DoD.4)", async () => {
  await withBranchRepo(["mode: allowed", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await withSource(["work: hotfix", "branch: develop"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: develop (switched)");
      assert.equal(await headOf(repo), "develop");
    });
  });
});

test("required and an entry based on develop: a plan naming main as its branch is not the entry base, so the landing switches to it (DoD.4)", async () => {
  await withBranchRepo(["mode: required", "work:", ...workEntry("feature", "develop", "feature/{slug}", "develop")], async (repo) => {
    await repo.git("branch", "develop");
    await repo.git("checkout", "-q", "-b", "work");
    await withSource(["branch: main"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: main (switched)");
    });
  });
});

// --- the pull request target of the plan's work entry, right after branch: ---

test("a first landing prints the target of the plan's work entry on the line right after branch: (T5 DoD.1)", async () => {
  await withBranchRepo(["mode: allowed", ...TWO_BASES], async (repo) => {
    await branchAhead(repo, "develop");
    await withSource(["work: feature", "branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (created)");
      assert.equal(afterBranch(result.stdout), "target: develop");
      assert.deepEqual(targetLines(result.stdout), ["target: develop"]);
    });
  });
});

test("the no-argument form prints the target of the resolved run's work entry right after branch: (T5 DoD.2)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    const file = path.join(repo.dir, "docs", "_specs", "2026-09-19-17-30-00_add-login", "plan.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ["---", "work: hotfix", "branch: hotfix/add-login", "---", "", PLAN_BODY].join("\n"));
    const result = await runIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(branchLine(result.stdout), "branch: main (kept)");
    assert.equal(afterBranch(result.stdout), "target: main");
    assert.deepEqual(targetLines(result.stdout), ["target: main"]);
  });
});

test("mode off with a resolvable work entry: a landing prints neither a branch: nor a target: line (T5 DoD.3)", async () => {
  await withBranchRepo(["mode: off", ...ON_MAIN], async (repo) => {
    await withSource(["work: feature", "branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), undefined);
      assert.deepEqual(targetLines(result.stdout), []);
    });
  });
});

test("mode off with a resolvable work entry: the no-argument form prints neither a branch: nor a target: line and HEAD stays on main (T5 DoD.3)", async () => {
  await withBranchRepo(["mode: off", ...ON_MAIN], async (repo) => {
    const file = path.join(repo.dir, "docs", "_specs", "2026-09-19-17-30-00_add-login", "plan.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ["---", "work: feature", "branch: feature/login", "---", "", PLAN_BODY].join("\n"));
    const result = await runIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(branchLine(result.stdout), undefined);
    assert.deepEqual(targetLines(result.stdout), []);
    assert.equal(await headOf(repo), "main");
  });
});

for (const [what, frontmatter] of [
  ["records no work: key while several entries exist", ["branch: feature/login"]],
  ["names a work entry the configuration lacks", ["work: nope", "branch: feature/login"]],
] as const) {
  test(`a plan that ${what} still switches to its existing branch but prints no target: line (T5 DoD.4)`, async () => {
    await withBranchRepo(["mode: allowed", ...TWO_BASES], async (repo) => {
      await branchAhead(repo, "feature/login");
      await withSource([...frontmatter], async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(branchLine(result.stdout), "branch: feature/login (switched)");
        assert.deepEqual(targetLines(result.stdout), []);
      });
    });
  });
}

// --- a recorded branch resumes whatever the configuration is refused for ---

/** A pre-work configuration: base and name straight under branching:, no entry. */
const LEGACY = ["mode: required", "base: main", "name: '{type}/{slug}'"];
const LEGACY_ERROR = "branching.base and branching.name are no longer read - move them into a branching.work entry";

/** ON_MAIN plus an entry config.sh drops for its missing target, so its error comes first. */
const ONE_BROKEN = [...ON_MAIN, "  broken:", "    base: main", "    name: 'x/{slug}'"];
const BROKEN_ERROR = "work entry broken: missing target";

/** Staged and untracked changes, so a refused landing has a tree and an index to leave alone. */
async function dirtyTree(repo: GitRepo): Promise<void> {
  fs.writeFileSync(path.join(repo.dir, "README.md"), "staged\n");
  await repo.git("add", "README.md");
  fs.writeFileSync(path.join(repo.dir, "scratch.txt"), "untracked\n");
}

test("a legacy configuration and a plan recording an existing branch at another commit: the landing switches to it (T6 DoD.1)", async () => {
  await withBranchRepo(LEGACY, async (repo) => {
    await branchAhead(repo, "feature/login");
    const tip = await commitOf(repo, "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (switched)");
      assert.deepEqual(targetLines(result.stdout), []);
      assert.equal(await headOf(repo), "feature/login");
      assert.equal(await commitOf(repo), tip);
    });
  });
});

test("a legacy configuration and a plan recording the branch HEAD is on: the landing keeps it (T6 DoD.1)", async () => {
  await withBranchRepo(LEGACY, async (repo) => {
    await repo.git("checkout", "-q", "-b", "feature/login");
    await withSource(["branch: feature/login"], async (src) => {
      const result = await runIn(repo, ["--land", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(branchLine(result.stdout), "branch: feature/login (kept)");
      assert.equal(await headOf(repo), "feature/login");
    });
  });
});

for (const [how, prepare, expected] of [
  ["switches to it", (repo: GitRepo) => branchAhead(repo, "feature/login"), "switched"],
  ["keeps it", (repo: GitRepo) => repo.git("checkout", "-q", "-b", "feature/login"), "kept"],
] as const) {
  test(`required and a plan whose work: key names no entry but whose recorded branch exists: the landing ${how} (T6 DoD.2)`, async () => {
    await withBranchRepo(["mode: required", ...ON_MAIN], async (repo) => {
      await prepare(repo);
      await withSource(["work: nope", "branch: feature/login"], async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(branchLine(result.stdout), `branch: feature/login (${expected})`);
        assert.equal(await headOf(repo), "feature/login");
      });
    });
  });
}

for (const [what, branching, frontmatter, first] of [
  ["a legacy configuration and a recorded branch that does not exist", LEGACY, ["branch: feature/login"], LEGACY_ERROR],
  ["a legacy configuration, required and no branch recorded", LEGACY, [], LEGACY_ERROR],
  ["a dropped entry beside a valid one and a recorded branch that does not exist", ["mode: allowed", ...ONE_BROKEN], ["work: feature", "branch: feature/login"], BROKEN_ERROR],
  ["a dropped entry beside a valid one, required and no branch recorded on the base", ["mode: required", ...ONE_BROKEN], ["work: feature"], BROKEN_ERROR],
] as const) {
  test(`${what}: creating the run branch exits 6 naming the first configuration error, HEAD, index and tree unchanged (T6 DoD.3, DoD.4)`, async () => {
    await withBranchRepo([...branching], async (repo) => {
      await dirtyTree(repo);
      const head = await commitOf(repo);
      const tree = await treeOf(repo);
      const index = (await repo.git("diff", "--cached")).stdout;
      const branches = (await repo.git("branch", "--list")).stdout;
      await withSource([...frontmatter], async (src) => {
        const result = await runIn(repo, ["--land", src]);
        assert.equal(result.status, 6, `stdout: ${result.stdout}`);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr.trim(), `error: ${first}`);
        assert.equal(await headOf(repo), "main");
        assert.equal(await commitOf(repo), head);
        assert.equal(await treeOf(repo), tree);
        assert.equal((await repo.git("diff", "--cached")).stdout, index);
        assert.equal((await repo.git("branch", "--list")).stdout, branches);
        assert.deepEqual(runDirs(repo.dir), []);
      });
    });
  });
}

// --- --branch: the read-only C3 report for the planner, nothing moves ---

/** The --branch report's key: value lines as a plain map. */
function reportOf(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of slash(stdout).trim().split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 2);
  }
  return out;
}

/** The report lines starting with `prefix`, in the order printed. */
function linesOf(stdout: string, prefix: string): string[] {
  return slash(stdout)
    .split("\n")
    .filter((line) => line.startsWith(prefix));
}

/** One entry named from the plan type and slug, cut from and returning to main. */
const SINGLE = ["mode: required", "work:", ...workEntry("feature", "main", "{type}/{slug}", "main")];

/** GitFlow: features from develop, hotfixes from main, both named from the
 *  issue number, and two issue types mapped onto them. */
const GITFLOW = [
  "mode: required",
  "work:",
  ...workEntry("feature", "develop", "feature/issue.{issue-number}", "develop"),
  ...workEntry("hotfix", "main", "hotfix/issue.{issue-number}", "main"),
  "issue-type-mappings:",
  "  Bug-Report: hotfix",
  "  'Feature Request': feature",
];

const ISSUE = "issue: https://github.com/acme/app/issues/6759";

/** A fake `gh` answering issue-facts.sh: the issue block for `issue view`, the
 *  given type (and exit code) for the `api` type lookup. Every call is
 *  appended to `calls.log` beside the stub, so a test can see whether gh ran. */
async function withGh(type: string, exit: number, fn: (stubDir: string, calls: () => string) => void | Promise<void>): Promise<void> {
  await withTempDir("p2p2-ghlog-", async (logDir) => {
    const log = path.join(logDir, "calls.log").replace(/\\/g, "/");
    const body = [
      `printf '%s\\n' "$*" >> '${log}'`,
      `if [ "$1" = api ]; then printf '%s\\n' '${type}'; exit ${exit}; fi`,
      "printf 'NUMBER=6759\\nURL=https://github.com/acme/app/issues/6759\\nTITLE=t\\nSTATE=OPEN\\nAUTHOR=a\\nLABELS=\\nCOMMENTS=0\\n--- body ---\\nTYPE=not-this\\n'",
    ].join("\n");
    await withStub("gh", body, (stubDir) => fn(stubDir, () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8") : "")));
  });
}

test("off (no branching group configured): --branch prints only mode: off, even with a usable plan given", async () => {
  await withGitRepo(async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(slash(result.stdout), "mode: off\n");
    });
  });
});

test("outside a git repository: --branch prints only mode: off, whatever the configured mode", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "viber.yml"), "branching:\n  mode: required\n");
    const src = sourcePlan(dir, "plan.md", PLAN_BODY);
    const result = await run(dir, ["--branch", src]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), "mode: off\n");
  });
});

test("a missing plan file: exit 2 and nothing printed", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const result = await runIn(repo, ["--branch", path.join(repo.dir, "nope.md")]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  });
});

test("a single entry and a plan with no issue: the whole report, verbatim, suggesting that entry (DoD.5)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        [
          "mode: required",
          "issue-type: none",
          "suggested: feature",
          "entry: feature | base: main | target: main | new: feature/add-login | new-exists: no | behind: unknown",
          "current: main",
          "current-is-base: yes",
          "dirty: no",
          "",
        ].join("\n"),
      );
    });
  });
});

test("on a non-base branch: current reports that branch, not the base", async () => {
  await withBranchRepo(["mode: allowed", ...SINGLE.slice(1)], async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const report = reportOf(result.stdout);
      assert.equal(report.mode, "allowed");
      assert.equal(report.current, "work");
    });
  });
});

test("a name pattern fills in the fix type, the issue number and the run slug", async () => {
  const body = PLAN_BODY.replace("- Files: src/T1.ts", "- Files: src/T1.ts\n- Repro: tests/login.test.ts");
  await withBranchRepo(["mode: required", "work:", ...workEntry("any", "main", "{type}/{issue-number}-{slug}", "main")], async (repo) => {
    await withSource(
      ["issue: https://github.com/acme/app/issues/42"],
      async (src) => {
        const result = await runIn(repo, ["--branch", src]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.deepEqual(linesOf(result.stdout, "entry: "), [
          "entry: any | base: main | target: main | new: fix/42-add-login | new-exists: no | behind: unknown",
        ]);
      },
      body,
    );
  });
});

test("a plan with no issue: an entry named from the issue number reads new: -, and the one entry left is suggested (DoD.4)", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("titled", "main", "{type}/{slug}", "main"),
    ...workEntry("numbered", "main", "hotfix/issue.{issue-number}", "main"),
  ];
  await withBranchRepo(config, async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).suggested, "titled");
      assert.deepEqual(linesOf(result.stdout, "entry: "), [
        "entry: titled | base: main | target: main | new: feature/add-login | new-exists: no | behind: unknown",
        "entry: numbered | base: main | target: main | new: - | new-exists: no | behind: unknown",
      ]);
    });
  });
});

test("several entries and no mapping to choose between them: nothing is suggested", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("feature", "main", "feature/{slug}", "main"),
    ...workEntry("chore", "main", "chore/{slug}", "main"),
  ];
  await withBranchRepo(config, async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).suggested, "none");
    });
  });
});

for (const [type, entry] of [
  ["Bug-Report", "hotfix"],
  ["Feature Request", "feature"],
] as const) {
  test(`an issue of mapped type ${type} suggests the ${entry} entry, its type looked up in the issue's own repository (DoD.1)`, async () => {
    await withBranchRepo(GITFLOW, async (repo) => {
      await withGh(type, 0, async (stubDir, calls) => {
        await withSource([ISSUE], async (src) => {
          const result = await runIn(repo, ["--branch", src], [stubDir]);
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          const report = reportOf(result.stdout);
          assert.equal(report["issue-type"], type);
          assert.equal(report.suggested, entry);
          assert.deepEqual(linesOf(result.stdout, "entry: "), [
            "entry: feature | base: develop | target: develop | new: feature/issue.6759 | new-exists: no | behind: unknown",
            "entry: hotfix | base: main | target: main | new: hotfix/issue.6759 | new-exists: no | behind: unknown",
          ]);
          assert.deepEqual(linesOf(result.stdout, "error: "), []);
          assert.match(calls(), /^api repos\/acme\/app\/issues\/6759 /m);
        });
      });
    });
  });
}

for (const [what, type, exit, issueType, error] of [
  ["an unmapped type", "Task", 0, "Task", "error: issue type Task is not in branching.issue-type-mappings"],
  ["a mapped type in another letter case", "bug-report", 0, "bug-report", "error: issue type bug-report is not in branching.issue-type-mappings"],
  ["no type", "", 0, "none", "error: issue 6759 has no issue type"],
  ["a failed type lookup", "", 1, "none", "error: issue 6759 has no issue type"],
] as const) {
  test(`mappings present and an issue with ${what}: refused with an error: line (DoD.2)`, async () => {
    await withBranchRepo(GITFLOW, async (repo) => {
      await withGh(type, exit, async (stubDir) => {
        await withSource([ISSUE], async (src) => {
          const result = await runIn(repo, ["--branch", src], [stubDir]);
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          assert.equal(reportOf(result.stdout)["issue-type"], issueType);
          assert.deepEqual(linesOf(result.stdout, "error: "), [error]);
        });
      });
    });
  });
}

for (const [what, config, frontmatter] of [
  ["no mappings and a plan with an issue", SINGLE, [ISSUE]],
  ["mappings and a plan with no issue", GITFLOW, []],
] as const) {
  test(`${what}: the issue type is never fetched and reads none (DoD.3)`, async () => {
    await withBranchRepo([...config], async (repo) => {
      await withGh("Bug-Report", 0, async (stubDir, calls) => {
        await withSource([...frontmatter], async (src) => {
          const result = await runIn(repo, ["--branch", src], [stubDir]);
          assert.equal(result.status, 0, `stderr: ${result.stderr}`);
          assert.equal(reportOf(result.stdout)["issue-type"], "none");
          assert.deepEqual(linesOf(result.stdout, "error: "), []);
          assert.equal(calls(), "");
        });
      });
    });
  });
}

test("a legacy configuration: its config.sh errors are relayed as error: lines and nothing is suggested (DoD.6)", async () => {
  await withBranchRepo(["mode: required", "base: develop", "name: '{type}/{issue}-{slug}'"], async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).suggested, "none");
      assert.deepEqual(linesOf(result.stdout, "entry: "), []);
      assert.deepEqual(linesOf(result.stdout, "error: "), [
        "error: branching.base and branching.name are no longer read - move them into a branching.work entry",
        "error: no valid branching.work entry",
      ]);
    });
  });
});

test("an entry using the old {issue} placeholder is dropped and its config.sh error relayed, the valid entry still reported (DoD.6)", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("old", "main", "{type}/{issue}-{slug}", "main"),
    ...workEntry("feature", "main", "feature/{slug}", "main"),
  ];
  await withBranchRepo(config, async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).suggested, "feature");
      assert.equal(linesOf(result.stdout, "entry: ").length, 1);
      assert.deepEqual(linesOf(result.stdout, "error: "), ["error: work entry old: {issue} is now {issue-number}"]);
    });
  });
});

test("mode: off with entries, mappings and a legacy key: the report is that line alone and gh never runs (DoD.7)", async () => {
  await withBranchRepo(["mode: off", "base: develop", ...GITFLOW.slice(1)], async (repo) => {
    await withGh("Bug-Report", 0, async (stubDir, calls) => {
      await withSource([ISSUE], async (src) => {
        const result = await runIn(repo, ["--branch", src], [stubDir]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(slash(result.stdout), "mode: off\n");
        assert.equal(calls(), "");
      });
    });
  });
});

test("a detached HEAD reports current: detached", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const commit = await commitOf(repo);
    await repo.git("checkout", "-q", commit);
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).current, "detached");
    });
  });
});

test("a branch already at an entry's proposed name reports new-exists: yes on that entry", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await branchAhead(repo, "feature/add-login");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(linesOf(result.stdout, "entry: "), [
        "entry: feature | base: main | target: main | new: feature/add-login | new-exists: yes | behind: unknown",
      ]);
    });
  });
});

test("an entry base behind its remote-tracking branch reports the missing commit count on that entry", async () => {
  await withBranchRepo(["mode: allowed", ...SINGLE.slice(1)], async (repo) => {
    await repo.git("checkout", "-q", "-b", "tmp-ahead");
    fs.writeFileSync(path.join(repo.dir, "ahead.txt"), "ahead\n");
    await repo.git("add", "-A");
    await repo.git("commit", "-q", "-m", "ahead");
    const ahead = await commitOf(repo);
    await repo.git("checkout", "-q", "main");
    await repo.git("branch", "-D", "tmp-ahead");
    await repo.git("update-ref", "refs/remotes/origin/main", ahead);
    await repo.git("config", "remote.origin.url", "./nowhere");
    await repo.git("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
    await repo.git("config", "branch.main.remote", "origin");
    await repo.git("config", "branch.main.merge", "refs/heads/main");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.match(linesOf(result.stdout, "entry: ")[0], / \| behind: 1$/);
    });
  });
});

test("an untracked file in the tree reports dirty: yes", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "x\n");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).dirty, "yes");
    });
  });
});

test("--branch changes neither HEAD nor the tree's status, the issue type lookup included (DoD.8: read-only)", async () => {
  await withBranchRepo(GITFLOW, async (repo) => {
    await branchAhead(repo, "hotfix/issue.6759");
    fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "x\n");
    await withGh("Bug-Report", 0, async (stubDir) => {
      await withSource([ISSUE], async (src) => {
        const beforeHead = await headOf(repo);
        const beforeCommit = await commitOf(repo);
        const beforeTree = await treeOf(repo);
        const result = await runIn(repo, ["--branch", src], [stubDir]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(reportOf(result.stdout).suggested, "hotfix");
        assert.equal(await headOf(repo), beforeHead);
        assert.equal(await commitOf(repo), beforeCommit);
        assert.equal(await treeOf(repo), beforeTree);
      });
    });
  });
});

// --- --start: the plan-less, read-only start report ---

/** plan-path.sh --start, with an optional issue URL. */
function startIn(repo: GitRepo, url?: string, stubDirs?: string[]) {
  return runIn(repo, url === undefined ? ["--start"] : ["--start", url], stubDirs);
}

/** A second commit on the current branch, so it sits one ahead of any branch cut before it. */
async function commitOnHead(repo: GitRepo): Promise<void> {
  fs.writeFileSync(path.join(repo.dir, "ahead.txt"), "ahead\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-q", "-m", "ahead");
}

const ISSUE_URL = "https://github.com/acme/app/issues/6759";

for (const mode of ["allowed", "required"] as const) {
  test(`start report under ${mode} with no plan argument prints every line the contract declares (DoD.1)`, async () => {
    await withBranchRepo([`mode: ${mode}`, ...SINGLE.slice(1)], async (repo) => {
      const result = await startIn(repo);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        slash(result.stdout),
        [
          `mode: ${mode}`,
          "issue-type: none",
          "suggested: feature",
          "entry: feature | base: main | target: main | name: {type}/{slug} | usable: yes | base-exists: yes | at-base: yes | behind: unknown",
          "current: main",
          "current-is-base: yes",
          "dirty: no",
          "",
        ].join("\n"),
      );
    });
  });
}

test("start report relays every config.sh error and the issue type error after the dirty line, the valid entry still reported", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("old", "main", "{type}/{issue}-{slug}", "main"),
    ...workEntry("feature", "main", "feature/issue.{issue-number}", "main"),
    "issue-type-mappings:",
    "  Bug-Report: feature",
  ];
  await withBranchRepo(config, async (repo) => {
    await withGh("Task", 0, async (stubDir) => {
      const result = await startIn(repo, ISSUE_URL, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(linesOf(result.stdout, "error: "), [
        "error: work entry old: {issue} is now {issue-number}",
        "error: issue type Task is not in branching.issue-type-mappings",
      ]);
    });
  });
});

test("start report changes neither HEAD, the index nor git status --porcelain, the issue type lookup included (DoD.2)", async () => {
  await withBranchRepo(GITFLOW, async (repo) => {
    await branchAhead(repo, "work");
    await repo.git("checkout", "-q", "work");
    fs.writeFileSync(path.join(repo.dir, "untracked.txt"), "x\n");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    await repo.git("add", "README.md");
    await withGh("Bug-Report", 0, async (stubDir) => {
      const state = async () => [await headOf(repo), await commitOf(repo), await treeOf(repo), (await repo.git("diff", "--cached")).stdout, (await repo.git("branch", "--list")).stdout];
      const before = await state();
      const result = await startIn(repo, ISSUE_URL, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(reportOf(result.stdout).suggested, "hotfix");
      assert.deepEqual(await state(), before);
    });
  });
});

test("start report under branching off prints only mode: off, gh never run (DoD.3)", async () => {
  await withBranchRepo(["mode: off", ...GITFLOW.slice(1)], async (repo) => {
    await withGh("Bug-Report", 0, async (stubDir, calls) => {
      const result = await startIn(repo, ISSUE_URL, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(slash(result.stdout), "mode: off\n");
      assert.equal(calls(), "");
    });
  });
});

test("start report outside a git repository prints only mode: off, whatever the configured mode (DoD.3)", async () => {
  await withTempDir("p2p2-viber-", async (dir) => {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "viber.yml"), "branching:\n  mode: required\n");
    const result = await run(dir, ["--start"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), "mode: off\n");
  });
});

for (const [type, entry] of [
  ["Bug-Report", "hotfix"],
  ["Feature Request", "feature"],
] as const) {
  test(`start report suggests the ${entry} entry for an issue URL whose type ${type} is mapped, looked up in the issue's own repository (DoD.4)`, async () => {
    await withBranchRepo(GITFLOW, async (repo) => {
      await withGh(type, 0, async (stubDir, calls) => {
        const result = await startIn(repo, ISSUE_URL, [stubDir]);
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        const report = reportOf(result.stdout);
        assert.equal(report["issue-type"], type);
        assert.equal(report.suggested, entry);
        assert.deepEqual(linesOf(result.stdout, "error: "), []);
        assert.match(calls(), /^api repos\/acme\/app\/issues\/6759 /m);
      });
    });
  });
}

test("start report suggests the one usable entry when no URL is given and the other entry needs an issue number (DoD.4)", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("titled", "main", "{type}/{slug}", "main"),
    ...workEntry("numbered", "main", "hotfix/issue.{issue-number}", "main"),
  ];
  await withBranchRepo(config, async (repo) => {
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(reportOf(result.stdout).suggested, "titled");
  });
});

test("start report suggests none when several entries are usable and no mapping chooses (DoD.4)", async () => {
  const config = [
    "mode: required",
    "work:",
    ...workEntry("feature", "main", "feature/{slug}", "main"),
    ...workEntry("chore", "main", "chore/{slug}", "main"),
  ];
  await withBranchRepo(config, async (repo) => {
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(reportOf(result.stdout).suggested, "none");
  });
});

test("start report reads the literal {issue-number} in name: and usable: no on an entry whose name holds it when no URL is given (DoD.5)", async () => {
  await withBranchRepo(GITFLOW, async (repo) => {
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.deepEqual(linesOf(result.stdout, "entry: "), [
      "entry: feature | base: develop | target: develop | name: feature/issue.{issue-number} | usable: no | base-exists: no | at-base: no | behind: unknown",
      "entry: hotfix | base: main | target: main | name: hotfix/issue.{issue-number} | usable: no | base-exists: yes | at-base: yes | behind: unknown",
    ]);
  });
});

test("start report fills the URL's issue number into name: and reads usable: yes on an entry whose name holds {issue-number}", async () => {
  await withBranchRepo(GITFLOW, async (repo) => {
    await withGh("Bug-Report", 0, async (stubDir) => {
      const result = await startIn(repo, ISSUE_URL, [stubDir]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(linesOf(result.stdout, "entry: "), [
        "entry: feature | base: develop | target: develop | name: feature/issue.6759 | usable: yes | base-exists: no | at-base: no | behind: unknown",
        "entry: hotfix | base: main | target: main | name: hotfix/issue.6759 | usable: yes | base-exists: yes | at-base: yes | behind: unknown",
      ]);
    });
  });
});

test("start report reads at-base: yes on a branch at the base commit under another name (DoD.6)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(linesOf(result.stdout, "entry: ")[0], / \| at-base: yes \| /);
  });
});

test("start report reads at-base: no on a branch one commit ahead of the base (DoD.6)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await commitOnHead(repo);
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(linesOf(result.stdout, "entry: ")[0], / \| at-base: no \| /);
  });
});

test("start report reads current-is-base: yes on another entry's base (DoD.7)", async () => {
  await withBranchRepo(["mode: required", ...TWO_BASES], async (repo) => {
    await repo.git("checkout", "-q", "-b", "develop");
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(reportOf(result.stdout)["current-is-base"], "yes");
  });
});

test("start report reads current-is-base: no on a detached HEAD sitting on a base commit (DoD.7)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("checkout", "-q", await commitOf(repo));
    const result = await startIn(repo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(reportOf(result.stdout)["current-is-base"], "no");
  });
});

for (const arg of ["not-a-url", "https://github.com/acme/app/pull/12", "https://github.com/acme/app/issues/abc"]) {
  test(`start report exits 2 on ${arg}, which is not an issue URL, and prints nothing (DoD.8)`, async () => {
    await withBranchRepo(SINGLE, async (repo) => {
      const result = await startIn(repo, arg);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
    });
  });
}

test("--branch prints current-is-base: yes directly after current: on an entry base, every other line unchanged (DoD.9)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const lines = slash(result.stdout).split("\n");
      assert.deepEqual(lines.slice(lines.indexOf("current: main")).slice(0, 3), ["current: main", "current-is-base: yes", "dirty: no"]);
    });
  });
});

test("--branch prints current-is-base: no directly after current: on a branch that is no entry base (DoD.9)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await withSource([], async (src) => {
      const result = await runIn(repo, ["--branch", src]);
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      const lines = slash(result.stdout).split("\n");
      assert.deepEqual(lines.slice(lines.indexOf("current: work")).slice(0, 3), ["current: work", "current-is-base: no", "dirty: no"]);
    });
  });
});

// --- --checkout: HEAD onto an existing local branch, never a new one ---

/** The local branch names, one per line, so a test can assert none was created. */
async function branchesOf(repo: GitRepo): Promise<string> {
  return (await repo.git("branch", "--format=%(refname:short)")).stdout;
}

/** The index as git records it, so a test can assert a refusal left it alone. */
async function indexOf(repo: GitRepo): Promise<string> {
  return (await repo.git("ls-files", "-s")).stdout;
}

test("checkout form: an existing branch at another commit on a clean tree becomes HEAD and reads switched (DoD.1)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await branchAhead(repo, "feature/login");
    const tip = await commitOf(repo, "feature/login");
    const result = await runIn(repo, ["--checkout", "feature/login"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), "branch: feature/login (switched)\n");
    assert.equal(await headOf(repo), "feature/login");
    assert.equal(await commitOf(repo), tip);
  });
});

test("checkout form: the branch HEAD is already on reads kept (DoD.2)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const result = await runIn(repo, ["--checkout", "main"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), "branch: main (kept)\n");
    assert.equal(await headOf(repo), "main");
  });
});

test("checkout form: a name with no local branch exits 6 and creates nothing (DoD.3)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const branches = await branchesOf(repo);
    const result = await runIn(repo, ["--checkout", "feature/absent"]);
    assert.equal(result.status, 6, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /branch feature\/absent does not exist locally/);
    assert.equal(await headOf(repo), "main");
    assert.equal(await branchesOf(repo), branches);
  });
});

test("checkout form: an invalid name exits 6 with HEAD unchanged (DoD.4)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const result = await runIn(repo, ["--checkout", "bad..name"]);
    assert.equal(result.status, 6, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /invalid branch name: bad\.\.name/);
    assert.equal(await headOf(repo), "main");
  });
});

test("checkout form: the previous-branch shorthand is an invalid name, never a switch to wherever HEAD was before (DoD.4, git would expand @{-1})", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("checkout", "-q", "-b", "work");
    await repo.git("checkout", "-q", "main");
    // a Windows child re-parses its command line and drops the braces of a bare
    // argument, so the name crosses inside a shell string that holds spaces
    const result = await runScript(`exec bash "${SUT.replace(/\\/g, "/")}" --checkout '@{-1}'`, [], { cwd: repo.dir, shell: ["bash", "-c"], env: repo.env });
    assert.equal(result.status, 6, `stdout: ${result.stdout}`);
    assert.match(result.stderr, /invalid branch name/);
    assert.equal(await headOf(repo), "main");
  });
});

test("checkout form: a dirty tree and a branch at another commit exits 6 with HEAD, index and tree unchanged (DoD.5)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await branchAhead(repo, "feature/login");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    fs.writeFileSync(path.join(repo.dir, "staged.txt"), "staged\n");
    await repo.git("add", "staged.txt");
    const tree = await treeOf(repo);
    const index = await indexOf(repo);
    const result = await runIn(repo, ["--checkout", "feature/login"]);
    assert.equal(result.status, 6, `stdout: ${result.stdout}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /uncommitted changes and feature\/login is at another commit/);
    assert.equal(await headOf(repo), "main");
    assert.equal(await treeOf(repo), tree);
    assert.equal(await indexOf(repo), index);
  });
});

test("checkout form: a dirty tree and a branch at the same commit switches and carries the changes along (DoD.6)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    await repo.git("branch", "same");
    fs.writeFileSync(path.join(repo.dir, "README.md"), "changed\n");
    const result = await runIn(repo, ["--checkout", "same"]);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(slash(result.stdout), "branch: same (switched)\n");
    assert.equal(await headOf(repo), "same");
    assert.equal(fs.readFileSync(path.join(repo.dir, "README.md"), "utf-8"), "changed\n");
  });
});

test("checkout form: a missing argument exits 2 with nothing on stdout (DoD.7)", async () => {
  await withBranchRepo(SINGLE, async (repo) => {
    const result = await runIn(repo, ["--checkout"]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /usage: plan-path\.sh --checkout <branch>/);
    assert.equal(await headOf(repo), "main");
  });
});
