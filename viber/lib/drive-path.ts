/*
 * drive-path.ts - reads the MSYS spelling of a drive path (commit-args, the
 * extras file of plan-index): Node and git read no such path, and the shell
 * converts an argument that is one, never a path inside a list or a file.
 */

/** `/c/x` as `C:/x` under a drive root; any other path, and every path under another root, as it is. */
export function drivePath(path: string, root: string): string {
  return /^[A-Za-z]:/.test(root) ? path.replace(/^\/([A-Za-z])\//, (_, letter: string) => `${letter.toUpperCase()}:/`) : path;
}
