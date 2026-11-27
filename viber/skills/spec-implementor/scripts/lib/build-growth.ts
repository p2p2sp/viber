/*
 * build-growth.ts - the size limits of the project memory and the plugin's
 * project rules: the net growth in bytes of their files against HEAD. A new
 * file counts whole, a deleted one counts negative, a changed one counts by its
 * difference. The close step decides on the sum; this module only measures.
 */

import { isMemoryFile } from "../../../memory/scripts/lib/memory-file.ts";
import { VIBER_DIR } from "./build-rules.ts";
import { ownDirty, type Ctx } from "./build-state.ts";

// The bytes of net growth one build may add to the memory: a constant, not configurable.
export const MEMORY_LIMIT = 600;
// The bytes of net growth one build may add to the plugin's rules under VIBER_DIR: a constant, not configurable.
export const RULES_LIMIT = 200;
/** Every memory file of the work tree that differs from HEAD, none of `before`: new and deleted ones included. */
export function memoryPaths(ctx: Ctx): string[] {
  return ownDirty(ctx, ["."]).filter(isMemoryFile);
}

/** Every path of the work tree under VIBER_DIR that differs from HEAD, none of `before`: new and deleted ones included. */
export function rulesPaths(ctx: Ctx): string[] {
  return ownDirty(ctx, [VIBER_DIR]);
}

/** The net growth in bytes of the paths against HEAD. */
export function growthOf(ctx: Ctx, paths: string[]): number {
  let net = 0;
  for (const path of paths) {
    const text = ctx.fs.readText(`${ctx.root}/${path}`);
    const now = text === null ? 0 : Buffer.byteLength(text, "utf8");
    const head = ctx.git.sizeAtHead(ctx.root, path) ?? 0;
    net += now - head;
  }
  return net;
}
