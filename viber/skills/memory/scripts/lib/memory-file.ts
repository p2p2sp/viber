/*
 * memory-file.ts - which paths are memory files: the one pattern the memory
 * skill and the build share. Imports nothing from Node, so the build may import
 * it without the memory skill's runtime.
 */

/** A node file name, or a section file name CLAUDE.<topic>.md other than the user's CLAUDE.local.md. */
const NODE_OR_SECTION = /^CLAUDE\.md$|^CLAUDE\.(?!local\.md$).+\.md$/;

/** True for a node or section on a repo-relative path in a directory below the root; the root's CLAUDE*.md files never are. */
export function isMemoryFile(path: string): boolean {
  const slash = path.lastIndexOf("/");
  return slash > 0 && NODE_OR_SECTION.test(path.slice(slash + 1));
}
