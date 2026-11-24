/*
 * frame.ts - the frame core: reads the argument tokens of a code-auditor run,
 * settles the lens and the scope, runs every check of the Frame phase and, on
 * a framed run, writes the run workspace and run.md. The contract lives in the
 * header of ../skills/code-auditor/scripts/frame.ts.
 */

import { runDiffFiles } from "./diff-files.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Clock, Fs, Git } from "./ports.ts";

const LENSES = ["bugs", "security", "web-performance", "runtime-performance", "tests", "design"];
const GROUPS: Record<string, string> = { performance: "3,4", quality: "5,6" };

const text = (lines: string[]): string => lines.map((line) => `${line}\n`).join("");
const stop = (reason: string): string => `STOP: code-auditor: ${reason}\n`;

/** YYYYMMDD-HHMMSS from the local-time fields of the instant. */
function runId(at: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${String(at.getFullYear()).padStart(4, "0")}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
}

/** The path below the root, "" for the root itself; null when it lies elsewhere. */
function below(path: string, root: string): string | null {
  if (path === root) return "";
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

/** The root-relative directory a scope token names; null when it holds an apostrophe or a `..` segment, lies outside the root or names no directory. */
function resolveDir(token: string, root: string, fs: Fs): string | null {
  if (token.includes("'")) return null;
  let t = /^[A-Za-z]:[/\\]/.test(token) ? token.replaceAll("\\", "/") : token;
  if (`/${t}/`.includes("/../")) return null;
  let rel: string | null;
  if (/^(\/|[A-Za-z]:\/)/.test(t)) {
    // A token on the root's own drive takes the case of its drive letter.
    if (/^[A-Za-z]:/.test(t) && /^[A-Za-z]:/.test(root) && t[0].toLowerCase() === root[0].toLowerCase()) t = root[0] + t.slice(1);
    const abs = t.replace(/\/$/, "");
    rel = below(abs, root);
    if (rel === null) {
      // Another spelling of a directory under the root: compare where it really is.
      const real = fs.kind(abs) === "dir" ? fs.realPath(abs) : null;
      rel = real === null ? null : below(real, root);
    }
    if (rel === null) return null;
  } else {
    rel = t.replace(/^\.\//, "").replace(/\/$/, "");
  }
  if (fs.kind(rel === "" ? root : `${root}/${rel}`) !== "dir") return null;
  if (rel === "") return ".";
  return rel === "diff" || rel === "repo" ? `./${rel}` : rel;
}

/** The whole stdout of one frame call, script being the path its entry was started by. Never throws. */
export function runFrame(argv: string[], cwd: string, script: string, ports: { fs: Fs; git: Git; clock: Clock }): string {
  let lens = "";
  let group = "";
  let kind: "diff" | "repo" | "dir" | "" = "";
  let scopeToken = "";
  let lensCount = 0;
  let scopeCount = 0;
  const tokens = argv.filter((token) => token !== "");
  for (const token of tokens) {
    if (LENSES.includes(token)) {
      lens = token;
      lensCount += 1;
    } else if (token in GROUPS) {
      group = token;
      lensCount += 1;
    } else {
      kind = token === "diff" || token.startsWith("diff:") ? "diff" : token === "repo" ? "repo" : "dir";
      scopeToken = token;
      scopeCount += 1;
    }
  }
  if (tokens.length > 2 || lensCount > 1 || scopeCount > 1) return stop("give at most one lens and one scope: [<lens>] [diff | diff:<sha> | <directory> | repo]");
  if (lens === "") return text([`NEXT: ask-lens | numbers: ${GROUPS[group] ?? "1-6"}`, ...(scopeToken === "" ? [] : [`scope: ${scopeToken}`])]);
  if (kind === "") return text(["ASK: changes -> diff | directory -> directory | whole repository -> repo", `lens: ${lens}`]);

  const here = cwd.replaceAll("\\", "/").replace(/(.)\/$/, "$1");
  const root = ports.git.repoRoot(here) ?? here;
  const skillDir = rootAbove(script, 1);
  const lensFile = `${skillDir}/references/lenses/${lens}.md`;
  const needsClean = (): boolean => (ports.fs.readText(lensFile) ?? "").split("\n").some((line) => line.startsWith("Worktree: required"));

  let scope: string = kind;
  if (kind === "dir") {
    const rel = resolveDir(scopeToken, root, ports.fs);
    if (rel === null) return stop(`area directory not found under ${root}: ${scopeToken === "--apostrophe" ? "<token>" : scopeToken} (lenses: ${LENSES.join(", ")})`);
    scope = rel;
  }
  if (kind !== "diff" && needsClean() && ports.git.commit(root, "HEAD") === null) {
    return stop(`${lens} verifies on a clean checkout and ${root} holds no git commit: commit first, or pick the design lens`);
  }

  const run = [`Lens: ${lens}`, `Lens file: ${lensFile}`, `Scope: ${scope}`, `Target root: ${root}`];
  if (kind === "diff") {
    const sha = scopeToken.slice("diff:".length);
    const [first, ...changed] = runDiffFiles(sha === "" ? [root] : [root, sha], here, ports).stdout.replace(/\n$/, "").split("\n");
    if (first.startsWith("BAD_BASE")) return stop(`diff base not found: ${sha}`);
    if (first.startsWith("NOT_A_REPO")) return stop("the diff scope needs a git repository");
    const base = first.replace(/^BASE /, "");
    if (changed.join("") === "") return stop(`nothing changed against ${base}`);
    if (base === "none" && needsClean()) return stop(`${lens} verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens`);
    run.push(`Base: ${base}`, "", "## Changed files", ...changed);
  }

  const ws = `${root}/.temp/viber/code-auditor/${runId(ports.clock.now())}`;
  ports.fs.makeDir(`${ws}/reports`);
  ports.fs.makeDir(`${ws}/worktrees`);
  ports.fs.writeBytes(`${ws}/run.md`, new TextEncoder().encode(text(run)));
  return `RUN: sh "${skillDir}/scripts/map-signals.sh" "${ws}"\n`;
}
