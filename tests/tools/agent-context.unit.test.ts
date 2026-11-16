/*
 * agent-context.unit.test.ts - proves `runStats` of tools/agent-context.ts, the function turning the
 * transcript lines of one Claude Code subagent run into its context statistics.
 * Transcript lines are JS objects serialized with JSON.stringify, shaped as the C1 contract of the
 * task names them (assistant usage, tool_use and tool_result items, instructions and nested_memory
 * attachments). Nothing here touches the disk.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/tools/agent-context.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import { runStats } from "../../tools/agent-context.ts";

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
