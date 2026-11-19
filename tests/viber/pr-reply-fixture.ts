/*
 * pr-reply-fixture.ts - the helpers pr-reply.test.ts and
 * pr-reply.critical.test.ts share: what both tiers need to seed a case and run
 * viber/scripts/pr-reply.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo } from "../harness/tmp.ts";
import { slash } from "../harness/paths.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/pr-reply.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const PR_URL = "https://github.com/acme/widgets/pull/42";
export const REPLY_URL = `${PR_URL}#discussion_r777`;
export const ISSUE_REPLY_URL = `${PR_URL}#issuecomment-888`;
export const MARKER = "<!-- viber:pr-feedback 101 -->";
export const REPLY_TEXT = "Fixed in abc123.\n\nThe guard now runs first.\r\nNo trailing newline";
export const ORIGINAL_URL = `${PR_URL}#issuecomment-55`;
export const ORIGINAL_QUOTE = "Please rename this helper";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after each
 *  call) into `$ARGV_FILE`. A call with `-X` is the POST: it copies the file of
 *  its `-F body=@<file>` into `$BODY_LOG`, then fails on POST_FAIL or prints
 *  POST_OUT (default: a review comment URL, or an issue comment URL when the POST
 *  goes to the issue comments endpoint). A read of an issue comment or a review
 *  prints ORIGINAL or fails on ORIGINAL_FAIL. Any other call is the comments
 *  read: it prints COMMENTS or fails on READ_FAIL. */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
post=""
kind=""
endpoint=""
for a in "$@"; do
  if [ "$a" = "-X" ]; then post=yes; fi
  case $a in repos/*) endpoint=$a ;; esac
  case $a in
    body=@*) cat "\${a#body=@}" > "$BODY_LOG" ;;
    repos/*/issues/comments/*|repos/*/pulls/*/reviews/*) kind=original ;;
    repos/*/issues/*/comments) kind=issues ;;
  esac
done
if [ -n "$post" ]; then
  if [ -n "\${POST_FAIL:-}" ]; then echo "HTTP 500: server error" >&2; exit 1; fi
  if [ -n "\${POST_FAIL_ON:-}" ]; then
    case $endpoint in *"$POST_FAIL_ON"*) echo "HTTP 500: server error" >&2; exit 1 ;; esac
  fi
  if [ "\${POST_OUT+set}" = set ]; then printf '%s' "$POST_OUT"; exit 0; fi
  if [ "$kind" = issues ]; then printf '%s\\n' "${ISSUE_REPLY_URL}"; else printf '%s\\n' "${REPLY_URL}"; fi
  exit 0
fi
if [ "$kind" = original ]; then
  if [ -n "\${ORIGINAL_FAIL:-}" ]; then echo "HTTP 404: Not Found" >&2; exit 1; fi
  printf '%s' "\${ORIGINAL:-}"
  exit 0
fi
if [ -n "\${READ_FAIL:-}" ]; then echo "HTTP 401: Bad credentials" >&2; exit 1; fi
printf '%s' "\${COMMENTS:-}"
exit 0
`;

export interface Outcome {
  result: RunResult;
  calls: string[][];
  body: string | null;
  /** The content of .temp/viber/pr-feedback/42/posted/<key>.md after the run (null when absent). */
  kept: string | null;
}

export interface RunOpts {
  env?: Record<string, string>;
  /** Write no reply file. */
  noFile?: boolean;
  /** The remark key whose kept body file is read back (default: the thread 101). */
  key?: string;
}

/** Runs pr-reply.sh inside a fresh repo holding reply.md (REPLY_TEXT), with the
 *  gh stub first on PATH. The token "<file>" in `args` becomes "reply.md". */
export async function runInRepo(shell: Shell, args: string[], opts: RunOpts = {}): Promise<Outcome> {
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      if (!opts.noFile) fs.writeFileSync(path.join(repo.dir, "reply.md"), REPLY_TEXT);
      const argvFile = path.join(repo.dir, "argv.log");
      const bodyLog = path.join(repo.dir, "body.log");
      fs.writeFileSync(argvFile, "");
      const real = args.map((a) => (a === "<file>" ? "reply.md" : a));
      const original = `${ORIGINAL_URL}\n${ORIGINAL_QUOTE}\n`;
      const env = { ...repo.env, ARGV_FILE: argvFile, BODY_LOG: bodyLog, ORIGINAL: original, ...opts.env };
      const result = await runScript(SUT, real, { shell, cwd: repo.dir, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      const body = fs.existsSync(bodyLog) ? fs.readFileSync(bodyLog, "utf-8") : null;
      const keptFile = path.join(repo.dir, `.temp/viber/pr-feedback/42/posted/${opts.key ?? "101"}.md`);
      const kept = fs.existsSync(keptFile) ? fs.readFileSync(keptFile, "utf-8") : null;
      return { result, calls, body, kept };
    }),
  );
}
export const posts = (calls: string[][]) => calls.filter((c) => c.includes("-X"));
export const EXPECTED_BODY = `${MARKER}\n\n${REPLY_TEXT}`;

export function assertOneError(result: RunResult) {
  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, "");
  const lines = result.stderr.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
  assert.match(lines[0], /^ERROR pr-reply\.sh: /);
}

export interface Item {
  k: number;
  where: string;
  key: string;
  /** Whether the section's reply file exists. */
  ready: boolean;
}

export interface ListOpts {
  /** The items of the review.md; absent writes no review.md. */
  items?: Item[];
  /** The pull request number whose pr-feedback directory holds the review. */
  n?: number;
  /** The script to run (default: the shipped one). */
  script?: string;
  /** The mode flag (default: --list). */
  flag?: string;
  /** Extra environment of the run (the gh stub's controls). */
  env?: Record<string, string>;
}

export interface ListOutcome {
  result: RunResult;
  /** The length of the gh stub's argv log: 0 when gh was never called. */
  calls: number;
  /** The gh calls of the run, one argv per call. */
  argv: string[][];
}

export const sectionOf = (dir: string, n: number, item: Item) =>
  [
    `## ${item.k} - problem - ${item.where}`,
    `- Kind: ${item.key.startsWith("comment-") ? "conversation" : "thread"}`,
    `- Comment: ${item.key}`,
    `- Reply file: ${dir}/.temp/viber/pr-feedback/${n}/replies/${item.key}.md`,
    "- Expected: rename the helper",
    "",
    "> Please rename this helper",
    "",
  ].join("\n");

/** Runs `pr-reply.sh --list <pr>` in a fresh repo whose review.md holds `items`
 *  (a reply file written for each ready one), the gh stub first on PATH. */
export async function runList(shell: Shell, pr: string, opts: ListOpts = {}): Promise<ListOutcome> {
  const n = opts.n ?? 42;
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      const dir = slash(repo.dir);
      const argvFile = path.join(repo.dir, "argv.log");
      fs.writeFileSync(argvFile, "");
      if (opts.items) {
        const feedback = path.join(repo.dir, `.temp/viber/pr-feedback/${n}`);
        fs.mkdirSync(path.join(feedback, "replies"), { recursive: true });
        fs.writeFileSync(
          path.join(feedback, "review.md"),
          `# Review of pull request ${n}\n\n${opts.items.map((item) => sectionOf(dir, n, item)).join("\n")}`,
        );
        for (const item of opts.items) {
          if (item.ready) fs.writeFileSync(path.join(feedback, `replies/${item.key}.md`), "Done.\n");
        }
      }
      const env = {
        ...repo.env,
        ARGV_FILE: argvFile,
        BODY_LOG: path.join(repo.dir, "body.log"),
        ORIGINAL: `${ORIGINAL_URL}\n${ORIGINAL_QUOTE}\n`,
        ...opts.env,
      };
      const result = await runScript(opts.script ?? SUT, [opts.flag ?? "--list", pr], {
        shell,
        cwd: repo.dir,
        env,
        stubDirs: [stubDir],
      });
      const logged = fs.readFileSync(argvFile, "utf-8");
      const argv = logged
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      return { result, calls: logged.length, argv };
    }),
  );
}

export const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));
export const THREE_ITEMS: Item[] = [
  { k: 1, where: "src/a.ts:10", key: "101", ready: true },
  { k: 2, where: "review", key: "review-9", ready: false },
  { k: 3, where: "conversation", key: "comment-55", ready: true },
];
