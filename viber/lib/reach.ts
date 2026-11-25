/*
 * reach.ts - the reach core: collects the lines naming each reach target of a
 * plan, as the candidates page (every hit line) and the paths page (the files
 * behind them, one line per file). plan-build.ts writes both pages; the contract
 * of the two files lives in the header of
 * ../skills/planner/scripts/plan-build.ts.
 */

import type { Git } from "./ports.ts";

export interface Reach {
  /** The candidates page: per target its heading, terms, hit lines and truncated: line. */
  candidates: string[];
  /** The paths page: per target its heading and one `<path> | <hit count>` line per file. */
  paths: string[];
  /** The hit lines kept, all targets. */
  hits: number;
  /** The distinct files those lines sit in. */
  files: number;
}

const CAP = 200;

const trim = (s: string): string => s.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
/** A length and a cut count characters, never the two halves of one. */
const cut = (s: string): string => [...s].slice(0, CAP).join("");

/** The path a target names, a leading ./ dropped once, and what it searches for: whole words for a symbol. */
function termsOf(target: string): { path: string; candidates: string[]; word: boolean } {
  const bar = target.indexOf("|");
  const path = trim(bar < 0 ? target : target.slice(0, bar)).replace(/^\.\//, "");
  const mode = bar < 0 ? "" : trim(target.slice(bar + 1));
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash);
  if (mode === "new") return { path, candidates: [dir || "."], word: false };
  if (mode !== "") return { path, candidates: [mode], word: true };
  const name = path.slice(slash + 1);
  // The name without its last extension, which a dot at its very start is not.
  const stem = name.indexOf(".", 1) < 0 ? name : name.slice(0, name.lastIndexOf("."));
  return { path, candidates: [path, name, stem, ...(stem === "index" && dir !== "" ? [dir] : [])], word: false };
}

/** The path of a target as written, a leading ./ dropped once: what a slice brief matches its files against. */
export const targetPath = (target: string): string => termsOf(target).path;

/** Both pages for the targets, in the order given; a target with an empty path gets no section. Never throws. */
export function collectReach(targets: string[], root: string, git: Git): Reach {
  const candidates: string[] = [];
  const paths: string[] = [];
  const files = new Set<string>();
  let hits = 0;
  for (const target of targets) {
    const { path, candidates: wanted, word } = termsOf(target);
    if (path === "") continue;
    const terms = [...new Set(wanted.flatMap((term) => term.split("\n")).filter((term) => term !== ""))];
    const searched = terms.filter((term) => [...term].length >= 3);
    candidates.push(`## ${target}`, `terms: ${searched.join(", ")}`);
    paths.push(`## ${target}`);
    if (searched.length < terms.length) candidates.push(`skipped: ${terms.filter((term) => !searched.includes(term)).join(", ")}`);
    // The target's own file and everything under a .temp directory are no candidates.
    const found = git.grep(root, searched, word).filter((hit) => hit.path !== path && !`/${hit.path}`.includes("/.temp/"));
    const counts = new Map<string, number>();
    for (const hit of found.slice(0, CAP)) {
      candidates.push(`${hit.path}:${hit.line}: ${cut(hit.text.replace(/^[ \t]+/, "").replace(/\r$/, ""))}`);
      counts.set(hit.path, (counts.get(hit.path) ?? 0) + 1);
      files.add(hit.path);
      hits += 1;
    }
    for (const [file, count] of counts) paths.push(`${file} | ${count}`);
    if (found.length > CAP) {
      const truncated = `truncated: past ${CAP} lines - search this target yourself`;
      candidates.push(truncated);
      paths.push(truncated);
    }
  }
  return { candidates, paths, hits, files: files.size };
}
