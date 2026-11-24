/*
 * memory-map.ts - the memory-map core: maps the host project's `CLAUDE.md`
 * cascade, deletes the nodes and sections of a reset once every one passed,
 * derives the targets of a mode with their auditor blocks and judges the nodes
 * the write waves left off. The contract lives in the header of
 * ../skills/memory/scripts/memory-map.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { byteOrder } from "./byte-order.ts";
import { answer, baseOf, fail, projectRoot, type MapAnswer } from "./map-answer.ts";
import { rootAbove } from "./plugin-root.ts";
import type { Clock, Fs, Git } from "./ports.ts";
import { stampOf } from "./stamp.ts";

type Ports = { fs: Fs; git: Git; clock: Clock };

/** The mapped tree: what git tracks less what memory never maps. dirty: the nodes and sections carrying uncommitted work, with the word for it, in git order: one untracked by `git rm --cached` is listed twice, its first word counting in a reset. */
interface Repo {
  root: string;
  tracked: string[];
  isTracked: Set<string>;
  sections: string[];
  dirty: Dirty[];
}

interface Dirty {
  path: string;
  word: string;
}

/** text: the line after its `node: ` or `cand: ` word. */
interface Entry {
  path: string;
  text: string;
}

interface Layer {
  state: string;
  nodes: Entry[];
  sections: string[];
  unlinked: string[];
  orphans: string[];
  /** path: the node the candidate directory would carry. */
  candidates: Array<Entry & { facts: string }>;
  /** The dirty files still in the working tree. */
  dirty: Dirty[];
}

/** files: the paths its `--files` named, split and stripped. */
interface Dispatch {
  kind: string;
  node: string;
  files: string[];
}

interface TargetCall {
  mode: string;
  removed: string[];
  id: string;
  keep: string[];
}

interface ReconcileCall {
  planned: string;
  dispatches: Dispatch[];
}

const ROOT_BUDGET = 4000;
const NODE_BUDGET = 12000;
const CHAIN_BUDGET = 32000;
const MANIFESTS = new Set(
  "package.json pyproject.toml setup.py requirements.txt go.mod Cargo.toml pom.xml build.gradle build.gradle.kts Gemfile composer.json mix.exs pubspec.yaml CMakeLists.txt Makefile".split(" "),
);
/** The headings of a node in their order; the last one belongs to a node alone. */
const HEADINGS = ["Terms", "Relationships", "Contracts", "Commands", "Change together", "Traps", "Sections"];

const usage = (text: string): MapAnswer => ({ stdout: "", stderr: `usage: ${text}\n`, exit: 2 });
const bare = (path: string): string => path.replace(/^\.\//, "");
const isNode = (path: string): boolean => baseOf(path) === "CLAUDE.md";
const isSectionName = (name: string): boolean => name !== "CLAUDE.local.md" && /^CLAUDE\.[a-z0-9-]+\.md$/.test(name);
const isSection = (path: string): boolean => isSectionName(baseOf(path));
/** The directory of a path with its closing slash, empty at the root. */
const dirOf = (path: string): string => path.slice(0, path.lastIndexOf("/") + 1);
/** The node a section belongs to. */
const nodeOf = (path: string): string => `${dirOf(path)}CLAUDE.md`;
const depthOf = (path: string): number => path.split("/").length - 1;
const byDepth = (a: string, b: string): number => depthOf(a) - depthOf(b) || byteOrder(a, b);
const belowDotDir = (path: string): boolean => path.split("/").slice(0, -1).some((segment) => segment.startsWith("."));

function isManifest(name: string): boolean {
  return MANIFESTS.has(name) || name.endsWith(".csproj") || name.endsWith(".sln");
}

function repoOf(root: string, git: Git): Repo {
  const ignored = new Set(git.trackedIgnored(root));
  const tracked = git
    .trackedFiles(root)
    .map((file) => file.path)
    .filter((path) => !ignored.has(path) && !belowDotDir(path));
  const dirty = git
    .status(root)
    .filter(({ path }) => (isNode(path) || isSection(path)) && !isExcluded(path, root, git))
    .map(({ code, path }) => ({ path, word: code === "??" ? "untracked" : "modified" }));
  return { root, tracked, isTracked: new Set(tracked), sections: tracked.filter(isSection), dirty };
}

/** True for a path memory never maps, tracked or not. */
function isExcluded(path: string, root: string, git: Git): boolean {
  return belowDotDir(path) || git.ignored(root, path);
}

/** A node tracked and still in the working tree: one deleted but not committed is none. */
function isPresent(path: string, repo: Repo, fs: Fs): boolean {
  return repo.isTracked.has(path) && fs.exists(`${repo.root}/${path}`);
}

/** The bytes of a file, 0 when it cannot be read. */
function bytesOf(path: string, repo: Repo, fs: Fs): number {
  return fs.readBytes(`${repo.root}/${path}`)?.length ?? 0;
}

/** Every file is judged before the first one is deleted; a node takes every tracked section beside it along. */
function resetMode(args: string[], repo: Repo, fs: Fs): MapAnswer {
  if (args.length === 0) return usage("memory-map.sh --reset <path> [<path>...]");
  /** Each queued file once, with why it cannot go, empty when it can. */
  const queued = new Map<string, string>();
  const queue = (path: string, reason = ""): void => {
    if (!queued.has(path)) queued.set(path, reason || (repo.dirty.find((entry) => entry.path === path)?.word ?? (repo.isTracked.has(path) ? "" : "not-a-node")));
  };
  for (const target of args.map(bare)) {
    if (isNode(target)) {
      queue(target);
      for (const section of repo.sections) if (nodeOf(section) === target) queue(section);
    } else {
      queue(target, isSection(target) ? "" : "not-a-node");
    }
  }
  const refused = [...queued].filter(([, reason]) => reason !== "");
  if (refused.length > 0) return answer(refused.map(([path, reason]) => `refused: ${path} ${reason}`), 3);
  const targets = [...queued.keys()];
  for (const target of targets) fs.remove(`${repo.root}/${target}`);
  return answer([...targets.map((target) => `removed: ${target}`), `removed: ${targets.length}`]);
}

/** One node line: its own bytes, then those of every node a reader loads by the time it reaches this one. */
function nodeEntry(path: string, repo: Repo, fs: Fs): Entry {
  const own = bytesOf(path, repo, fs);
  let chain = own;
  for (let dir = dirOf(path); dir !== ""; ) {
    dir = dirOf(dir.slice(0, -1));
    if (isPresent(`${dir}CLAUDE.md`, repo, fs)) chain += bytesOf(`${dir}CLAUDE.md`, repo, fs);
  }
  // The node's own budget wins: shrinking the node shortens every chain below it too.
  const over = own > (path === "CLAUDE.md" ? ROOT_BUDGET : NODE_BUDGET) ? "OVER-NODE" : chain > CHAIN_BUDGET ? "OVER-CHAIN" : "ok";
  return { path, text: `${path} ${own} chain ${chain} ${over}` };
}

/** True when a tracked file other than the node and its own sections lies below its directory. */
function holdsOther(node: string, repo: Repo): boolean {
  const dir = dirOf(node);
  return repo.tracked.some((path) => path !== node && path.startsWith(dir) && !isSectionName(path.slice(dir.length)));
}

/** True when no reader reaches the section: no node beside it, or one never naming its file. */
function isUnlinked(section: string, repo: Repo, fs: Fs): boolean {
  const owner = nodeOf(section);
  return !isPresent(owner, repo, fs) || !(fs.readText(`${repo.root}/${owner}`) ?? "").includes(baseOf(section));
}

interface Area {
  files: number;
  bytes: number;
  node: boolean;
  tool: boolean;
  own: boolean;
  kids: Set<string>;
}

/** The directories that deserve a node and have none, every file counted in each directory above it. */
function candidatesOf(repo: Repo, fs: Fs): Layer["candidates"] {
  const areas = new Map<string, Area>();
  for (const path of repo.tracked) {
    const segments = path.split("/");
    const size = segments.length < 2 ? null : fs.size(`${repo.root}/${path}`);
    if (size === null) continue;
    const name = segments.pop() ?? "";
    segments.forEach((_, index) => {
      const dir = segments.slice(0, index + 1).join("/");
      const area = areas.get(dir) ?? { files: 0, bytes: 0, node: false, tool: false, own: false, kids: new Set<string>() };
      areas.set(dir, area);
      area.files += 1;
      area.bytes += size;
      if (index < segments.length - 1) {
        area.kids.add(segments[index + 1]);
        return;
      }
      area.own = true;
      if (name === "CLAUDE.md") area.node = true;
      if (isManifest(name)) area.tool = true;
    });
  }
  return [...areas]
    .filter(([dir, area]) => {
      if (area.node) return false;
      if (depthOf(dir) < 2) return area.files >= 3;
      // Deeper, a directory with no file of its own and one subdirectory is a passthrough.
      return area.tool || (area.files >= 20 && (area.own || area.kids.size !== 1));
    })
    .map(([dir, area]) => {
      const facts = `files ${area.files} bytes ${area.bytes} ${area.tool ? "toolchain" : "plain"}`;
      return { path: `${dir}/CLAUDE.md`, facts, text: `${dir} ${facts}` };
    })
    .sort((a, b) => byteOrder(a.text, b.text));
}

function layerOf(repo: Repo, fs: Fs): Layer {
  const present = repo.tracked.filter((path) => fs.exists(`${repo.root}/${path}`) && (isNode(path) || isSection(path))).sort(byDepth);
  const nodes = present.filter(isNode);
  const sections = present.filter(isSection);
  const candidates = candidatesOf(repo, fs);
  return {
    // Complete is the root node plus a node on every directory that deserves one.
    state: nodes.length === 0 ? "none" : nodes[0] === "CLAUDE.md" && candidates.length === 0 ? "complete" : "partial",
    nodes: nodes.map((path) => nodeEntry(path, repo, fs)),
    sections: sections.map((path) => {
      const own = bytesOf(path, repo, fs);
      return `${path} ${own} ${own > NODE_BUDGET ? "OVER-NODE" : "ok"}`;
    }),
    unlinked: sections.filter((path) => isUnlinked(path, repo, fs)),
    orphans: nodes.filter((path) => !holdsOther(path, repo)),
    candidates,
    dirty: repo.dirty.filter(({ path }) => fs.exists(`${repo.root}/${path}`)),
  };
}

function mapMode(layer: Layer, at: Date): MapAnswer {
  return answer([
    "# viber memory map",
    `id: ${stampOf(at)}`,
    `state: ${layer.state}`,
    ...layer.nodes.map((node) => `node: ${node.text}`),
    ...layer.sections.map((section) => `section: ${section}`),
    ...layer.unlinked.map((path) => `unlinked: ${path}`),
    ...layer.orphans.map((path) => `orphan: ${path}`),
    ...layer.candidates.map((candidate) => `cand: ${candidate.text}`),
    ...layer.dirty.map(({ path, word }) => `dirty: ${path} ${word}`),
    `total: nodes ${layer.nodes.length}`,
  ]);
}

/** The create targets of a mode, each with the text after its path: one per directory, the first form to claim it keeping it. */
function createTargets(call: TargetCall, layer: Layer, repo: Repo, { fs, git }: Ports): Map<string, string> {
  // A directory holding a dirty section is claimed up front: that section is the user's own work.
  const claimed = new Set(layer.dirty.map(({ path }) => path).filter(isSection).map(nodeOf));
  const created = new Map<string, string>();
  const create = (node: string, text: string): void => {
    if (claimed.has(node)) return;
    claimed.add(node);
    created.set(node, text);
  };
  if (call.mode === "review") return created;
  for (const candidate of layer.candidates) create(candidate.path, candidate.facts);
  if (call.mode === "reset") {
    for (const path of call.removed) {
      if (!isNode(path) && !isSection(path)) continue;
      const owner = nodeOf(path);
      // The removed section of a node still standing empties nothing.
      if (!isExcluded(path, repo.root, git) && !isPresent(owner, repo, fs)) create(owner, "removed");
    }
    return created;
  }
  for (const section of layer.unlinked) if (!isPresent(nodeOf(section), repo, fs)) create(nodeOf(section), `unlinked ${section}`);
  if (!isPresent("CLAUDE.md", repo, fs)) create("CLAUDE.md", "root");
  return created;
}

/** The form departures of one file from the template, in line order. A `##` line inside a fenced block is no heading. */
function shapeLines(path: string, kind: "node" | "section", repo: Repo, fs: Fs): string[] {
  const listed = kind === "node" ? HEADINGS : HEADINGS.slice(0, -1);
  const headings: Array<{ text: string; empty: boolean }> = [];
  let current: { text: string; empty: boolean } | null = null;
  let fence = "";
  for (const raw of (fs.readText(`${repo.root}/${path}`) ?? "").split("\n")) {
    const line = raw.replace(/\r$/, "");
    const opening = /^ *(`{3,}|~{3,})(.*)$/s.exec(line);
    if (fence !== "" || opening !== null) {
      if (current !== null) current.empty = false;
      if (fence === "") fence = opening?.[1] ?? "";
      else if (opening !== null && opening[1][0] === fence[0] && opening[1].length >= fence.length && /^[ \t]*$/.test(opening[2])) fence = "";
    } else if (line.startsWith("## ")) {
      current = { text: line.slice(3).replace(/[ \t]+$/, ""), empty: true };
      headings.push(current);
    } else if (line.startsWith("# ")) {
      current = null;
    } else if (current !== null && !/^[ \t]*$/.test(line)) {
      current.empty = false;
    }
  }
  const ranks = headings.map((heading) => listed.indexOf(heading.text));
  return headings.flatMap(({ text, empty }, index) => {
    const ahead = ranks.slice(index + 1).some((rank) => rank >= 0 && rank < ranks[index]);
    const departures = ranks[index] < 0 ? ["heading outside the template"] : ahead ? ["out of order"] : [];
    if (empty) departures.push("empty heading");
    return departures.map((departure) => `shape: ${baseOf(path)}: ${departure}: ${text}`);
  });
}

/** The planned set, then one auditor block per kept fix target. */
function keepMode(call: TargetCall, refs: string, fix: string[], created: string[], layer: Layer, repo: Repo, fs: Fs): MapAnswer {
  const stray = call.keep.find((path) => path !== "" && !fix.includes(path) && !created.includes(path));
  if (stray !== undefined) return fail(`--keep ${stray} is no target of the ${call.mode} mode`);
  const kept = new Set(call.keep);
  const planned = [...layer.nodes.map((node) => node.path), ...created.filter((path) => kept.has(path))].sort(byDepth);
  const blocks = fix.filter((path) => kept.has(path)).flatMap((path) => {
    const block = ["NEXT: memory-auditor", `target: ${path}`, `scope: ${dirOf(path).slice(0, -1) || "."}`, `out: .temp/viber/${call.id}/`, refs];
    // The root node and its sections are outside the template.
    if (path === "CLAUDE.md") return block;
    const beside = repo.sections.filter((section) => nodeOf(section) === path).sort(byteOrder);
    return [...block, ...shapeLines(path, "node", repo, fs), ...beside.flatMap((section) => shapeLines(section, "section", repo, fs))];
  });
  return answer([`planned: ${planned.join(",")}`, ...(blocks.length > 0 ? blocks : ["NEXT: none"])]);
}

function targetsMode(call: TargetCall, refs: string, repo: Repo, ports: Ports): MapAnswer {
  const layer = layerOf(repo, ports.fs);
  const fix = call.mode === "review" || call.mode === "both" ? layer.nodes : [];
  const created = createTargets(call, layer, repo, ports);
  if (call.keep.length > 0) return keepMode(call, refs, fix.map((node) => node.path), [...created.keys()], layer, repo, ports.fs);
  const lines = [...fix.map((node) => `target: fix ${node.text}`), ...[...created].map(([path, text]) => `target: create ${path} ${text}`)];
  return answer(lines.length > 0 ? [...lines, "NEXT: approve"] : ["NEXT: none"]);
}

/** The items of a comma-separated list, one leading `./` stripped, an empty one dropped. */
function itemsOf(list: string): string[] {
  return list.split(/[,\n]/).map(bare).filter((item) => item !== "");
}

/** The nodes the write waves left off, judged from the working tree as those waves left it: a `--done` dispatch only names its node handled. */
function reconcileMode(call: ReconcileCall, refs: string, root: string, fs: Fs): MapAnswer {
  const exists = (path: string): boolean => fs.exists(absolutePath(path, root));
  const planned = new Set(itemsOf(call.planned));
  const done = call.dispatches.filter((dispatch) => dispatch.kind === "done");
  const handled = new Set(done.map((dispatch) => dispatch.node));
  const doneFiles = done.flatMap((dispatch) => dispatch.files);
  const doneGone = new Set(doneFiles.filter((path) => !exists(path)));
  const doneMade = doneFiles.filter((path) => exists(path) && !planned.has(path));

  const standing = (path: string): boolean => exists(path) || doneGone.has(path);
  const records = call.dispatches
    .filter((dispatch) => dispatch.kind !== "done")
    .map(({ kind, node, files }) => {
      const written = files.filter(standing);
      return {
        written: new Set(written),
        made: written.filter((path) => (kind === "create" && path === node) || !planned.has(path)),
        deleted: files.filter((path) => !standing(path)),
      };
    });
  const known = new Set([...planned, ...records.flatMap((record) => [...record.written])]);
  const existing = [...known].filter(standing);
  const nextPlanned = [...new Set([...existing.filter(exists), ...doneMade])].sort(byDepth).join(",");

  const isOff = (node: string): boolean => {
    const dir = node.endsWith("CLAUDE.md") ? node.slice(0, -"CLAUDE.md".length) : node;
    const below = (paths: Iterable<string>): string[] => [...paths].filter((path) => path !== node && path.startsWith(dir));
    const wrote = records.filter((record) => record.written.has(node));
    if (wrote.length === 0) return records.some((record) => below([...record.made, ...record.deleted]).length > 0);
    const expected = new Set(below([...planned, ...wrote.flatMap((record) => record.made)]));
    const now = new Set(below(existing));
    return now.size !== expected.size || [...now].some((path) => !expected.has(path));
  };
  const pending = existing.filter((node) => node !== "CLAUDE.md" && !handled.has(node) && isOff(node)).sort(byDepth);
  if (pending.length === 0) return answer(["NEXT: none"]);
  const wave = depthOf(pending[pending.length - 1]);
  return answer(
    pending
      .filter((node) => depthOf(node) === wave)
      .flatMap((node) => [`NEXT: memory-node-writer | wave: ${wave}`, "mode: fix", `node: ${node}`, "findings: none", `planned: ${nextPlanned}`, refs]),
  );
}

/** The call the arguments after `--targets` make; a string: the reason it is unusable. */
function targetCall(args: string[]): TargetCall | string {
  if (args.length === 0) return "--targets needs a mode: review, extend, both or reset";
  const call: TargetCall = { mode: args[0], removed: [], id: "", keep: [] };
  if (!["review", "extend", "both", "reset"].includes(call.mode)) return `unknown mode ${call.mode}: review, extend, both or reset`;
  for (let i = 1; i < args.length; i += 2) {
    const [flag, value = ""] = args.slice(i);
    if (flag === "--removed") {
      if (value === "") return "--removed needs a path";
      if (call.mode !== "reset") return "--removed belongs to the reset mode alone";
      call.removed.push(bare(value));
    } else if (flag === "--id") {
      if (value === "") return "--id needs a map id";
      if (call.id !== "") return "--id given twice";
      call.id = value;
    } else if (flag === "--keep") {
      if (value === "") return "--keep needs a node path";
      call.keep.push(bare(value));
    } else return `unknown argument ${flag}`;
  }
  if (call.mode === "reset" && call.removed.length === 0) return "reset needs at least one --removed path";
  if (call.keep.length > 0 && call.id === "") return "--keep needs --id";
  if (call.id !== "" && call.keep.length === 0) return "--id needs at least one --keep path";
  return call;
}

/** The call the arguments after `--reconcile` make; a string: the reason it is unusable. */
function reconcileCall(args: string[]): ReconcileCall | string {
  let planned = "";
  let filled = false;
  const dispatches: Dispatch[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = args.slice(i);
    if (flag === "--planned") {
      if (!value) return "--planned needs a node list";
      if (planned !== "") return "--planned given twice";
      planned = value;
    } else if (flag === "--fix" || flag === "--create" || flag === "--done") {
      if (!value) return `${flag} needs a node path`;
      dispatches.push({ kind: flag.slice(2), node: bare(value), files: [] });
      filled = false;
    } else if (flag === "--files") {
      const last = dispatches.at(-1);
      if (last === undefined) return "--files needs a --fix, --create or --done before it";
      if (filled) return `--files given twice for ${last.node}`;
      if (value === undefined) return '--files needs a path list, "" for none';
      last.files = itemsOf(value).filter(isNode);
      filled = true;
    } else return `unknown argument ${flag}`;
  }
  return planned === "" ? "--reconcile needs --planned" : { planned, dispatches };
}

/** The stdout, stderr and exit code of one memory-map call, script being the path its entry was started by. Never throws. */
export function runMemoryMap(argv: string[], cwd: string, script: string, ports: Ports): MapAnswer {
  const { fs, git } = ports;
  const [mode, ...args] = argv;
  if (mode !== undefined && !["--reset", "--targets", "--reconcile"].includes(mode)) return usage("memory-map.sh [--reset <path> [<path>...]]");
  const targets = mode === "--targets" ? targetCall(args) : null;
  if (typeof targets === "string") return fail(targets);
  const reconcile = mode === "--reconcile" ? reconcileCall(args) : null;
  if (typeof reconcile === "string") return fail(reconcile);

  const root = projectRoot(cwd, git);
  const refs = `refs: ${rootAbove(script, 3)}/references`;
  if (reconcile !== null) return reconcileMode(reconcile, refs, root, fs);
  const repo = repoOf(root, git);
  if (mode === "--reset") return resetMode(args, repo, fs);
  if (targets !== null) return targetsMode(targets, refs, repo, ports);
  return mapMode(layerOf(repo, fs), ports.clock.now());
}
