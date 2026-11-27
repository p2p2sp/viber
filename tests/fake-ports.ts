/*
 * fake-ports.ts - in-memory ports for the lib/ modules of the build: a file
 * system held in a map, git answering from a list of dirty paths and a map of
 * HEAD sizes, gh recording its calls. Every call that writes is recorded.
 */

import type { Committed, Fs, Gh, GhDone, Git } from "../viber/skills/spec-implementor/scripts/lib/ports.ts";
import { freshClose, type Ctx, type State } from "../viber/skills/spec-implementor/scripts/lib/build-state.ts";

export interface FakeFs extends Fs {
  files: Map<string, string>;
  removed: string[];
}

export function fakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map(Object.entries(initial));
  const removed: string[] = [];
  const below = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);
  return {
    files,
    removed,
    readText: (path) => files.get(path) ?? null,
    writeText: (path, text) => {
      files.set(path, text);
      return true;
    },
    exists: (path) => [...files.keys()].some((file) => below(file, path)),
    remove: (path) => {
      removed.push(path);
      for (const file of [...files.keys()]) if (below(file, path)) files.delete(file);
    },
    removeEmptyDir: () => {},
    move: (from, to) => {
      for (const [file, text] of [...files]) {
        if (!below(file, from)) continue;
        files.delete(file);
        files.set(`${to}${file.slice(from.length)}`, text);
      }
      return true;
    },
    lock: () => true,
    unlock: () => {},
  };
}

export interface FakeGit extends Git {
  dirtyPaths: string[];
  heads: Map<string, number>;
  commits: Array<{ message: string; paths: string[] }>;
  restores: string[][];
  restoreOk: boolean;
  changesText: string;
}

export function fakeGit(dirtyPaths: string[] = [], heads: Record<string, number> = {}): FakeGit {
  const git: FakeGit = {
    dirtyPaths,
    heads: new Map(Object.entries(heads)),
    commits: [],
    restores: [],
    restoreOk: true,
    changesText: "",
    head: () => "base000",
    holds: () => true,
    diff: () => "",
    dirty: (_root, paths) =>
      git.dirtyPaths.filter((path) =>
        paths.some((raw) => {
          const at = raw.replace(/\/$/, "");
          return at === "." || path === at || path.startsWith(`${at}/`);
        }),
      ),
    sizeAtHead: (_root, path) => git.heads.get(path) ?? null,
    restore: (_root, paths) => {
      git.restores.push(paths);
      return git.restoreOk;
    },
    changes: () => git.changesText,
    log: () => "",
    commit: (_root, message, paths): Committed => {
      git.commits.push({ message, paths });
      return { kind: "done", sha: "abc1234" };
    },
  };
  return git;
}

export interface FakeGh extends Gh {
  calls: string[][];
}

export function fakeGh(): FakeGh {
  const calls: string[][] = [];
  return { calls, run: (_root, args): GhDone => (calls.push(args), { exit: 0, out: "", err: "" }) };
}

export const ROOT = "/r";
export const NAME = "run1";
export const SPEC_DIR = `${ROOT}/docs/_specs/${NAME}`;
export const WORK = `${SPEC_DIR}/work`;

/** A context of a run in the repository at /r, its close at `step`, no task. */
export function fakeCtx(opts: { fs?: FakeFs; git?: FakeGit; before?: string[]; step?: State["close"]["step"]; files?: string[] } = {}): Ctx & { fs: FakeFs; git: FakeGit; gh: FakeGh } {
  const close = freshClose(0);
  close.step = opts.step ?? "tasks";
  const state: State = { base: "base000", tasks: {}, close };
  if (opts.before !== undefined) state.before = opts.before;
  return {
    root: ROOT,
    name: NAME,
    work: WORK,
    specDir: SPEC_DIR,
    refs: "/refs",
    title: "Run",
    issue: null,
    tasks: [],
    state,
    out: [],
    files: () => opts.files ?? [],
    fs: opts.fs ?? fakeFs(),
    git: opts.git ?? fakeGit(),
    gh: fakeGh(),
    tree: { root: () => ROOT, files: () => opts.files ?? [] },
  };
}
