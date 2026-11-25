/*
 * commit-task-fixture.ts - the helpers commit-task.test.ts and
 * commit-task.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/commit-task.sh. It holds no case of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/commit-task.sh");

// commit-task.sh ships mode 100755 and the implementor invokes it directly as
// `"${CLAUDE_PLUGIN_ROOT}/scripts/commit-task.sh" ...`, never through bash; the
// harness below still runs it via shell: "bash" because it is testing the
// script's content, not its exec bit (the `invocations` lint rule covers that).
export function run(dir: string, env: Record<string, string>, args: string[], timeout?: number) {
  return runScript(SUT, args, { cwd: dir, env, shell: "bash", timeout });
}

/** The dated run directory plan-path.sh owns - the plan lives in the repo, and
 *  the run's state lives beside it in status.md, which plan-index.sh --split
 *  writes with the decomposition. */
export const RUN_DIR = "docs/_specs/2026-09-20-10-00-00_feat-x";
export const PLAN_REL = `${RUN_DIR}/plan.md`;
export const STATUS_REL = `${RUN_DIR}/status.md`;

export function write(root: string, rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A plan in the template's shape: the `## Tasks` header and one `<!-- TASK -->`
 *  block per task, whose `- Files:` line is the machine-readable map the script
 *  stages literally and whose `### T<n> - <title>` heading is the commit subject
 *  it reads. It carries no progress of its own: a landed plan is never written
 *  to again. */
export function planBody(tasks: Array<[id: string, files: string, title?: string]>): string {
  return [
    "# Plan - feat x",
    "",
    "## Tasks",
    "",
    ...tasks.flatMap(([id, files, title]) => [
      "<!-- TASK -->",
      `### ${id} - ${title ?? `task ${id}`}`,
      `- Files: ${files}`,
      "<!-- /TASK -->",
      "",
    ]),
  ].join("\n");
}

/** The state file as --split leaves it: every key present, nothing done. */
export function statusBody(total: number): string {
  return `# status\n\nprogress: 0/${total}\ndone: none\nskipped: none\nunreviewed: none\ndeferred: none\nclosed: none\n`;
}

export const TWO_TASKS: Array<[string, string, string?]> = [
  ["T1", "src/a.ts"],
  ["T2", "src/b.ts"],
];

/** Commits the plan, its state file and a README so the only pending change a
 *  test sees is the one the test makes. */
export async function seed(repo: GitRepo, tasks: Array<[string, string, string?]> = TWO_TASKS): Promise<void> {
  write(repo.dir, PLAN_REL, planBody(tasks));
  write(repo.dir, STATUS_REL, statusBody(tasks.length));
  write(repo.dir, "README.md", "seed\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
}

export function readStatus(repo: GitRepo): string {
  return fs.readFileSync(path.join(repo.dir, STATUS_REL), "utf-8");
}

export async function subjects(repo: GitRepo): Promise<string[]> {
  return (await repo.git("log", "--format=%s")).stdout.trim().split("\n").filter(Boolean);
}

export async function committedFiles(repo: GitRepo): Promise<string[]> {
  return (await repo
    .git("show", "--name-only", "--format=", "HEAD"))
    .stdout.trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

export async function stagedFiles(repo: GitRepo): Promise<string[]> {
  return (await repo.git("diff", "--cached", "--name-only")).stdout.trim().split("\n").filter(Boolean).sort();
}

/** Makes `git commit` fail while `git add` keeps working - the pre-commit hook
 *  / rejected-signature class of failure, reproduced through an unresolvable
 *  gpg program rather than a hook script, because a hook needs an exec bit that
 *  Windows does not carry. */
export async function breakCommit(repo: GitRepo): Promise<void> {
  await repo.git("config", "commit.gpgsign", "true");
  await repo.git("config", "gpg.program", "p2p2-no-such-gpg");
}

/** The committed mode of one path, read from HEAD's tree. */
export async function headMode(repo: GitRepo, rel: string): Promise<string> {
  return (await repo.git("ls-tree", "HEAD", "--", rel)).stdout.split(/\s/)[0];
}

export const OUTSIDE_SUBJECT = "chore(viber): commit changes made outside the plan";

/*
 * Root cause: commit-task.sh hands a task's whole path list to ONE git call (commit_named's
 * `git rm --cached` / `git ls-files -s`, the `git diff --cached --quiet` gate, --landed's diff/status).
 * Actual: a ~36 KB command line; expected: every git command line within Windows' CreateProcess cap
 * (32767 chars), which MSYS2 reports as E2BIG. Fix: split each path-list git call into bounded chunks.
 */
export const CMDLINE_CAP = 32767;
export const MANY_PATHS = Array.from(
  { length: 260 },
  (_, i) => `src/${"a-long-module-directory-name-".repeat(4)}/file-${String(i).padStart(4, "0")}.ts`,
);

/** Puts a `git` shell function in front of the real one through BASH_ENV, refusing
 *  any command line longer than CreateProcess takes, so the Windows limit holds on
 *  every OS the suite runs on. */
export function cappedGitEnv(repo: GitRepo): Record<string, string> {
  const file = path.join(repo.dir, ".git", "cmdline-cap.sh");
  fs.writeFileSync(
    file,
    [
      "git() {",
      '  local line="git" a',
      '  for a in "$@"; do line="$line $a"; done',
      `  if [ "\${#line}" -gt ${CMDLINE_CAP} ]; then`,
      '    echo "git: Argument list too long (${#line} chars)" >&2',
      "    return 126",
      "  fi",
      '  command git "$@"',
      "}",
      "",
    ].join("\n"),
  );
  return { ...repo.env, BASH_ENV: file.replace(/\\/g, "/") };
}

export function writeMany(repo: GitRepo): void {
  for (const p of MANY_PATHS) write(repo.dir, p, `${p}\n`);
}

// Seeding a repository of a few hundred paths and running the script over it
// stays slow on Windows, so each long-list case outlasts the harness default.
export const LONG_LIST_TIMEOUT = 600000;

export const OUTCOME_REL = `${RUN_DIR}/outcome.md`;
export const OUTCOME_HEAD = "Build summary.\n\n## Leftovers\n";
export const NO_NOTE_REASON = "named by no build note: a tool output or a change outside the build";

export interface LeftoverTask {
  id: string;
  files: string;
  repro?: string;
}

export const LEFTOVER_TASKS: LeftoverTask[] = [
  { id: "T1", files: "src/a.ts" },
  { id: "T2", files: "src/b.ts, test/b.test.ts", repro: "test/b.test.ts" },
  { id: "T3", files: "src/c.ts" },
];

/** A plan plan-index.sh accepts: the leftovers form reads the index it prints.
 *  `items` are the lines of its "## Open items" section, which a plan with none
 *  does not carry. */
export function leftoversPlan(tasks: LeftoverTask[], items: string[] = []): string {
  return [
    "# Add login",
    "",
    "## Goal",
    "",
    "Users can log in.",
    "The session is durable.",
    "",
    "## Acceptance criteria",
    "",
    "1. A user with valid credentials gets a session.",
    "   The session survives a reload.",
    "",
    "## Scope",
    "",
    "### File map",
    "",
    "- add - src/login.ts - the handler",
    "",
    "### Out of scope",
    "",
    "- Password reset.",
    "",
    ...(items.length === 0 ? [] : ["## Open items", "", ...items, ""]),
    "## Tasks",
    "",
    ...tasks.flatMap((t) => [
      "<!-- TASK -->",
      `### ${t.id} - task ${t.id}`,
      `- TDD: ${t.repro ? "none" : "required"}`,
      ...(t.repro ? [`- Repro: ${t.repro}`] : []),
      "- Covers: AC1",
      "- Uses: C1",
      "- Depends-on: none",
      `- Files: ${t.files}`,
      "- Delivers: the thing",
      "- Verification: npm test -> green",
      "- DoD: it works",
      "<!-- /TASK -->",
      "",
    ]),
    "## Contracts",
    "",
    "### C1 - Login endpoint",
    "",
    "File: none",
    "",
    "POST /login -> 200 | 401",
    "",
  ].join("\n");
}

/** The three-task plan committed with its state file, then the outcome.md a closeout
 *  leaves behind (the summary and its heading line), uncommitted like the real one;
 *  `outcome: null` leaves the run without one. */
export async function seedLeftovers(
  repo: GitRepo,
  opts: { skipped?: string; outcome?: string | null; items?: string[] } = {},
): Promise<void> {
  write(repo.dir, PLAN_REL, leftoversPlan(LEFTOVER_TASKS, opts.items));
  write(repo.dir, STATUS_REL, statusBody(3).replace("skipped: none", `skipped: ${opts.skipped ?? "none"}`));
  write(repo.dir, "README.md", "seed\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-m", "seed");
  if (opts.outcome !== null) write(repo.dir, OUTCOME_REL, opts.outcome ?? OUTCOME_HEAD);
}

export function runLeftovers(repo: GitRepo, drift = "none", env: Record<string, string> = repo.env) {
  return run(repo.dir, env, ["--leftovers", PLAN_REL, "--drift", drift]);
}

export function readOutcome(repo: GitRepo): string {
  return fs.readFileSync(path.join(repo.dir, OUTCOME_REL), "utf-8");
}

export async function headSha(repo: GitRepo): Promise<string> {
  return (await repo.git("rev-parse", "--short", "HEAD")).stdout.trim();
}
