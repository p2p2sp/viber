/*
 * pr-threads-fixture.ts - the helpers pr-threads.test.ts and
 * pr-threads.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/pr-threads.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { coreUtilsPath, withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-threads.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const PR_URL = "https://github.com/acme/widgets/pull/7";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after each
 *  call) into `$ARGV_FILE`; its stdout, stderr and exit code come from env vars. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
if [ -n "\${GH_STDERR:-}" ]; then printf '%s' "$GH_STDERR" >&2; fi
printf '%s' "\${GH_STDOUT:-}"
exit "\${GH_EXIT:-0}"
`;

export interface Scene {
  work: GitRepo;
  stubDir: string;
  argvFile: string;
  sha: string;
}

/** A work repo with one commit on `feature/x` and a `gh` stub first on PATH. */
export async function withScene<T>(fn: (scene: Scene) => Promise<T>): Promise<T> {
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

export interface FixtureComment {
  id: number;
  author: string;
  at: string;
  body: string;
}

export interface FixtureThread {
  resolved?: boolean;
  outdated?: boolean;
  line?: number;
  originalLine?: number;
  path: string;
  comments: FixtureComment[];
}

/** One thread as the --jq filter prints it: a T line, then per comment a C line and one B line per body line. */
export function threadText(t: FixtureThread): string {
  const head = `T\t${t.resolved ?? false}\t${t.outdated ?? false}\t${t.line ?? ""}\t${t.originalLine ?? ""}\t${t.path}\n`;
  const comments = t.comments.map(
    (c) => `C\t${c.id}\t${c.author}\t${c.at}\n` + c.body.split("\n").map((l) => `B\t${l}\n`).join(""),
  );
  return head + comments.join("");
}

export interface FixtureRemark {
  kind: "conversation" | "review";
  id: number;
  author: string | null;
  bot?: boolean;
  at?: string;
  state?: string;
  body: string;
}

/** One remark as the --jq filter prints it: an R line (an empty author field is a null author), then one Q line per body line. */
export function remarkText(r: FixtureRemark): string {
  const head = `R\t${r.kind}\t${r.id}\t${r.author ?? ""}\t${r.bot ?? false}\t${r.at ?? "2026-10-01T10:00:00Z"}\t${r.state ?? ""}\n`;
  return head + (r.body === "" ? "" : r.body.split("\n").map((l) => `Q\t${l}\n`).join(""));
}

export interface GhOutOpts {
  url?: string;
  more?: boolean;
  commentsMore?: boolean;
  reviewsMore?: boolean;
  prAuthor?: string | null;
  remarks?: FixtureRemark[];
  threads?: FixtureThread[];
}

/** What the real gh prints once its --jq filter ran. */
export function ghOut(head: string, oid: string, opts: GhOutOpts = {}): string {
  const header =
    `URL=${opts.url ?? PR_URL}\nHEAD=${head}\nOID=${oid}\nMORE=${opts.more ?? false}\n` +
    `CMORE=${opts.commentsMore ?? false}\nRMORE=${opts.reviewsMore ?? false}\nAUTH=${opts.prAuthor === undefined ? "pat" : (opts.prAuthor ?? "")}\n`;
  return header + (opts.remarks ?? []).map(remarkText).join("") + (opts.threads ?? []).map(threadText).join("");
}

export function comment(id: number, author: string, body: string, at = "2026-10-01T10:00:00Z"): FixtureComment {
  return { id, author, at, body };
}

export async function runThreads(
  shell: Shell,
  scene: Scene,
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string; noGh?: boolean } = {},
): Promise<RunResult> {
  const env = { ...scene.work.env, ARGV_FILE: scene.argvFile, ...(opts.noGh ? { PATH: coreUtilsPath() } : {}), ...opts.env };
  return await runScript(SUT, args, { shell, cwd: opts.cwd ?? scene.work.dir, env, stubDirs: opts.noGh ? [] : [scene.stubDir] });
}

export function lines(result: RunResult): string[] {
  return result.stdout.split("\n").filter((l) => l.length > 0);
}

export const THREADS_PATH = ".temp/viber/pr-feedback/7/threads.md";
