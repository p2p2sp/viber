/*
 * diff-files.ts - the diff-files core: settles the base of the "current diff"
 * audit scope and lists the files changed against it. The contract and the
 * base rules live in the header of
 * ../skills/code-auditor/scripts/diff-files.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { byteOrder } from "./byte-order.ts";
import type { Fs, Git } from "./ports.ts";
import { repoPrefix } from "./repo-prefix.ts";

export interface DiffFilesResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const ORIGIN = "refs/remotes/origin/";
const OWN = ".temp/viber/code-auditor/";

/** The label of the base line and the commit the diff is taken against: null for the empty tree. */
function baseOf(git: Git, top: string, head: string): { label: string; base: string } {
  // The default branch: the target of origin/HEAD, else local main, else local master.
  let ref = "";
  let short = "";
  const origin = git.symbolicRef(top, `${ORIGIN}HEAD`);
  if (origin !== null && git.commit(top, origin) !== null) {
    ref = origin;
    short = origin.startsWith(ORIGIN) ? origin.slice(ORIGIN.length) : origin;
  } else if (git.commit(top, "refs/heads/main") !== null) {
    ref = "refs/heads/main";
    short = "main";
  } else if (git.commit(top, "refs/heads/master") !== null) {
    ref = "refs/heads/master";
    short = "master";
  }
  const current = git.branch(top);
  if (ref !== "" && current !== null && current !== short) {
    const fork = git.mergeBase(top, "HEAD", ref);
    if (fork !== null) return { label: fork, base: fork };
  }
  return { label: "HEAD", base: head };
}

/** The stdout, stderr and exit code of one diff-files call. Never throws. */
export function runDiffFiles(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): DiffFilesResult {
  const given = argv[0] ?? "";
  const explicit = argv[1] ?? "";
  if (given === "") return { stdout: "", stderr: "usage: diff-files.sh <repo-root> [<base>]\n", exit: 2 };
  const refuse = (line: string): DiffFilesResult => ({ stdout: `${line}\n`, stderr: "", exit: 1 });

  const dir = absolutePath(given.replaceAll("\\", "/"), cwd.replaceAll("\\", "/"));
  const top = ports.git.repoRoot(dir);
  if (top === null) return refuse(`NOT_A_REPO ${given}`);

  const head = ports.git.commit(top, "HEAD");
  let label = "none";
  let base: string | null = null;
  if (explicit !== "") {
    const sha = explicit.startsWith("-") ? null : ports.git.commit(top, explicit);
    if (sha === null) return refuse(`BAD_BASE ${explicit}`);
    label = sha;
    base = sha;
  } else if (head !== null) {
    ({ label, base } = baseOf(ports.git, top, head));
  }

  // Every path is printed relative to the directory given, and only one below it; a deleted or unmerged file is left out.
  const prefix = repoPrefix(dir, top, ports.fs);
  const changed = ports.git.changedFiles(top, base).filter((file) => /^[ACMRT]$/.test(file.status));
  const paths = new Set<string>();
  for (const path of [...changed.map((file) => file.path), ...ports.git.untrackedFiles(top)]) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    if (rel !== "" && !rel.startsWith(OWN)) paths.add(rel);
  }
  return { stdout: [`BASE ${label}`, ...[...paths].sort(byteOrder)].map((line) => `${line}\n`).join(""), stderr: "", exit: 0 };
}
