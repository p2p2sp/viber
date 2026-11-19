/*
 * plan-path-fixture.ts - the helpers plan-path.test.ts and
 * plan-path.critical.test.ts share: what both tiers need to seed a case and
 * run viber/scripts/plan-path.sh. It holds no case of its own.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { slash } from "../harness/paths.ts";
import { withGitRepo, withTempDir, type GitRepo } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/scripts/plan-path.sh");

/** The run directory's name: the landing stamp, then the normalized slug. */
export const KEY_SHAPE = /^(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})_([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function run(dir: string, args: string[] = [], stubDirs?: string[]) {
  return runScript(SUT, args, { cwd: dir, shell: "bash", stubDirs });
}

export interface Resolved {
  path: string;
  key: string;
  state: string;
}

export function parse(stdout: string): Resolved {
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
export function slugOf(key: string): string {
  const match = KEY_SHAPE.exec(key);
  assert.ok(match, `key is not <stamp>_<slug>: ${key}`);
  return match[2];
}

/** A landed plan: the run directory plus its plan.md, with a pinned mtime so
 *  "most recently worked on" is decided by the test, not by the filesystem. */
export function landPlan(root: string, key: string, mtime = "2026-01-01T00:00:00Z", body?: string): string {
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
export function sourcePlan(dir: string, name: string, body: string): string {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
}

/** A landed plan carrying N task blocks, so a run has something to be open about. */
export function planWithTasks(title: string, ids: string[]): string {
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
export function runDirs(root: string): string[] {
  const specs = path.join(root, "docs", "_specs");
  return fs.existsSync(specs) ? fs.readdirSync(specs).sort() : [];
}

/** A plan the way one lands for a build: a head, then the task half. */
export const PLAN_BODY = [
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

/** A plan whose frontmatter carries the given lines after `source:`. */
export function withFrontmatter(lines: string[], body: string): string {
  return ["---", "source: /elsewhere/plans/round.md", ...lines, "---", "", body].join("\n");
}

/** A plan whose frontmatter lists `name: path` attachments, indented under `attachments:`. */
export function withAttachments(entries: string[], body: string): string {
  return withFrontmatter(["attachments:", ...entries.map((entry) => `  ${entry}`)], body);
}

/** A file under the host's `.temp/`, where the skills write the files a plan is built from. */
export function attachment(root: string, name: string, content: string | Buffer): string {
  const file = path.join(root, ".temp", "viber", "attach", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** The POSIX spelling of an absolute path: as is off Windows, `/c/...` on it. */
export function posixForm(file: string): string {
  return process.platform === "win32" ? slash(file).replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`) : file;
}

/** A repository on `main` with one commit carrying the branching group, so the
 *  base exists and the tree starts clean. The group's lines are the test's. */
export async function withBranchRepo(branching: string[], fn: (repo: GitRepo) => void | Promise<void>): Promise<void> {
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
export function workEntry(key: string, base: string, name: string, target: string): string[] {
  return [`  ${key}:`, `    base: ${base}`, `    name: '${name}'`, `    target: ${target}`];
}

/** The work entries a landing case runs against unless it names its own: one
 *  entry cut from and returning to main, named from the plan type and slug. */
export const ON_MAIN = ["work:", ...workEntry("feature", "main", "{type}/{slug}", "main")];

/** plan-path.sh run inside the throwaway repository, with its pinned git identity. */
export function runIn(repo: GitRepo, args: string[] = [], stubDirs?: string[]) {
  return runScript(SUT, args, { cwd: repo.dir, shell: "bash", env: repo.env, stubDirs });
}

/** The branch HEAD names, or "HEAD" when it is detached. */
export async function headOf(repo: GitRepo): Promise<string> {
  return (await repo.git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();
}

/** The commit a revision points at. */
export async function commitOf(repo: GitRepo, rev = "HEAD"): Promise<string> {
  return (await repo.git("rev-parse", rev)).stdout.trim();
}

/** `git status --porcelain`, so a test can assert the tree came through as it was. */
export async function treeOf(repo: GitRepo): Promise<string> {
  return (await repo.git("status", "--porcelain")).stdout;
}

/** A second commit on a new branch, HEAD back where it was: a branch at another commit. */
export async function branchAhead(repo: GitRepo, name: string): Promise<void> {
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
export async function withSource(frontmatter: string[], fn: (src: string) => void | Promise<void>, body = PLAN_BODY): Promise<void> {
  await withTempDir("p2p2-plans-", async (plans) => {
    const text = frontmatter.length ? ["---", ...frontmatter, "---", "", body].join("\n") : body;
    await fn(sourcePlan(plans, "approved.md", text));
  });
}

/** The `branch:` line of one resolution, or undefined when none was printed. */
export function branchLine(stdout: string): string | undefined {
  return slash(stdout)
    .split("\n")
    .find((line) => line.startsWith("branch: "));
}

/** The report lines starting with `prefix`, in the order printed. */
export function linesOf(stdout: string, prefix: string): string[] {
  return slash(stdout)
    .split("\n")
    .filter((line) => line.startsWith(prefix));
}

/** One entry named from the plan type and slug, cut from and returning to main. */
export const SINGLE = ["mode: required", "work:", ...workEntry("feature", "main", "{type}/{slug}", "main")];

/** A second commit on the current branch, so it sits one ahead of any branch cut before it. */
export async function commitOnHead(repo: GitRepo): Promise<void> {
  fs.writeFileSync(path.join(repo.dir, "ahead.txt"), "ahead\n");
  await repo.git("add", "-A");
  await repo.git("commit", "-q", "-m", "ahead");
}

/** Two entries cut from main and both usable without an issue, no mapping choosing. */
export function twoEntries(mode: string): string[] {
  return [`mode: ${mode}`, "work:", ...workEntry("feature", "main", "feature/{slug}", "main"), ...workEntry("chore", "main", "chore/{slug}", "main")];
}

/** HEAD on a new branch one commit ahead of main: not at any base. */
export async function workAhead(repo: GitRepo): Promise<void> {
  await repo.git("checkout", "-q", "-b", "work");
  await commitOnHead(repo);
}

/** The plugin root the run: commands open on: the directory above the scripts directory. */
export const PLUGIN_ROOT = slash(path.resolve(import.meta.dirname, "../../viber"));
