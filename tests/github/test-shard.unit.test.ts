/*
 * test-shard.unit.test.ts - proves the weighted shard split of
 * .github/scripts/test-shard.ts, which full.yml uses to deal the test files
 * out to its Windows jobs: every file lands in exactly one shard, the heavy
 * files spread out, and the split of the tracked files stays balanced.
 * Imports the pure function, spawns nothing (the git file list is a
 * read-only query).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { test } from "../harness/test.ts";
import { assignShards, DEFAULT_WEIGHT, WEIGHTS } from "../../.github/scripts/test-shard.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("every file lands in exactly one shard (a file dealt twice or dropped would run twice or never)", () => {
  const files = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts", "e.test.ts"];
  const shards = assignShards(files, { "a.test.ts": 50, "c.test.ts": 20 }, 3);
  assert.equal(shards.length, 3);
  assert.deepEqual(shards.flat().sort(), files);
});

test("two heavy files go to different shards and the light files fill the other one", () => {
  const shards = assignShards(["h1", "h2", "l1", "l2", "l3"], { h1: 100, h2: 90 }, 3);
  assert.deepEqual(shards, [["h1"], ["h2"], ["l1", "l2", "l3"]]);
});

test("more shards than files leaves the extra shards empty", () => {
  assert.deepEqual(assignShards(["only"], {}, 3), [["only"], [], []]);
});

test("the tracked test files split into 5 shards none heavier than 1.25 times the average (the imbalance node --test-shard gives)", () => {
  const files = execFileSync("git", ["ls-files", "tests/**/*.test.ts"], { cwd: ROOT, encoding: "utf-8" })
    .split("\n")
    .filter((line) => line.length > 0);
  const loads = assignShards(files, WEIGHTS, 5).map((shard) =>
    shard.reduce((sum, file) => sum + (WEIGHTS[file] ?? DEFAULT_WEIGHT), 0),
  );
  const average = loads.reduce((a, b) => a + b, 0) / loads.length;
  assert.ok(Math.max(...loads) <= average * 1.25, `shard loads ${loads.join(", ")}`);
});

test("every WEIGHTS entry names a tracked test file (a renamed or removed file leaves a stale weight)", () => {
  const files = new Set(
    execFileSync("git", ["ls-files", "tests/**/*.test.ts"], { cwd: ROOT, encoding: "utf-8" }).split("\n"),
  );
  const stale = Object.keys(WEIGHTS).filter((file) => !files.has(file));
  assert.deepEqual(stale, []);
});
