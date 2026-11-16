/*
 * agent-context-fixture.ts - shared fixtures of the agent-context tests: the in-memory fake of the
 * `ReadRuns` port of tools/agent-context.ts and the reader contract every reader of that port passes.
 * The fake passes it in agent-context.unit.test.ts; the disk adapter passes it as an integration test.
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { runStats } from "../../tools/agent-context.ts";
import type { ReadRuns, RunStats } from "../../tools/agent-context.ts";

/** One run a caller seeds into a root: the agent type and the transcript lines of the run. */
export interface Seed {
  agent: string;
  lines: string[];
}

/** An in-memory reader: runs seeded under a root are what `read` returns for that root. */
export class FakeRuns {
  private readonly roots = new Map<string, Seed[]>();

  seed(root: string, seeds: Seed[]): void {
    this.roots.set(root, [...(this.roots.get(root) ?? []), ...seeds]);
  }

  read: ReadRuns = (root) =>
    (this.roots.get(root) ?? []).flatMap((seed) => runStats(seed.agent, seed.lines) ?? []);
}

/** Seeds the runs into a root of the reader under test and hands that root and the reader to `check`. */
export type WithReader = (seeds: Seed[], check: (root: string, read: ReadRuns) => void | Promise<void>) => Promise<void>;

/** A transcript line of an assistant turn whose context is `tokens`. */
export function usageLine(tokens: number): string {
  return JSON.stringify({ type: "assistant", message: { usage: { input_tokens: tokens }, content: [] } });
}

function statsOf(agent: string, tokens: number): RunStats {
  return {
    agent,
    start: tokens,
    peak: tokens,
    bytes: { "read-plugin": 0, "read-project": 0, search: 0, bash: 0, other: 0 },
    startMemory: 0,
    nestedMemory: 0,
    files: 0,
  };
}

function byAgent(runs: RunStats[]): RunStats[] {
  return [...runs].sort((a, b) => a.agent.localeCompare(b.agent));
}

/** Registers the reader contract of C2 for the reader `withReader` opens. */
export function readerContract(label: string, withReader: WithReader): void {
  test(`${label} returns the runStats of every seeded run`, async () => {
    const seeds = [
      { agent: "viber:alpha", lines: [usageLine(10)] },
      { agent: "viber:beta", lines: [usageLine(20)] },
    ];
    await withReader(seeds, (root, read) => {
      assert.deepEqual(byAgent(read(root)), [statsOf("viber:alpha", 10), statsOf("viber:beta", 20)]);
    });
  });

  test(`${label} leaves out a run whose runStats is undefined`, async () => {
    const seeds = [
      { agent: "viber:alpha", lines: [usageLine(10)] },
      { agent: "viber:silent", lines: ["not json"] },
    ];
    await withReader(seeds, (root, read) => {
      assert.deepEqual(read(root), [statsOf("viber:alpha", 10)]);
    });
  });

  test(`${label} returns an empty list for a root holding nothing`, async () => {
    await withReader([], (root, read) => {
      assert.deepEqual(read(root), []);
    });
  });
}
