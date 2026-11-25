/*
 * archive-run.ts - the archive-run core: moves a finished run's lasting work
 * into the archive, drops the scaffolding and commits the move. The contract
 * lives in the header of ../scripts/archive-run.ts.
 */

import { directory } from "./config/block.ts";
import { readChildren } from "./config/lines.ts";
import { baseOf, type MapAnswer } from "./map-answer.ts";
import type { Fs, Git, GitWrite } from "./ports.ts";
import { repoPrefix } from "./repo-prefix.ts";

const SCAFFOLD = ["plan.md", "status.md", "tasks", "work"];
const OPEN = /^\s*<!--\s*TASK\s*-->\s*$/;
const CLOSE = /^\s*<!--\s*\/TASK\s*-->\s*$/;

const stop = (exit: number, reason: string): MapAnswer => ({ stdout: "", stderr: reason === "" ? "" : `error: ${reason}\n`, exit });

/** The distinct task ids the TASK blocks of a plan declare; a marker opens a block only when it stands alone on its line. */
function taskIds(plan: string): Set<string> {
  const ids = new Set<string>();
  let open = false;
  for (const line of plan.split("\n")) {
    if (OPEN.test(line)) open = true;
    else if (CLOSE.test(line)) open = false;
    else if (open && /^###\s/.test(line)) {
      const id = line.replace(/^###\s*/, "").split(" - ")[0].trimEnd();
      if (id !== "") ids.add(id);
      open = false;
    }
  }
  return ids;
}

/** The ids the done: and skipped: lines of a status file name. */
function settledIds(status: string): Set<string> {
  const lines = status.split("\n").filter((line) => /^(done|skipped):/.test(line));
  return new Set(lines.flatMap((line) => line.replace(/^[a-z]+:/, "").split(/\s+/)));
}

/** The regular files below dir, no link followed or counted. */
function countFiles(dir: string, fs: Fs): number {
  if (fs.isLink(dir)) return 0;
  if (fs.kind(dir) === "file") return 1;
  return fs.listDir(dir).reduce((n, name) => n + countFiles(`${dir}/${name}`, fs), 0);
}

/** Removes what a build and its planning left under .temp/viber/: an enumerated list, so every other skill keeps its files. Best effort. */
function clearScratch(top: string, ids: Iterable<string>, fs: Fs): void {
  const temp = `${top}/.temp/viber`;
  if (fs.kind(temp) !== "dir") return;
  const matching = (dir: string, re: RegExp): string[] => fs.listDir(`${temp}${dir}`).filter((name) => re.test(name)).map((name) => `${dir}/${name}`.replace(/^\//, ""));
  // Only a plain name becomes a path: an id like ".." would reach outside .temp/viber/.
  const tasks = [...ids].filter((id) => /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== "..");
  const gone = [
    ...tasks,
    "lessons",
    "test-runner",
    "final-fix",
    ...matching("", /^(repair|extension)-/),
    ...matching("/intent", /^summary-.*\.md$/s),
    ...matching("/planner", /^reach-.*\.md$/s),
    "planner/review-round",
    "fixer/tree-record",
  ];
  for (const name of gone) fs.removeTree(`${temp}/${name}`);
}

/** An absolute path below root as its relative form, links resolved; any other path as it is. */
function rootRelative(dir: string, root: string, fs: Fs): string {
  if (!/^(\/|[A-Za-z]:\/)/.test(dir)) return dir;
  if (fs.kind(dir) === "dir") return repoPrefix(dir, root, fs).replace(/\/$/, "") || dir;
  const cut = dir.lastIndexOf("/");
  const parent = repoPrefix(dir.slice(0, cut), root, fs);
  return parent === "" ? dir : parent + dir.slice(cut + 1);
}

/** The stdout, stderr and exit code of one archive-run call. */
export function runArchiveRun(argv: string[], cwd: string, { fs, git, write }: { fs: Fs; git: Git; write: GitWrite }): MapAnswer {
  const raw = argv[0] ?? "";
  if (argv.length !== 1 || raw === "") return stop(2, "usage: archive-run.sh <run-dir>");

  const here = cwd.replaceAll("\\", "/");
  const inGit = git.isRepository(here);
  const root = (inGit ? git.repoRoot(here) : null) ?? here;
  const top = root.replace(/\/$/, "");

  let dir = raw.replaceAll("\\", "/").replace(/\/+$/, "").replace(/^\.\//, "");
  if (dir === "" || baseOf(dir) === ".") return stop(2, `refused ${raw} - no run key`);

  const config = readChildren(fs.readText(`${top}/.claude/viber.yml`) ?? "");
  const runs = `docs/${directory(config.get("directories.runs"), "_specs")}`;
  const specs = `docs/${directory(config.get("directories.specifications"), "specs")}`;

  if (`/${dir}/`.includes("/../")) return stop(2, `refused ${dir} - a run directory carries no '..' segment`);
  // Only once the '..' gate has seen the path as written: resolving it would fold the segment away.
  dir = rootRelative(dir, root, fs);
  if (!dir.startsWith(`${runs}/`)) return stop(2, `refused ${dir} - a run directory lives under ${runs}/`);
  if (fs.kind(`${top}/${dir}`) !== "dir") return stop(2, `run directory not found: ${dir}`);
  if (fs.kind(`${top}/${dir}/status.md`) !== "file") return stop(2, `refused ${dir} - no status.md, so this is not a run directory`);

  // Settled counts the plan's own ids: one that names no task of it counts for nothing.
  const ids = taskIds(fs.readText(`${top}/${dir}/plan.md`) ?? "");
  const named = settledIds(fs.readText(`${top}/${dir}/status.md`) ?? "");
  const settled = [...ids].filter((id) => id !== "none" && id !== "-" && named.has(id)).length;
  if (settled < ids.size) return stop(4, `refused ${dir} - the run is unfinished: ${settled} of ${ids.size} tasks settled`);

  const key = baseOf(dir);
  const dest = `${specs}/${key}`;
  if (fs.exists(`${top}/${dest}`)) return stop(3, `${dest} already exists - nothing was moved`);
  if (!fs.makeDir(`${top}/${specs}`)) return stop(1, `could not create ${specs} - nothing was moved`);

  if (!inGit) {
    if (!fs.move(`${top}/${dir}`, `${top}/${dest}`)) return stop(1, `could not move ${dir} to ${dest} - nothing was moved`);
    for (const leaf of SCAFFOLD) {
      if (!fs.removeTree(`${top}/${dest}/${leaf}`)) return stop(1, `could not remove ${dest}/${leaf} - the move stands`);
    }
    fs.removeEmptyDir(`${top}/${runs}`);
    clearScratch(top, ids, fs);
    return { stdout: `ARCHIVED: ${dest} (${countFiles(`${top}/${dest}`, fs)} files - no git repository)\n`, stderr: "", exit: 0 };
  }

  // One rename of the whole directory: an edit of spec.md made before the call lands as rename plus modification.
  if (write.move(root, dir, dest) !== 0) return stop(5, `could not move ${dir} to ${dest} - nothing was moved`);
  for (const leaf of SCAFFOLD) {
    const left = `could not remove ${dest}/${leaf} - the move stands, nothing was committed`;
    if (write.removeTracked(root, `${dest}/${leaf}`) !== 0) return stop(5, left);
    if (!fs.removeTree(`${top}/${dest}/${leaf}`)) return stop(1, left);
  }
  // git removes the directory with its last file: a run of scaffolding alone has nothing to archive.
  if (!fs.exists(`${top}/${dest}`)) return stop(1, `${dest} holds no file - the move stands, nothing was committed`);
  const n = countFiles(`${top}/${dest}`, fs);
  const paths = [dir];
  if (n > 0) {
    const exit = write.stageAll(root, dest);
    if (exit !== 0) return stop(5, "");
    paths.push(dest);
  } else {
    fs.removeEmptyDir(`${top}/${dest}`);
  }
  fs.removeEmptyDir(`${top}/${runs}`);
  if (git.commit(root, "HEAD") === null) return stop(5, "HEAD names no commit - the move stands, nothing was committed");
  if (write.commit(root, `docs(viber): archive run ${key}`, paths, true) !== 0) return stop(5, "");
  clearScratch(top, ids, fs);
  return { stdout: `ARCHIVED: ${dest} (${n} files)\n`, stderr: "", exit: 0 };
}
