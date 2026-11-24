/*
 * fakes.ts - in-memory Fs, Git and Clock holding their own state, seeded from
 * SCENE_STATE and HISTORY_STATE through fakeScene. Each passes the contract
 * cases of ports-contract.ts.
 */

import type { ChangedFile, Clock, Fs, Git, StatusEntry, TrackedFile } from "../../viber/lib/ports.ts";
import { HISTORY_STATE, SCENE_STATE } from "./ports-contract.ts";

export interface FakeFsOpts {
  /** Files that exist yet cannot be read. */
  unreadable?: string[];
  /** Directories holding no file. */
  dirs?: string[];
  /** Directory links: the link's path to the directory it names. */
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
  const links = Object.entries(opts.links ?? {});
  const dirs = new Set(opts.dirs ?? []);
  const exec = opts.exec ?? [];
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
      return kindOf(key) !== null && exec.includes(key);
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
  status?: StatusEntry[];
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
    untrackedFiles(root) {
      return [...(at(root)?.untracked ?? [])];
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
  const tracked = Object.keys(SCENE_STATE.files)
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
      tracked: [],
      branch: null,
      commits: Object.fromEntries(shas.map((sha, index) => [index === last ? "HEAD" : `HEAD~${last - index}`, sha])),
      mergeBases: { "HEAD HEAD~2": shas[last - 2] },
      added,
      changed: { HEAD: HISTORY_STATE.changed.head, "HEAD~2": HISTORY_STATE.changed.first, "": HISTORY_STATE.changed.none },
      untracked: HISTORY_STATE.untracked,
      status: HISTORY_STATE.status,
      texts,
    },
  ]);
  const exec = SCENE_STATE.exec.map((rel) => `${root}/${rel}`);
  return { fs: fakeFs(files, { dirs: [scratch, history], links, exec }), git, root, outside: "/scene/outside", scratch, history, linked: true, execBits: true };
}
