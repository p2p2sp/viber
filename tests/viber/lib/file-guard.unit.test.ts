/*
 * file-guard.unit.test.ts - the file-guard core on a fake file system and a fake
 * git: a task-coder edit of a path another unfinished task claims (its Files or
 * one of its two extras files) is refused with the one deny line, and every
 * other edit prints nothing: a path no task claims, the coder's own path, a path
 * of a done or skipped task, a caller that is no coder and every input that
 * cannot be read (the guard fails open). Where the file system ignores case
 * (the caseless option its entry sets on macOS and Windows) two spellings of
 * one file are one path, refused under the spelling its claimant lists. The coder's task comes from the first record of its
 * own transcript, shaped here as the harness writes it: a user record carrying
 * agentId and the dispatch prompt as message.content. The wrapper
 * viber/hooks/scripts/file-guard.sh only filters on agent_type and pipes stdin on.
 */

import assert from "node:assert/strict";
import { fakeFs, fakeGit } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import { runFileGuard } from "../../../viber/lib/file-guard.ts";
import type { Fs } from "../../../viber/lib/ports.ts";

const RUN = "docs/_specs/2026-11-25-10-00-00_guard";
const AGENT = "a1b2c3d4e5f6a7b8c";
const SESSION = "/home/u/.claude/projects/-r/11111111-2222-3333-4444-555555555555";

const task = (id: string, files: string): string => `### ${id} - do ${id}\n- TDD: none\n- Files: ${files}\n- Delivers: something\n- DoD.1: it works\n\n## Goal\nA goal.\n`;

/** The first record of a subagent transcript: the dispatch prompt of the coder. */
const firstRecord = (agentId: string, prompt: string): string =>
  `${JSON.stringify({ parentUuid: null, isSidechain: true, agentId, type: "user", message: { role: "user", content: prompt } })}\n${JSON.stringify({ type: "assistant", agentId, message: { role: "assistant", content: [] } })}\n`;

const promptOf = (taskLine: string, root: string): string => `${taskLine}notes: ${RUN}/work/T1-coder.md\nout: ${root}/.temp/viber/T1\nrefs: /plugin/references\nextras: ${RUN}/work/T1-extra.md\n`;

interface Scene {
  root?: string;
  /** The first line of the coder's prompt; the task line of T1 when left out. */
  taskLine?: string;
  /** Files over those of the run, by repo-relative path: null takes one away. */
  tree?: Record<string, string | null>;
  /** Files outside the repository, by absolute path: null takes one away. */
  outside?: Record<string, string | null>;
  /** No repository at the cwd. */
  bare?: boolean;
  /** The file system ignores case, as on macOS and Windows. */
  caseless?: boolean;
  fs?: Partial<Fs>;
}

function scene(given: Scene = {}) {
  const root = given.root ?? "/r";
  const run: Record<string, string | null> = {
    [`${RUN}/status.md`]: "# status\n\nprogress: 1/5\ndone: T3\nskipped: T4\nunreviewed: none\n",
    [`${RUN}/tasks/T1.md`]: task("T1", "src/a.ts, src/shared.ts"),
    [`${RUN}/tasks/T2.md`]: task("T2", "src/b.ts, ./src/shared.ts"),
    [`${RUN}/tasks/T3.md`]: task("T3", "src/c.ts"),
    [`${RUN}/tasks/T4.md`]: task("T4", "src/d.ts"),
    [`${RUN}/tasks/T10.md`]: task("T10", "src/b.ts, src/j.ts"),
    [`${RUN}/work/T1-extra.md`]: "src/mine.ts\n",
    [`${RUN}/work/T2-extra.md`]: "src/x.ts\r\n\n  ./src/own-too.ts  \n",
    [`${RUN}/work/T2-extra-review.md`]: "src\\y.ts\n",
    [`${RUN}/work/T3-extra.md`]: "src/z.ts\n",
    [`${RUN}/work/T10-extra.md`]: "src/mine.ts\n",
    ...given.tree,
  };
  const outside: Record<string, string | null> = {
    [`${SESSION}.jsonl`]: `${JSON.stringify({ type: "user", message: { role: "user", content: "build it" } })}\n`,
    [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: firstRecord(AGENT, promptOf(given.taskLine ?? `task: ${RUN}/tasks/T1.md\n`, root)),
    ...given.outside,
  };
  const files = [...Object.entries(run).map(([path, text]): [string, string | null] => [`${root}/${path}`, text]), ...Object.entries(outside)];
  const fs = { ...fakeFs(Object.fromEntries(files.filter((entry): entry is [string, string] => entry[1] !== null)), { dirs: [root] }), ...given.fs };
  const git = fakeGit(given.bare ? null : { root, tracked: [] });
  const guard = (filePath: unknown, over: Record<string, unknown> = {}): string =>
    runFileGuard(
      JSON.stringify({
        session_id: "s",
        transcript_path: `${SESSION}.jsonl`,
        cwd: root,
        permission_mode: "default",
        agent_id: AGENT,
        agent_type: "viber:task-coder",
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: filePath, old_string: "a", new_string: "b" },
        ...over,
      }),
      { fs, git },
      { caseless: given.caseless ?? false },
    );
  return { fs, git, guard, root };
}

const deny = (path: string, id: string): string =>
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: ${path} belongs to task ${id}, which is not finished. Leave it as it is, finish every DoD clause that does not need it, then return VERDICT: FAIL with WAIT: ${path}."}}\n`;

test("an edit of a path in the Files of another task that is not done is refused with the one deny line naming the path and that task", () => {
  assert.equal(scene().guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("a refusal is one line of JSON whose reason opens with the viber guard marker", () => {
  const out = scene().guard("/r/src/j.ts");
  assert.equal(out.split("\n").length, 2);
  const answer = JSON.parse(out).hookSpecificOutput;
  assert.equal(answer.hookEventName, "PreToolUse");
  assert.equal(answer.permissionDecision, "deny");
  assert.ok(answer.permissionDecisionReason.startsWith("viber guard: src/j.ts belongs to task T10, which is not finished."));
});

test("an edit of a path the coder extras file of another open task lists is refused, a carriage return, blanks and a leading ./ of its line cut", () => {
  const at = scene();
  assert.equal(at.guard("/r/src/x.ts"), deny("src/x.ts", "T2"));
  assert.equal(at.guard("/r/src/own-too.ts"), deny("src/own-too.ts", "T2"));
});

test("an edit of a path the reviewer extras file of another open task lists is refused, a backslash of its line read as a slash", () => {
  assert.equal(scene().guard("/r/src/y.ts"), deny("src/y.ts", "T2"));
});

test("an edit of a path no task claims is allowed (it stays an EXTRA)", () => {
  assert.equal(scene().guard("/r/src/free.ts"), "");
});

test("an edit of the coder's own Files path is allowed", () => {
  assert.equal(scene().guard("/r/src/a.ts"), "");
});

test("an edit of the coder's own Files path that a later open task also lists is allowed", () => {
  assert.equal(scene().guard("/r/src/shared.ts"), "");
});

test("an edit of a path of the coder's own extras file that the extras file of another open task also lists is allowed", () => {
  assert.equal(scene().guard("/r/src/mine.ts"), "");
});

test("an edit of a path the reviewer extras file of the coder's own task lists is allowed, another open task listing it too", () => {
  assert.equal(scene({ tree: { [`${RUN}/work/T1-extra-review.md`]: "src/j.ts\n" } }).guard("/r/src/j.ts"), "");
});

test("an edit of a path only a done task claims, in its Files or its extras file, is allowed", () => {
  const at = scene();
  assert.equal(at.guard("/r/src/c.ts"), "");
  assert.equal(at.guard("/r/src/z.ts"), "");
});

test("an edit of a path only a skipped task claims is allowed (a skipped task never finishes, so no wait on it could end)", () => {
  assert.equal(scene().guard("/r/src/d.ts"), "");
  assert.equal(scene({ tree: { [`${RUN}/work/T4-extra.md`]: "src/k.ts\n" } }).guard("/r/src/k.ts"), "");
});

test("a path a skipped task and an open task both claim is refused naming the open one", () => {
  assert.equal(scene({ tree: { [`${RUN}/tasks/T4.md`]: task("T4", "src/d.ts, src/j.ts") } }).guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("on a file system that ignores case another spelling of a claimed path is refused, under the spelling its claimant lists (src/A.ts is the file src/a.ts there)", () => {
  const at = scene({ caseless: true });
  assert.equal(at.guard("/r/src/J.ts"), deny("src/j.ts", "T10"));
  assert.equal(at.guard("/r/SRC/B.TS"), deny("src/b.ts", "T2"));
  assert.equal(at.guard("/r/src/X.ts"), deny("src/x.ts", "T2"));
  assert.equal(at.guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("on a file system that ignores case another spelling of the coder's own path, in its Files or its extras file, is allowed", () => {
  const at = scene({ caseless: true });
  assert.equal(at.guard("/r/src/Shared.ts"), "");
  assert.equal(at.guard("/r/src/MINE.ts"), "");
  assert.equal(at.guard("/r/src/Free.ts"), "");
});

test("on a file system that tells case apart another spelling of a claimed path is another file, and allowed", () => {
  const at = scene();
  assert.equal(at.guard("/r/src/J.ts"), "");
  assert.equal(at.guard("/r/SRC/b.ts"), "");
});

test("a path two open tasks claim is refused naming the lowest-numbered one, T2 before T10", () => {
  assert.equal(scene().guard("/r/src/b.ts"), deny("src/b.ts", "T2"));
});

test("a path once every claimant is done is allowed", () => {
  assert.equal(scene({ tree: { [`${RUN}/status.md`]: "done: T2 T3 T10\n" } }).guard("/r/src/b.ts"), "");
});

test("a Write is judged as an Edit is: by its file_path alone", () => {
  assert.equal(scene().guard("/r/src/j.ts", { tool_name: "Write", tool_input: { file_path: "/r/src/j.ts", content: "x" } }), deny("src/j.ts", "T10"));
});

test("a relative file_path is read against the cwd of the payload", () => {
  const at = scene();
  assert.equal(at.guard("src/j.ts"), deny("src/j.ts", "T10"));
  assert.equal(at.guard("./j.ts", { cwd: "/r/src" }), deny("src/j.ts", "T10"));
  assert.equal(at.guard("../src/free.ts", { cwd: "/r/src" }), "");
});

test("a path outside the repository is allowed", () => {
  assert.equal(scene().guard("/elsewhere/src/j.ts"), "");
});

test("a C:\\ spelling, a C:/ spelling and a /c/ spelling of one claimed path give one refusal, and of one unclaimed path one allow", () => {
  const at = scene({ root: "C:/r" });
  const want = deny("src/j.ts", "T10");
  assert.equal(at.guard("C:\\r\\src\\j.ts"), want);
  assert.equal(at.guard("C:/r/src/j.ts"), want);
  assert.equal(at.guard("/c/r/src/j.ts"), want);
  assert.equal(at.guard("c:\\r\\src\\j.ts"), want);
  for (const free of ["C:\\r\\src\\free.ts", "C:/r/src/free.ts", "/c/r/src/free.ts"]) assert.equal(at.guard(free), "");
});

test("a backslash cwd and transcript path of a drive root are read as their slash spelling", () => {
  const at = scene({ root: "C:/r", outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: null, [`C:/Users/u/s/subagents/agent-${AGENT}.jsonl`]: firstRecord(AGENT, `task: ${RUN}\\tasks\\T1.md\n`) } });
  assert.equal(at.guard("C:\\r\\src\\j.ts", { cwd: "C:\\r", transcript_path: "C:\\Users\\u\\s.jsonl" }), deny("src/j.ts", "T10"));
});

test("a task line holding an absolute path names the same run", () => {
  assert.equal(scene({ taskLine: `task: /r/${RUN}/tasks/T1.md\n` }).guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("the task line is found below other lines of the prompt, never inside one", () => {
  assert.equal(scene({ taskLine: `reason: the last attempt failed\ntask: ${RUN}/tasks/T1.md\n` }).guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
  assert.equal(scene({ taskLine: `review: x.md subtask: ${RUN}/tasks/T1.md\n` }).guard("/r/src/j.ts"), "");
});

test("the agent_transcript_path of the payload is read first when it is there", () => {
  const own = "/elsewhere/own.jsonl";
  const at = scene({ outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: null, [own]: firstRecord(AGENT, `task: ${RUN}/tasks/T1.md\n`) } });
  assert.equal(at.guard("/r/src/j.ts", { agent_transcript_path: own }), deny("src/j.ts", "T10"));
});

test("a transcript_path that is the coder's own transcript is read too", () => {
  const own = `${SESSION}/subagents/agent-${AGENT}.jsonl`;
  assert.equal(scene().guard("/r/src/j.ts", { transcript_path: own }), deny("src/j.ts", "T10"));
});

test("a prompt held as text parts is read as their text", () => {
  const record = `${JSON.stringify({ agentId: AGENT, type: "user", message: { role: "user", content: [{ type: "text", text: `task: ${RUN}/tasks/T1.md\nnotes: n.md` }] } })}\n`;
  assert.equal(scene({ outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: record } }).guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("the task file found is kept as the one line of .temp/viber/guard/<agent id>, and a later call needs no transcript", () => {
  const at = scene();
  assert.equal(at.guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
  assert.equal(at.fs.readText(`/r/.temp/viber/guard/${AGENT}`), `/r/${RUN}/tasks/T1.md\n`);
  at.fs.remove(`${SESSION}/subagents/agent-${AGENT}.jsonl`);
  assert.equal(at.guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
  assert.equal(at.guard("/r/src/a.ts"), "");
});

test("a kept line naming no task file that exists is passed over for the transcript", () => {
  const at = scene({ tree: { [`.temp/viber/guard/${AGENT}`]: `/r/${RUN}/tasks/T9.md\n` } });
  assert.equal(at.guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("a guard directory that cannot be written changes no answer", () => {
  const at = scene({ fs: { makeDir: () => false, writeBytes: () => false } });
  assert.equal(at.guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("outside a repository the cwd is the root", () => {
  assert.equal(scene({ bare: true }).guard("/r/src/j.ts"), deny("src/j.ts", "T10"));
});

test("a payload of any other agent, or of the main session, prints nothing", () => {
  const at = scene();
  assert.equal(at.guard("/r/src/j.ts", { agent_type: "viber:task-reviewer" }), "");
  assert.equal(at.guard("/r/src/j.ts", { agent_type: "general-purpose" }), "");
  assert.equal(at.guard("/r/src/j.ts", { agent_type: undefined }), "");
});

const OPEN: Array<{ name: string; over?: Record<string, unknown>; given?: Scene; path?: unknown }> = [
  { name: "no agent_id", over: { agent_id: undefined } },
  { name: "an agent_id that is no plain name", over: { agent_id: "../x" } },
  { name: "no transcript_path", over: { transcript_path: undefined } },
  { name: "no cwd", over: { cwd: undefined } },
  { name: "a relative cwd", over: { cwd: "r" } },
  { name: "no tool_input", over: { tool_input: undefined } },
  { name: "a file_path that is no text", path: 7 },
  { name: "an empty file_path", path: "" },
  { name: "no transcript of the agent", given: { outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: null } } },
  { name: "an empty transcript", given: { outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: "" } } },
  { name: "a transcript whose first line is no JSON", given: { outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: `task: ${RUN}/tasks/T1.md\n` } } },
  { name: "a transcript whose first record belongs to another agent", given: { outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: firstRecord("another", `task: ${RUN}/tasks/T1.md\n`) } } },
  { name: "a first record that is no user record", given: { outside: { [`${SESSION}/subagents/agent-${AGENT}.jsonl`]: `${JSON.stringify({ agentId: AGENT, type: "assistant", message: { content: `task: ${RUN}/tasks/T1.md` } })}\n` } } },
  { name: "a dispatch with no task line (a review or a report alone)", given: { taskLine: `review: ${RUN}/work/final-1.md\nspec: ${RUN}/spec.md\n` } },
  { name: "a task line naming no file under a tasks directory", given: { taskLine: `task: ${RUN}/T1.md\n` } },
  { name: "a task line naming a task file that does not exist", given: { taskLine: `task: ${RUN}/tasks/T9.md\n` } },
  { name: "no status.md beside the tasks directory", given: { tree: { [`${RUN}/status.md`]: null } } },
];

for (const row of OPEN) {
  test(`${row.name} allows the edit of a path another open task claims (the guard fails open)`, () => {
    assert.equal(scene(row.given).guard(row.path === undefined ? "/r/src/j.ts" : row.path, row.over), "");
  });
}

for (const payload of ["", "   ", "not json", "[]", "null", '"text"', '{"agent_type":"viber:task-coder","tool_input":{"file_path":"/r/src/j']) {
  test(`the payload ${JSON.stringify(payload)} prints nothing`, () => {
    const at = scene();
    assert.equal(runFileGuard(payload, { fs: at.fs, git: at.git }), "");
  });
}

test("a port that throws prints nothing", () => {
  const at = scene({
    fs: {
      listDir: () => {
        throw new Error("boom");
      },
    },
  });
  assert.equal(at.guard("/r/src/j.ts"), "");
});

test("a path holding a quote or a backslash is escaped in the deny line, which stays valid JSON", () => {
  const at = scene({ tree: { [`${RUN}/tasks/T10.md`]: task("T10", 'src/a"b.ts') } });
  const out = at.guard('/r/src/a"b.ts');
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, 'viber guard: src/a"b.ts belongs to task T10, which is not finished. Leave it as it is, finish every DoD clause that does not need it, then return VERDICT: FAIL with WAIT: src/a"b.ts.');
});
