/*
 * agent-context.unit.test.ts - proves `runStats`, `summarize` and `render` of tools/agent-context.ts:
 * the transcript lines of one Claude Code subagent run turned into its context statistics, the runs
 * grouped into one summary per viber agent and the summaries printed as the two tables.
 * Transcript lines are JS objects serialized with JSON.stringify, shaped as the C1 contract of the
 * task names them (assistant usage, tool_use and tool_result items, instructions and nested_memory
 * attachments). Nothing here touches the disk.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/tools/agent-context.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { render, runStats, summarize } from "../../tools/agent-context.ts";
import type { AgentSummary, RunStats } from "../../tools/agent-context.ts";

type Item = Record<string, unknown>;

function assistant(usage: Record<string, number> | undefined, content: Item[] = []): string {
  return JSON.stringify({ type: "assistant", message: { usage, content } });
}

function call(id: string, name: string, filePath?: string): Item {
  return { type: "tool_use", id, name, input: filePath === undefined ? {} : { file_path: filePath } };
}

function result(id: string, content: string | Item[]): string {
  return JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content }] } });
}

const AGENT = "viber:task-coder";

test("start is the context of the first assistant line carrying usage and peak the largest one, each summing the three usage fields", () => {
  const stats = runStats(AGENT, [
    assistant(undefined),
    assistant({ input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000 }),
    assistant({ input_tokens: 5, cache_read_input_tokens: 9000 }),
    assistant({ input_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 1 }),
  ]);
  assert.equal(stats?.agent, "viber:task-coder");
  assert.equal(stats?.start, 3210);
  assert.equal(stats?.peak, 9005);
});

test("tool result bytes land under the kind of the call they answer, string and array contents alike", () => {
  const stats = runStats(AGENT, [
    assistant({ input_tokens: 1 }, [
      call("a", "Read", "/home/u/.claude/plugins/cache/p2p2/viber/1.0/references/tdd.md"),
      call("b", "Read", "/repo/src/main.ts"),
      call("c", "Grep"),
      call("d", "Glob"),
      call("e", "Bash"),
      call("f", "Edit", "/repo/src/main.ts"),
    ]),
    result("a", "aaaa"),
    result("b", "bbbbb"),
    result("c", [{ type: "text", text: "cc" }, { type: "text", text: "ccc" }]),
    result("d", "dddddd"),
    result("e", "eeeeeee"),
    result("f", "ffffffff"),
  ]);
  assert.deepEqual(stats?.bytes, { "read-plugin": 4, "read-project": 5, search: 11, bash: 7, other: 8 });
});

test("a Read path written with backslashes is classified as its forward-slash form", () => {
  const stats = runStats(AGENT, [
    assistant({ input_tokens: 1 }, [call("a", "Read", "C:\\Users\\u\\.claude\\plugins\\cache\\p2p2\\viber\\tdd.md")]),
    result("a", "abc"),
  ]);
  assert.deepEqual(stats?.bytes, { "read-plugin": 3, "read-project": 0, search: 0, bash: 0, other: 0 });
});

test("a tool result answering no known call counts as other", () => {
  const stats = runStats(AGENT, [assistant({ input_tokens: 1 }), result("missing", "abcdef")]);
  assert.deepEqual(stats?.bytes, { "read-plugin": 0, "read-project": 0, search: 0, bash: 0, other: 6 });
});

test("startMemory sums the content of every file of every instructions attachment, nestedMemory the text of every nested_memory attachment", () => {
  const stats = runStats(AGENT, [
    assistant({ input_tokens: 1 }),
    JSON.stringify({ type: "attachment", attachment: { type: "instructions", files: [{ content: "12345" }, { content: "678" }] } }),
    JSON.stringify({ type: "attachment", attachment: { type: "instructions", files: [{ content: "90" }] } }),
    JSON.stringify({ type: "attachment", attachment: { type: "nested_memory", content: { content: "abcd" } } }),
    JSON.stringify({ type: "attachment", attachment: { type: "nested_memory", content: { content: "ef" } } }),
  ]);
  assert.equal(stats?.startMemory, 10);
  assert.equal(stats?.nestedMemory, 6);
});

test("files counts the distinct file_path values over the Read calls only", () => {
  const stats = runStats(AGENT, [
    assistant({ input_tokens: 1 }, [call("a", "Read", "/repo/a.ts"), call("b", "Read", "/repo/b.ts"), call("c", "Edit", "/repo/c.ts")]),
    assistant({ input_tokens: 1 }, [call("d", "Read", "/repo/a.ts")]),
  ]);
  assert.equal(stats?.files, 2);
});

test("a line that is not JSON is skipped without losing the lines around it", () => {
  const stats = runStats(AGENT, ["not json {", assistant({ input_tokens: 7 }), "", "{broken"]);
  assert.equal(stats?.peak, 7);
});

test("lines carrying no assistant usage give undefined", () => {
  const stats = runStats(AGENT, [assistant(undefined), result("a", "abc")]);
  assert.equal(stats, undefined);
});

function run(agent: string, peak: number, extra: Partial<RunStats> = {}): RunStats {
  return {
    agent,
    start: 0,
    peak,
    bytes: { "read-plugin": 0, "read-project": 0, search: 0, bash: 0, other: 0 },
    startMemory: 0,
    nestedMemory: 0,
    files: 0,
    ...extra,
  };
}

function summary(agent: string, extra: Partial<AgentSummary> = {}): AgentSummary {
  return {
    agent,
    runs: 1,
    startP50: 0,
    peakP50: 0,
    peakP90: 0,
    peakMax: 0,
    bytes: { "read-plugin": 0, "read-project": 0, search: 0, bash: 0, other: 0 },
    startMemory: 0,
    nestedMemory: 0,
    files: 0,
    ...extra,
  };
}

test("summarize leaves out every run whose agent does not start with viber: and counts the runs of each remaining agent", () => {
  const rows = summarize([
    run("viber:task-coder", 10),
    run("general-purpose", 99),
    run("viber:task-coder", 20),
    run("Explore", 98),
    run("viber:reviewer", 5),
  ]);
  assert.deepEqual(
    rows.map((row) => [row.agent, row.runs]),
    [
      ["viber:task-coder", 2],
      ["viber:reviewer", 1],
    ],
  );
});

test("summarize takes the percentiles of start and peak at index min(n - 1, floor(f * n)) of the ascending values", () => {
  const peaks = [50, 10, 110, 30, 90, 70, 100, 20, 80, 60, 40];
  const rows = summarize(peaks.map((peak) => run(AGENT, peak * 1000, { start: peak })));
  assert.equal(rows[0].startP50, 60);
  assert.equal(rows[0].peakP50, 60000);
  assert.equal(rows[0].peakP90, 100000);
  assert.equal(rows[0].peakMax, 110000);
});

test("summarize takes the upper middle value as the median of an even number of runs", () => {
  const rows = summarize([run(AGENT, 100), run(AGENT, 300)]);
  assert.equal(rows[0].peakP50, 300);
});

test("summarize averages each byte kind, the start memory, the nested memory and the files over the runs of an agent", () => {
  const rows = summarize([
    run(AGENT, 1, {
      bytes: { "read-plugin": 10, "read-project": 20, search: 30, bash: 40, other: 50 },
      startMemory: 100,
      nestedMemory: 6,
      files: 3,
    }),
    run(AGENT, 1, {
      bytes: { "read-plugin": 30, "read-project": 0, search: 10, bash: 0, other: 51 },
      startMemory: 300,
      nestedMemory: 0,
      files: 4,
    }),
  ]);
  assert.deepEqual(rows[0].bytes, { "read-plugin": 20, "read-project": 10, search: 20, bash: 20, other: 50.5 });
  assert.equal(rows[0].startMemory, 200);
  assert.equal(rows[0].nestedMemory, 3);
  assert.equal(rows[0].files, 3.5);
});

test("summarize orders the agents by median peak, largest first", () => {
  const rows = summarize([run("viber:small", 100), run("viber:large", 900), run("viber:middle", 500)]);
  assert.deepEqual(
    rows.map((row) => row.agent),
    ["viber:large", "viber:middle", "viber:small"],
  );
});

test("summarize of no runs is an empty list", () => {
  assert.deepEqual(summarize([]), []);
});

test("render prints the context table, one empty line and the breakdown table, tokens in rounded thousands, bytes in rounded kilobytes and files with one decimal", () => {
  const lines = render([
    summary("viber:task-coder", {
      runs: 3,
      startP50: 12499,
      peakP50: 80500,
      peakP90: 99999,
      peakMax: 150000,
      bytes: { "read-plugin": 2048, "read-project": 1536, search: 511, bash: 0, other: 10240 },
      startMemory: 4096,
      nestedMemory: 1024,
      files: 4.25,
    }),
    summary("viber:reviewer", { runs: 1, startP50: 1000, peakP50: 2000, peakP90: 3000, peakMax: 4000, files: 2 }),
  ]);
  assert.deepEqual(lines, [
    "agent | runs | start p50 | peak p50 | peak p90 | peak max",
    "viber:task-coder | 3 | 12k | 81k | 100k | 150k",
    "viber:reviewer | 1 | 1k | 2k | 3k | 4k",
    "",
    "agent | read-plugin KB | read-project KB | search KB | bash KB | other KB | start memory KB | nested memory KB | files",
    "viber:task-coder | 2 | 2 | 0 | 0 | 10 | 4 | 1 | 4.3",
    "viber:reviewer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.0",
  ]);
});
