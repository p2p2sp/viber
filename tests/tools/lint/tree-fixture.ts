/*
 * tree-fixture.ts - an in-memory Tree for the lint rule tests; holds no case.
 */

import type { Tree } from "../../../tools/lint/engine.ts";

export function treeOf(files: Record<string, string>, modes: Record<string, string> = {}): Tree {
  const paths = Object.keys(files);
  return {
    files: paths.map((path) => ({ path, mode: modes[path] ?? "100644" })),
    read: (path) => files[path] ?? null,
    list: (dir) => {
      const prefix = dir === "" ? "" : `${dir.replace(/\/$/, "")}/`;
      const names = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split("/")[0]);
      return [...new Set(names)].sort();
    },
  };
}
