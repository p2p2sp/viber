/*
 * test-shard.ts - prints the test files of one Windows shard of full.yml, one
 * path per line: `node .github/scripts/test-shard.ts <index> <total>`.
 *
 * `node --test-shard` deals files out by their index in the sorted list, so
 * the few files that take minutes on Windows land wherever the index puts them
 * and one shard runs several times longer than the rest. This script deals
 * them out by weight instead: heaviest first, each to the lightest shard so
 * far (greedy longest-processing-time), deterministic for a given file list.
 *
 * WEIGHTS holds the measured Windows wall time, in seconds, of every file
 * that took 30 s or more in a full.yml run; any other file weighs
 * DEFAULT_WEIGHT. A stale entry only unbalances the shards, it never drops a
 * file: every tracked test file is printed by exactly one shard.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

export const DEFAULT_WEIGHT = 7;

export const WEIGHTS: Record<string, number> = {
  "tests/viber/pr-facts.test.ts": 405,
  "tests/viber/task-step.test.ts": 373,
  "tests/viber/plan-index.test.ts": 339,
  "tests/viber/keep-units.test.ts": 285,
  "tests/viber/plan-gate.test.ts": 266,
  "tests/viber/commit-task.test.ts": 261,
  "tests/viber/memory-map.test.ts": 261,
  "tests/viber/pr-threads.test.ts": 232,
  "tests/viber/plan-path.test.ts": 183,
  "tests/viber/rules-map.test.ts": 182,
  "tests/viber/commit-task.critical.test.ts": 141,
  "tests/viber/config.test.ts": 105,
  "tests/viber/review-round.test.ts": 96,
  "tests/viber/frame.test.ts": 96,
  "tests/viber/pr-reply.test.ts": 92,
  "tests/viber/archive-run.test.ts": 76,
  "tests/viber/hunt-return.test.ts": 71,
  "tests/viber/diff-overlay.test.ts": 66,
  "tests/viber/bootstrap.test.ts": 62,
  "tests/viber/red-check.test.ts": 57,
  "tests/viber/skill-part.test.ts": 54,
  "tests/viber/commit.critical.test.ts": 54,
  "tests/viber/pr-create.test.ts": 53,
  "tests/viber/app-wait.test.ts": 50,
  "tests/viber/plan-path.critical.test.ts": 46,
  "tests/viber/commit-args.test.ts": 44,
  "tests/viber/issue-facts.test.ts": 40,
  "tests/viber/run-failures.test.ts": 39,
  "tests/viber/issue-templates.test.ts": 39,
  "tests/viber/run-summary.test.ts": 37,
  "tests/viber/switch-text.test.ts": 36,
  "tests/viber/map-signals.test.ts": 35,
  "tests/viber/issue-create.test.ts": 32,
};

/** Deals `files` into `total` shards by weight; shard i is `result[i]`, its
 *  files sorted by path. */
export function assignShards(files: string[], weights: Record<string, number>, total: number): string[][] {
  const weightOf = (file: string) => weights[file] ?? DEFAULT_WEIGHT;
  const ordered = [...files].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards: string[][] = Array.from({ length: total }, () => []);
  const loads = new Array<number>(total).fill(0);
  for (const file of ordered) {
    const lightest = loads.indexOf(Math.min(...loads));
    shards[lightest].push(file);
    loads[lightest] += weightOf(file);
  }
  return shards.map((shard) => shard.sort());
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const index = Number(process.argv[2]);
  const total = Number(process.argv[3]);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(index) || index < 1 || index > total) {
    process.stderr.write("usage: node .github/scripts/test-shard.ts <index> <total> (1 <= index <= total)\n");
    process.exit(2);
  }
  const files = execFileSync("git", ["ls-files", "tests/**/*.test.ts"], { encoding: "utf-8" })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const shard = assignShards(files, WEIGHTS, total)[index - 1];
  process.stdout.write(shard.map((file) => `${file}\n`).join(""));
}
