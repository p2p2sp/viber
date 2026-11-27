/*
 * plugin-root.ts - cuts the plugin root, or a directory on the way to it, from
 * the path a script entry was started by.
 */

/**
 * The directory `levels` above the one holding the script, as text, forward
 * slashes: 1 is the skill directory of `skills/<skill>/scripts/<entry>`, 3 the
 * plugin root.
 */
export function rootAbove(script: string, levels: number): string {
  return script.replaceAll("\\", "/").split("/").slice(0, -(levels + 1)).join("/");
}
