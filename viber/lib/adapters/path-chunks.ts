/*
 * path-chunks.ts - cuts a path list into the command lines the git adapters run
 * over it: one past 32767 characters is refused on Windows.
 */

const LIMIT = 24000;

/** The paths in order, at most LIMIT characters a chunk, a longer path a chunk of its own; no chunk for no path. */
export function pathChunks(paths: string[]): string[][] {
  const chunks: string[][] = [];
  let room = 0;
  for (const path of paths) {
    const size = path.length + 1;
    if (chunks.length === 0 || size > room) {
      chunks.push([]);
      room = LIMIT;
    }
    chunks[chunks.length - 1].push(path);
    room -= size;
  }
  return chunks;
}
