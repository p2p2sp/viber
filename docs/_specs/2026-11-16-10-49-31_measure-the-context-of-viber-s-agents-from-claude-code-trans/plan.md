---
source: C:/Projects/viber/docs/_specs/2026-11-16-10-49-31_measure-the-context-of-viber-s-agents-from-claude-code-trans/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Measure the context of viber's agents from Claude Code transcripts

## Goal

A developer of viber gets one command that reads the subagent transcripts Claude Code keeps on disk and reports, per viber agent, how large its context starts, how large it peaks and what fills it. Today nothing in the repository measures this, so a change to an agent's instructions or read set cannot be checked against real runs, and three assumptions about what fills the context were disproven only by ad hoc scripts. The command is a development tool outside both plugins and ships to no user.

## Acceptance criteria

1. `node tools/agent-context.ts <projects directory>` prints one line for every agent type starting with `viber:` that has at least one run under that directory, carrying its number of runs and its median start, median peak, 90th percentile peak and largest peak context in thousands of tokens, the median taken as the upper middle value for an even number of runs, the agents ordered by median peak, largest first.
2. The same command prints a second table with one line per agent carrying the mean per run, in kilobytes, of tool output split into plugin file reads, project file reads, search output, shell output and other, of the memory injected at the start of the run and of the nested memory injected on file reads, and the mean number of distinct files opened per run.
3. With no directory argument the command reads `<CLAUDE_CONFIG_DIR>/projects`, or `<home>/.claude/projects` when that variable is unset. A directory that is missing or holds no viber agent run prints `no viber agent runs found under <directory>` and exits 0.

## Scope

### File map

- add - tools/agent-context.ts - the command and its functions: statistics of one run, the per-agent summary, the printed report, the choice of the projects directory, the port to the transcripts and its disk adapter
- add - tests/tools/agent-context.unit.test.ts - unit proof of the run statistics, the summary, the printed report, the directory choice and the command's decisions on the fake reader
- add - tests/tools/agent-context-fixture.ts - the fake reader of transcripts and the reader contract both the fake and the disk adapter pass
- add - tests/tools/agent-context.test.ts - integration proof of the disk adapter against a real directory

### Out of scope

- The reach script for `impact-mapper` and every change to `viber/agents/impact-mapper.md` or `viber/skills/planner/SKILL.md`: dropped after measuring that the agent's grep output is the evidence it confirms references from.
- Plan slices for the plan reviewers, the split of any agent, the host memory budgets and the `omitClaudeMd` field.
- Any file under `viber/` or `devtools/`: the tool ships with neither plugin.
- Any CI change: the workflow already runs `tests/**/*.test.ts`.
- Output tokens, turn counts, cost, a JSON or chart output, an option naming another agent prefix and an error exit for a missing directory.
- Every `CLAUDE.md`: the build's close owns the nodes, the root is the user's file.

## Tasks

<!-- TASK -->
### T1 - Compute the context statistics of one agent run
- TDD: required
- Covers: AC1, AC2
- Uses: C1, C2
- Depends-on: none
- Files: tools/agent-context.ts, tests/tools/agent-context.unit.test.ts
- Delivers: the function `runStats` of C2, turning the transcript lines of one agent run (C1) into its start and peak context, its tool output bytes by kind, its start and nested memory bytes and its count of distinct files opened
- Verification: node --test --test-reporter=dot tests/tools/agent-context.unit.test.ts -> every case passes
- DoD: `runStats` returns `start` as the context of the first assistant line carrying usage and `peak` as the largest one, each the sum of the three usage fields C1 names; the bytes of a tool result land under the kind C2 gives the tool call it answers, a `Read` path written with backslashes classified as its forward-slash form and a result answering no known call counted as `other`; `startMemory` is the summed length of the `content` of every file of every `instructions` attachment and `nestedMemory` the summed length of the text of every `nested_memory` attachment; `files` is the number of distinct `file_path` values over the `Read` calls; a line that is not JSON is skipped and lines carrying no assistant usage give `undefined`
<!-- /TASK -->

<!-- TASK -->
### T2 - Summarize runs per agent and render the report
- TDD: required
- Covers: AC1, AC2
- Uses: C2
- Depends-on: T1
- Files: tools/agent-context.ts, tests/tools/agent-context.unit.test.ts
- Delivers: the functions `summarize` and `render` of C2, grouping run statistics into one summary per viber agent and turning the summaries into the printed lines of both tables
- Verification: node --test --test-reporter=dot tests/tools/agent-context.unit.test.ts -> every case passes
- DoD: `summarize` leaves out every run whose agent does not start with `viber:` and gives each remaining agent its run count, the percentiles of C2 over its runs and the arithmetic mean of each byte kind, of `startMemory`, of `nestedMemory` and of `files`; the summaries come back ordered by `peakP50`, largest first; `render` returns the context table, one empty line and the breakdown table in the line format of C2
<!-- /TASK -->

<!-- TASK -->
### T3 - Choose the projects directory and report through a reader port
- TDD: required
- Covers: AC1, AC3
- Uses: C1, C2
- Depends-on: T2
- Files: tools/agent-context.ts, tests/tools/agent-context-fixture.ts, tests/tools/agent-context.unit.test.ts
- Delivers: the functions `projectsDir`, `agentOf` and `main` of C2, the `ReadRuns` port `main` reads the runs through, its in-memory fake and the reader contract in the fixture file
- Verification: node --test --test-reporter=dot tests/tools/agent-context.unit.test.ts -> every case passes
- DoD: `projectsDir` returns the first argument when one is given, else `<CLAUDE_CONFIG_DIR>/projects` when that variable is set and not empty, else `<home>/.claude/projects`; `agentOf` returns the `agentType` string of a meta file's text and `undefined` for text that is not JSON or carries no string `agentType`; `main`, given a directory argument and a reader returning runs of a viber agent, logs the `render` lines of their summary and returns 0; `main`, given a reader returning no viber run, logs `no viber agent runs found under <directory>`, the directory as `projectsDir` returned it, and returns 0; the fake reader passes the reader contract of C2
<!-- /TASK -->

<!-- TASK -->
### T4 - Read the transcripts from disk and run the report as a command
- TDD: none
- Covers: AC1, AC3
- Uses: C1, C2
- Depends-on: T3
- Files: tools/agent-context.ts, tests/tools/agent-context.test.ts
- Delivers: the disk adapter `readRuns` of C2 with its integration test, and the guarded entry that runs `main` when the file is the entry script
- Verification: node --test --test-name-pattern "no case carries this name" tests/tools/agent-context.test.ts && grep -q readRuns tools/agent-context.ts && grep -q readRuns tests/tools/agent-context.test.ts && node tools/agent-context.ts tests/tools -> the integration file loads with no case run, both files name readRuns, and the last command prints no viber agent runs found under tests/tools
- DoD: an integration test holds `readRuns` to the reader contract of C2 against a real directory; an integration test shows `readRuns` finding a run under a `subagents` directory several levels below the root and skipping a meta file with no transcript beside it; an integration test shows `readRuns` returning an empty list for a directory that does not exist; the file run as the entry script calls `main` with the process arguments, `console.log` and `readRuns` and sets the process exit code to its result
<!-- /TASK -->

## Contracts

### C1 - Subagent transcript files

File: none

```
<projects directory>/**/subagents/agent-<id>.meta.json   one JSON object, its "agentType" a string such as "viber:task-coder"
<projects directory>/**/subagents/agent-<id>.jsonl       the run's transcript, one JSON object per line, beside its meta file

transcript line, type "assistant":
  message.usage.input_tokens, message.usage.cache_creation_input_tokens, message.usage.cache_read_input_tokens   numbers, a missing one counts as 0
  message.content[]   items of type "tool_use": id, name, input.file_path (on Read)

transcript line, type "user":
  message.content[]   items of type "tool_result": tool_use_id, content (a string, or an array of items carrying "text")

transcript line, type "attachment":
  attachment.type "instructions"    the memory injected at the start of the run: attachment.files[], each carrying "content" (a string)
  attachment.type "nested_memory"   a CLAUDE.md or rule file injected on a file read: attachment.content.content (a string)
```

The context of one assistant line is `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. The size of a tool result is the length of its string content, or the summed length of the `text` of its array items.

### C2 - agent-context module

File: tools/agent-context.ts

```ts
export type Kind = "read-plugin" | "read-project" | "search" | "bash" | "other";

export interface RunStats {
  agent: string;
  start: number;
  peak: number;
  bytes: Record<Kind, number>;
  startMemory: number;
  nestedMemory: number;
  files: number;
}

export interface AgentSummary {
  agent: string;
  runs: number;
  startP50: number;
  peakP50: number;
  peakP90: number;
  peakMax: number;
  bytes: Record<Kind, number>;
  startMemory: number;
  nestedMemory: number;
  files: number;
}

export type ReadRuns = (root: string) => RunStats[];

export function runStats(agent: string, lines: string[]): RunStats | undefined;
export function agentOf(metaText: string): string | undefined;
export function summarize(runs: RunStats[]): AgentSummary[];
export function render(rows: AgentSummary[]): string[];
export function projectsDir(argv: string[], env: Record<string, string | undefined>, home: string): string;
export function main(argv: string[], log: (line: string) => void, read: ReadRuns): number;
export const readRuns: ReadRuns;
```

`ReadRuns` is the port to the transcripts and `readRuns` its disk adapter. Reader contract, for a root holding the runs a caller seeded as an agent type plus transcript lines: the reader returns the `runStats` of every seeded run, leaves out a run whose `runStats` is `undefined`, and returns an empty list for a root holding nothing.

Kind of a tool call: `Read` with a `file_path` holding the segment `plugins/cache/` is `read-plugin`, any other `Read` is `read-project`, `Grep` and `Glob` are `search`, `Bash` is `bash`, every other tool is `other`.

Percentile `f` of `n` values sorted ascending: the value at index `min(n - 1, floor(f * n))`; `P50` uses `f = 0.5`, `P90` uses `f = 0.9`.

Printed lines, fields joined by ` | `:

```
agent | runs | start p50 | peak p50 | peak p90 | peak max
<agent> | <runs> | <startP50>k | <peakP50>k | <peakP90>k | <peakMax>k

agent | read-plugin KB | read-project KB | search KB | bash KB | other KB | start memory KB | nested memory KB | files
<agent> | <read-plugin> | <read-project> | <search> | <bash> | <other> | <startMemory> | <nestedMemory> | <files>
```

A token value prints as `round(value / 1000)` followed by `k`, a byte value as `round(value / 1024)`, `files` with one decimal.
