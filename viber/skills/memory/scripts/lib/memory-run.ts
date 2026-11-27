/*
 * memory-run.ts - the prepare and report subcommands of memory.ts, whose header
 * is their contract. Reads and writes the work tree only; asks git for the
 * repository root, the tracked files and the status, never for a write, so the
 * index is never touched.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { isMemoryFile } from "./memory-file.ts";

class Usage extends Error {}

function git(cwd: string, args: string[]): { exit: number; out: string } {
  const done = spawnSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  return { exit: done.status ?? 1, out: done.stdout ?? "" };
}

const label = (dir: string): string => (dir === "" ? "." : dir);
const abs = (root: string, path: string): string => (path === "" ? root : `${root}/${path}`);
/** True when inner lies strictly below outer; "" is the root, which holds every other directory. */
const inside = (inner: string, outer: string): boolean => (outer === "" ? inner !== "" : inner.startsWith(`${outer}/`));
/** A CLAUDE*.md file: the only tracked files an orphan directory may hold. */
const CLAUDE_FILE = /^CLAUDE.*\.md$/;
/** The byte budgets of R19: a node or a section, and a chain of the root, the ancestor nodes and the node. */
const NODE_BUDGET = 6000;
const CHAIN_BUDGET = 16000;
/** The byte budget of R30: a root CLAUDE.md the run created. */
const ROOT_BUDGET = 2000;
/** A check violation: a file over its budget (size, excess in bytes) or a section its node does not name (unlinked). */
type Violation = { path: string; kind: "size" | "unlinked"; excess: number };
/** The BACK item of a violation, or with over, its over.txt line. */
const item = (v: Violation, over: boolean): string =>
  v.kind === "unlinked" ? `unlinked: ${v.path}` : over ? `OVER: ${v.path} ${v.excess} bytes` : `take off: ${v.excess} bytes from ${v.path}`;
const dirOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nodeOf = (dir: string): string => (dir === "" ? "CLAUDE.md" : `${dir}/CLAUDE.md`);
/** True when dir is target or lies below it. */
const within = (dir: string, target: string): boolean => dir === target || inside(dir, target);
/** The directories above dir, the root "" first, then each prefix of dir; dir is below the root. */
function above(dir: string): string[] {
  const parts = dir.split("/");
  return [""].concat(parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/")));
}

/** True for a node or section below the root in a target or below one. */
function nodeBelow(path: string, dirs: string[]): boolean {
  if (!isMemoryFile(path)) return false;
  const dir = dirOf(path);
  return dirs.some((target) => dir === target || inside(dir, target));
}

/**
 * The committed nodes and sections of the targets, below the root only: the
 * root directory is never listed. Only committed files, so every deletion is
 * in HEAD; the index is read, never written.
 */
function committedBelow(root: string, dirs: string[]): string[] {
  const listed = git(root, ["ls-files", "-z"]);
  if (listed.exit !== 0) throw new Usage("git ls-files failed");
  return listed.out.split("\0").filter((path) => nodeBelow(path, dirs));
}

/**
 * Every path git status lists: untracked, staged, modified or deleted. --no-optional-locks keeps git from
 * refreshing the index.
 */
function statusPaths(root: string): string[] {
  const status = git(root, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.exit !== 0) throw new Usage("git status failed");
  const fields = status.out.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.length < 4) continue;
    paths.push(field.slice(3));
    // A rename or copy is followed by its original path as a field of its own.
    if (/[RC]/.test(field.slice(0, 2))) i++;
  }
  return paths;
}

/**
 * The orphans of R31 in the whole repository below the root: a node or section
 * whose directory and its subdirectories hold no tracked file other than
 * CLAUDE*.md. An orphan that git status lists is kept; any other is deleted
 * from the work tree. Returns one report line per orphan, in path order.
 */
function orphans(root: string, status: string[]): string[] {
  const listed = git(root, ["ls-files", "-z"]);
  if (listed.exit !== 0) throw new Usage("git ls-files failed");
  const tracked = listed.out.split("\0").filter((path) => path !== "");
  const dirty = new Set(status);
  // A path gone from the work tree, deleted by an earlier run, is no orphan to report again.
  const candidates = [...new Set([...tracked, ...status])].filter((path) => nodeBelow(path, [""]) && fs.existsSync(`${root}/${path}`)).sort();
  const lines: string[] = [];
  for (const path of candidates) {
    const slash = path.lastIndexOf("/");
    const dir = path.slice(0, slash);
    if (tracked.some((other) => inside(other, dir) && !CLAUDE_FILE.test(other.slice(other.lastIndexOf("/") + 1)))) continue;
    if (dirty.has(path)) lines.push(`kept, uncommitted: ${path}`);
    else {
      fs.rmSync(`${root}/${path}`, { force: true });
      lines.push(`deleted: ${path}`);
    }
  }
  return lines;
}

/** The argument, resolved against base, as a repo-relative path, "" for the root; refused outside the repository. */
function norm(root: string, base: string, arg: string): string {
  const rel = relative(root, resolve(base, arg)).replaceAll("\\", "/");
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Usage(`outside the repository: ${arg}`);
  return rel;
}

function workOf(id: string | undefined): string {
  if (id === undefined || !/^[\w.-]+$/.test(id) || /^\.+$/.test(id)) throw new Usage(`bad id: ${id ?? "none"}`);
  return `.temp/viber/${id}/memory`;
}

function prepare(root: string, cwd: string, args: string[]): string[] {
  const work = workOf(args[0]);
  const mode = args[1];
  if (mode !== "update" && mode !== "rewrite") throw new Usage(`mode must be update or rewrite: ${mode ?? "none"}`);
  const dirs = [...new Set(args.slice(2).map((arg) => norm(root, cwd, arg)))];
  if (dirs.length === 0) dirs.push("");
  for (const dir of dirs) if (!fs.statSync(abs(root, dir), { throwIfNoEntry: false })?.isDirectory()) throw new Usage(`no directory: ${label(dir)}`);
  const status = statusPaths(root);
  if (mode === "rewrite") {
    const refused = status.filter((path) => nodeBelow(path, dirs)).sort();
    if (refused.length > 0) return refused.map((path) => `REFUSED: ${path}`);
  }

  fs.rmSync(`${root}/${work}`, { recursive: true, force: true });
  fs.mkdirSync(`${root}/${work}`, { recursive: true });
  fs.writeFileSync(`${root}/${work}/orphans.txt`, orphans(root, status).map((line) => `${line}\n`).join(""));
  if (mode === "rewrite") for (const path of committedBelow(root, dirs)) fs.rmSync(`${root}/${path}`, { force: true });
  const rootNew = !fs.existsSync(`${root}/CLAUDE.md`);
  const lines = dirs.map((dir, i) => {
    const brief = `${work}/brief-${i + 1}.md`;
    const note = `${work}/note-${i + 1}.md`;
    const others = dirs.filter((other) => inside(other, dir)).map((other) => `other: ${label(other)}\n`).join("");
    const rootLine = rootNew ? "root: new\n" : dir === "" ? "root: verify\n" : "";
    fs.writeFileSync(`${root}/${brief}`, `mode: ${mode}\nrepo: ${root}\ntarget: ${label(dir)}\nnote: ${note}\n${rootLine}${others}`);
    return `BRIEF: ${abs(root, brief)}`;
  });
  if (rootNew) {
    const brief = `${work}/brief-root.md`;
    fs.writeFileSync(`${root}/${brief}`, `mode: root\nrepo: ${root}\nnote: ${work}/note-root.md\n`);
    lines.push(`BRIEF: ${abs(root, brief)}`);
  }
  return lines;
}

/** The sections CLAUDE.md, Missing in CLAUDE.md, Orphan nodes and Over budget from the lines prepare, check and the root agent wrote; a section with no line is left out. */
function report(root: string, args: string[]): string[] {
  const work = workOf(args[0]);
  const file = `${root}/${work}/orphans.txt`;
  if (!fs.existsSync(file)) throw new Usage(`no prepare for ${args[0]}`);
  const lines = (path: string): string[] => (fs.existsSync(path) ? fs.readFileSync(path, "utf-8").split("\n").filter((line) => line !== "") : []);
  const sections = [
    ["## CLAUDE.md", "", ...claudeLines(root, args[0])],
    ["## Missing in CLAUDE.md", "", ...missingLines(root, args[0])],
    ["## Orphan nodes", "", ...lines(file)],
    ["## Over budget", "", ...lines(`${root}/${work}/over.txt`)],
  ].filter((section) => section.length > 2);
  return sections.flatMap((section, i) => (i === 0 ? section : ["", ...section]));
}

/** The briefs of prepare <id> in order: each absolute brief and note path with its target directory, "" for the root. */
function briefsOf(root: string, id: string | undefined): { brief: string; note: string; dir: string }[] {
  const work = workOf(id);
  const found: { brief: string; note: string; dir: string }[] = [];
  for (let k = 1; fs.existsSync(`${root}/${work}/brief-${k}.md`); k++) {
    const text = fs.readFileSync(`${root}/${work}/brief-${k}.md`, "utf-8");
    const line = text.split("\n").find((row) => row.startsWith("target: "));
    if (line === undefined) throw new Usage(`no target in brief-${k}.md`);
    const dir = line.slice("target: ".length);
    found.push({ brief: abs(root, `${work}/brief-${k}.md`), note: abs(root, `${work}/note-${k}.md`), dir: dir === "." ? "" : dir });
  }
  if (found.length === 0) throw new Usage(`no prepare for ${id}`);
  return found;
}

/** The claude: lines of the note of the root target's brief, in note order; none when no target is the root or its note is missing. */
function claudeLines(root: string, id: string | undefined): string[] {
  const rootBrief = briefsOf(root, id).find((brief) => brief.dir === "");
  if (rootBrief === undefined || !fs.existsSync(rootBrief.note)) return [];
  return fs.readFileSync(rootBrief.note, "utf-8").split("\n").filter((line) => line.startsWith("claude: "));
}

/** The missing: lines of the note of the mode root brief, in note order; none when the root brief wrote no note. */
function missingLines(root: string, id: string | undefined): string[] {
  const note = `${root}/${workOf(id)}/note-root.md`;
  if (!fs.existsSync(note)) return [];
  return fs.readFileSync(note, "utf-8").split("\n").filter((line) => line.startsWith("missing: "));
}

/** The deepest target holding dir, or undefined when no target holds it. */
function deepest(dir: string, dirs: string[]): string | undefined {
  return dirs.filter((target) => within(dir, target)).sort((a, b) => b.length - a.length)[0];
}

/**
 * The violations of R19 after the agents returned: one BACK line per target in brief order, or DONE. A node or
 * a section over 6000 bytes is a violation; so is a node whose chain is over 16000 bytes while the chain files
 * outside its target stay within 16000, its excess being the chain's. A file is named once per kind, by its larger
 * excess. A section its node does not name (a whole-word file name on a line of the CLAUDE.md of its directory; no
 * node names none) is an unlinked violation, no excess. A file belongs to its deepest target.
 * A root CLAUDE.md over 2000 bytes (R30) is a violation only when <work>/brief-root.md exists, prepare
 * writing it only while the root was missing: its BACK line, `take off: <n> bytes from CLAUDE.md`, comes
 * after the target lines, its brief being brief-root.md. Any other root CLAUDE.md is never named by BACK
 * (R23); CLAUDE.local.md is never checked.
 * A target already in <work>/sent.txt (sent back by an earlier check) gets no BACK line: its violations go to
 * <work>/over.txt, as OVER lines or `unlinked: <file>`, for report. A chain whose files outside the target (the root and the ancestor nodes
 * outside it) alone exceed 16000 bytes costs the target nothing: each such file goes to over.txt by its size, once,
 * whatever the target's state. Every BACK target is added to sent.txt. Deletes and restores nothing.
 */
function check(root: string, args: string[]): string[] {
  const briefs = briefsOf(root, args[0]);
  const dirs = briefs.map((brief) => brief.dir);
  const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (listed.exit !== 0) throw new Usage("git ls-files failed");
  const present = [...new Set(listed.out.split("\0"))].filter((path) => path !== "" && fs.existsSync(`${root}/${path}`));
  const size = (path: string): number => fs.statSync(`${root}/${path}`).size;
  const nodes = new Set(present.filter((path) => path === "CLAUDE.md" || path.endsWith("/CLAUDE.md")));
  const sections = present.filter((path) => !nodes.has(path) && isMemoryFile(path));
  const found = new Map<string, Violation[]>();
  const flag = (target: string, violation: Violation): void => {
    found.set(target, [...(found.get(target) ?? []), violation]);
  };
  // A section is linked when its node holds its file name as a whole word.
  const linked = (path: string): boolean => {
    const node = nodeOf(dirOf(path));
    if (!nodes.has(node)) return false;
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\w.-])${name}(?![\\w.-])`).test(fs.readFileSync(`${root}/${node}`, "utf-8"));
  };
  // The files outside the target of an over-budget chain, path -> size.
  const outsideOver = new Map<string, number>();
  for (const path of sections) {
    const target = deepest(dirOf(path), dirs);
    if (target === undefined) continue;
    if (size(path) > NODE_BUDGET) flag(target, { path, kind: "size", excess: size(path) - NODE_BUDGET });
    if (!linked(path)) flag(target, { path, kind: "unlinked", excess: 0 });
  }
  for (const path of nodes) {
    const dir = dirOf(path);
    const target = dir === "" ? undefined : deepest(dir, dirs);
    if (target === undefined) continue;
    const ancestors = above(dir).map(nodeOf).filter((file) => nodes.has(file));
    const chain = [...ancestors, path].reduce((sum, file) => sum + size(file), 0);
    const beyond = ancestors.filter((file) => !within(dirOf(file), target));
    const outside = beyond.reduce((sum, file) => sum + size(file), 0);
    if (outside > CHAIN_BUDGET) for (const file of beyond) outsideOver.set(file, size(file));
    const chainExcess = outside <= CHAIN_BUDGET ? chain - CHAIN_BUDGET : 0;
    const excess = Math.max(size(path) - NODE_BUDGET, chainExcess);
    if (excess > 0) flag(target, { path, kind: "size", excess });
  }
  const work = `${root}/${workOf(args[0])}`;
  const sentFile = `${work}/sent.txt`;
  const sent = new Set(fs.existsSync(sentFile) ? fs.readFileSync(sentFile, "utf-8").split("\n").filter((line) => line !== "") : []);
  const byPath = (a: Violation, b: Violation): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  // over.txt entries by kind and path: a file outside a chain by its size, a sent-back violation replaces the entry of its kind.
  const over = new Map<string, { path: string; kind: string; line: string }>();
  for (const [path, bytes] of outsideOver) over.set(`size ${path}`, { path, kind: "size", line: `OVER: ${path} ${bytes} bytes` });
  const lines = briefs.flatMap(({ brief, dir }) => {
    const list = (found.get(dir) ?? []).sort(byPath);
    if (list.length === 0) return [];
    if (sent.has(label(dir))) {
      for (const v of list) over.set(`${v.kind} ${v.path}`, { path: v.path, kind: v.kind, line: item(v, true) });
      return [];
    }
    sent.add(label(dir));
    return [`BACK: ${brief} | ${list.map((v) => item(v, false)).join(" | ")}`];
  });
  // The created root (R30): prepare wrote brief-root.md, so the run created the root; it is keyed in sent.txt by that brief path.
  const rootKey = `${workOf(args[0])}/brief-root.md`;
  const rootExcess = fs.existsSync(`${root}/${rootKey}`) && fs.existsSync(`${root}/CLAUDE.md`) ? size("CLAUDE.md") - ROOT_BUDGET : 0;
  if (rootExcess > 0) {
    if (sent.has(rootKey)) over.set("size CLAUDE.md", { path: "CLAUDE.md", kind: "size", line: `OVER: CLAUDE.md ${rootExcess} bytes` });
    else {
      sent.add(rootKey);
      lines.push(`BACK: ${abs(root, rootKey)} | ${item({ path: "CLAUDE.md", kind: "size", excess: rootExcess }, false)}`);
    }
  }
  fs.writeFileSync(sentFile, [...sent].map((line) => `${line}\n`).join(""));
  const sorted = [...over.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  fs.writeFileSync(`${work}/over.txt`, sorted.map(({ line }) => `${line}\n`).join(""));
  return lines.length > 0 ? lines : ["DONE"];
}

/** Runs one call, prints its lines and returns the exit code. */
export function run(args: string[], cwd: string): number {
  try {
    const top = git(cwd, ["rev-parse", "--show-toplevel"]);
    if (top.exit !== 0) throw new Usage("not inside a git repository");
    const root = top.out.trim().replaceAll("\\", "/");
    const [command, ...rest] = args;
    let out: string[];
    if (command === "prepare") out = prepare(root, cwd, rest);
    else if (command === "check") out = check(root, rest);
    else if (command === "report") out = report(root, rest);
    else throw new Usage("usage: memory.sh prepare <id> update|rewrite [<dir>...] | check <id> | report <id>");
    if (out.length > 0) process.stdout.write(`${out.join("\n")}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: memory.sh: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
