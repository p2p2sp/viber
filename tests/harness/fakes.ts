/*
 * fakes.ts - in-memory Fs, Git and Clock holding their own state, seeded from
 * SCENE_STATE through fakeScene. Each passes the contract cases of
 * ports-contract.ts.
 */

import type { Clock, Fs, Git, TrackedFile } from "../../viber/lib/ports.ts";
import { SCENE_STATE } from "./ports-contract.ts";

export interface FakeFsOpts {
  /** Files that exist yet cannot be read. */
  unreadable?: string[];
  /** Directories holding no file. */
  dirs?: string[];
  /** Directory links: the link's path to the directory it names. */
  links?: Record<string, string>;
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
  };
}

/** null: no repository anywhere. */
export function fakeGit(repo: { root: string; tracked: TrackedFile[] } | null): Git {
  return {
    repoRoot(cwd) {
      if (repo === null) return null;
      return cwd === repo.root || cwd.startsWith(`${repo.root}/`) ? repo.root : null;
    },
    trackedFiles(root) {
      return repo !== null && root === repo.root ? repo.tracked.map((t) => ({ ...t })) : [];
    },
  };
}

/** A clock standing at one instant. */
export function fakeClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}

/** scratch: the one directory a contract case writes into. linked: the fake always holds the scene's directory link. */
export function fakeScene(root = "/scene/repo"): { fs: Fs; git: Git; root: string; outside: string; scratch: string; linked: boolean } {
  const files: Record<string, string> = {};
  for (const [rel, text] of Object.entries(SCENE_STATE.files)) files[`${root}/${rel}`] = text;
  const links: Record<string, string> = {};
  for (const [rel, target] of Object.entries(SCENE_STATE.links)) links[`${root}/${rel}`] = `${root}/${target}`;
  const tracked = Object.keys(SCENE_STATE.files)
    .filter((rel) => !SCENE_STATE.untracked.includes(rel))
    .sort()
    .map((rel) => ({ path: rel, mode: SCENE_STATE.exec.includes(rel) ? "100755" : "100644" }));
  const scratch = "/scene/scratch";
  return { fs: fakeFs(files, { dirs: [scratch], links }), git: fakeGit({ root, tracked }), root, outside: "/scene/outside", scratch, linked: true };
}
