/*
 * reach.ts - the reach core: collects the lines naming each reach target of a
 * plan, as the candidates page (the hit lines, a few of each file once a target
 * passes the cap) and the paths page (every file behind them, one line per
 * file), a derived term too common to name the target left out. A target the
 * change adds has nothing referring to it yet: the lines naming its directory
 * go to the candidates page alone, so the paths page, which the plan has to
 * place file by file, holds only what refers to a path or symbol the change
 * modifies, moves or deletes. plan-build.ts writes both pages; the contract of
 * the two files lives in the header of ../skills/planner/scripts/plan-build.ts.
 */

import { byteOrder } from "./byte-order.ts";
import type { Git } from "./ports.ts";

export interface Reach {
  /** The candidates page: per target its heading, terms, skipped: and common: lines, hit lines and truncated: line. */
  candidates: string[];
  /** The paths page: per target that is no new file its heading and one `<path> | <hit count>` line for every file with a hit, in path order. */
  paths: string[];
  /** The hit lines kept, all targets. */
  hits: number;
  /** The distinct files those lines sit in. */
  files: number;
}

/** A target keeps this many hit lines; past them it keeps PER_FILE lines of each file, up to the same count. */
const CAP = 200;
const PER_FILE = 2;
/** A derived term naming more files than this refers to the target no more than to anything else: a project name on every namespace line. */
const COMMON = 25;

const trim = (s: string): string => s.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
/** A length and a cut count characters, never the two halves of one. */
const cut = (s: string): string => [...s].slice(0, CAP).join("");

/** The path a target names, a leading ./ dropped once, and what it searches for: whole words for a symbol. derived: the terms a whole-file target adds to its path and the directory of a new file, each dropped when it is common. added: the target is a file the change adds. */
function termsOf(target: string): { path: string; candidates: string[]; derived: string[]; word: boolean; added: boolean } {
  const bar = target.indexOf("|");
  const path = trim(bar < 0 ? target : target.slice(0, bar)).replace(/^\.\//, "");
  const mode = bar < 0 ? "" : trim(target.slice(bar + 1));
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash);
  if (mode === "new") return { path, candidates: [dir || "."], derived: [dir || "."], word: false, added: true };
  if (mode !== "") return { path, candidates: [mode], derived: [], word: true, added: false };
  const name = path.slice(slash + 1);
  // The name without its last extension, which a dot at its very start is not.
  const stem = name.indexOf(".", 1) < 0 ? name : name.slice(0, name.lastIndexOf("."));
  const derived = [name, stem, ...(stem === "index" && dir !== "" ? [dir] : [])];
  return { path, candidates: [path, ...derived], derived, word: false, added: false };
}

/** The path of a target as written, a leading ./ dropped once: what a slice brief matches its files against. */
export const targetPath = (target: string): string => termsOf(target).path;

/**
 * Both pages for the targets, in the order given; a target with an empty path
 * gets no section. candidatesFile: the path the candidates page is written to,
 * which the paths page names for a target cut short. Never throws.
 */
export function collectReach(targets: string[], root: string, git: Git, candidatesFile: string): Reach {
  const candidates: string[] = [];
  const paths: string[] = [];
  const files = new Set<string>();
  let hits = 0;
  for (const target of targets) {
    const { path, candidates: wanted, derived, word, added } = termsOf(target);
    if (path === "") continue;
    // The target's own file and everything under a .temp directory are no candidates.
    const search = (terms: string[]) => git.grep(root, terms, word).filter((hit) => hit.path !== path && !`/${hit.path}`.includes("/.temp/"));
    const terms = [...new Set(wanted.flatMap((term) => term.split("\n")).filter((term) => term !== ""))];
    const long = terms.filter((term) => [...term].length >= 3);
    const common = new Map<string, number>();
    for (const term of long.filter((each) => each !== path && derived.includes(each))) {
      const spread = new Set(search([term]).map((hit) => hit.path)).size;
      if (spread > COMMON) common.set(term, spread);
    }
    const searched = long.filter((term) => !common.has(term));
    candidates.push(`## ${target}`, `terms: ${searched.join(", ")}`);
    // A file the change adds forces no place: what names its directory is a hint for its author, on the candidates page alone.
    if (!added) paths.push(`## ${target}`);
    if (long.length < terms.length) candidates.push(`skipped: ${terms.filter((term) => !long.includes(term)).join(", ")}`);
    if (common.size > 0) candidates.push(`common: ${[...common].map(([term, spread]) => `${term} (${spread} files)`).join(", ")}`);
    const found = search(searched);
    const counts = new Map<string, number>();
    for (const hit of found) counts.set(hit.path, (counts.get(hit.path) ?? 0) + 1);
    // Past the cap every file still shows what it refers to: a few lines of each, in path order.
    const order = [...counts.keys()].sort(byteOrder);
    const kept = found.length <= CAP ? found : order.flatMap((file) => found.filter((hit) => hit.path === file).slice(0, PER_FILE)).slice(0, CAP);
    for (const hit of kept) {
      candidates.push(`${hit.path}:${hit.line}: ${cut(hit.text.replace(/^[ \t]+/, "").replace(/\r$/, ""))}`);
      files.add(hit.path);
      hits += 1;
    }
    if (!added) for (const file of order) paths.push(`${file} | ${counts.get(file)}`);
    if (found.length > CAP) {
      candidates.push(`truncated: ${kept.length} of ${found.length} lines kept, ${PER_FILE} per file at most`);
      if (!added) paths.push(`truncated: ${found.length} lines, ${kept.length} kept in ${candidatesFile}`);
    }
  }
  return { candidates, paths, hits, files: files.size };
}
