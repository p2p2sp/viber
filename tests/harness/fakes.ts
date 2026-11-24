/*
 * fakes.ts - in-memory Fs and Git holding their own state, seeded from
 * SCENE_STATE through fakeScene. Both pass the contract cases of
 * ports-contract.ts.
 */

import type { Fs, Git, TrackedFile } from "../../viber/lib/ports.ts";
import { SCENE_STATE } from "./ports-contract.ts";

/** files: absolute paths, forward slashes; a directory exists when a file sits below it. */
export function fakeFs(files: Record<string, string>, opts: { unreadable?: string[] } = {}): Fs {
  const unreadable = opts.unreadable ?? [];
  const known = [...Object.keys(files), ...unreadable];
  const clean = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  return {
    readText(p) {
      const key = clean(p);
      if (unreadable.includes(key)) return null;
      return Object.hasOwn(files, key) ? files[key] : null;
    },
    exists(p) {
      const key = clean(p);
      return known.some((f) => f === key || f.startsWith(`${key}/`));
    },
    listDir(p) {
      const prefix = `${clean(p)}/`;
      const names = known.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split("/")[0]);
      return [...new Set(names)].sort();
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

export function fakeScene(root = "/scene/repo"): { fs: Fs; git: Git; root: string; outside: string } {
  const files: Record<string, string> = {};
  for (const [rel, text] of Object.entries(SCENE_STATE.files)) files[`${root}/${rel}`] = text;
  const tracked = Object.keys(SCENE_STATE.files)
    .filter((rel) => !SCENE_STATE.untracked.includes(rel))
    .sort()
    .map((rel) => ({ path: rel, mode: SCENE_STATE.exec.includes(rel) ? "100755" : "100644" }));
  return { fs: fakeFs(files), git: fakeGit({ root, tracked }), root, outside: "/scene/outside" };
}
