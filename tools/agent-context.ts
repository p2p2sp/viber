/*
 * agent-context.ts - development tool measuring the context of viber's agents from the subagent
 * transcripts Claude Code keeps on disk. Ships with no plugin.
 */

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
