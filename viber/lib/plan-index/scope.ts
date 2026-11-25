/*
 * scope.ts - the --extra answer: the paths a coder's extras file names beyond
 * the Files list of every task neither done nor skipped, and the checks of the
 * done tasks they reach.
 */

import { drivePath } from "../drive-path.ts";
import type { Fs } from "../ports.ts";
import { rootRelative } from "../root-relative.ts";
import type { Checked } from "./check.ts";
import type { RunState } from "./state.ts";
import { bare, commandOf, linesOf, trim } from "./text.ts";

/** One spelling per file, or the ownership comparison misses: an absolute path inside the repository as its relative form, a backslash of a relative one as "/"; a path outside stays as written. */
function spelled(raw: string, root: string, fs: Pick<Fs, "kind" | "realPath">): string {
  const line = trim(raw);
  const path = bare(/^(\/|[A-Za-z]:[/\\])/.test(line) ? line : line.replaceAll("\\", "/"));
  const full = drivePath(path.replaceAll("\\", "/"), root);
  const relative = rootRelative(full, root, fs);
  return relative === full ? path : relative;
}

/** extras: the text of the task's coder extras file. */
export function scopeLines(self: Checked, tasks: Checked[], state: RunState, extras: string, root: string, fs: Pick<Fs, "kind" | "realPath">): string[] {
  const paths = [...new Set(linesOf(extras).map((line) => spelled(line, root, fs)))];
  // A skipped task never finishes, so it claims nothing: no coder of its own will own the path.
  const claimed = new Set([...self.files, ...tasks.filter(({ task }) => !state.done.has(task.id) && !state.skipped.has(task.id)).flatMap(({ files }) => files)]);
  const extra = paths.filter((path) => path !== "" && !path.startsWith(".temp/") && !claimed.has(path));
  if (extra.length === 0) return [];
  const reached = tasks.filter(({ task, files }) => state.done.has(task.id) && files.some((path) => extra.includes(path)));
  return [`extra: ${extra.join(",")}`, ...reached.map(({ task }) => `recheck: ${task.id} | ${commandOf(task.verification)}`)];
}
