/*
 * lines.ts - reads the child key lines of viber.yml text, bound to their group.
 * A group is a column-0 key; its children are the indented key lines below it,
 * up to the next column-0 key. A blank line or a column-0 comment leaves it
 * open.
 */

const GROUP = /^([A-Za-z0-9_-]+)[ \t]*:/;
const CHILD = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/;

/** "<group>.<key>" to the raw text after the colon; the first assignment of a child wins and a CR is dropped. */
export function readChildren(text: string): Map<string, string> {
  const children = new Map<string, string>();
  let group = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
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
