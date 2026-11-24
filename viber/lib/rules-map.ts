/*
 * rules-map.ts - the rules-map core: maps the host project's `.claude/rules/`
 * directory, deletes the rules of a reset once every target passed, and prints
 * the auditor blocks and the writer gate of a run. The contract lives in the
 * header of ../skills/rules/scripts/rules-map.ts.
 */

import { byteOrder } from "./byte-order.ts";
import { runConfig } from "./config/run.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Clock, Fs, Git } from "./ports.ts";
import { stampOf } from "./stamp.ts";

export interface RulesMapResult {
  stdout: string;
  stderr: string;
  exit: number;
}

type Ports = { fs: Fs; git: Git; clock: Clock };

/** The repository as git answers it, rule paths as they are. */
interface Repo {
  root: string;
  tracked: string[];
  isTracked: Set<string>;
  modified: Set<string>;
}

/** where: the area a misplaced rule belongs to, else empty. */
interface Rule {
  path: string;
  size: number;
  globs: string[];
  matches: number;
  dead: boolean;
  where: string;
}

interface Layer {
  rules: Rule[];
  frozen: string[];
  dirty: string[];
  total: number;
  state: string;
}

interface Trail {
  path: string;
  counts: number[];
  convention: number;
  other: number;
}

/** dir: the directory of a `dir` target, spelled one way. */
interface Target {
  given: string;
  kind: "rule" | "dir" | "trail";
  dir: string;
}

const RULES = ".claude/rules";
const FILE_CAP = 4000;
const DIR_CAP = 40000;
const CAUSES = ["convention", "place", "plan", "task", "test", "unknown"];
const GONE = "GONE: the rule's globs match no tracked file\n";

const fail = (reason: string): RulesMapResult => ({ stdout: "", stderr: `error: ${reason}\n`, exit: 2 });
const answer = (lines: string[], exit = 0): RulesMapResult => ({ stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit });
const baseOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const slugOf = (path: string): string => path.slice(RULES.length + 1, -".md".length).replaceAll("/", "--");
const verdictOf = (size: number): string => (size > FILE_CAP ? "OVER-FILE" : "ok");
const ruleLine = (rule: Rule): string => `rule: ${rule.path} ${rule.size} paths ${rule.globs.join(",") || "none"} matches ${rule.matches} ${verdictOf(rule.size)}`;
const trailLine = (trail: Trail): string => `trail: ${trail.path} convention ${trail.convention} other ${trail.other}`;
const totalLine = (total: number): string => `total: ${total} ${total > DIR_CAP ? "OVER-DIR" : "ok"}`;

/** True for a path below the rules directory ending in `.md` that no `..` or empty segment leads elsewhere. */
function isRulePath(path: string): boolean {
  if (!path.startsWith(`${RULES}/`) || !path.endsWith(".md")) return false;
  const rest = path.slice(RULES.length + 1);
  return !(rest.startsWith("/") || rest.startsWith("..") || rest.includes("/..") || rest.includes("//"));
}

/** A value without the blanks and the one pair of quotes around it. */
function clean(value: string): string {
  const bare = value.replaceAll("\r", "").replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
  const quoted = bare.length >= 2 && (bare[0] === '"' || bare[0] === "'") && bare.at(-1) === bare[0];
  return quoted ? bare.slice(1, -1) : bare;
}

/** The items of a comma-separated list; a comma inside a `{a,b}` group belongs to its glob. */
function listItems(list: string): string[] {
  const items = [""];
  let depth = 0;
  for (const c of list) {
    if (c === "," && depth === 0) {
      items.push("");
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}" && depth > 0) depth -= 1;
    items[items.length - 1] += c;
  }
  return items;
}

/** The globs a rule declares in the `paths:` key of its frontmatter: a block sequence, a flow sequence or a comma-separated scalar. */
function globsOf(text: string): string[] {
  const fence = /^---[ \t\r]*$/;
  const [opener, ...rest] = text.split("\n");
  if (!fence.test(opener)) return [];
  const found: string[] = [];
  let collecting = false;
  for (const line of rest) {
    if (fence.test(line)) break;
    const item = collecting ? /^[ \t]*-[ \t]+(.*)$/s.exec(line) : null;
    if (item !== null) {
      found.push(item[1]);
      continue;
    }
    collecting = false;
    const key = /^paths[ \t]*:[ \t]*(.*)$/s.exec(line);
    if (key === null) continue;
    const value = clean(key[1]);
    if (value === "") collecting = true;
    else found.push(...listItems(value.startsWith("[") ? value.slice(1).replace(/\]$/, "") : value));
  }
  return found.map(clean).filter((glob) => glob !== "");
}

/** True when the `{` at index i has its closing `}`: a group without one is a literal brace. */
function closes(chars: string[], i: number): boolean {
  let depth = 0;
  for (; i < chars.length; i++) {
    if (chars[i] === "{") depth += 1;
    else if (chars[i] === "}" && --depth === 0) return true;
  }
  return false;
}

/** The path pattern of a glob: `*` and `?` stay inside one segment, `[` and `]` are literal, a `{a,b}` group matches either branch. */
function patternOf(glob: string): RegExp {
  const chars = [...glob];
  let out = "";
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "{" && closes(chars, i)) {
      out += "(?:";
      depth += 1;
    } else if (c === "}" && depth > 0) {
      out += ")";
      depth -= 1;
    } else if (c === "," && depth > 0) out += "|";
    else if (c === "*" && chars[i + 1] === "*") {
      const segments = chars[i + 2] === "/";
      out += segments ? "(?:[^/]+/)*" : ".*";
      i += segments ? 2 : 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += /[.^$+(){}|\\[\]]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${out}$`, "su");
}

function countMatches(globs: string[], tracked: string[]): number {
  const patterns = globs.map(patternOf);
  return tracked.filter((path) => patterns.some((pattern) => pattern.test(path))).length;
}

/** The literal first segment every glob opens on; empty when one holds no `/`, two differ or the segment is no plain name. */
function sharedSegment(globs: string[]): string {
  const firsts = new Set(globs.map((glob) => (glob.includes("/") ? glob.split("/")[0] : "")));
  const [first = ""] = firsts;
  return firsts.size === 1 && !/[*?[{]/.test(first) ? first : "";
}

/** Where a rule is misplaced to, else empty. areas: the direct subdirectories of the rules directory. */
function misplacedTo(path: string, globs: string[], areas: string[]): string {
  const rel = path.slice(RULES.length + 1);
  const base = baseOf(path);
  if (!rel.includes("/")) return sharedSegment(globs) || (areas.find((area) => base.startsWith(`${area}-`)) ?? "");
  const top = rel.split("/")[0];
  return base.startsWith(`${top}-`) ? top : "";
}

/** True for an entry that is a link: its real path is not its directory's real path plus its own name. */
function isLink(dir: string, name: string, fs: Fs): boolean {
  const real = fs.realPath(dir);
  return real === null || fs.realPath(`${dir}/${name}`)?.toLowerCase() !== `${real.replace(/\/$/, "")}/${name}`.toLowerCase();
}

/** The entries of a directory that are directories of their own, a link left out. */
function subdirs(dir: string, fs: Fs): string[] {
  return fs.listDir(dir).filter((name) => fs.kind(`${dir}/${name}`) === "dir" && !isLink(dir, name, fs));
}

/** Every `.md` file below dir, a link to a file included, a linked directory never entered. */
function markdownBelow(dir: string, fs: Fs): string[] {
  const files = fs.listDir(dir).filter((name) => name.endsWith(".md") && fs.kind(`${dir}/${name}`) === "file");
  return [...files.map((name) => `${dir}/${name}`), ...subdirs(dir, fs).flatMap((name) => markdownBelow(`${dir}/${name}`, fs))];
}

/** The whole layer; `.claude/rules` being a link itself is an empty one. */
function layerOf(repo: Repo, fs: Fs): Layer {
  const dir = `${repo.root}/${RULES}`;
  const linked = isLink(`${repo.root}/.claude`, "rules", fs);
  const files = linked ? [] : markdownBelow(dir, fs).map((file) => file.slice(repo.root.length + 1)).sort(byteOrder);
  const areas = linked ? [] : subdirs(dir, fs).sort(byteOrder);
  const layer: Layer = { rules: [], frozen: [], dirty: [], total: 0, state: "none" };
  for (const path of files) {
    const size = fs.readBytes(`${repo.root}/${path}`)?.length ?? 0;
    layer.total += size;
    if (!repo.isTracked.has(path)) layer.dirty.push(`dirty: ${path} untracked`);
    else if (repo.modified.has(path)) layer.dirty.push(`dirty: ${path} modified`);
    if (baseOf(path).startsWith("_")) {
      layer.frozen.push(`frozen: ${path} ${size}`);
      continue;
    }
    const globs = globsOf(fs.readText(`${repo.root}/${path}`) ?? "");
    const matches = countMatches(globs, repo.tracked);
    layer.rules.push({ path, size, globs, matches, dead: isDead(globs, matches, repo), where: misplacedTo(path, globs, areas) });
  }
  if (layer.rules.length > 0) layer.state = layer.rules.every((rule) => rule.globs.length > 0) ? "complete" : "partial";
  return layer;
}

/** A rule is dead by its own scope alone: never with none declared, never while nothing is tracked, where every rule would be. */
function isDead(globs: string[], matches: number, repo: Repo): boolean {
  return globs.length > 0 && matches === 0 && repo.tracked.length > 0;
}

/** Every archived failures.md with its entries per cause, in byte order of its path. */
function trailsOf(repo: Repo, ports: Ports): Trail[] {
  const { fs } = ports;
  const name = runConfig(["--specifications"], repo.root, ports).split("\n")[0];
  const archive = `docs/${name}`;
  const full = `${repo.root}/${archive}`;
  if (fs.kind(full) !== "dir" || isLink(`${repo.root}/docs`, name, fs)) return [];
  return subdirs(full, fs)
    .filter((run) => fs.kind(`${full}/${run}/failures.md`) === "file" && !isLink(`${full}/${run}`, "failures.md", fs))
    .map((run) => `${archive}/${run}/failures.md`)
    .sort(byteOrder)
    .map((path) => {
      const lines = (fs.readText(`${repo.root}/${path}`) ?? "").split("\n");
      const counts = CAUSES.map((cause) => lines.filter((line) => line.startsWith(`- ${cause} |`)).length);
      return { path, counts, convention: counts[0], other: counts.slice(1).reduce((sum, n) => sum + n, 0) };
    });
}

function mapMode(layer: Layer, trails: Trail[], at: Date): RulesMapResult {
  const sums = CAUSES.map((cause, index) => `${cause} ${trails.reduce((sum, trail) => sum + trail.counts[index], 0)}`);
  return answer([
    "# viber rules map",
    `id: ${stampOf(at)}`,
    `state: ${layer.state}`,
    ...layer.rules.map(ruleLine),
    ...layer.frozen,
    ...layer.rules.filter((rule) => rule.dead).map((rule) => `dead: ${rule.path}`),
    ...layer.rules.filter((rule) => rule.where !== "").map((rule) => `misplaced: ${rule.path} ${rule.where}`),
    ...layer.dirty,
    ...trails.filter((trail) => trail.convention + trail.other > 0).map(trailLine),
    ...(trails.length > 0 ? [`waiting: ${sums.join(" ")}`] : []),
    totalLine(layer.total),
  ]);
}

/** Why a reset target is unfit, empty when it may be deleted. */
function unfit(target: string, repo: Repo, fs: Fs): string {
  if (!isRulePath(target)) return "not-a-rule";
  if (baseOf(target).startsWith("_")) return "frozen";
  if (!repo.isTracked.has(target)) return fs.exists(`${repo.root}/${target}`) ? "untracked" : "missing";
  return repo.modified.has(target) ? "modified" : "";
}

/** The whole call is judged before one file is deleted. */
function resetMode(targets: string[], repo: Repo, fs: Fs): RulesMapResult {
  if (targets.length === 0) return answer(["refused: - no-target"], 2);
  const refusals = targets.map((target) => ({ target, reason: unfit(target, repo, fs) })).filter(({ reason }) => reason !== "");
  if (refusals.length > 0) return answer(refusals.map(({ target, reason }) => `refused: ${target} ${reason}`), 3);
  for (const target of targets) {
    fs.remove(`${repo.root}/${target}`);
    // An area whose last rule just went is no area any more; the rules directory itself is kept.
    const parent = target.slice(0, target.lastIndexOf("/"));
    if (parent !== RULES) fs.removeEmptyDir(`${repo.root}/${parent}`);
  }
  return answer([...targets.map((target) => `removed: ${target}`), `removed: ${targets.length}`]);
}

/** The target a brief or confirm argument names; a string: the reason it is unusable. */
function targetOf(given: string, root: string, fs: Fs): Target | string {
  if (given === "trail") return { given, kind: "trail", dir: "" };
  if (given.startsWith(`${RULES}/`) && given.endsWith(".md")) {
    if (!isRulePath(given)) return `${given} is not a rule`;
    if (baseOf(given).startsWith("_")) return `${given} is frozen`;
    return fs.kind(`${root}/${given}`) === "file" ? { given, kind: "rule", dir: "" } : `${given} is not a rule file`;
  }
  const dir = given.replace(/\/$/, "").replace(/^\.\//, "");
  const usable = dir !== "" && !dir.startsWith("/") && !`/${dir}/`.includes("/../") && fs.kind(dir === "." ? root : `${root}/${dir}`) === "dir";
  return usable ? { given, kind: "dir", dir } : `${given} is neither a rule, a directory nor trail`;
}

function briefMode(targets: Target[], out: string, refs: string, repo: Repo, trails: Trail[], fs: Fs): RulesMapResult {
  const audits: string[] = [];
  const blocks: string[] = [];
  for (const { given, kind, dir } of targets) {
    const block = (target: string, scope: string, matches: string): void => {
      blocks.push("NEXT: rules-auditor", `target: ${target}`, `scope: ${scope}`, `matches: ${matches}`, `out: ${out}/`, refs);
    };
    if (kind === "dir") block("none", dir, "none");
    else if (kind === "trail") {
      const scope = trails.filter((trail) => trail.convention > 0).map((trail) => trail.path);
      if (scope.length > 0) block("trail", scope.join(","), "none");
    } else {
      const globs = globsOf(fs.readText(`${repo.root}/${given}`) ?? "");
      const matches = countMatches(globs, repo.tracked);
      if (!isDead(globs, matches, repo)) {
        block(given, globs.join(",") || "**", globs.length === 0 ? "none" : String(matches));
        continue;
      }
      const file = `${out}/${slugOf(given)}-audit.md`;
      if (!fs.makeDir(`${repo.root}/${out}`)) return fail(`cannot create ${out}`);
      if (!fs.writeBytes(`${repo.root}/${file}`, new TextEncoder().encode(GONE))) return fail(`cannot write ${file}`);
      audits.push(`AUDIT: ${given} stale 0 gone 1 unverifiable 0 drop 0 miss 0 -> ${file}`);
    }
  }
  return answer([...audits, ...(blocks.length > 0 ? blocks : ["NEXT: none"])]);
}

/** The targets given are the kept ones. */
function confirmMode(targets: Target[], id: string, out: string, refs: string, repo: Repo, layer: Layer, trails: Trail[], fs: Fs): RulesMapResult {
  const confirms: string[] = [];
  for (const { given, kind, dir } of targets) {
    const words = kind === "trail" ? ["MISS", "IGNORED", "REJECTED"] : ["STALE", "GONE", "DROP", "MISS"];
    const slug = kind === "trail" ? "_trail" : kind === "rule" ? slugOf(given) : `new--${dir === "." ? "root" : dir.replaceAll("/", "--")}`;
    const lines = (fs.readText(`${repo.root}/${out}/${slug}-audit.md`) ?? "").split("\n");
    const counts = words.map((word) => `${word.toLowerCase()} ${lines.filter((line) => line.startsWith(`${word}:`)).length}`);
    if (counts.some((count) => !count.endsWith(" 0"))) confirms.push(`confirm: ${given} ${counts.join(" ")}`);
  }
  const keptPaths = new Set(targets.filter((target) => target.kind === "rule").map((target) => target.given));
  const kept = layer.rules.filter((rule) => keptPaths.has(rule.path));
  const keptTrails = targets.some((target) => target.kind === "trail") ? trails.filter((trail) => trail.convention + trail.other > 0) : [];
  confirms.push(
    ...kept.filter((rule) => rule.where !== "").map((rule) => `confirm: ${rule.path} misplaced ${rule.where}`),
    ...kept.filter((rule) => verdictOf(rule.size) !== "ok").map((rule) => `confirm: ${rule.path} OVER-FILE`),
    ...(layer.total > DIR_CAP ? ["confirm: total OVER-DIR"] : []),
    ...keptTrails.filter((trail) => trail.other > 0).map((trail) => `confirm: ${trail.path} other ${trail.other}`),
  );
  if (confirms.length === 0) return answer(["STOP: rules: the layer already holds, no writer dispatched"]);
  return answer([
    ...confirms,
    "ASK: fold in -> write | stop -> stop",
    "NEXT: rules-writer",
    "map:",
    `id: ${id}`,
    `state: ${layer.state}`,
    ...kept.map(ruleLine),
    ...kept.filter((rule) => rule.dead).map((rule) => `dead: ${rule.path}`),
    ...keptTrails.map(trailLine),
    totalLine(layer.total),
    `notes: ${out}/`,
    refs,
  ]);
}

/** The stdout, stderr and exit code of one rules-map call, script being the path its entry was started by. Never throws. */
export function runRulesMap(argv: string[], cwd: string, script: string, ports: Ports): RulesMapResult {
  const { fs, git } = ports;
  const [mode, ...args] = argv;
  if (mode !== undefined && !["--reset", "--brief", "--confirm"].includes(mode)) return answer([`refused: ${mode} unknown-mode`], 2);

  const here = cwd.replaceAll("\\", "/");
  const root = (git.repoRoot(here) ?? here).replace(/\/$/, "");
  const tracked = git.trackedFiles(root).map((file) => file.path);
  const modified = git.status(root).filter((entry) => entry.code !== "??").map((entry) => entry.path);
  const repo: Repo = { root, tracked, isTracked: new Set(tracked), modified: new Set(modified) };
  if (mode === "--reset") return resetMode(args, repo, fs);
  if (mode === undefined) return mapMode(layerOf(repo, fs), trailsOf(repo, ports), ports.clock.now());

  const [id, ...given] = args;
  if (given.length === 0) return fail(`${mode} takes a map id and at least one target`);
  if (id === "." || id === ".." || !/^[A-Za-z0-9._-]+$/.test(id)) return fail(`${id} is not a usable map id`);
  const targets: Target[] = [];
  for (const one of given) {
    const target = targetOf(one, root, fs);
    if (typeof target === "string") return fail(target);
    targets.push(target);
  }
  const out = `.temp/viber/${id}`;
  const refs = `refs: ${rootAbove(script, 3)}/references`;
  const trails = trailsOf(repo, ports);
  return mode === "--brief" ? briefMode(targets, out, refs, repo, trails, fs) : confirmMode(targets, id, out, refs, repo, layerOf(repo, fs), trails, fs);
}
