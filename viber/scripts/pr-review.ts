/*
 * pr-review.ts - the two script steps of the `pr-review` skill: `facts` names
 * the pull request to review and the file its findings go to, `post` sends that
 * file's findings into the pull request as one review. The logic that touches
 * no command lives in lib/pr-review.ts.
 *
 * It exists so the skill resolves the pull request and publishes through ONE
 * pre-approved command each, and so no model composes a `gh api` call or
 * decides per finding where it lands: a comment on a line the diff does not
 * show makes GitHub refuse the whole review, so the split is computed here from
 * the pull request's own patches. Self-verifying: REVIEW_URL is printed only
 * after gh exited 0 AND returned a well-formed review URL. Callers run it
 * through the wrapper pr-review.sh, which keeps its call line.
 *
 * Contract:
 *   argv   : `facts <arguments>` - the skill's whole argument text as ONE
 *            argument, empty included: no word (the pull request of the
 *            checked-out branch) or one word, <N>, #<N> or
 *            https://<host>/<owner>/<repo>/pull/<N> with an optional #... or
 *            ?... suffix (the shapes arg-kind.ts accepts for `pr`).
 *            `post <pull request url> <findings file>` - the PR_URL= and the
 *            FINDINGS_FILE= of a `facts` block.
 *            Anything else -> exit 2.
 *   cwd    : any directory inside the host repository; gh resolves the
 *            repository of `facts` from it. `post` reads host, owner and
 *            repository out of the URL and resolves a relative file against it.
 *   env    : PATH must resolve `gh` and, for `facts`, `git`; gh reads its usual
 *            auth and host config.
 *   file   : `post` reads the findings file, a JSON array of objects:
 *              file              path from the repository root (required)
 *              line              line of the head version of the file; absent,
 *                                0 or not a whole number -> the finding has no line
 *              severity          free text, may be absent
 *              summary           required
 *              failure_scenario  may be absent
 *            It is never modified or removed. `facts` only names it.
 *   gh     : facts: `gh pr view [<ref>] --json number,url`.
 *            post: `gh api repos/<owner>/<repo>/pulls/<N> --jq .head.sha`, then
 *            `gh api --paginate repos/<owner>/<repo>/pulls/<N>/files?per_page=100`
 *            (name and patch of each file), then `gh api -X POST
 *            repos/<owner>/<repo>/pulls/<N>/reviews --input -`, each with
 *            `--hostname <host>`. No other endpoint is called.
 *   review : event COMMENT on the head commit. A finding whose line is an added
 *            or context line of its file's patch is a comment on that line, RIGHT
 *            side, with the body
 *              **<severity>**: <summary>
 *              (blank)
 *              Failure scenario: <failure_scenario>
 *            (the severity mark and the scenario paragraph left out when empty).
 *            Every other finding is a section of the review text, under
 *            `## Findings outside the diff`: `### \`<file>:<line>\``, the same
 *            body, then on its own line
 *            https://<host>/<owner>/<repo>/blob/<head sha>/<file>#L<line>.
 *   stdout : facts, exit 0:
 *              STATUS=ready
 *              PR=<N>
 *              PR_URL=https://<host>/<owner>/<repo>/pull/<N>
 *              FINDINGS_FILE=<repo root>/.temp/viber/pr-review/<N>/findings-<yyyy-mm-dd-HH-MM-SS>.json
 *                                                 (only named, never created here)
 *            or
 *              STATUS=stop
 *              REASON=usage|no-repo|no-gh|no-pr
 *              SAY=<sentence of the reason, which the caller states and never rewords>
 *            Stop checks, in order: usage (more than one word, or a word of
 *            another shape), no-repo, no-gh, no-pr (gh pr view failed; SAY
 *            carries its first error line).
 *            post, exit 0:
 *              REVIEW_URL=https://<host>/<owner>/<repo>/pull/<N>#pullrequestreview-<id>
 *              INLINE=<findings posted as a comment on their line>
 *              OUTSIDE=<findings posted in the review text>
 *   exit   : 0 with a block; 1 with one `ERROR pr-review.sh: ...` line on stderr
 *            and nothing on stdout when gh is missing (post), a gh call failed
 *            or its answer did not parse - after a failed POST whether a review
 *            landed is unknown, so the caller reports and never retries; 2 with
 *            one ERROR line on bad arguments, a missing findings file or one
 *            that is no JSON array of findings (an empty array included):
 *            nothing was posted.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runArgKind } from "./lib/arg-kind.ts";
import { buildReview, parseFindings, parsePullUrl, patchLines } from "./lib/pr-review.ts";

interface Result {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Done {
  ok: boolean;
  missing: boolean;
  out: string;
  err: string;
}

const USAGE = "usage: pr-review.sh facts <arguments> | post <pull request url> <findings file>";

function fail(exit: number, reason: string): Result {
  return { stdout: "", stderr: `ERROR pr-review.sh: ${reason}\n`, exit };
}

function stop(reason: string, say: string): Result {
  return { stdout: `STATUS=stop\nREASON=${reason}\nSAY=${say}\n`, stderr: "", exit: 0 };
}

function run(cmd: string, args: string[], input?: string): Done {
  // The default buffer of 1 MiB would turn the patches of a large pull request into a failure.
  const done = spawnSync(cmd, args, { encoding: "utf-8", input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], maxBuffer: 1 << 28 });
  return {
    ok: done.status === 0,
    missing: (done.error as { code?: string } | undefined)?.code === "ENOENT",
    out: (done.stdout ?? "").replaceAll("\r", ""),
    err: `${done.stderr ?? ""} ${done.stdout ?? ""}`.replace(/\s+/g, " ").trim(),
  };
}

function stamp(now: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
}

function facts(text: string): Result {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length > 1 || (words.length === 1 && !runArgKind(["pr", words[0]]).stdout.startsWith("NEXT: pr"))) {
    return stop("usage", "Usage: /viber:pr-review [pull request number or URL].");
  }
  const top = run("git", ["rev-parse", "--show-toplevel"]);
  const root = top.out.trim().replaceAll("\\", "/");
  if (!top.ok || root === "") return stop("no-repo", "Not inside a git repository.");
  const ref = words.map((word) => word.replace(/^#/, "").replace(/[#?].*$/, ""));
  const view = run("gh", ["pr", "view", ...ref, "--json", "number,url"]);
  if (view.missing) return stop("no-gh", "GitHub command line tool missing.");
  if (!view.ok) return stop("no-pr", `No pull request to review: ${view.err}`);
  let url = "";
  try {
    url = String((JSON.parse(view.out) as { url?: unknown }).url ?? "");
  } catch {
    // An unparsable answer leaves the URL empty, which the check below reports.
  }
  const pr = parsePullUrl(url);
  if (!pr) return fail(1, `gh pr view returned no pull request url: ${view.err}`);
  return {
    stdout: `STATUS=ready\nPR=${pr.number}\nPR_URL=${url}\nFINDINGS_FILE=${root}/.temp/viber/pr-review/${pr.number}/findings-${stamp(new Date())}.json\n`,
    stderr: "",
    exit: 0,
  };
}

function post(url: string, file: string): Result {
  const pr = parsePullUrl(url);
  if (!pr) return fail(2, USAGE);
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return fail(2, `findings file not found: ${file}`);
  }
  const findings = parseFindings(text);
  if (typeof findings === "string") return fail(2, findings);

  const api = (args: string[], input?: string): Done => run("gh", ["api", "--hostname", pr.host, ...args], input);
  const pull = `repos/${pr.slug}/pulls/${pr.number}`;
  const head = api([pull, "--jq", ".head.sha"]);
  if (head.missing) return fail(1, "gh not found on PATH");
  const commit = head.out.trim();
  if (!head.ok || !/^[0-9a-f]{40,64}$/.test(commit)) return fail(1, `gh api pull request failed: ${head.err}`);

  // One JSON line per file, so the pages of --paginate need no joining.
  const files = api(["--paginate", `${pull}/files?per_page=100`, "--jq", '.[] | [.filename, (.patch // "")] | @json']);
  if (!files.ok) return fail(1, `gh api files failed: ${files.err}`);
  const shown = new Map<string, Set<number>>();
  try {
    for (const row of files.out.split("\n")) {
      if (row === "") continue;
      const [name, patch] = JSON.parse(row) as [string, string];
      shown.set(name, patchLines(patch));
    }
  } catch {
    return fail(1, "gh api files returned an unreadable list");
  }

  const review = buildReview(findings, shown, `https://${pr.host}/${pr.slug}/blob/${commit}`, commit);
  const sent = api(["-X", "POST", `${pull}/reviews`, "--input", "-", "--jq", ".html_url"], JSON.stringify(review.payload));
  const link = sent.out.trim();
  if (!sent.ok || !/^https:\/\/\S+\/pull\/[0-9]+#pullrequestreview-[0-9]+$/.test(link)) {
    return fail(1, `gh api review failed, whether a review landed is unknown: ${sent.err}`);
  }
  return { stdout: `REVIEW_URL=${link}\nINLINE=${review.inline}\nOUTSIDE=${review.outside}\n`, stderr: "", exit: 0 };
}

function main(argv: string[]): Result {
  if (argv[0] === "facts" && argv.length === 2) return facts(argv[1]);
  if (argv[0] === "post" && argv.length === 3) return post(argv[1], argv[2]);
  return fail(2, USAGE);
}

const result = main(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exit;
