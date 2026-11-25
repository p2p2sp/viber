/*
 * fakes.ts - in-memory Fs, Git, GitWrite and Clock holding their own state, seeded
 * from SCENE_STATE and HISTORY_STATE through fakeScene and from WRITE_STATE through
 * fakeThrowaway. Each passes the contract
 * cases of ports-contract.ts.
 */

import type { ChangedFile, Clock, Fs, Git, GitWrite, StagedFile, StatusEntry, TrackedFile } from "../../viber/lib/ports.ts";
import { HISTORY_STATE, SCENE_STATE, WRITE_STATE, type Throwaway, type ThrowawayOpts } from "./ports-contract.ts";

export interface FakeFsOpts {
  /** Files that exist yet cannot be read. */
  unreadable?: string[];
  /** Directories holding no file. */
  dirs?: string[];
  /** Links: the link's path to the absolute path it names, a directory or a file. */
  links?: Record<string, string>;
  /** Files carrying an exec bit; every other file carries none. */
  exec?: string[];
}

/**
 * files: absolute paths, forward slashes, a string held as its UTF-8 bytes; a
 * directory exists when a file sits below it, when opts.dirs names it or once
 * makeDir created it. The fake copies what it is given: a write changes the
 * fake alone, read back through its own methods.
 */
export function fakeFs(files: Record<string, string | Uint8Array>, opts: FakeFsOpts = {}): Fs {
  const unreadable = opts.unreadable ?? [];
  let links = Object.entries(opts.links ?? {});
  const dirs = new Set(opts.dirs ?? []);
  const exec = new Set(opts.exec ?? []);
  const store = new Map<string, Uint8Array>();
  for (const [p, body] of Object.entries(files)) store.set(p, typeof body === "string" ? new TextEncoder().encode(body) : body.slice());

  const clean = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const below = (dir: string): string => (dir === "/" ? "/" : `${dir}/`);
  /** The cleaned path, every link on its way replaced by the directory it names. */
  const resolve = (p: string): string => {
    let key = clean(p);
    for (let hop = 0; hop < 16; hop++) {
      const link = links.find(([from]) => key === from || key.startsWith(`${from}/`));
      if (!link) break;
      key = link[1] + key.slice(link[0].length);
    }
    return key;
  };
  /** The cleaned path, the links above its last name resolved, that name itself not. */
  const beside = (p: string): string => {
    const key = clean(p);
    const cut = key.lastIndexOf("/");
    return cut < 1 ? key : `${resolve(key.slice(0, cut))}${key.slice(cut)}`;
  };
  const at = (key: string, path: string): boolean => path === key || path.startsWith(below(key));
  const known = (): string[] => [...store.keys(), ...unreadable, ...dirs];
  const kindOf = (key: string): "file" | "dir" | null => {
    if (store.has(key) || unreadable.includes(key)) return "file";
    return known().some((f) => f === key || f.startsWith(below(key))) ? "dir" : null;
  };
  const bytesOf = (p: string): Uint8Array | null => {
    const key = resolve(p);
    return unreadable.includes(key) ? null : (store.get(key) ?? null);
  };

  return {
    readText(p) {
      const bytes = bytesOf(p);
      return bytes === null ? null : new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    },
    readBytes(p) {
      return bytesOf(p)?.slice() ?? null;
    },
    size(p) {
      return bytesOf(p)?.length ?? null;
    },
    exists(p) {
      return kindOf(resolve(p)) !== null;
    },
    kind(p) {
      return kindOf(resolve(p));
    },
    realPath(p) {
      const key = resolve(p);
      return kindOf(key) === null ? null : key;
    },
    listDir(p) {
      const prefix = below(resolve(p));
      const entries = [...known(), ...links.map(([from]) => from)].filter((f) => f.startsWith(prefix));
      return [...new Set(entries.map((f) => f.slice(prefix.length).split("/")[0]))].sort();
    },
    executable(p) {
      const key = resolve(p);
      return kindOf(key) !== null && exec.has(key);
    },
    isLink(p) {
      return links.some(([from]) => from === beside(p));
    },
    setExecutable(p, on) {
      const key = resolve(p);
      if (kindOf(key) === null) return false;
      if (on) exec.add(key);
      else exec.delete(key);
      return true;
    },
    makeDir(p) {
      const key = resolve(p);
      for (let cut = key.indexOf("/", 1); ; cut = key.indexOf("/", cut + 1)) {
        if (kindOf(cut < 0 ? key : key.slice(0, cut)) === "file") return false;
        if (cut < 0) break;
      }
      dirs.add(key);
      return true;
    },
    writeBytes(p, bytes) {
      const key = resolve(p);
      if (kindOf(key) === "dir" || kindOf(key.slice(0, key.lastIndexOf("/")) || "/") !== "dir") return false;
      store.set(key, bytes.slice());
      return true;
    },
    appendBytes(p, bytes) {
      const key = resolve(p);
      if (kindOf(key) === "dir" || kindOf(key.slice(0, key.lastIndexOf("/")) || "/") !== "dir") return false;
      const old = store.get(key) ?? new Uint8Array(0);
      const whole = new Uint8Array(old.length + bytes.length);
      whole.set(old);
      whole.set(bytes, old.length);
      store.set(key, whole);
      return true;
    },
    replace(from, to) {
      const [source, target] = [resolve(from), resolve(to)];
      const bytes = store.get(source);
      if (bytes === undefined || kindOf(target) === "dir" || kindOf(target.slice(0, target.lastIndexOf("/")) || "/") !== "dir") return false;
      if (source === target) return true;
      store.delete(source);
      // The directory stays behind its last file, as on disk.
      dirs.add(source.slice(0, source.lastIndexOf("/")) || "/");
      store.set(target, bytes);
      return true;
    },
    move(from, to) {
      const [source, target] = [beside(from), beside(to)];
      const named = links.some(([link]) => link === source);
      if ((!named && kindOf(source) === null) || links.some(([link]) => link === target) || kindOf(target) !== null) return false;
      if (kindOf(target.slice(0, target.lastIndexOf("/")) || "/") !== "dir") return false;
      const moved = (path: string): string => (at(source, path) ? target + path.slice(source.length) : path);
      for (const [path, bytes] of [...store]) {
        if (!at(source, path)) continue;
        store.delete(path);
        store.set(moved(path), bytes);
      }
      for (const set of [dirs, exec]) {
        for (const path of [...set]) {
          if (!at(source, path)) continue;
          set.delete(path);
          set.add(moved(path));
        }
      }
      links = links.map(([link, names]) => [moved(link), names]);
      dirs.add(source.slice(0, source.lastIndexOf("/")) || "/");
      return true;
    },
    removeTree(p) {
      const key = beside(p);
      const stood = links.some(([link]) => at(key, link)) || kindOf(key) !== null;
      links = links.filter(([link]) => !at(key, link));
      for (const path of [...store.keys()]) if (at(key, path)) store.delete(path);
      for (const set of [dirs, exec]) for (const path of [...set]) if (at(key, path)) set.delete(path);
      // The directory stays behind its last entry, as on disk.
      const parent = key.slice(0, key.lastIndexOf("/")) || "/";
      if (stood) dirs.add(parent);
      return true;
    },
    remove(p) {
      const key = resolve(p);
      if (kindOf(key) === "dir") return false;
      // The directory stays behind its last file, as on disk.
      if (store.delete(key)) dirs.add(key.slice(0, key.lastIndexOf("/")) || "/");
      return true;
    },
    removeEmptyDir(p) {
      const key = resolve(p);
      if (links.some(([from]) => from === clean(p) || from.startsWith(below(key))) || kindOf(key) !== "dir") return false;
      if (known().some((f) => f.startsWith(below(key)))) return false;
      dirs.delete(key);
      const parent = key.slice(0, key.lastIndexOf("/")) || "/";
      if (parent !== key) dirs.add(parent);
      return true;
    },
  };
}

/** What git answers in one repository: each table is looked up by the text it is asked with, nothing is derived from another. */
export interface FakeRepo {
  root: string;
  tracked: TrackedFile[];
  /** The branch HEAD stands on, `main` when left out; null: a detached HEAD. */
  branch?: string | null;
  /** The commit each ref names: a ref (`HEAD`, `refs/heads/main`, `v1`, `HEAD~1`) to its full sha. A sha held here names itself. */
  commits?: Record<string, string>;
  /** The symbolic refs beside HEAD: a name to the full ref it points at. HEAD follows `branch`. */
  symbolic?: Record<string, string>;
  /** The merge bases, each under the key `<a> <b>` as asked. */
  mergeBases?: Record<string, string>;
  /** The commits that added a path, oldest first, by repo-relative path. */
  added?: Record<string, string[]>;
  /** The files differing from a base, by the base as asked; the key `""` holds the answer for no base. */
  changed?: Record<string, ChangedFile[]>;
  untracked?: string[];
  /** The tracked files the ignore rules exclude all the same, in index order. */
  trackedIgnored?: string[];
  /** The paths the ignore rules exclude, each as asked. */
  ignored?: string[];
  status?: StatusEntry[];
  /** The files HEAD holds, repo-relative. */
  head?: string[];
  staged?: StagedFile[];
  /** What git prints for a person, by kind; the paths asked for are left out. */
  reports?: Partial<Record<"log" | "status" | "stat" | "diff", string>>;
  /** The text files grep reads, a repo-relative path to its content, in git order: the one answer the fake derives, a line held when it holds a term. */
  texts?: Record<string, string>;
}

/** True when the line holds the term, with word true only where no letter, digit or underscore stands right before or after it. */
function holds(line: string, term: string, word: boolean): boolean {
  for (let at = line.indexOf(term); at >= 0; at = line.indexOf(term, at + 1)) {
    if (!word || !/\w/.test(`${line[at - 1] ?? ""}${line[at + term.length] ?? ""}`)) return true;
  }
  return false;
}

/** A path asked of git as the repo-relative text it names; empty for the root. */
function relative(root: string, path: string): string {
  const rest = path === root || path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  return rest.replace(/^\.\//, "").replace(/\/+$/, "").replace(/^\.$/, "");
}

/** True when the file lies at or below the repo-relative path. */
const covers = (path: string, file: string): boolean => path === "" || file === path || file.startsWith(`${path}/`);

/** One repository or several apart from each other; null: no repository anywhere. */
export function fakeGit(repos: FakeRepo | FakeRepo[] | null): Git {
  const all = repos === null ? [] : Array.isArray(repos) ? repos : [repos];
  const holding = (cwd: string): FakeRepo | undefined => all.find((repo) => cwd === repo.root || cwd.startsWith(`${repo.root}/`));
  const at = (root: string): FakeRepo | undefined => all.find((repo) => repo.root === root);
  return {
    commit(root, ref) {
      const commits = at(root)?.commits ?? {};
      return commits[ref] ?? (Object.values(commits).includes(ref) ? ref : null);
    },
    symbolicRef(root, name) {
      const repo = at(root);
      if (repo === undefined) return null;
      if (name === "HEAD") return repo.branch === null ? null : `refs/heads/${repo.branch ?? "main"}`;
      return repo.symbolic?.[name] ?? null;
    },
    mergeBase(root, a, b) {
      return at(root)?.mergeBases?.[`${a} ${b}`] ?? null;
    },
    firstAdded(root, path) {
      const rel = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
      return at(root)?.added?.[rel]?.[0] ?? null;
    },
    changedFiles(root, base) {
      return at(root)?.changed?.[base ?? ""]?.map((file) => ({ ...file })) ?? [];
    },
    isRepository(cwd) {
      return holding(cwd) !== undefined;
    },
    shortCommit(root, ref) {
      return this.commit(root, ref)?.slice(0, 7) ?? null;
    },
    indexHolds(root, path) {
      return at(root)?.tracked.some((file) => covers(relative(root, path), file.path)) ?? false;
    },
    headHolds(root, path) {
      return at(root)?.head?.some((file) => covers(relative(root, path), file)) ?? false;
    },
    stagedFiles(root, paths) {
      const repo = at(root);
      if (repo === undefined) return null;
      return (repo.staged ?? []).filter((file) => paths === null || paths.some((path) => covers(relative(root, path), file.path))).map((file) => ({ ...file }));
    },
    report(root, kind) {
      return at(root)?.reports?.[kind] ?? "";
    },
    untrackedFiles(root, path) {
      return (at(root)?.untracked ?? []).filter((file) => path === undefined || covers(relative(root, path), file));
    },
    trackedIgnored(root) {
      return [...(at(root)?.trackedIgnored ?? [])];
    },
    ignored(root, path) {
      return at(root)?.ignored?.includes(path) ?? false;
    },
    status(root) {
      return at(root)?.status?.map((entry) => ({ ...entry })) ?? [];
    },
    grep(root, terms, word) {
      return Object.entries(at(root)?.texts ?? {}).flatMap(([path, text]) =>
        text
          .replace(/\n$/, "")
          .split("\n")
          .map((line, index) => ({ path, line: index + 1, text: line }))
          .filter((hit) => terms.some((term) => holds(hit.text, term, word))),
      );
    },
    repoRoot(cwd) {
      return holding(cwd)?.root ?? null;
    },
    trackedFiles(root) {
      return all.find((repo) => repo.root === root)?.tracked.map((t) => ({ ...t })) ?? [];
    },
    branch(cwd) {
      const repo = holding(cwd);
      return repo === undefined || repo.branch === null ? null : (repo.branch ?? "main");
    },
  };
}

export interface FakeRepositoryOpts {
  /** The files of the first commit, texts; null: a branch with no commit yet. */
  head: Record<string, string> | null;
  /** The files of the first commit HEAD holds as 100755. */
  exec?: string[];
  /** core.fileMode, true when left out. */
  fileMode?: boolean;
  /** The files and directories the ignore rules exclude, repo-relative. */
  ignored?: string[];
  /** A detached HEAD; on `main` when left out. */
  detached?: boolean;
  /** The exit of a pre-commit hook that refuses; 0 when left out. */
  hook?: number;
  /** The exit of a post-checkout hook; 0 when left out. */
  checkout?: number;
  /** A write that fails before it does anything, with its exit. */
  fails?: Partial<Record<"stageTracked" | "stage" | "stageAll" | "commit" | "move" | "removeTracked", number>>;
}

export interface FakeCommit {
  message: string;
  /** The text and mode of each file, repo-relative. */
  files: Record<string, { mode: string; text: string }>;
}

export interface FakeRepository {
  git: Git;
  write: GitWrite;
  /** Every commit after the first one, oldest first. */
  commits: FakeCommit[];
  /** Stages the mode of an indexed file, as `git update-index --chmod` does. */
  stageMode(path: string, mode: string): void;
}

/**
 * One repository git can write: an index and a HEAD over the work tree fs
 * holds, every read GitWrite's callers make derived from them (unlike fakeGit,
 * whose answers are tables). The index starts as HEAD; a link is no file of it.
 */
export function fakeRepository(root: string, fs: Fs, opts: FakeRepositoryOpts): FakeRepository {
  interface Entry {
    mode: string;
    text: string;
  }
  type Files = Map<string, Entry>;
  const fileMode = opts.fileMode ?? true;
  const first = opts.head === null ? null : new Map(Object.entries(opts.head).map(([path, text]): [string, Entry] => [path, { mode: opts.exec?.includes(path) ? "100755" : "100644", text }]));
  let head: Files = new Map(first ?? []);
  let index: Files = new Map(head);
  let count = first === null ? 0 : 1;
  const commits: FakeCommit[] = [];
  const worktrees = new Set<string>();

  const rel = (path: string): string => relative(root, path);
  const ignored = (file: string): boolean => (opts.ignored ?? []).some((path) => covers(path, file));
  const disk = (dir = ""): string[] =>
    fs.listDir(`${root}/${dir}`.replace(/\/$/, "")).flatMap((name) => {
      const path = `${dir}${name}`;
      if (path === ".git" || fs.isLink(`${root}/${path}`)) return [];
      return fs.kind(`${root}/${path}`) === "dir" ? (worktrees.has(`${root}/${path}`) ? [] : disk(`${path}/`)) : [path];
    });
  const untracked = (path: string): string[] => disk().filter((file) => covers(path, file) && !index.has(file) && !ignored(file));
  const tracked = (path: string): string[] => [...index.keys()].filter((file) => covers(path, file));
  const take = (file: string): void => {
    const text = fs.kind(`${root}/${file}`) === "file" ? fs.readText(`${root}/${file}`) : null;
    if (text === null) index.delete(file);
    else index.set(file, { mode: fileMode ? (fs.executable(`${root}/${file}`) ? "100755" : "100644") : (index.get(file)?.mode ?? "100644"), text });
  };
  const staged = (paths: string[] | null): StagedFile[] =>
    [...new Set([...head.keys(), ...index.keys()])]
      .filter((file) => paths === null || paths.some((path) => covers(rel(path), file)))
      .filter((file) => head.get(file)?.mode !== index.get(file)?.mode || head.get(file)?.text !== index.get(file)?.text)
      .sort()
      .map((path) => ({ path, from: head.get(path)?.mode ?? "000000", mode: index.get(path)?.mode ?? "000000" }));
  const sha = (): string | null => (count === 0 ? null : String(count).padStart(7, "0").padEnd(40, "0"));
  /** The exit a write was told to fail with, else what it does. */
  const unless = (name: keyof NonNullable<FakeRepositoryOpts["fails"]>, run: () => number): number => opts.fails?.[name] ?? run();

  const git: Git = {
    ...fakeGit({ root, tracked: [], branch: opts.detached ? null : "main" }),
    repoRoot: (cwd) => [...worktrees].find((tree) => fs.exists(tree) && (cwd === tree || cwd.startsWith(`${tree}/`))) ?? (cwd === root || cwd.startsWith(`${root}/`) ? root : null),
    commit: (_, ref) => (ref === "HEAD" ? sha() : null),
    shortCommit: (_, ref) => (ref === "HEAD" ? (sha()?.slice(0, 7) ?? null) : null),
    trackedFiles: () => [...index].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, entry]) => ({ path, mode: entry.mode })),
    indexHolds: (_, path) => tracked(rel(path)).length > 0,
    headHolds: (_, path) => [...head.keys()].some((file) => covers(rel(path), file)),
    stagedFiles: (_, paths) => staged(paths),
    untrackedFiles: (_, path) => untracked(rel(path ?? "")),
    changedFiles: () => [...head].filter(([path, entry]) => fs.readText(`${root}/${path}`) !== entry.text).map(([path]) => ({ status: fs.exists(`${root}/${path}`) ? "M" : "D", path })),
    report: (_, kind) => (kind === "log" ? [...commits].reverse().map((commit, i) => `${String(count - i).padStart(7, "0")} ${commit.message.split("\n")[0]}\n`).join("") : ""),
  };

  const addWorktree = (path: string): number => {
    if (count === 0 || worktrees.has(path) || (fs.exists(path) && fs.listDir(path).length + (fs.kind(path) === "file" ? 1 : 0) > 0)) return 128;
    if (!fs.makeDir(path)) return 128;
    for (const [file, entry] of head) {
      fs.makeDir(`${path}/${file}`.slice(0, `${path}/${file}`.lastIndexOf("/")));
      fs.writeBytes(`${path}/${file}`, new TextEncoder().encode(entry.text));
    }
    fs.writeBytes(`${path}/.git`, new TextEncoder().encode("gitdir: elsewhere\n"));
    worktrees.add(path);
    return opts.checkout ?? 0;
  };
  const told = (exit: number, output: string) => ({ exit, output: exit === 0 ? "" : output });

  const write: GitWrite = {
    stageTracked: (_, path) =>
      unless("stageTracked", () => {
        const files = tracked(rel(path));
        files.forEach(take);
        return files.length > 0 ? 0 : 128;
      }),
    stage: (_, paths) =>
      unless("stage", () => {
        const named = paths.map(rel);
        const files = disk();
        if (named.some((path) => !files.some((file) => covers(path, file)) && tracked(path).length === 0)) return 128;
        if (named.some((path) => ignored(path) && !index.has(path))) return 1;
        for (const path of named) for (const file of [...tracked(path), ...untracked(path)]) take(file);
        return 0;
      }),
    stageAll: (_, path) =>
      unless("stageAll", () => {
        const files = [...tracked(rel(path ?? "")), ...untracked(rel(path ?? ""))];
        files.forEach(take);
        return path !== null && files.length === 0 ? 128 : 0;
      }),
    commit: (_, message, paths) =>
      unless("commit", () => {
        if (opts.hook) return opts.hook;
        if (staged(paths).length === 0) return 1;
        const named = (file: string): boolean => paths === null || paths.some((path) => covers(rel(path), file));
        head = new Map([...[...head].filter(([file]) => !named(file)), ...[...index].filter(([file]) => named(file))]);
        count += 1;
        commits.push({ message, files: Object.fromEntries([...head].map(([file, entry]) => [file, { ...entry }])) });
        return 0;
      }),
    move: (_, from, to) =>
      unless("move", () => {
        const [source, target] = [rel(from), rel(to)];
        const files = tracked(source);
        if (files.length === 0 || !fs.move(`${root}/${source}`, `${root}/${target}`)) return 128;
        for (const file of files) {
          index.set(target + file.slice(source.length), index.get(file)!);
          index.delete(file);
        }
        return 0;
      }),
    removeTracked: (_, path) =>
      unless("removeTracked", () => {
        for (const file of tracked(rel(path))) {
          index.delete(file);
          fs.remove(`${root}/${file}`);
          // git takes the directories its last file leaves empty.
          for (let dir = file; dir.includes("/"); ) {
            dir = dir.slice(0, dir.lastIndexOf("/"));
            if (!fs.removeEmptyDir(`${root}/${dir}`)) break;
          }
        }
        return 0;
      }),
    addWorktree: (_, path) => told(addWorktree(path.replace(/\/+$/, "")), "fatal: cannot add\n"),
    removeWorktree: (_, path) => {
      if (!worktrees.has(path) || !fs.exists(path)) return told(128, "fatal: not a working tree\n");
      worktrees.delete(path);
      return told(fs.removeTree(path) ? 0 : 1, "fatal: cannot remove\n");
    },
    pruneWorktrees: () => {
      for (const path of [...worktrees]) if (!fs.exists(`${path}/.git`)) worktrees.delete(path);
    },
  };
  return { git, write, commits, stageMode: (path, mode) => void index.set(path, { ...index.get(path)!, mode }) };
}

/** The throwaway repository of the write contract cases, in memory. */
export function fakeThrowaway(opts: ThrowawayOpts = {}): Throwaway {
  const root = "/throwaway/repo";
  const files = Object.fromEntries(Object.entries(WRITE_STATE.files).map(([path, text]) => [`${root}/${path}`, text]));
  const fs = fakeFs(files, { dirs: [root] });
  const repo = fakeRepository(root, fs, {
    head: opts.unborn ? null : Object.fromEntries(Object.entries(WRITE_STATE.files).filter(([path]) => path !== WRITE_STATE.untracked)),
    ignored: WRITE_STATE.ignored,
    fileMode: opts.fileMode,
    detached: opts.detached,
    hook: opts.refuse ? 1 : 0,
    checkout: opts.checkout ? 1 : 0,
  });
  return { ...repo, fs, root, execBits: true };
}

/** A clock standing at one instant. */
export function fakeClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}

/** scratch: the one directory a contract case writes into. history: a second repository, holding the answers of HISTORY_STATE on a detached HEAD. linked: the fake always holds the scene's directory link. execBits: the fake always tells a file carrying an exec bit from one carrying none. */
export function fakeScene(root = "/scene/repo"): { fs: Fs; git: Git; root: string; outside: string; scratch: string; history: string; linked: boolean; execBits: boolean } {
  const files: Record<string, string> = {};
  for (const [rel, text] of Object.entries(SCENE_STATE.files)) files[`${root}/${rel}`] = text;
  const links: Record<string, string> = {};
  for (const [rel, target] of Object.entries(SCENE_STATE.links)) links[`${root}/${rel}`] = `${root}/${target}`;
  const tracked: TrackedFile[] = Object.keys(SCENE_STATE.files)
    .filter((rel) => !SCENE_STATE.untracked.includes(rel))
    .sort()
    .map((rel) => ({ path: rel, mode: SCENE_STATE.exec.includes(rel) ? "100755" : "100644" }));
  const scratch = "/scene/scratch";
  const history = "/scene/history";
  // One made-up sha per commit of HISTORY_STATE, oldest first.
  const shas = HISTORY_STATE.commits.map((_, index) => String(index + 1).repeat(40));
  const last = shas.length - 1;
  const added: Record<string, string[]> = {};
  HISTORY_STATE.commits.forEach((commit, index) => {
    for (const [rel, text] of Object.entries(commit)) if (text !== null) (added[rel] ??= []).push(shas[index]);
  });
  // What grep reads: the last commit under the changed work tree, less every file git neither tracks nor lists as untracked (the ignored one).
  const tree: Record<string, string | null> = Object.assign({}, ...HISTORY_STATE.commits, HISTORY_STATE.tree);
  const read = [...HISTORY_STATE.changed.none.map((file) => file.path), ...HISTORY_STATE.untracked].sort();
  const texts = Object.fromEntries(read.map((rel) => [rel, tree[rel] ?? ""]));
  const git = fakeGit([
    { root, tracked, changed: { "": tracked.map((file) => ({ status: "A", path: file.path })) } },
    {
      root: history,
      tracked: HISTORY_STATE.index.map((path) => ({ path, mode: "100644" })),
      head: HISTORY_STATE.head,
      staged: HISTORY_STATE.stagedFiles,
      reports: HISTORY_STATE.reports,
      branch: null,
      commits: Object.fromEntries(shas.map((sha, index) => [index === last ? "HEAD" : `HEAD~${last - index}`, sha])),
      mergeBases: { "HEAD HEAD~2": shas[last - 2] },
      added,
      changed: { HEAD: HISTORY_STATE.changed.head, "HEAD~2": HISTORY_STATE.changed.first, "": HISTORY_STATE.changed.none },
      untracked: HISTORY_STATE.untracked,
      trackedIgnored: HISTORY_STATE.trackedIgnored,
      ignored: HISTORY_STATE.ignored,
      status: HISTORY_STATE.status,
      texts,
    },
  ]);
  const exec = SCENE_STATE.exec.map((rel) => `${root}/${rel}`);
  return { fs: fakeFs(files, { dirs: [scratch, history], links, exec }), git, root, outside: "/scene/outside", scratch, history, linked: true, execBits: true };
}
