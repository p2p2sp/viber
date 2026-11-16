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
