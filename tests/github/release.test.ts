/*
 * release.test.ts - proves .github/scripts/release.sh's version computation,
 * manifest bump, commit/tag/push and GitHub-release publish flow against a
 * throwaway work repo (with its own throwaway `--bare` `origin`) and a
 * stubbed `gh`. release.sh is one of the three scripts scoped to its
 * boundary (never `forEachShell`-looped - it is always `#!/usr/bin/env
 * bash`, invoked once through whichever real bash is on this machine, the
 * same way the "Release" workflow invokes it: `bash .github/scripts/release.sh`).
 *
 * No test here ever reaches the network or mutates this repo's real working
 * tree: `gh` is always a `withStub` and every git push targets a local
 * `--bare` remote created by `withGitRepo`.
 *
 * Skipped wholesale (never failed) when `jq` or `bash` is missing on
 * `PATH` - release.sh hard-requires `jq`, which Git-Bash does not ship.
 *
 * Repo reality: no build, no lint, no npm, no package.json - this file is run
 * directly by Node's native test runner + TypeScript type stripping:
 *   node --test tests/github/release.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { bashShells } from "../harness/shells.ts";

const RELEASE_SH = path.resolve(import.meta.dirname, "../../.github/scripts/release.sh");
const PLUGINS = ["viber"];

function commandAvailable(cmd: string): boolean {
  return !spawnSync(cmd, ["--version"]).error;
}

/** A `gh` stub answering only the two subcommands release.sh calls, argv
 *  logged one-arg-per-line (a "===" separator between calls) into
 *  `$ARGV_FILE`. "Does a release already exist" is driven entirely by
 *  whether `$RELEASE_EXISTS_FLAG` exists on disk - `release create` creates
 *  it, so a second run's `release view` reports the release as already
 *  published, matching real `gh` semantics without touching the network. */
const GH_STUB = `
log() { for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"; }
if [ "$1" = "release" ] && [ "$2" = "view" ]; then
  log "$@"
  if [ -n "\${RELEASE_EXISTS_FLAG:-}" ] && [ -f "$RELEASE_EXISTS_FLAG" ]; then exit 0; fi
  exit 1
fi
if [ "$1" = "release" ] && [ "$2" = "create" ]; then
  log "$@"
  if [ "\${GH_CREATE_FAULT:-}" = always ]; then echo "HTTP 502: Server Error" >&2; exit 1; fi
  if [ "\${GH_CREATE_FAULT:-}" = once ] && [ ! -f "$ARGV_FILE.failed" ]; then : > "$ARGV_FILE.failed"; echo "HTTP 502: Server Error" >&2; exit 1; fi
  if [ -n "\${RELEASE_EXISTS_FLAG:-}" ]; then : > "$RELEASE_EXISTS_FLAG"; fi
  if [ "\${GH_CREATE_FAULT:-}" = lost-reply ]; then echo "HTTP 502: Server Error" >&2; exit 1; fi
  exit 0
fi
exit 1
`;

function argvCalls(argvFile: string): string[][] {
  if (!fs.existsSync(argvFile)) return [];
  const raw = fs.readFileSync(argvFile, "utf-8");
  return raw
    .split("===\n")
    .filter((block) => block.length > 0)
    .map((block) => block.split("\n").filter((line) => line.length > 0));
}

function manifestPath(repoDir: string, plugin: string): string {
  return path.join(repoDir, plugin, ".claude-plugin", "plugin.json");
}

/** Writes the fixture manifest release.sh bumps. `viber`'s is
 *  deliberately written WITHOUT a trailing newline, to prove jq's rewrite
 *  still leaves the file newline-terminated (jq always appends one);
 *  `trailingNewline` writes it already newline-terminated instead. */
function writeManifests(repoDir: string, version = "0.1.0", trailingNewline = false): void {
  for (const plugin of PLUGINS) {
    const file = manifestPath(repoDir, plugin);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = { name: plugin, version, description: `${plugin} release-fixture plugin` };
    const json = JSON.stringify(body, null, 2);
    fs.writeFileSync(file, trailingNewline ? `${json}\n` : json);
  }
}

function readManifests(repoDir: string): Record<string, { name: string; version: string; description: string }> {
  const out: Record<string, { name: string; version: string; description: string }> = {};
  for (const plugin of PLUGINS) {
    out[plugin] = JSON.parse(fs.readFileSync(manifestPath(repoDir, plugin), "utf-8"));
  }
  return out;
}

interface Fixture {
  repo: GitRepo;
  origin: GitRepo;
  ghDir: string;
  stateDir: string;
  argvFile: string;
  releaseFlag: string;
}

/** Builds a work repo (the fixture manifest, an initial commit already
 *  pushed to `main` on its own `--bare` `origin`) plus a stubbed `gh` - the
 *  full fixture every release.sh scenario below runs against. Nested
 *  `withGitRepo`/`withStub`/`withTempDir` calls guarantee every piece is
 *  cleaned up whether `fn` returns or throws. */
async function withReleaseFixture<T>(fn: (fx: Fixture) => T, opts: { manifestTrailingNewline?: boolean } = {}): Promise<T> {
  return await withGitRepo(
    (origin) =>
      withGitRepo((repo) =>
        withStub("gh", GH_STUB, (ghDir) =>
          withTempDir("p2p2-release-state-", async (stateDir) => {
            writeManifests(repo.dir, "0.1.0", opts.manifestTrailingNewline ?? false);
            const remote = await repo.git("remote", "add", "origin", origin.dir);
            if (remote.status !== 0) throw new Error(`fixture: git remote add failed: ${remote.stderr}`);
            const add = await repo.git("add", "-A");
            if (add.status !== 0) throw new Error(`fixture: git add failed: ${add.stderr}`);
            const commit = await repo.git("commit", "-m", "chore: initial fixture");
            if (commit.status !== 0) throw new Error(`fixture: git commit failed: ${commit.stderr}`);
            const push = await repo.git("push", "origin", "HEAD:main");
            if (push.status !== 0) throw new Error(`fixture: initial push failed: ${push.stderr}`);
            return fn({
              repo,
              origin,
              ghDir,
              stateDir,
              argvFile: path.join(stateDir, "gh-argv.log"),
              releaseFlag: path.join(stateDir, "release-exists.flag"),
            });
          }),
        ),
      ),
    { bare: true },
  );
}

interface RunReleaseOpts {
  /** `null` omits GITHUB_REF_NAME entirely (exercises the script's own `:-main` fallback). */
  githubRefName?: string | null;
  /** `null` omits GITHUB_OUTPUT entirely (exercises the script's own `:-/dev/null` fallback). */
  githubOutput?: string | null;
  /** How the stubbed `gh release create` fails: every time, the first time
   *  only, or after the release was created (the reply is lost). */
  createFault?: "always" | "once" | "lost-reply";
}

async function runRelease(bashPath: string, fx: Fixture, part: string, opts: RunReleaseOpts = {}): Promise<RunResult & { outputFile: string | null }> {
  const outputFile = opts.githubOutput === null ? null : (opts.githubOutput ?? path.join(fx.stateDir, "github_output.txt"));
  const env: Record<string, string> = {
    ...fx.repo.env,
    GH_TOKEN: "test-token",
    ARGV_FILE: fx.argvFile,
    RELEASE_EXISTS_FLAG: fx.releaseFlag,
    RETRY_DELAY: "0",
  };
  if (opts.createFault) env.GH_CREATE_FAULT = opts.createFault;
  if (opts.githubRefName !== null) env.GITHUB_REF_NAME = opts.githubRefName ?? "main";
  if (outputFile !== null) env.GITHUB_OUTPUT = outputFile;
  const result = await runScript(RELEASE_SH, [part], { shell: bashPath, cwd: fx.repo.dir, env, stubDirs: [fx.ghDir] });
  return { ...result, outputFile };
}

function readGithubOutput(outputFile: string | null): string {
  if (outputFile === null || !fs.existsSync(outputFile)) return "";
  return fs.readFileSync(outputFile, "utf-8");
}

/** release.sh's final `echo "$new"` is always the LAST stdout line - but
 *  whenever a real `git commit` runs first, git's own "[main abc123] ..."
 *  summary lands on stdout ahead of it (the script never redirects it), so
 *  every assertion on the printed version reads the last line, not the
 *  whole trimmed output. */
function lastStdoutLine(output: string): string {
  const trimmed = output.trim();
  const lines = trimmed.split("\n");
  return lines[lines.length - 1] ?? "";
}

const jqAvailable = commandAvailable("jq");
const bashPath = bashShells()[0];

if (!jqAvailable || !bashPath) {
  const reason = !jqAvailable
    ? "jq not on PATH - release.sh requires it and Git-Bash does not ship it"
    : "no bash found on PATH";
  test(`release.sh coverage skipped: ${reason}`, { skip: reason }, () => {});
} else {
  const bash: string = bashPath;

  test("no tags at all -> the 0.1.0 seed is taken as-is, no bump applied", async () => {
    await withReleaseFixture(async (fx) => {
      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "0.1.0");
      assert.equal(readGithubOutput(result.outputFile).trim(), "version=0.1.0");
      const manifests = readManifests(fx.repo.dir);
      for (const plugin of PLUGINS) assert.equal(manifests[plugin].version, "0.1.0");
    });
  });

  test("1.2.3 + patch -> 1.2.4", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");
    });
  });

  test("1.2.3 + minor -> 1.3.0", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "minor");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.3.0");
    });
  });

  test("1.2.3 + major -> 2.0.0", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "major");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "2.0.0");
    });
  });

  test("non-semver tags (v1.0.0, 1.0, release-2) are ignored when picking the highest", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "v1.0.0");
      await fx.repo.git("tag", "1.0");
      await fx.repo.git("tag", "release-2");
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4", "the non-semver tags must not outrank 1.2.3");
    });
  });

  test("a gap in numbering (1.0.0, 1.5.0) still picks the true highest", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.0.0");
      await fx.repo.git("tag", "1.5.0");
      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.5.1");
    });
  });

  test("200 tags, including a 1.9.0/1.10.0 pair, sort by version not lexicographically", async () => {
    await withReleaseFixture(async (fx) => {
      // One `git update-ref --stdin` rather than 200 `git tag` calls: the refs
      // it writes are the same lightweight tags, and 200 spawned processes
      // take tens of seconds on Windows.
      const head = await fx.repo.git("rev-parse", "HEAD");
      assert.equal(head.status, 0, `resolving HEAD should succeed: ${head.stderr}`);
      const names = [...Array.from({ length: 198 }, (_, i) => `0.0.${i + 1}`), "1.9.0", "1.10.0"];
      const commands = names.map((name) => `create refs/tags/${name} ${head.stdout.trim()}\n`).join("");
      const seedTags = await runScript("git", ["update-ref", "--stdin"], {
        cwd: fx.repo.dir,
        env: fx.repo.env,
        input: commands,
      });
      assert.equal(seedTags.status, 0, `seeding 200 tags should succeed: ${seedTags.stderr}`);

      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.10.1", "1.10.0 must sort above 1.9.0 (version sort, not lexicographic)");
    });
  });

  test("invalid part -> exit 2", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "bogus");
      assert.equal(result.status, 2);
      assert.match(result.stderr, /invalid part 'bogus'/);
    });
  });

  test("a target tag that already exists -> exit 3", async () => {
    // Unreachable through ordinary tag progression: "current" is always the
    // highest existing tag and "new" is always strictly greater than
    // "current" for every part, so a real tag can never already sit at
    // "new" by the time the normal current-tag listing picks it up. The
    // check this exercises guards a stale-listing/race window instead (e.g.
    // a concurrent run publishes the tag between this run's tag listing and
    // its rev-parse re-check) - reproduced here with a `git` stub that fakes
    // only the `tag --list` call (everything else passes through to the
    // real `git`), so the tag REALLY exists on disk while the listing the
    // script bases "current" on still reports the lower tag.
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      await fx.repo.git("tag", "1.2.4");
      const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf-8" }).stdout.trim();
      assert.ok(realGit.length > 0, "a real git must be resolvable on PATH to build the passthrough stub");
      await withStub(
        "git",
        `if [ "$1" = "tag" ] && [ "$2" = "--list" ]; then printf '1.2.3\\n'; exit 0; fi\nexec "${realGit}" "$@"`,
        async (fakeCurrentGitDir) => {
          const result = await runScript(RELEASE_SH, ["patch"], {
            shell: bash,
            cwd: fx.repo.dir,
            env: { ...fx.repo.env, GH_TOKEN: "test-token", ARGV_FILE: fx.argvFile, RELEASE_EXISTS_FLAG: fx.releaseFlag, GITHUB_REF_NAME: "main" },
            stubDirs: [fakeCurrentGitDir, fx.ghDir],
          });
          assert.equal(result.status, 3);
          assert.match(result.stderr, /tag 1\.2\.4 already exists/);
        },
      );
    });
  });

  test("bumps the manifest's version and nothing else in it, commits with the exact chore(bump) subject, tags and pushes to origin, and creates the GitHub release", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const before = readManifests(fx.repo.dir);

      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");
      assert.equal(readGithubOutput(result.outputFile).trim(), "version=1.2.4");

      const after = readManifests(fx.repo.dir);
      for (const plugin of PLUGINS) {
        assert.equal(after[plugin].version, "1.2.4");
        assert.equal(after[plugin].name, before[plugin].name, `${plugin}: only .version should change`);
        assert.equal(after[plugin].description, before[plugin].description, `${plugin}: only .version should change`);
        // jq always emits a trailing newline, whether or not the source had one
        // (viber's fixture manifest was written without one).
        assert.ok(fs.readFileSync(manifestPath(fx.repo.dir, plugin), "utf-8").endsWith("\n"), `${plugin}: manifest must end with a newline`);
      }

      const log = await fx.repo.git("log", "-1", "--pretty=%s");
      assert.equal(log.stdout.trim(), "chore(bump): bump version to 1.2.4");

      const localTag = await fx.repo.git("rev-parse", "refs/tags/1.2.4");
      const originTag = await fx.origin.git("rev-parse", "refs/tags/1.2.4");
      assert.equal(localTag.status, 0);
      assert.equal(originTag.status, 0);
      assert.equal(localTag.stdout.trim(), originTag.stdout.trim(), "the pushed tag must point at the same commit locally and on origin");

      const originMain = await fx.origin.git("rev-parse", "refs/heads/main");
      assert.equal(originMain.stdout.trim(), localTag.stdout.trim(), "origin's main branch must have received the bump commit");

      const calls = argvCalls(fx.argvFile);
      const releaseCreateCalls = calls.filter((c) => c[0] === "release" && c[1] === "create");
      const releaseViewCalls = calls.filter((c) => c[0] === "release" && c[1] === "view");
      assert.equal(releaseViewCalls.length, 1);
      assert.equal(releaseCreateCalls.length, 1, "gh release create should be called exactly once");
    });
  });

  test("a manifest that already ends in a newline is bumped and still ends in exactly one newline (jq must not add a second)", async () => {
    await withReleaseFixture(
      async (fx) => {
        await fx.repo.git("tag", "1.2.3");
        const result = await runRelease(bash, fx, "patch");
        assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);

        const raw = fs.readFileSync(manifestPath(fx.repo.dir, "viber"), "utf-8");
        assert.equal(readManifests(fx.repo.dir).viber.version, "1.2.4");
        assert.ok(raw.endsWith("\n"), "manifest must end with a newline");
        assert.ok(!raw.endsWith("\n\n"), "manifest must not end with two newlines");
      },
      { manifestTrailingNewline: true },
    );
  });

  test("a release body larger than the OS pipe buffer still publishes - gh exiting without draining the notes must not kill release.sh", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      // A commit whose SUBJECT alone outgrows every OS pipe buffer (64 KiB on
      // Linux, 16-64 KiB on macOS), so the notes body cannot be handed over in a
      // single non-blocking write. Passed via -F, never -m: Git-Bash caps a
      // command line at 32 KiB. The filler commit ahead of it is load-bearing -
      // `--pretty=format:` ends without a newline, so the OLDEST commit in the
      // range never reaches the body and the big one must not be it.
      const filler = await fx.repo.git("commit", "--allow-empty", "-m", "fix: filler ahead of the big subject");
      assert.equal(filler.status, 0, `seeding the filler commit should succeed: ${filler.stderr}`);
      const msgFile = path.join(fx.stateDir, "big-subject.txt");
      fs.writeFileSync(msgFile, `feat: ${"x".repeat(128 * 1024)}\n`);
      const commit = await fx.repo.git("commit", "--allow-empty", "-F", msgFile);
      assert.equal(commit.status, 0, `seeding the big-subject commit should succeed: ${commit.stderr}`);

      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");

      const calls = argvCalls(fx.argvFile);
      assert.equal(calls.filter((c) => c[0] === "release" && c[1] === "create").length, 1, "the release must still be created");
    });
  });

  test("re-run recovery: a second run at the same target version re-tags the already-committed bump instead of fabricating an empty commit, and does not re-create the GitHub release", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");

      const first = await runRelease(bash, fx, "patch");
      assert.equal(first.status, 0, `first run should succeed: ${first.stderr}`);
      assert.equal(lastStdoutLine(first.stdout), "1.2.4");

      // Simulate a run that committed + pushed the bump but crashed before (or
      // during) pushing the tag/release: the tag never made it, locally or on
      // origin, but the bump commit and the already-published release did.
      await fx.repo.git("tag", "-d", "1.2.4");
      await fx.origin.git("tag", "-d", "1.2.4");

      const second = await runRelease(bash, fx, "patch");
      assert.equal(second.status, 0, `recovery run should succeed: ${second.stderr}`);
      assert.equal(lastStdoutLine(second.stdout), "1.2.4", "recomputing from the same tag state must reach the same target version");
      assert.match(second.stderr, /1\.2\.4 already committed; re-tagging existing release commit/);

      const bumpCommits = await fx.repo.git("log", "--oneline", "--grep=chore(bump)");
      assert.equal(
        bumpCommits.stdout.trim().split("\n").filter(Boolean).length,
        1,
        "the recovery run must not fabricate a second bump commit",
      );

      const localTag = await fx.repo.git("rev-parse", "refs/tags/1.2.4");
      const originTag = await fx.origin.git("rev-parse", "refs/tags/1.2.4");
      assert.equal(localTag.status, 0, "the tag must be re-created locally");
      assert.equal(originTag.status, 0, "the tag must be re-pushed to origin");

      const calls = argvCalls(fx.argvFile);
      const releaseCreateCalls = calls.filter((c) => c[0] === "release" && c[1] === "create");
      const releaseViewCalls = calls.filter((c) => c[0] === "release" && c[1] === "view");
      assert.equal(releaseViewCalls.length, 2, "both runs check for an existing release");
      assert.equal(
        releaseCreateCalls.length,
        1,
        "gh release create must be called once overall - the recovery run finds the release already exists and skips it",
      );
    });
  });

  const createCalls = (fx: Fixture): number =>
    argvCalls(fx.argvFile).filter((c) => c[0] === "release" && c[1] === "create").length;

  test("a gh release create that fails once is retried and the release is published", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch", { createFault: "once" });
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");
      assert.equal(createCalls(fx), 2);
      assert.ok(fs.existsSync(fx.releaseFlag), "the release must be published");
    });
  });

  test("a gh release create that published the release but lost the reply is not repeated (a second create would fail on the existing release)", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch", { createFault: "lost-reply" });
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);
      assert.equal(createCalls(fx), 1);
    });
  });

  test("a gh release create that keeps failing fails the run after five attempts", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch", { createFault: "always" });
      assert.notEqual(result.status, 0);
      assert.equal(createCalls(fx), 5);
      assert.equal(readGithubOutput(result.outputFile), "", "no version is reported for an unpublished release");
    });
  });

  test("a GITHUB_REF_NAME other than main pushes the bump commit to that branch, not main", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch", { githubRefName: "release-train" });
      assert.equal(result.status, 0, `release.sh should succeed: ${result.stderr}`);

      const localHead = await fx.repo.git("rev-parse", "HEAD");
      const originBranch = await fx.origin.git("rev-parse", "refs/heads/release-train");
      assert.equal(originBranch.status, 0, "origin should gain the release-train ref");
      assert.equal(originBranch.stdout.trim(), localHead.stdout.trim());

      const originMain = await fx.origin.git("rev-parse", "-q", "--verify", "refs/heads/main");
      assert.notEqual(originMain.stdout.trim(), localHead.stdout.trim(), "main must not have received the bump commit");
    });
  });

  test("GITHUB_OUTPUT unset falls back to /dev/null without failing", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const result = await runRelease(bash, fx, "patch", { githubOutput: null });
      assert.equal(result.status, 0, `release.sh should succeed even with GITHUB_OUTPUT unset: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");
    });
  });

  test("a detached HEAD does not stop the bump commit, tag, or push", async () => {
    await withReleaseFixture(async (fx) => {
      await fx.repo.git("tag", "1.2.3");
      const detach = await fx.repo.git("checkout", "--detach", "HEAD");
      assert.equal(detach.status, 0, `detaching HEAD should succeed: ${detach.stderr}`);

      const result = await runRelease(bash, fx, "patch");
      assert.equal(result.status, 0, `release.sh should succeed from a detached HEAD: ${result.stderr}`);
      assert.equal(lastStdoutLine(result.stdout), "1.2.4");

      const originTag = await fx.origin.git("rev-parse", "refs/tags/1.2.4");
      assert.equal(originTag.status, 0, "the tag must still reach origin from a detached HEAD");
    });
  });
}
