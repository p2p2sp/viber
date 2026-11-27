/*
 * simple-commit.ts - what the close of a run with no commit of its own hands
 * the commit skill and what it reports as left in the tree. Shared by
 * simple-run.ts and the implementor skill's lib/direct-run.ts. Every path is
 * repo-relative with forward slashes.
 */

const inTemp = (path: string): boolean => path === ".temp" || path.startsWith(".temp/");

/** The paths of a return's FILES value: `\` turned to `/`, a leading `./` and a <root>/ prefix cut, each once, none under .temp/. */
export function pathsOf(root: string, files: string): string[] {
  const out: string[] = [];
  for (const raw of files.split(",")) {
    let path = raw.trim().replaceAll("\\", "/").replace(/^\.\//, "");
    if (path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
    if (path !== "" && !inTemp(path) && !out.includes(path)) out.push(path);
  }
  return out;
}

/** What git gave as differing from HEAD, as the close reads it: `\` turned to `/`, none under .temp/. */
export const runDirty = (dirty: string[]): string[] => dirty.map((path) => path.replaceAll("\\", "/")).filter((path) => !inTemp(path));

/** True for a path the commit skill reads inside a list: it splits on blanks and commas, and no argument carries an apostrophe. */
export const listable = (path: string): boolean => !/[\s,']/.test(path);

/** The change to commit: the dirty paths a coder reported, none that differed before the run, none of the writers'. */
export function changePaths(dirty: string[], before: string[], reported: string[], writers: string[]): string[] {
  return dirty.filter((path) => reported.includes(path) && !before.includes(path) && !writers.includes(path) && listable(path));
}

/**
 * The END lines naming what still differs from HEAD: the run's own files (reported by a coder or handed to a commit),
 * the reported ones that differed before the run too, and those no coder reported. A file of `before` no coder
 * reported is the user's and is never named.
 */
export function leftLines(dirty: string[], before: string[], reported: string[], own: string[]): string[] {
  const mixed = dirty.filter((path) => before.includes(path) && reported.includes(path));
  const run = dirty.filter((path) => !before.includes(path));
  const mine = run.filter((path) => reported.includes(path) || own.includes(path));
  const stray = run.filter((path) => !mine.includes(path));
  const out: string[] = [];
  if (mine.length > 0) out.push(`Left uncommitted: ${mine.join(", ")}`);
  if (mixed.length > 0) out.push(`Left uncommitted, changed before the run too: ${mixed.join(", ")}`);
  if (stray.length > 0) out.push(`Left uncommitted, reported by no coder: ${stray.join(", ")}`);
  return out;
}

/** The END line of a commit the commit skill was asked for: made when HEAD moved off `head`, the HEAD read before it was sent. */
export function commitLine(subject: string, head: string, now: string | null): string {
  return now !== null && now !== head ? `${subject} committed: ${now.slice(0, 7)}.` : `${subject} not committed.`;
}
