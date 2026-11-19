/*
 * qa-comment-fixture.ts - the helpers qa-comment.test.ts and
 * qa-comment.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/qa-comment.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript, type RunResult } from "../harness/run.ts";
import { withGitRepo, type GitRepo } from "../harness/tmp.ts";
import { withStub } from "../harness/stub.ts";
import { forEachShell, type Shell } from "../harness/shells.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/qa-comment.sh");

export async function assertPosix(fn: (shell: Shell) => void | Promise<void>) {
  const skips = await forEachShell("posix", fn);
  for (const skip of skips) {
    assert.equal(skip.kind, "posix");
    assert.ok(skip.reason.length > 0, "a skip must record a reason");
  }
}

export const KEY = "2026-01-01-00-00-00_thing";
export const QA_REL = `docs/_specs/${KEY}/qa.md`;
export const QA_TEXT = "# Thing\n\n## What changed\nA person can now post.\n\n| # | Step | Expected result |\n| --- | --- | --- |\n";
export const PR_URL = "https://github.com/acme/widgets/pull/7";
export const COMMENT_URL = `${PR_URL}#issuecomment-99`;
export const ISSUE_URL = "https://github.com/acme/widgets/issues/12";

/** A `gh` stub logging its argv one-arg-per-line (a "===" separator after
 *  each call) into `$ARGV_FILE`. `pr list` prints the raw `--jq` rows the script
 *  asks for, `<isCrossRepository> <url>`: one `true` row per URL of
 *  PR_FORK_LIST, then one `false` row per URL of PR_LIST; `pr|issue view`
 *  prints COMMENTS or fails on VIEW_FAIL; `pr|issue comment` copies its
 *  --body-file into `$BODY_LOG`, then fails on POST_FAIL or prints POST_OUT
 *  (default: a pull request comment URL). */
export const GH_STUB = `
for a in "$@"; do printf '%s\\n' "$a" >> "$ARGV_FILE"; done; printf '===\\n' >> "$ARGV_FILE"
case "$1 $2" in
  "pr list")
    for u in \${PR_FORK_LIST:-}; do printf 'true %s\\n' "$u"; done
    for u in \${PR_LIST:-}; do printf 'false %s\\n' "$u"; done ;;
  "pr view"|"issue view")
    if [ -n "\${VIEW_FAIL:-}" ]; then echo "HTTP 401: Bad credentials" >&2; exit 1; fi
    printf '%s' "\${COMMENTS:-}" ;;
  "pr comment"|"issue comment")
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--body-file" ]; then cat "$a" > "$BODY_LOG"; fi
      prev=$a
    done
    if [ -n "\${POST_FAIL:-}" ]; then echo "HTTP 500: server error" >&2; exit 1; fi
    printf '%s\\n' "\${POST_OUT-${COMMENT_URL}}" ;;
esac
exit 0
`;

export interface Outcome {
  result: RunResult;
  calls: string[][];
  body: string | null;
}

export interface RunOpts {
  env?: Record<string, string>;
  /** Repo-relative directory the script runs in (default: the repo root). */
  cwd?: string;
  /** Runs after the qa file is written, before the script. */
  setup?: (repo: GitRepo) => Promise<void>;
  /** Write no qa file. */
  noFile?: boolean;
}

/** Runs qa-comment.sh inside a fresh repo holding QA_REL, with the gh stub
 *  first on PATH. Returns the result, every logged gh call and the body gh
 *  was handed (null when nothing was posted). */
export async function runInRepo(shell: Shell, args: string[], opts: RunOpts = {}): Promise<Outcome> {
  return await withGitRepo((repo) =>
    withStub("gh", GH_STUB, async (stubDir) => {
      if (!opts.noFile) {
        fs.mkdirSync(path.join(repo.dir, path.dirname(QA_REL)), { recursive: true });
        fs.writeFileSync(path.join(repo.dir, QA_REL), QA_TEXT);
      }
      if (opts.setup) await opts.setup(repo);
      const argvFile = path.join(repo.dir, "argv.log");
      const bodyLog = path.join(repo.dir, "body.log");
      fs.writeFileSync(argvFile, "");
      const cwd = path.join(repo.dir, opts.cwd ?? "");
      fs.mkdirSync(cwd, { recursive: true });
      const env = { ...repo.env, ARGV_FILE: argvFile, BODY_LOG: bodyLog, ...opts.env };
      const result = await runScript(SUT, args, { shell, cwd, env, stubDirs: [stubDir] });
      const calls = fs
        .readFileSync(argvFile, "utf-8")
        .split("===\n")
        .map((block) => block.split("\n").filter((line) => line.length > 0))
        .filter((call) => call.length > 0);
      const body = fs.existsSync(bodyLog) ? fs.readFileSync(bodyLog, "utf-8") : null;
      return { result, calls, body };
    }),
  );
}

export function posts(calls: string[][]): string[][] {
  return calls.filter((c) => c[1] === "comment");
}

/** A setup writing the run's spec.md beside the qa file with `text` as its content. */
export function specWith(text: string): (repo: GitRepo) => Promise<void> {
  return async (repo) => {
    fs.writeFileSync(path.join(repo.dir, path.dirname(QA_REL), "spec.md"), text);
  };
}

export const SPEC_WITH_ISSUE = `---\r\nissue: ${ISSUE_URL}\r\n---\r\n\r\n# Thing\n`;

export const EXPECTED_BODY = `<!-- viber:qa ${QA_REL} -->\nQA document: \`${QA_REL}\`\n\n${QA_TEXT}`;

export function assertOneError(result: RunResult) {
  assert.equal(result.status, 1, `stdout: ${result.stdout}`);
  assert.equal(result.stdout, "");
  const lines = result.stderr.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 1, `expected a single ERROR line, got:\n${result.stderr}`);
  assert.match(lines[0], /^ERROR qa-comment\.sh: /);
}
