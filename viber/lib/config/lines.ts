/*
 * lines.ts - reads the child key lines of viber.yml text, bound to their group.
 * A group is a column-0 key; its children are the indented key lines below it,
 * up to the next column-0 key. A blank line or a column-0 comment leaves it
 * open. The lines of the build.extensions map are children of no group.
 */

const GROUP = /^([A-Za-z0-9_-]+)[ \t]*:/;
const CHILD = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/;
const SKIPPABLE = /^\s*(#|$)/;

/** Where a line sits against the extension map: "key" for the `extensions:` key line, "map" below it, null elsewhere. */
export type MapRole = "key" | "map" | null;

/** Classifies the lines of one text fed in file order; the map ends at the first line neither blank nor a comment and indented no deeper than its key. */
export function mapClassifier(): (line: string) => MapRole {
  let inBuild = false;
  let state: "before" | "inside" | "after" = "before";
  let keyIndent = 0;
  return (line) => {
    if (state === "inside") {
      if (SKIPPABLE.test(line)) return "map";
      if (/^\s*/.exec(line)![0].length > keyIndent) return "map";
      state = "after";
    }
    if (/^[^\s#]/.test(line)) {
      inBuild = /^build[ \t]*:/.test(line);
      return null;
    }
    if (state === "before" && inBuild && /^\s+extensions\s*:/.test(line)) {
      keyIndent = /^\s*/.exec(line)![0].length;
      state = "inside";
      return "key";
    }
    return null;
  };
}

/** "<group>.<key>" to the raw text after the colon; the first assignment of a child wins and a CR is dropped. */
export function readChildren(text: string): Map<string, string> {
  const children = new Map<string, string>();
  const role = mapClassifier();
  let group = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (role(line) !== null) continue;
    if (/^[^\s#]/.test(line)) {
      group = GROUP.exec(line)?.[1] ?? "";
      continue;
    }
    if (group === "" || !/^[ \t]+[A-Za-z]/.test(line)) continue;
    const child = CHILD.exec(line);
    if (child === null) continue;
    const id = `${group}.${child[1]}`;
    if (!children.has(id)) children.set(id, child[2]);
  }
  return children;
}
