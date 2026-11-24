/*
 * attach-lines.ts - the attach-lines core: turns the paths a skill received
 * into the `Attachment:` lines of its hand-off, one per existing file or
 * directory under the repository's `.temp/`. The contract lives in the header
 * of ../scripts/attach-lines.ts.
 */

import { absolutePath } from "./abs-path.ts";
import type { Fs, Git } from "./ports.ts";

export interface AttachLinesResult {
  stdout: string;
  stderr: string;
  exit: number;
}

function fail(reason: string): AttachLinesResult {
  return { stdout: "", stderr: `error: attach-lines.sh: ${reason}\n`, exit: 2 };
}

/** The directory holding the path, the root of a drive or of the file system keeping its slash. */
function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return /^(\/?|[A-Za-z]:)$/.test(path.slice(0, cut)) ? path.slice(0, cut + 1) : path.slice(0, cut);
}

/** The stdout, stderr and exit code of one attach-lines call. Never throws. */
export function runAttachLines(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): AttachLinesResult {
  if (argv.length < 1) return fail("usage: attach-lines.sh <path> [<path>]...");
  const here = cwd.replaceAll("\\", "/");
  const root = ports.git.repoRoot(here)?.replace(/\/$/, "") ?? null;
  if (root === null) return fail("not inside a git repository");

  const under = `${root}/.temp/`;
  const seen = new Set<string>();
  for (const arg of argv) {
    if (arg === "") continue;
    const path = absolutePath(arg.replaceAll("\\", "/"), here);
    // A directory resolves whole, a file through its directory: a symlinked
    // directory then reads as git reads the repository root.
    let real: string | null = null;
    if (ports.fs.kind(path) === "dir") {
      real = ports.fs.realPath(path);
    } else if (ports.fs.exists(path)) {
      const dir = ports.fs.realPath(parentOf(path));
      if (dir !== null) real = `${dir.replace(/\/$/, "")}/${path.slice(path.lastIndexOf("/") + 1)}`;
    }
    if (real !== null && real.startsWith(under) && real.length > under.length) seen.add(real);
  }
  return { stdout: [...seen].map((path) => `Attachment: ${path}\n`).join(""), stderr: "", exit: 0 };
}
