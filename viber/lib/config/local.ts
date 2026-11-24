/*
 * local.ts - reads .claude/viber.local.yml: the valid values of the five keys it
 * may override and the keys it names without effect.
 */

/** The overridable keys in block order, the order the local line names them. */
export const LOCAL_KEYS = [
  "build.baseline-tests",
  "github.issues",
  "tiers.min",
  "tiers.max",
  "planning.questions-per-round",
];

export interface Local {
  /** A key to its normalized value, only for a valid local value. */
  overrides: Map<string, string>;
  /** The keys of the file that took no effect, in file order, each once. */
  ignored: string[];
}

const TOP = /^([A-Za-z0-9_-]+)[ \t]*:(.*)$/;
const CHILD = /^([A-Za-z0-9_-]+)[ \t]*:(.*)$/;

/** The value cut at its first blank or `#`. */
function cut(raw: string): string {
  return raw.replace(/^\s+/, "").replace(/[\s#].*$/s, "");
}

/** The normalized value of an overridable key, null when invalid. */
function valid(id: string, exact: string): string | null {
  const v = exact.toLowerCase();
  if (id === "tiers.min" || id === "tiers.max") return ["haiku", "sonnet", "opus", "fable"].includes(v) ? v : null;
  if (id === "build.baseline-tests") {
    if (v === "true") return "full";
    if (v === "false") return "off";
    return v === "off" || v === "fast" || v === "full" ? v : null;
  }
  if (id === "github.issues") return v === "true" || v === "false" ? v : null;
  if (id === "planning.questions-per-round") return /^([1-9]|10|all)$/.test(exact) ? exact : null;
  return null;
}

/** A group child counts only at the indentation of the first key line inside its group; the first assignment of a key wins. */
export function readLocal(text: string): Local {
  const overrides = new Map<string, string>();
  const ignored: string[] = [];
  const seen = new Set<string>();
  let group = "";
  let childIndent = 0;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^[^\s#]/.test(line)) {
      group = "";
      childIndent = 0;
      const top = TOP.exec(line);
      if (top === null) continue;
      if (cut(top[2]) === "") group = top[1];
      else if (!seen.has(top[1])) {
        seen.add(top[1]);
        ignored.push(top[1]);
      }
      continue;
    }
    if (group === "") continue;
    const indent = /^[ \t]+/.exec(line)?.[0].length ?? 0;
    if (indent === 0) continue;
    const child = CHILD.exec(line.slice(indent));
    if (child === null) continue;
    if (childIndent === 0) childIndent = indent;
    if (indent !== childIndent) continue;
    const id = `${group}.${child[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const exact = cut(child[2]);
    const value = LOCAL_KEYS.includes(id) ? valid(id, exact) : null;
    if (value === null) ignored.push(id);
    else overrides.set(id, value);
  }
  return { overrides, ignored };
}

/** The `# local:` line of the block. */
export function localLine(local: Local): string {
  const overridden = LOCAL_KEYS.filter((k) => local.overrides.has(k));
  return `# local: ${overridden.length === 0 ? "none" : overridden.join(", ")} | ignored: ${local.ignored.length === 0 ? "none" : local.ignored.join(", ")}`;
}
