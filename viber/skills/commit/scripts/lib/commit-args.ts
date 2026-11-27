/*
 * commit-args.ts - the argument reading of the commit skill, shared by
 * commit-context (which measures the selected set) and commit (which stages
 * it), so the two never read one selector two ways. Only where a relative token
 * is read from differs: commit-context tries the cwd first, then the root;
 * commit reads the root-relative paths of the RUN: line from the root alone.
 * The contract lives in the header of ../commit.ts.
 */

import { drivePath } from "./drive-path.ts";
import type { Fs, Git } from "./ports.ts";
import { repoPrefix } from "./repo-prefix.ts";

export interface CommitSelector {
  /** Where git runs and every relative path resolves: the repository root, the cwd outside a repository. */
  root: string;
  mode: "all" | "paths" | "missing";
  /** The paths git reads at the root, in mode paths. */
  paths: string[];
  /** The path-shaped tokens that do not exist, space-joined, in mode missing. */
  missing: string;
  /** The issue numbers the arguments name, each once, in order. */
  refs: string[];
}

const URL_REF = /()(https?:\/\/[^ \t\n\v\f\r]+\/issues\/([0-9]+)[^ \t\n\v\f\r]*)()/u;
// A non-alphanumeric boundary on both sides, or a hex colour (#1a2b3c) or a URL fragment (#issue-12x) would pass for an issue.
const HASH_REF = /(^|[^\p{L}\p{N}_])(#([0-9]+))([^\p{L}\p{N}_]|$)/u;

/** The text without every match of re, whose groups are: the boundary before, the text to cut, the issue number, the boundary after. Only the second is cut. */
function cut(text: string, re: RegExp, refs: string[]): string {
  let out = "";
  let scan = text;
  for (let match = re.exec(scan); match !== null; match = re.exec(scan)) {
    if (!refs.includes(match[3])) refs.push(match[3]);
    out += scan.slice(0, match.index) + match[1];
    scan = match[4] + scan.slice(match.index + match[0].length);
  }
  return out + scan;
}

/** Where a selected path lies on disk: an absolute one as given, any other below the root. A drive or a leading backslash is absolute under a drive root alone. */
export function diskPath(path: string, root: string): string {
  const absolute = /^[A-Za-z]:/.test(root) ? /^([A-Za-z]:)?[\\/]/.test(path) : path.startsWith("/");
  return absolute ? path : `${root.replace(/\/$/, "")}/${path}`;
}

/** The path with every "<segment>/.." cut as text, "." when nothing is left; null when a ".." cuts a segment holding a blank: git would read two tokens ("a.txt x/../b.txt") as the one path b.txt. */
function flat(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split("/")) {
    const last = out[out.length - 1];
    if (part !== ".." || last === undefined || last === "" || last === "..") out.push(part);
    else if (/\s/.test(out.pop() ?? "")) return null;
  }
  return out.length === 0 ? "." : out.join("/");
}

/** What the raw argument string of the commit skill selects. from: "cwd" reads a relative token below the cwd first, then from the root; "root" from the root alone. */
export function readSelector(raw: string, cwd: string, { fs, git }: { fs: Fs; git: Git }, from: "cwd" | "root" = "cwd"): CommitSelector {
  const here = cwd.replaceAll("\\", "/");
  const found = git.repoRoot(here);
  const root = found ?? here;
  const prefix = found === null || from === "root" ? "" : repoPrefix(here, root, fs);

  /** On disk, in the index (a deleted tracked file) or in HEAD (a path removed with git rm). */
  const held = (path: string): boolean => path !== "" && (fs.exists(diskPath(path, root)) || git.indexHolds(root, path) || git.headHolds(root, path));

  /** The path a token names as git reads it at the root, its ".." cut: an absolute one as given, a relative one below the cwd first (from "cwd" only), then from the root; null when it names none. */
  const resolve = (token: string): string | null => {
    // Empty, it would name the cwd itself once its prefix stands before it.
    if (token === "") return null;
    const given = drivePath(token, root);
    const path = given.replace(/^\.\//, "");
    const tries = /^(\/|\\|[A-Za-z]:[/\\])/.test(given) ? [given] : prefix !== "" ? [prefix + path, path] : [path];
    for (const tried of tries) {
      const read = flat(tried);
      if (read !== null && held(read)) return read;
    }
    return null;
  };

  const refs: string[] = [];
  const answer = (mode: CommitSelector["mode"], paths: string[], missing = ""): CommitSelector => ({ root, mode, paths, missing, refs });

  // The whole argument first: a file named "bugs/#12.md" is that path, never a reference to issue 12.
  const whole = resolve(raw);
  if (whole !== null) return answer("paths", [whole]);
  const text = raw
    .split(/[ \t\n]+/)
    .filter((word) => word !== "")
    .map((word) => (resolve(word) !== null ? word : cut(cut(word, URL_REF, refs), HASH_REF, refs)))
    .join(" ")
    .replace(/ {2,}/g, " ")
    .replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
  // A path before the keyword: a file named "all" could otherwise never be committed alone.
  const left = resolve(text);
  if (left !== null) return answer("paths", [left]);
  if (text === "" || /^all$/i.test(text)) return answer("all", []);

  const paths: string[] = [];
  const missing: string[] = [];
  for (const token of text.split(/[ \t\n,]+/)) {
    const path = resolve(token);
    if (path !== null) paths.push(path);
    else if (/[/\\]/.test(token)) missing.push(token);
  }
  // Named paths that are not there never become a commit of everything; pure prose does.
  if (paths.length > 0) return answer("paths", paths);
  return missing.length > 0 ? answer("missing", [], missing.join(" ")) : answer("all", []);
}
