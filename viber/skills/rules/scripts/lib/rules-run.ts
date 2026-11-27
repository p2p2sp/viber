/*
 * rules-run.ts - the four subcommands of rules.ts, whose header is their
 * contract. Reads and writes the work tree and asks git directly: nothing here
 * stages or commits.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { matchingRules, pathsOf, RULES_DIR, VIBER_DIR } from "../../../spec-implementor/scripts/lib/build-rules.ts";
import type { Ctx } from "../../../spec-implementor/scripts/lib/build-state.ts";
import { globRegex } from "../../../planner/scripts/lib/plan-order.ts";

// A constant, not configurable: the bytes of one rule.
const RULE_LIMIT = 2000;
// A constant, not configurable: the bytes of all of VIBER_DIR.
const DIR_LIMIT = 20000;

interface Target {
  /** Repo-relative, "" for the root. */
  dir: string;
  brief: string;
  note: string;
  rules: string[];
  room: number;
  sent: boolean;
  over: string[];
}

interface State {
  targets: Target[];
  /** Every file of VIBER_DIR at prepare: its hash and byte size. */
  files: Record<string, { hash: string; size: number }>;
  dead: string[];
}

class Usage extends Error {}

function git(root: string, args: string[]): { exit: number; out: string } {
  const done = spawnSync("git", args, { cwd: root, env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" }, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  return { exit: done.status ?? 1, out: done.stdout ?? "" };
}

const read = (root: string, path: string): string | null => {
  try {
    return fs.readFileSync(`${root}/${path}`, "utf-8");
  } catch {
    return null;
  }
};

const sizeOf = (root: string, path: string): number => (fs.existsSync(`${root}/${path}`) ? fs.statSync(`${root}/${path}`).size : 0);
const hashOf = (root: string, path: string): string | null => {
  const text = read(root, path);
  return text === null ? null : createHash("sha1").update(text).digest("hex");
};
const tracked = (root: string): string[] => git(root, ["ls-files", "-z"]).out.split("\0").filter((name) => name !== "");
/** False only for a file tracked and equal to HEAD: untracked, ignored, staged, changed or a failed git count as dirty. */
function dirty(root: string, path: string): boolean {
  if (git(root, ["ls-files", "--error-unmatch", "--", path]).exit !== 0) return true;
  if (git(root, ["cat-file", "-e", `HEAD:${path}`]).exit !== 0) return true;
  const status = git(root, ["status", "--porcelain", "-z", "--", path]);
  return status.exit !== 0 || status.out !== "";
}
const label = (dir: string): string => (dir === "" ? "." : dir);
const abs = (root: string, path: string): string => (path === "" ? root : `${root}/${path}`);
/** The argument, resolved against base, as a repo-relative path, "" for the root; refused outside the repository. */
function norm(root: string, base: string, arg: string): string {
  const rel = relative(root, resolve(base, arg)).replaceAll("\\", "/");
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Usage(`outside the repository: ${arg}`);
  return rel;
}

/** The `.md` files at and below the repo-relative directory, sorted. */
function mdFiles(root: string, dir: string): string[] {
  const abs = `${root}/${dir}`.replace(/\/$/, "");
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `${entry.parentPath.replaceAll("\\", "/")}/${entry.name}`.slice(root.length + 1))
    .sort();
}

const own = (root: string): string[] => mdFiles(root, RULES_DIR).filter((path) => !path.startsWith(VIBER_DIR));

/** The index of the target holding the most files the globs match, the first on a tie; -1 when none holds one. */
function ownerOf(globs: string[], files: string[], dirs: string[]): number {
  const patterns = globs.map(globRegex);
  const hits = files.filter((file) => patterns.some((pattern) => pattern.test(file)));
  let best = -1;
  let most = 0;
  dirs.forEach((dir, i) => {
    const count = hits.filter((file) => dir === "" || file.startsWith(`${dir}/`)).length;
    if (count > most) [best, most] = [i, count];
  });
  return best;
}

function workOf(root: string, id: string | undefined): string {
  if (id === undefined || !/^[\w.-]+$/.test(id) || /^\.+$/.test(id)) throw new Usage(`bad id: ${id ?? "none"}`);
  return `.temp/viber/${id}/rules`;
}

function loadState(root: string, work: string): State {
  const text = read(root, `${work}/state.json`);
  if (text === null) throw new Usage(`no ${work}/state.json: run prepare first`);
  return JSON.parse(text) as State;
}

function prepare(root: string, cwd: string, args: string[]): string[] {
  const work = workOf(root, args[0]);
  const mode = args[1];
  if (mode !== "update" && mode !== "rewrite") throw new Usage(`mode must be update or rewrite: ${mode ?? "none"}`);
  const cut = args.indexOf("--adopt");
  const dirs = [...new Set((cut < 0 ? args.slice(2) : args.slice(2, cut)).map((arg) => norm(root, cwd, arg)))];
  if (dirs.length === 0) dirs.push("");
  for (const dir of dirs) if (!fs.statSync(`${root}/${dir}`, { throwIfNoEntry: false })?.isDirectory()) throw new Usage(`no directory: ${dir}`);
  const picked = cut < 0 ? [] : args.slice(cut + 1).map((arg) => norm(root, cwd, arg));
  const before = mdFiles(root, VIBER_DIR);
  // Lower-cased: on a case-insensitive file system a rename would replace a rule.
  const names = new Set(before.map((path) => path.slice(path.lastIndexOf("/") + 1).toLowerCase()));
  for (const file of picked) {
    if (!file.startsWith(RULES_DIR) || file.startsWith(VIBER_DIR) || !file.endsWith(".md") || read(root, file) === null) throw new Usage(`not a user rule: ${file}`);
    const name = file.slice(file.lastIndexOf("/") + 1).toLowerCase();
    if (names.has(name)) throw new Usage(`file name taken in ${VIBER_DIR}: ${name}`);
    names.add(name);
  }

  const files = tracked(root);
  const ctx = { root, files: () => before, fs: { readText: (path: string) => read(root, path.slice(root.length + 1)) } } as unknown as Ctx;
  const alive = new Set(matchingRules(ctx, files.map((file) => `M\t${file}`).join("\n")));
  const dead = before.filter((rule) => !alive.has(rule) && pathsOf(read(root, rule) ?? "").length > 0);
  const owner = new Map<string, number>();
  for (const rule of before.filter((path) => !dead.includes(path))) {
    const globs = pathsOf(read(root, rule) ?? "");
    const index = globs.length === 0 ? 0 : ownerOf(globs, files, dirs);
    if (index >= 0) owner.set(rule, index);
  }
  const drop = mode === "update" ? [] : dirs.includes("") ? before.filter((path) => !dead.includes(path)) : [...owner.keys()];
  const refused = drop.filter((path) => dirty(root, path));
  if (refused.length > 0) return refused.map((path) => `REFUSED: ${path} has uncommitted changes`);

  const deadLines: string[] = [];
  const adopt: string[] = [];
  // Every file change from here on, named in the error when one fails.
  const done: string[] = [];
  try {
    fs.rmSync(`${root}/${work}`, { recursive: true, force: true });
    for (const rule of dead) {
      if (dirty(root, rule)) deadLines.push(`kept, uncommitted: ${rule}`);
      else {
        fs.rmSync(`${root}/${rule}`);
        deadLines.push(`deleted: ${rule}`);
        done.push(`deleted ${rule}`);
      }
    }
    for (const rule of drop) {
      fs.rmSync(`${root}/${rule}`);
      done.push(`deleted ${rule}`);
      owner.delete(rule);
    }
    for (const file of picked) {
      const globs = pathsOf(read(root, file) ?? "");
      if (globs.length === 0) {
        adopt.push(file);
        continue;
      }
      const dest = `${VIBER_DIR}${file.slice(file.lastIndexOf("/") + 1)}`;
      fs.mkdirSync(`${root}/${VIBER_DIR}`, { recursive: true });
      fs.renameSync(`${root}/${file}`, `${root}/${dest}`);
      done.push(`moved ${file} to ${dest}`);
      // An adopted rule is always verified: the first target when no target holds a file it matches.
      owner.set(dest, Math.max(0, ownerOf(globs, files, dirs)));
    }
    return write(root, work, mode, dirs, owner, adopt, deadLines);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; done before it: ${done.join(", ") || "nothing"}`);
  }
}

/** Writes the briefs and state.json of prepare and returns its BRIEF lines. */
function write(root: string, work: string, mode: string, dirs: string[], owner: Map<string, number>, adopt: string[], deadLines: string[]): string[] {
  const after = mdFiles(root, VIBER_DIR);
  const total = after.reduce((sum, path) => sum + sizeOf(root, path), 0);
  const free = DIR_LIMIT - total;
  const owned = dirs.map((_, i) => after.filter((path) => owner.get(path) === i).reduce((sum, path) => sum + sizeOf(root, path), 0));
  const ownedAll = owned.reduce((sum, size) => sum + size, 0);
  // Over the limit, the excess is split by the bytes each target owns: a target owning none gets 0.
  const rooms = owned.map((size) => (free >= 0 ? Math.floor(free / dirs.length) : ownedAll === 0 ? 0 : -Math.ceil((-free * size) / ownedAll)));
  const others = own(root);
  const state: State = { targets: [], files: {}, dead: deadLines };
  for (const path of after) state.files[path] = { hash: hashOf(root, path) ?? "", size: sizeOf(root, path) };
  const out: string[] = [];
  dirs.forEach((dir, i) => {
    const target: Target = { dir, brief: `${work}/brief-${i + 1}.md`, note: `${work}/note-${i + 1}.md`, rules: after.filter((path) => owner.get(path) === i), room: rooms[i], sent: false, over: [] };
    const lines = [`mode: ${mode}`, `target: ${abs(root, dir)}`, ...target.rules.map((path) => `rule: ${abs(root, path)}`), `rule limit: ${RULE_LIMIT} bytes`, `room: ${target.room} bytes`];
    lines.push(...others.filter((path) => i > 0 || !adopt.includes(path)).map((path) => `own: ${abs(root, path)}`));
    if (i === 0) lines.push(...adopt.map((path) => `adopt: ${abs(root, path)}`));
    lines.push(`note: ${abs(root, target.note)}`);
    fs.mkdirSync(`${root}/${work}`, { recursive: true });
    fs.writeFileSync(`${root}/${target.brief}`, `${lines.join("\n")}\n`);
    state.targets.push(target);
    out.push(`BRIEF: ${abs(root, target.brief)}`);
  });
  fs.writeFileSync(`${root}/${work}/state.json`, `${JSON.stringify(state, null, 2)}\n`);
  return out;
}

/** The lines of every note that open with the prefix after indentation and a `- ` or `* ` bullet, the prefix cut. */
function noted(root: string, state: State, prefix: string): string[][] {
  return state.targets.map((target) =>
    (read(root, target.note) ?? "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*]\s+)?/, ""))
      .filter((line) => line.startsWith(prefix))
      .map((line) => line.slice(prefix.length).trim()),
  );
}

function check(root: string, args: string[]): string[] {
  const work = workOf(root, args[0]);
  const state = loadState(root, work);
  const files = tracked(root);
  const dirs = state.targets.map((target) => target.dir);
  // The path before the first `|` of each `file:` line, absolute or repo-relative, as repo-relative.
  const claims = noted(root, state, "file:").map((lines) => lines.map((line) => relative(root, resolve(root, line.split("|")[0].trim())).replaceAll("\\", "/")));
  const paths = [...new Set([...mdFiles(root, VIBER_DIR), ...Object.keys(state.files)])];
  const changed = paths.filter((path) => hashOf(root, path) !== (state.files[path]?.hash ?? null));
  const mine: string[][] = dirs.map(() => []);
  for (const path of changed) {
    let index = claims.findIndex((claim) => claim.includes(path));
    if (index < 0) index = state.targets.findIndex((target) => target.rules.includes(path));
    if (index < 0) index = Math.max(0, ownerOf(pathsOf(read(root, path) ?? ""), files, dirs));
    mine[index].push(path);
  }
  const out: string[] = [];
  state.targets.forEach((target, i) => {
    const back: string[] = [];
    const over: string[] = [];
    let growth = 0;
    for (const path of mine[i]) {
      const text = read(root, path);
      const size = sizeOf(root, path);
      growth += size - (state.files[path]?.size ?? 0);
      if (text === null) continue;
      if (size > RULE_LIMIT) {
        back.push(`take off: ${size - RULE_LIMIT} bytes from ${path}`);
        over.push(`OVER: ${path} ${size - RULE_LIMIT} bytes`);
      }
      if (pathsOf(text).length === 0) {
        back.push(`no paths: ${path}`);
        over.push(`no paths: ${path}`);
      }
    }
    if (growth > target.room) {
      back.push(`take off: ${growth - target.room} bytes`);
      over.push(`OVER: ${label(target.dir)} ${growth - target.room} bytes`);
    }
    if (back.length > 0 && !target.sent) {
      target.sent = true;
      out.push(`BACK: ${abs(root, target.brief)} | ${back.join(" | ")}`);
    } else target.over = over;
  });
  fs.writeFileSync(`${root}/${work}/state.json`, `${JSON.stringify(state, null, 2)}\n`);
  return out.length > 0 ? out : ["DONE"];
}

function report(root: string, args: string[]): string[] {
  const work = workOf(root, args[0]);
  const state = loadState(root, work);
  const sections: [string, string[]][] = [
    ["Proposed checks", noted(root, state, "check:").flat()],
    ["CLAUDE.md", noted(root, state, "claude:").flat()],
    ["Removed rules", noted(root, state, "removed:").flat()],
    ["Dead rules", state.dead],
    ["Over budget", state.targets.flatMap((target) => target.over)],
    ["Missing notes", state.targets.filter((target) => read(root, target.note) === null).map((target) => target.note)],
  ];
  const out = ["# Rules report"];
  for (const [heading, items] of sections) if (items.length > 0) out.push("", `## ${heading}`, "", ...items.map((item) => `- ${item}`));
  fs.writeFileSync(`${root}/${work}/report.md`, `${out.join("\n")}\n`);
  return out;
}

/** Runs one call, prints its lines and returns the exit code. */
export function run(args: string[], cwd: string): number {
  try {
    const top = git(cwd, ["rev-parse", "--show-toplevel"]);
    if (top.exit !== 0) throw new Usage("not inside a git repository");
    const root = top.out.trim().replaceAll("\\", "/");
    const [command, ...rest] = args;
    let out: string[];
    if (command === "list") out = own(root).map((path) => `OWN: ${abs(root, path)}`);
    else if (command === "prepare") out = prepare(root, cwd, rest);
    else if (command === "check") out = check(root, rest);
    else if (command === "report") out = report(root, rest);
    else throw new Usage("usage: rules.sh list | prepare <id> <update|rewrite> [<dir>...] [--adopt <file>...] | check <id> | report <id>");
    if (out.length > 0) process.stdout.write(`${out.join("\n")}\n`);
    return out[0]?.startsWith("REFUSED:") ? 3 : 0;
  } catch (error) {
    process.stderr.write(`error: rules.sh: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
