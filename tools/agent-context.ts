/*
 * agent-context.ts - development tool measuring the context of viber's agents from the subagent
 * transcripts Claude Code keeps on disk. Ships with no plugin.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

type Json = Record<string, any>;

function parse(line: string): Json | undefined {
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
}

function kindOf(name: unknown, filePath: unknown): Kind {
  if (name === "Read") {
    const forward = typeof filePath === "string" ? filePath.replaceAll("\\", "/") : "";
    return forward.includes("plugins/cache/") ? "read-plugin" : "read-project";
  }
  if (name === "Grep" || name === "Glob") return "search";
  if (name === "Bash") return "bash";
  return "other";
}

function contextOf(usage: Json): number {
  return (
    (Number(usage.input_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0)
  );
}

function sizeOf(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, item) => sum + (typeof item?.text === "string" ? item.text.length : 0), 0);
}

function textLength(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

export function runStats(agent: string, lines: string[]): RunStats | undefined {
  const bytes: Record<Kind, number> = { "read-plugin": 0, "read-project": 0, search: 0, bash: 0, other: 0 };
  const kinds = new Map<string, Kind>();
  const opened = new Set<string>();
  let start: number | undefined;
  let peak = 0;
  let startMemory = 0;
  let nestedMemory = 0;

  for (const line of lines) {
    const entry = parse(line);
    if (!entry) continue;
    if (entry.type === "assistant") {
      const usage = entry.message?.usage;
      if (usage && typeof usage === "object") {
        const context = contextOf(usage);
        start ??= context;
        peak = Math.max(peak, context);
      }
      for (const item of entry.message?.content ?? []) {
        if (item?.type !== "tool_use") continue;
        const filePath = item.input?.file_path;
        kinds.set(item.id, kindOf(item.name, filePath));
        if (item.name === "Read" && typeof filePath === "string") opened.add(filePath);
      }
    } else if (entry.type === "user") {
      for (const item of entry.message?.content ?? []) {
        if (item?.type !== "tool_result") continue;
        bytes[kinds.get(item.tool_use_id) ?? "other"] += sizeOf(item.content);
      }
    } else if (entry.type === "attachment") {
      const attachment = entry.attachment;
      if (attachment?.type === "instructions") {
        for (const file of attachment.files ?? []) startMemory += textLength(file?.content);
      } else if (attachment?.type === "nested_memory") {
        nestedMemory += textLength(attachment.content?.content);
      }
    }
  }

  if (start === undefined) return undefined;
  return { agent, start, peak, bytes, startMemory, nestedMemory, files: opened.size };
}

const KINDS: Kind[] = ["read-plugin", "read-project", "search", "bash", "other"];

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ascending(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function summaryOf(agent: string, runs: RunStats[]): AgentSummary {
  const starts = ascending(runs.map((run) => run.start));
  const peaks = ascending(runs.map((run) => run.peak));
  const bytes = {} as Record<Kind, number>;
  for (const kind of KINDS) bytes[kind] = mean(runs.map((run) => run.bytes[kind]));
  return {
    agent,
    runs: runs.length,
    startP50: percentile(starts, 0.5),
    peakP50: percentile(peaks, 0.5),
    peakP90: percentile(peaks, 0.9),
    peakMax: peaks[peaks.length - 1],
    bytes,
    startMemory: mean(runs.map((run) => run.startMemory)),
    nestedMemory: mean(runs.map((run) => run.nestedMemory)),
    files: mean(runs.map((run) => run.files)),
  };
}

export function summarize(runs: RunStats[]): AgentSummary[] {
  const byAgent = new Map<string, RunStats[]>();
  for (const run of runs) {
    if (!run.agent.startsWith("viber:")) continue;
    byAgent.set(run.agent, [...(byAgent.get(run.agent) ?? []), run]);
  }
  return [...byAgent].map(([agent, group]) => summaryOf(agent, group)).sort((a, b) => b.peakP50 - a.peakP50);
}

function tokens(value: number): string {
  return `${Math.round(value / 1000)}k`;
}

function kilobytes(value: number): string {
  return String(Math.round(value / 1024));
}

export function render(rows: AgentSummary[]): string[] {
  return [
    "agent | runs | start p50 | peak p50 | peak p90 | peak max",
    ...rows.map((row) =>
      [row.agent, row.runs, tokens(row.startP50), tokens(row.peakP50), tokens(row.peakP90), tokens(row.peakMax)].join(" | "),
    ),
    "",
    "agent | read-plugin KB | read-project KB | search KB | bash KB | other KB | start memory KB | nested memory KB | files",
    ...rows.map((row) =>
      [
        row.agent,
        ...KINDS.map((kind) => kilobytes(row.bytes[kind])),
        kilobytes(row.startMemory),
        kilobytes(row.nestedMemory),
        row.files.toFixed(1),
      ].join(" | "),
    ),
  ];
}

export function agentOf(metaText: string): string | undefined {
  const agentType = parse(metaText)?.agentType;
  return typeof agentType === "string" ? agentType : undefined;
}

export function projectsDir(argv: string[], env: Record<string, string | undefined>, home: string): string {
  if (argv.length > 0) return argv[0];
  const config = env.CLAUDE_CONFIG_DIR;
  return config ? path.join(config, "projects") : path.join(home, ".claude", "projects");
}

export function main(argv: string[], log: (line: string) => void, read: ReadRuns): number {
  const directory = projectsDir(argv, process.env, os.homedir());
  const rows = summarize(read(directory));
  if (rows.length === 0) {
    log(`no viber agent runs found under ${directory}`);
    return 0;
  }
  for (const line of render(rows)) log(line);
  return 0;
}

const META_SUFFIX = ".meta.json";

function entriesOf(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function textOf(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function runsIn(directory: string, entries: fs.Dirent[]): RunStats[] {
  const runs: RunStats[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("agent-") || !entry.name.endsWith(META_SUFFIX)) continue;
    const base = entry.name.slice(0, -META_SUFFIX.length);
    const meta = textOf(path.join(directory, entry.name));
    const transcript = textOf(path.join(directory, `${base}.jsonl`));
    if (meta === undefined || transcript === undefined) continue;
    const agent = agentOf(meta);
    if (agent === undefined) continue;
    const stats = runStats(agent, transcript.split("\n"));
    if (stats) runs.push(stats);
  }
  return runs;
}

export const readRuns: ReadRuns = (root) => {
  const runs: RunStats[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    const entries = entriesOf(directory);
    if (path.basename(directory) === "subagents") runs.push(...runsIn(directory, entries));
    for (const entry of entries) if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
  }
  return runs;
};

if (import.meta.main) process.exitCode = main(process.argv.slice(2), console.log, readRuns);
