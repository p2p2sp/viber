/*
 * reach.ts - the reach core: collects the lines naming each reach target of a
 * plan into one candidates file and builds the dispatch block of
 * impact-mapper. The contract lives in the header of
 * ../skills/planner/scripts/reach.ts.
 */

import type { Clock, Fs, Git } from "./ports.ts";
import { stampOf } from "./stamp.ts";

export interface ReachResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const USAGE = 'reach.sh --plan "<plan path>" "<path>" ["<path> | <symbol>" | "<path> | new" ...]';
const DIR = ".temp/viber/planner";
const CAP = 200;

function fail(reason: string): ReachResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

const text = (lines: string[]): string => lines.map((line) => `${line}\n`).join("");
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

/** The stdout, stderr and exit code of one reach call. Never throws. */
export function runReach(argv: string[], cwd: string, ports: { fs: Fs; git: Git; clock: Clock }): ReachResult {
  if (argv[0] !== "--plan") return fail(`--plan missing: ${USAGE}`);
  if (argv.length < 2 || trim(argv[1]) === "") return fail(`--plan is empty: ${USAGE}`);
  const targets = argv.slice(2);
  if (targets.length === 0) return fail(`no target: ${USAGE}`);
  const empty = targets.find((target) => trim(target.split("|")[0]) === "");
  if (empty !== undefined) return fail(`empty path in target: ${empty}`);
  const dispatch = (candidates: string[]): string[] => ["NEXT: dispatch | agent: viber:impact-mapper", `plan: ${argv[1]}`, ...candidates, "targets:", ...targets];

  const root = ports.git.repoRoot(cwd.replaceAll("\\", "/"));
  if (root === null) return { stdout: text(dispatch([])), stderr: "", exit: 0 };
  const top = root.replace(/\/$/, "");

  const page: string[] = [];
  const files = new Set<string>();
  let kept = 0;
  for (const target of targets) {
    const { path, candidates, word } = termsOf(target);
    const terms = [...new Set(candidates.flatMap((candidate) => candidate.split("\n")).filter((term) => term !== ""))];
    const searched = terms.filter((term) => [...term].length >= 3);
    page.push(`## ${target}`, `terms: ${searched.join(", ")}`);
    if (searched.length < terms.length) page.push(`skipped: ${terms.filter((term) => !searched.includes(term)).join(", ")}`);
    // The target's own file and everything under a .temp directory are no candidates.
    const hits = ports.git.grep(root, searched, word).filter((hit) => hit.path !== path && !`/${hit.path}`.includes("/.temp/"));
    for (const hit of hits.slice(0, CAP)) {
      page.push(`${hit.path}:${hit.line}: ${cut(hit.text.replace(/^[ \t]+/, "").replace(/\r$/, ""))}`);
      files.add(hit.path);
      kept += 1;
    }
    if (hits.length > CAP) page.push(`truncated: past ${CAP} lines - search this target yourself`);
  }

  const out = `${DIR}/reach-${stampOf(ports.clock.now())}.md`;
  if (!ports.fs.makeDir(`${top}/${DIR}`)) return fail(`cannot create ${DIR}`);
  if (!ports.fs.writeBytes(`${top}/${out}`, new TextEncoder().encode(text(page)))) return fail(`cannot write ${out}`);
  const candidates = `candidates: ${top}/${out}`;
  return { stdout: text([candidates, `hits: ${kept} lines in ${files.size} files`, ...dispatch([candidates])]), stderr: "", exit: 0 };
}
