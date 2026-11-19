/*
 * agent-context.critical.test.ts - critical tier: the disk adapter `readRuns` of tools/agent-context.ts
 * against a real directory tree in a temp dir. It passes the reader contract of the `ReadRuns` port
 * (shared with the in-memory fake in agent-context.unit.test.ts) and proves what only the disk
 * reveals: runs found in a `subagents` directory several levels below the root, a meta file with no
 * transcript beside it skipped, a root that does not exist read as empty.
 *
 * Run directly by Node's type stripping (every operating system, per the critical tier):
 *   node --test tests/tools/agent-context.critical.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRuns } from "../../tools/agent-context.ts";
import { withTempDir } from "../harness/tmp.ts";
import { readerContract, usageLine } from "./agent-context-fixture.ts";
import type { Seed } from "./agent-context-fixture.ts";

function seedRun(dir: string, id: string, agent: string, lines: string[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: agent }));
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.join("\n") + "\n");
}

readerContract("readRuns", async (seeds: Seed[], check) => {
  await withTempDir("agent-context-", async (root) => {
    const dir = path.join(root, "project", "session", "subagents");
    fs.mkdirSync(dir, { recursive: true });
    seeds.forEach((seed, index) => seedRun(dir, String(index), seed.agent, seed.lines));
    await check(root, readRuns);
  });
});

test("readRuns finds a run under a subagents directory several levels below the root and skips a meta file with no transcript beside it", async () => {
  await withTempDir("agent-context-", async (root) => {
    const dir = path.join(root, "a", "b", "c", "subagents");
    seedRun(dir, "deep", "viber:deep", [usageLine(40)]);
    fs.writeFileSync(path.join(dir, "agent-orphan.meta.json"), JSON.stringify({ agentType: "viber:orphan" }));
    assert.deepEqual(
      readRuns(root).map((run) => [run.agent, run.peak]),
      [["viber:deep", 40]],
    );
  });
});

test("readRuns returns an empty list for a directory that does not exist", async () => {
  await withTempDir("agent-context-", async (root) => {
    assert.deepEqual(readRuns(path.join(root, "missing")), []);
  });
});
