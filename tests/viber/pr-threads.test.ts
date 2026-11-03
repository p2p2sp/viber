/*
 * pr-threads.test.ts - proves viber/scripts/pr-threads.sh's
 * `pr-threads.sh <N | #N | pull request url>` contract, against a real
 * throwaway git repo and a stubbed `gh`: the argument forms and the exit 2 on a
 * malformed one, the no-gh and no-repo stops, the wrong-branch stop (no thread
 * line, no threads file), the PR= to PUSHED= lines of a ready run, its
 * THREADS_FILE=, SKIPPED=, TRUNCATED= and THREAD= lines with the threads file,
 * the REMARK= lines and file sections of the Conversation comments and review
 * bodies (listed, unlisted, skipped, truncated), and exit 1 with one ERROR line
 * when gh fails or prints nothing usable.
 *
 * pr-threads.sh is `#!/bin/sh`, so every case runs through
 * forEachShell("posix", ...) via opts.shell, never executed directly. `gh` is
 * always a withStub, or absent - this test never shells out to the real gh. The
 * stub answers `gh api graphql ... --jq <filter>` with the text the filter
 * would print (URL=, HEAD=, OID=, MORE=, CMORE=, RMORE=, AUTH= lines, then per
 * remark an R line and one Q line per body line, then per thread a T line and
 * per comment a C line and one B line per body line), because the filter itself
 * runs inside the real gh.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/viber/pr-threads.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-threads.sh");

async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

const PR_URL = "https://github.com/acme/widgets/pull/7";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after each
 *  call) into `$ARGV_FILE`; its stdout, stderr and exit code come from env vars. */
const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ -n "\${GH_STDERR:-}" ]; then printf '%s' "$GH_STDERR" >&2; fi
printf '%s' "\${GH_STDOUT:-}"
exit "\${GH_EXIT:-0}"
`;

interface Scene {
  work: GitRepo;
  stubDir: string;
  argvFile: string;
  sha: string;
}

/** A work repo with one commit on `feature/x` and a `gh` stub first on PATH. */
async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
  return await withGitRepo((work) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const argvFile = path.join(stubDir, "argv.log");
      fs.writeFileSync(argvFile, "");
      fs.writeFileSync(path.join(work.dir, "README.md"), "readme\n");
      await work.git("add", "--", "README.md");
      await work.git("commit", "-m", "init");
      await work.git("checkout", "-b", "feature/x");
      const sha = (await work.git("rev-parse", "HEAD")).stdout.trim();
      return await fn({ work, stubDir, argvFile, sha });
    }),
  );
}

interface FixtureComment {
  id: number;
  author: string;
  at: string;
  body: string;
}

interface FixtureThread {
  resolved?: boolean;
  outdated?: boolean;
  line?: number;
  originalLine?: number;
  path: string;
  comments: FixtureComment[];
}

/** One thread as the --jq filter prints it: a T line, then per comment a C line and one B line per body line. */
function threadText(t: FixtureThread): string {
  const head = `T\t${t.resolved ?? false}\t${t.outdated ?? false}\t${t.line ?? ""}\t${t.originalLine ?? ""}\t${t.path}\n`;
  const comments = t.comments.map(
    (c) => `C\t${c.id}\t${c.author}\t${c.at}\n` + c.body.split("\n").map((l) => `B\t${l}\n`).join(""),
  );
  return head + comments.join("");
}

interface FixtureRemark {
  kind: "conversation" | "review";
  id: number;
  author: string | null;
  bot?: boolean;
  at?: string;
  state?: string;
  body: string;
}

/** One remark as the --jq filter prints it: an R line (an empty author field is a null author), then one Q line per body line. */
function remarkText(r: FixtureRemark): string {
  const head = `R\t${r.kind}\t${r.id}\t${r.author ?? ""}\t${r.bot ?? false}\t${r.at ?? "2026-10-01T10:00:00Z"}\t${r.state ?? ""}\n`;
  return head + (r.body === "" ? "" : r.body.split("\n").map((l) => `Q\t${l}\n`).join(""));
}

interface GhOutOpts {
  url?: string;
  more?: boolean;
  commentsMore?: boolean;
  reviewsMore?: boolean;
  prAuthor?: string | null;
  remarks?: FixtureRemark[];
  threads?: FixtureThread[];
}

/** What the real gh prints once its --jq filter ran. */
function ghOut(head: string, oid: string, opts: GhOutOpts = {}): string {
  const header =
    `URL=${opts.url ?? PR_URL}\nHEAD=${head}\nOID=${oid}\nMORE=${opts.more ?? false}\n` +
    `CMORE=${opts.commentsMore ?? false}\nRMORE=${opts.reviewsMore ?? false}\nAUTH=${opts.prAuthor === undefined ? "pat" : (opts.prAuthor ?? "")}\n`;
  return header + (opts.remarks ?? []).map(remarkText).join("") + (opts.threads ?? []).map(threadText).join("");
}

function conversation(id: number, author: string | null, body: string, extra: Partial<FixtureRemark> = {}): FixtureRemark {
  return { kind: "conversation", id, author, body, ...extra };
}

function review(id: number, author: string | null, body: string, extra: Partial<FixtureRemark> = {}): FixtureRemark {
  return { kind: "review", id, author, body, state: "COMMENTED", ...extra };
}

function remarkLines(result: RunResult): string[] {
  return lines(result).filter((l) => l.startsWith("REMARK="));
}

function comment(id: number, author: string, body: string, at = "2026-10-01T10:00:00Z"): FixtureComment {
  return { id, author, at, body };
}

function threadLines(result: RunResult): string[] {
  return lines(result).filter((l) => l.startsWith("THREAD="));
}

const keyMarker = (key: string) => `<!-- viber:pr-feedback ${key} -->`;
const marker = (id: number) => keyMarker(String(id));

async function runThreads(
  shell: Shell,
  scene: Scene,
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string; noGh?: boolean } = {},
): Promise<RunResult> {
  const env = { ...scene.work.env, ARGV_FILE: scene.argvFile, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  return await runScript(SUT, args, { shell, cwd: opts.cwd ?? scene.work.dir, env, stubDirs: opts.noGh ? [] : [scene.stubDir] });
}

/** Every gh call the stub logged, one argv array each. */
function ghCalls(scene: Scene): string[][] {
  return fs
    .readFileSync(scene.argvFile, "utf-8")
    .split("===\n")
    .map((block) => block.split("\n").filter((line) => line.length > 0))
    .filter((call) => call.length > 0);
}

/** The argument following `flag` in a logged gh call, undefined when the flag is absent. */
function flagValue(call: string[], flag: string): string | undefined {
  const at = call.indexOf(flag);
  return at < 0 ? undefined : call[at + 1];
}

function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((l) => l.length > 0);
}

function stderrLines(result: RunResult): string[] {
  return result.stderr.split("\n").filter((l) => l.length > 0);
}

// --- arguments (DoD 1) -----------------------------------------------------------------

const BAD_ARGS: { name: string; args: string[] }[] = [
  { name: "no argument", args: [] },
  { name: "two arguments", args: ["7", "8"] },
  { name: "an empty argument", args: [""] },
  { name: "a word", args: ["abc"] },
  { name: "a lone hash", args: ["#"] },
  { name: "a number with a suffix", args: ["7x"] },
  { name: "an issue url", args: ["https://github.com/acme/widgets/issues/7"] },
  { name: "a pull url without a repository", args: ["https://github.com/acme/pull/7"] },
  { name: "a pull url with a non-numeric number", args: ["https://github.com/acme/widgets/pull/x"] },
  { name: "a plain http pull url", args: ["http://github.com/acme/widgets/pull/7"] },
];

for (const row of BAD_ARGS) {
  test(`${row.name}: exit 2 with one ERROR line, nothing on stdout and gh never called`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, row.args);
        assert.equal(result.status, 2, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "");
        assert.match(stderrLines(result).join("\n"), /^ERROR pr-threads\.sh: [^\n]+$/);
        assert.deepEqual(ghCalls(scene), []);
      });
    });
  });
}

const FORMS: { name: string; arg: string; hostname?: string; owner: string; repo: string }[] = [
  { name: "a bare number", arg: "7", owner: "owner={owner}", repo: "name={repo}" },
  { name: "a #number", arg: "#7", owner: "owner={owner}", repo: "name={repo}" },
  { name: "a pull url", arg: PR_URL, hostname: "github.com", owner: "owner=acme", repo: "name=widgets" },
  {
    name: "a pull url on another host with a fragment",
    arg: "https://ghe.example.com/acme/widgets/pull/7#discussion_r12",
    hostname: "ghe.example.com",
    owner: "owner=acme",
    repo: "name=widgets",
  },
  { name: "a pull url with a query", arg: `${PR_URL}?notification_referrer_id=1`, hostname: "github.com", owner: "owner=acme", repo: "name=widgets" },
];

for (const row of FORMS) {
  test(`${row.name} reaches gh api graphql with its owner, name, number 7 and ${row.hostname ? `--hostname ${row.hostname}` : "no --hostname"}`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, [row.arg], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        const call = ghCalls(scene)[0];
        assert.deepEqual(call.slice(0, 2), ["api", "graphql"]);
        assert.ok(call.includes(row.owner), `owner in ${call.join(" ")}`);
        assert.ok(call.includes(row.repo), `name in ${call.join(" ")}`);
        assert.ok(call.includes("number=7"), `number in ${call.join(" ")}`);
        assert.equal(flagValue(call, "--hostname"), row.hostname);
      });
    });
  });
}

// --- the stops before gh (DoD 2) --------------------------------------------------------

const ghOnCorePath = coreUtilsPath()
  .split(path.delimiter)
  .some((dir) => ["gh", "gh.exe"].some((n) => fs.existsSync(path.join(dir, n))));

test(
  "gh missing: STATUS=stop REASON=no-gh and nothing else",
  { skip: ghOnCorePath ? "a real gh sits in the core utilities directory, so its absence cannot be staged" : false },
  async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { noGh: true });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "STATUS=stop\nREASON=no-gh\n");
      });
    });
  },
);

test("a working directory outside a git repository: STATUS=stop REASON=no-repo and gh api never called", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await withTempDir("pr-threads-norepo-", async (dir) => {
        const result = await runThreads(shell, scene, ["7"], { cwd: dir, env: { GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
        assert.equal(result.status, 0, `stderr: ${result.stderr}`);
        assert.equal(result.stdout, "STATUS=stop\nREASON=no-repo\n");
        assert.deepEqual(ghCalls(scene), []);
      });
    });
  });
});

// --- the wrong-branch stop (DoD 3) -------------------------------------------------------

test("a current branch other than headRefName: STATUS=stop REASON=wrong-branch with the branch facts, no THREAD= line", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("other", "0".repeat(40)) } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(
        result.stdout,
        `STATUS=stop\nREASON=wrong-branch\nPR=7\nPR_URL=${PR_URL}\nHEAD_BRANCH=other\nBRANCH=feature/x\nPUSHED=no\n`,
      );
    });
  });
});

test("a wrong-branch stop writes no threads file", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("other", scene.sha) } });
      assert.equal(fs.existsSync(path.join(scene.work.dir, ".temp", "viber", "pr-feedback")), false);
    });
  });
});

test("a detached HEAD is a wrong-branch stop with an empty BRANCH=", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("checkout", "--detach");
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
      assert.equal(result.stdout, `STATUS=stop\nREASON=wrong-branch\nPR=7\nPR_URL=${PR_URL}\nHEAD_BRANCH=feature/x\nBRANCH=\nPUSHED=yes\n`);
    });
  });
});

// --- PUSHED (DoD 4) ---------------------------------------------------------------------

test("a ready run prints STATUS= to PUSHED= in order, PUSHED=yes when local HEAD is headRefOid", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(lines(result).slice(0, 6), ["STATUS=ready", "PR=7", `PR_URL=${PR_URL}`, "HEAD_BRANCH=feature/x", "BRANCH=feature/x", "PUSHED=yes"]);
    });
  });
});

test("a headRefOid other than local HEAD gives PUSHED=no", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", "f".repeat(40)) } });
      assert.equal(lines(result)[5], "PUSHED=no");
    });
  });
});

test("a local commit on top of headRefOid gives PUSHED=no", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      await scene.work.git("commit", "--allow-empty", "-m", "local only");
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
      assert.equal(lines(result)[5], "PUSHED=no");
    });
  });
});

// --- the listed threads (DoD 1) ---------------------------------------------------------

const THREADS_PATH = ".temp/viber/pr-feedback/7/threads.md";

test("a ready run prints THREADS_FILE=, SKIPPED=, TRUNCATED= and one THREAD= line per unresolved thread after PUSHED=, none for a resolved one", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        { path: "src/a.ts", line: 12, comments: [comment(101, "alice", "first")] },
        { resolved: true, path: "src/b.ts", line: 3, comments: [comment(102, "bob", "done")] },
        { path: "src/c.ts", line: 30, comments: [comment(103, "carol", "second"), comment(104, "dave", "reply")] },
      ];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.deepEqual(lines(result).slice(6), [
        `THREADS_FILE=${THREADS_PATH}`,
        "SKIPPED=0",
        "TRUNCATED=no",
        "THREAD=1 | 101 | src/a.ts:12 | alice | current",
        "THREAD=2 | 103 | src/c.ts:30 | carol | current",
      ]);
    });
  });
});

test("a ready run with no thread prints THREADS_FILE=, SKIPPED=0 and TRUNCATED=no and no THREAD= line", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
      assert.deepEqual(lines(result).slice(6), [`THREADS_FILE=${THREADS_PATH}`, "SKIPPED=0", "TRUNCATED=no"]);
    });
  });
});

// --- outdated and the line (DoD 2) ------------------------------------------------------

const LOCATIONS: { name: string; thread: Partial<FixtureThread>; want: string }[] = [
  { name: "an outdated thread reads outdated", thread: { outdated: true, line: 12 }, want: "src/a.ts:12 | alice | outdated" },
  { name: "a thread with no line takes originalLine", thread: { originalLine: 9 }, want: "src/a.ts:9 | alice | current" },
  { name: "a thread with neither line nor originalLine reads ?", thread: {}, want: "src/a.ts:? | alice | current" },
  { name: "a thread with both takes line", thread: { line: 12, originalLine: 9 }, want: "src/a.ts:12 | alice | current" },
];

for (const row of LOCATIONS) {
  test(`${row.name}`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const threads: FixtureThread[] = [{ path: "src/a.ts", comments: [comment(101, "alice", "x")], ...row.thread }];
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
        assert.deepEqual(threadLines(result), [`THREAD=1 | 101 | ${row.want}`]);
      });
    });
  });
}

// --- the viber reply marker (DoD 3) -----------------------------------------------------

test("a thread whose latest comment opens with the reply marker is absent and counted in SKIPPED=", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        { path: "src/a.ts", line: 1, comments: [comment(101, "alice", "fix this"), comment(102, "me", `${marker(101)}\nFixed in abc123.`)] },
        { path: "src/b.ts", line: 2, comments: [comment(201, "bob", "and this")] },
      ];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.deepEqual(lines(result).slice(6), [
        `THREADS_FILE=${THREADS_PATH}`,
        "SKIPPED=1",
        "TRUNCATED=no",
        "THREAD=1 | 201 | src/b.ts:2 | bob | current",
      ]);
    });
  });
});

test("a thread with a reviewer comment after the viber reply is listed (the reviewer answered back)", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        {
          path: "src/a.ts",
          line: 1,
          comments: [comment(101, "alice", "fix this"), comment(102, "me", `${marker(101)}\nFixed.`), comment(103, "alice", "still wrong")],
        },
      ];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.deepEqual(lines(result).slice(7), ["SKIPPED=0", "TRUNCATED=no", "THREAD=1 | 101 | src/a.ts:1 | alice | current"]);
    });
  });
});

test("a latest comment that only mentions the marker on a later line is not a viber reply and stays listed", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        { path: "src/a.ts", line: 1, comments: [comment(101, "alice", `see below\n${marker(101)}`)] },
      ];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.deepEqual(lines(result).slice(7), ["SKIPPED=0", "TRUNCATED=no", "THREAD=1 | 101 | src/a.ts:1 | alice | current"]);
    });
  });
});

// --- TRUNCATED (DoD 4) ------------------------------------------------------------------

const TRUNCATION: { name: string; more: boolean; want: string }[] = [
  { name: "hasNextPage true", more: true, want: "TRUNCATED=yes" },
  { name: "hasNextPage false", more: false, want: "TRUNCATED=no" },
];

for (const row of TRUNCATION) {
  test(`${row.name} prints ${row.want}`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { more: row.more }) } });
        assert.equal(lines(result)[8], row.want);
      });
    });
  });
}

// --- the threads file (DoD 5) -----------------------------------------------------------

test("the threads file holds every listed thread with its comments oldest first and bodies verbatim, and no resolved or skipped thread", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [
        {
          path: "src/a.ts",
          line: 12,
          comments: [
            comment(101, "alice", "Rename this.\n\n- keep `x`\n\ttabbed", "2026-10-01T10:00:00Z"),
            comment(102, "bob", "Agreed.", "2026-10-02T11:30:00Z"),
          ],
        },
        { resolved: true, path: "src/b.ts", line: 3, comments: [comment(201, "carol", "resolved one")] },
        { outdated: true, originalLine: 40, path: "src/c.ts", comments: [comment(301, "dave", "old code")] },
        { path: "src/d.ts", line: 5, comments: [comment(401, "erin", "fix"), comment(402, "me", `${marker(401)}\nDone.`)] },
      ];
      await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      const file = fs.readFileSync(path.join(scene.work.dir, THREADS_PATH), "utf-8");
      assert.equal(
        file,
        [
          "## 1 - src/a.ts:12 (current)",
          "comment-id: 101",
          "",
          "### alice - 2026-10-01T10:00:00Z",
          "",
          "Rename this.",
          "",
          "- keep `x`",
          "\ttabbed",
          "",
          "### bob - 2026-10-02T11:30:00Z",
          "",
          "Agreed.",
          "",
          "## 2 - src/c.ts:40 (outdated)",
          "comment-id: 301",
          "",
          "### dave - 2026-10-01T10:00:00Z",
          "",
          "old code",
          "",
        ].join("\n"),
      );
    });
  });
});

test("a ready run replaces the threads file of the earlier run, an empty one when no thread is listed", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const target = path.join(scene.work.dir, THREADS_PATH);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "stale\n");
      await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha) } });
      assert.equal(fs.readFileSync(target, "utf-8"), "");
    });
  });
});

// --- the remarks (Conversation comments and review bodies) -----------------------------

const NO_REMARKS = [`THREADS_FILE=${THREADS_PATH}`, "SKIPPED=0", "TRUNCATED=no"];

test("a Conversation comment and a review body each print a REMARK= line numbered after the threads, comments first", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [{ path: "src/a.ts", line: 12, comments: [comment(101, "alice", "first")] }];
      const remarks = [conversation(11, "carol", "Please add docs."), review(21, "bob", "Looks off.", { state: "CHANGES_REQUESTED" })];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads, remarks }) } });
      assert.deepEqual(lines(result).slice(6), [
        ...NO_REMARKS,
        "THREAD=1 | 101 | src/a.ts:12 | alice | current",
        "REMARK=2 | comment-11 | carol | conversation",
        "REMARK=3 | review-21 | bob | review",
      ]);
    });
  });
});

const UNLISTED: { name: string; remark: FixtureRemark }[] = [
  { name: "an empty Conversation comment", remark: conversation(11, "carol", "") },
  { name: "a whitespace-only Conversation comment", remark: conversation(11, "carol", "  \n\t\n") },
  { name: "an empty review body", remark: review(21, "bob", "") },
  { name: "a whitespace-only review body", remark: review(21, "bob", " \n ") },
  { name: "a Conversation comment opening with a viber marker", remark: conversation(11, "me", `${marker(5)}\nDone.`) },
];

for (const row of UNLISTED) {
  test(`${row.name} prints no REMARK= line and leaves SKIPPED= at 0`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { remarks: [row.remark] }) } });
        assert.deepEqual(lines(result).slice(6), NO_REMARKS);
      });
    });
  });
}

const SKIPPED_REMARKS: { name: string; remarks: FixtureRemark[] }[] = [
  { name: "a Conversation comment by the pull request author", remarks: [conversation(11, "pat", "my own note")] },
  { name: "a review body by the pull request author", remarks: [review(21, "pat", "my own review")] },
  { name: "a Conversation comment by a bot", remarks: [conversation(11, "ci-bot", "coverage report", { bot: true })] },
  { name: "a review body by a bot", remarks: [review(21, "ci-bot", "scan done", { bot: true })] },
  {
    name: "a Conversation comment answered by a comment opening with its marker",
    remarks: [conversation(11, "carol", "Please add docs."), conversation(12, "me", `${keyMarker("comment-11")}\nAdded.`)],
  },
  {
    name: "a review body answered by a comment opening with its marker",
    remarks: [review(21, "bob", "Looks off."), conversation(12, "me", `${keyMarker("review-21")}\nFixed.`)],
  },
];

for (const row of SKIPPED_REMARKS) {
  test(`${row.name} prints no REMARK= line and raises SKIPPED= to 1`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { remarks: row.remarks }) } });
        assert.deepEqual(lines(result).slice(6), [`THREADS_FILE=${THREADS_PATH}`, "SKIPPED=1", "TRUNCATED=no"]);
      });
    });
  });
}

test("a Conversation comment that mentions its marker only on a later line is not answered and stays listed", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const remarks = [conversation(11, "carol", "Please add docs."), conversation(12, "dave", `see below\n${keyMarker("comment-11")}`)];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { remarks }) } });
      assert.deepEqual(remarkLines(result), ["REMARK=1 | comment-11 | carol | conversation", "REMARK=2 | comment-12 | dave | conversation"]);
    });
  });
});

const GHOSTS: { name: string; prAuthor: string | null }[] = [
  { name: "a null author with a named pull request author", prAuthor: "pat" },
  { name: "a null author when the pull request author is null too", prAuthor: null },
];

for (const row of GHOSTS) {
  test(`${row.name}: the remark is listed with author ghost`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const remarks = [conversation(11, null, "from a deleted account")];
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { remarks, prAuthor: row.prAuthor }) } });
        assert.deepEqual(lines(result).slice(6), [...NO_REMARKS, "REMARK=1 | comment-11 | ghost | conversation"]);
      });
    });
  });
}

const REMARK_TRUNCATION: { name: string; opts: GhOutOpts }[] = [
  { name: "a further page of Conversation comments", opts: { commentsMore: true } },
  { name: "a further page of reviews", opts: { reviewsMore: true } },
];

for (const row of REMARK_TRUNCATION) {
  test(`${row.name} prints TRUNCATED=yes`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, row.opts) } });
        assert.equal(lines(result)[8], "TRUNCATED=yes");
      });
    });
  });
}

test("the threads file holds one section per listed remark after the thread sections, none for a skipped or empty one", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [{ path: "src/a.ts", line: 12, comments: [comment(101, "alice", "Rename this.")] }];
      const remarks = [
        conversation(11, "carol", "Please add docs.\r\n\r\n- one", { at: "2026-10-03T09:00:00Z" }),
        conversation(12, "pat", "my own note"),
        conversation(13, "dave", ""),
        review(21, "bob", "Looks off.", { state: "CHANGES_REQUESTED", at: "2026-10-04T09:00:00Z" }),
      ];
      await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads, remarks }) } });
      const file = fs.readFileSync(path.join(scene.work.dir, THREADS_PATH), "utf-8");
      assert.equal(
        file,
        [
          "## 1 - src/a.ts:12 (current)",
          "comment-id: 101",
          "",
          "### alice - 2026-10-01T10:00:00Z",
          "",
          "Rename this.",
          "",
          "## 2 - conversation",
          "comment-id: comment-11",
          "",
          "### carol - 2026-10-03T09:00:00Z",
          "",
          "Please add docs.",
          "",
          "- one",
          "",
          "## 3 - review (CHANGES_REQUESTED)",
          "comment-id: review-21",
          "",
          "### bob - 2026-10-04T09:00:00Z",
          "",
          "Looks off.",
          "",
        ].join("\n"),
      );
    });
  });
});

test("a thread opened by the pull request author is still listed as a THREAD= line", async () => {
  await assertPosix(async (shell) => {
    await withScene(async (scene) => {
      const threads: FixtureThread[] = [{ path: "src/a.ts", line: 12, comments: [comment(101, "pat", "note to self")] }];
      const result = await runThreads(shell, scene, ["7"], { env: { GH_STDOUT: ghOut("feature/x", scene.sha, { threads }) } });
      assert.deepEqual(threadLines(result), ["THREAD=1 | 101 | src/a.ts:12 | pat | current"]);
    });
  });
});

// --- gh failure -------------------------------------------------------------------------

const GH_FAILURES: { name: string; env: Record<string, string> }[] = [
  { name: "gh exits 1", env: { GH_EXIT: "1", GH_STDERR: "HTTP 401: Bad credentials\n" } },
  { name: "gh exits 0 and prints nothing", env: {} },
  { name: "gh exits 0 and prints no headRefOid", env: { GH_STDOUT: `URL=${PR_URL}\nHEAD=feature/x\nOID=\n` } },
  { name: "gh exits 1 although it printed a block", env: { GH_EXIT: "1", GH_STDOUT: ghOut("feature/x", "a".repeat(40)) } },
];

for (const row of GH_FAILURES) {
  test(`${row.name}: exit 1 with one ERROR line and nothing on stdout`, async () => {
    await assertPosix(async (shell) => {
      await withScene(async (scene) => {
        const result = await runThreads(shell, scene, ["7"], { env: row.env });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(stderrLines(result).join("\n"), /^ERROR pr-threads\.sh: [^\n]+$/);
      });
    });
  });
}
