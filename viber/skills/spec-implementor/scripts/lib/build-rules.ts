/*
 * build-rules.ts - which project rules a build touched: a file under
 * .claude/rules/ whose `paths:` globs match a path the build changed. The
 * rules step asks only that; the rules writer judges whether the rule is false.
 */

import { globRegex } from "../../../planner/scripts/lib/plan-order.ts";
import type { Ctx } from "./build-state.ts";

// The project's rules. The plugin's own zone is its `viber` directory; every other file here is the user's.
export const RULES_DIR = ".claude/rules/";
export const VIBER_DIR = `${RULES_DIR}viber/`;

const unquote = (text: string): string => text.trim().replace(/^(["'])(.*)\1$/, "$2");

/** A YAML value without its comment: a `#` outside quotes that opens the value or follows a blank. */
function uncomment(text: string): string {
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    if (quote !== "") {
      if (text[i] === quote) quote = "";
    } else if (text[i] === '"' || text[i] === "'") quote = text[i];
    else if (text[i] === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

/** The globs a brace group stands for: `*.{ts,tsx}` gives `*.ts` and `*.tsx`. */
function expand(glob: string): string[] {
  const group = /\{([^{}]*)\}/.exec(glob);
  if (group === null) return [glob];
  return group[1].split(",").flatMap((part) => expand(glob.slice(0, group.index) + part + glob.slice(group.index + group[0].length)));
}

/**
 * The globs of the `paths:` key of a rule's frontmatter: inline (comma-separated or `[...]`) or as a `- ` list,
 * a brace group expanded, comments and blank lines left out. None when the key or a closed frontmatter is missing.
 */
export function pathsOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (lines[0]?.trim() !== "---" || end < 0) return [];
  const front = lines.slice(1, end);
  const key = front.findIndex((line) => line.startsWith("paths:"));
  if (key < 0) return [];
  const inline = uncomment(front[key].slice("paths:".length).trim()).trim();
  const written: string[] = [];
  // A comma inside a brace group separates no glob.
  if (inline !== "") written.push(...inline.replace(/^\[(.*)\]$/, "$1").split(/,(?![^{}]*\})/));
  else {
    for (const line of front.slice(key + 1)) {
      if (/^\s*(#.*)?$/.test(line)) continue;
      const item = /^\s*-\s+(.*)$/.exec(line);
      if (item === null) break;
      written.push(uncomment(item[1]));
    }
  }
  return written.map(unquote).filter((glob) => glob !== "").flatMap(expand);
}

/** The rule files under .claude/rules/ whose `paths:` globs match a path of `changes`, the list `changes.md` holds: one `<status>\t<path>` line a file, both paths of a rename. */
export function matchingRules(ctx: Ctx, changes: string): string[] {
  const changed = changes.split("\n").flatMap((line) => line.split("\t").slice(1)).filter((path) => path !== "");
  if (changed.length === 0) return [];
  return ctx.files()
    .filter((path) => path.startsWith(RULES_DIR))
    .filter((path) => {
      const text = ctx.fs.readText(`${ctx.root}/${path}`);
      if (text === null) return false;
      return pathsOf(text).some((glob) => {
        const pattern = globRegex(glob);
        return changed.some((file) => pattern.test(file));
      });
    });
}
