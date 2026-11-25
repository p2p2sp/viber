/*
 * file-guard.ts - the file-guard core: refuses the edit a task coder makes to a
 * file another unfinished task of the run claims. The contract lives in the
 * header of ../hooks/scripts/file-guard.ts.
 */

import { absolutePath } from "./abs-path.ts";
import { byteOrder } from "./byte-order.ts";
import { drivePath } from "./drive-path.ts";
import { readState } from "./plan-index/state.ts";
import { bare, linesOf, trim, valueOf } from "./plan-index/text.ts";
import type { Fs, Git } from "./ports.ts";
import { rootRelative } from "./root-relative.ts";

const CODER = "viber:task-coder";
const ABSOLUTE = /^(\/|[A-Za-z]:\/)/;
const TASK_FILE = /^(.+)\/tasks\/([^/]+)\.md$/s;
const FILES = /^-[ \t\v\f\r]*Files:/;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const slashed = (path: string): string => path.replaceAll("\\", "/");
/** The text as it stands between the quotes of a JSON string. */
const quoted = (value: string): string => JSON.stringify(value).slice(1, -1);
const numberOf = (id: string): number => Number(/[0-9]+/.exec(id)?.[0] ?? Number.POSITIVE_INFINITY);

function parsed(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** The dispatch prompt a subagent transcript opens on: its first record, a user one carrying this agent's id; null for any other first line. */
function promptOf(transcript: string, agent: string): string | null {
  const end = transcript.indexOf("\n");
  const record = parsed(end < 0 ? transcript : transcript.slice(0, end));
  if (!isRecord(record) || record.agentId !== agent || record.type !== "user" || !isRecord(record.message)) return null;
  const content = record.message.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((part) => (isRecord(part) ? text(part.text) : "")).join("\n") : null;
}

/** The value of the first prompt line opening on `task:`; empty for none. */
function taskLine(prompt: string): string {
  return trim(/(?:^|\n)task:([^\n]*)/.exec(prompt)?.[1] ?? "");
}

/** The deny line of a refused edit, or nothing: every input that cannot be read allows. */
function guard(payload: string, { fs, git }: { fs: Fs; git: Pick<Git, "repoRoot"> }, caseless: boolean): string {
  const call = parsed(payload);
  if (!isRecord(call) || call.agent_type !== CODER || !isRecord(call.tool_input)) return "";
  const agent = text(call.agent_id);
  const edited = text(call.tool_input.file_path);
  const cwd = slashed(text(call.cwd)).replace(/(.)\/+$/, "$1");
  if (!/^[A-Za-z0-9_-]+$/.test(agent) || edited === "" || !ABSOLUTE.test(cwd)) return "";
  const root = (git.repoRoot(cwd) ?? cwd).replace(/(.)\/+$/, "$1");

  /** One spelling per path: slashes, a drive letter for an MSYS root, no `.` or `..` segment. */
  const absolute = (path: string, base: string): string => absolutePath(drivePath(slashed(path), root), base);
  /** The path below the repository root; null for one outside it. */
  const below = (path: string): string | null => {
    const full = absolute(path, cwd);
    const relative = rootRelative(full, root, fs);
    return relative === full ? null : relative;
  };
  /** A Files entry or an extras line as the repo-relative path it names; empty for none. */
  const named = (raw: string): string => {
    const path = slashed(trim(raw));
    return ABSOLUTE.test(drivePath(path, root)) ? (below(path) ?? "") : bare(path);
  };

  const path = below(edited);
  if (path === null) return "";

  const kept = `${root}/.temp/viber/guard/${agent}`;
  const isTask = (file: string): boolean => TASK_FILE.test(file) && fs.kind(file) === "file";
  const fromTranscript = (): string => {
    const session = slashed(text(call.transcript_path));
    const transcripts = [
      slashed(text(call.agent_transcript_path)),
      session.endsWith(".jsonl") ? `${session.slice(0, -".jsonl".length)}/subagents/agent-${agent}.jsonl` : "",
      session.endsWith(`/agent-${agent}.jsonl`) ? session : "",
    ];
    for (const transcript of transcripts) {
      const prompt = transcript === "" ? null : promptOf(fs.readText(transcript) ?? "", agent);
      if (prompt === null) continue;
      const line = taskLine(prompt);
      const file = line === "" ? undefined : [root, cwd].map((base) => absolute(line, base)).find(isTask);
      if (file === undefined) return "";
      // Kept so a later edit reads no transcript again; a failed write changes nothing.
      if (fs.makeDir(`${root}/.temp/viber/guard`)) fs.writeBytes(kept, new TextEncoder().encode(`${file}\n`));
      return file;
    }
    return "";
  };
  const earlier = trim(fs.readText(kept) ?? "");
  const task = TASK_FILE.exec(isTask(earlier) ? earlier : fromTranscript());
  if (task === null) return "";
  const [dir, own] = [task[1], task[2]];

  const state = readState(dir, fs);
  if (!state.landed) return "";
  const listed = (file: string): string[] => linesOf(fs.readText(file) ?? "");
  /** Two spellings of one file are one path where the file system ignores case. */
  const folded = (name: string): string => (caseless ? name.toLowerCase() : name);
  /** The path as task id lists it, in its Files or one of its two extras files; undefined when it lists none. */
  const listedAs = (id: string): string | undefined => {
    const files = listed(`${dir}/tasks/${id}.md`).find((line) => FILES.test(line));
    const extras = [`${dir}/work/${id}-extra.md`, `${dir}/work/${id}-extra-review.md`].flatMap(listed);
    return [...(files === undefined ? [] : valueOf(files).split(",")), ...extras].map(named).find((entry) => entry !== "" && folded(entry) === folded(path));
  };
  if (listedAs(own) !== undefined) return "";
  // A skipped task never finishes: a claim of its own would be a wait with no end.
  const open = fs
    .listDir(`${dir}/tasks`)
    .flatMap((name) => (name.endsWith(".md") ? [name.slice(0, -3)] : []))
    .filter((id) => id !== own && !state.done.has(id) && !state.skipped.has(id))
    .sort((a, b) => numberOf(a) - numberOf(b) || byteOrder(a, b));
  for (const claimant of open) {
    // Named as the claimant lists it, so the WAIT line the coder returns is found again by that spelling.
    const claimed = listedAs(claimant);
    if (claimed === undefined) continue;
    return `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"viber guard: ${quoted(claimed)} belongs to task ${quoted(claimant)}, which is not finished. Leave it as it is, finish every DoD clause that does not need it, then return VERDICT: FAIL with WAIT: ${quoted(claimed)}."}}\n`;
  }
  return "";
}

/**
 * The whole stdout of one file-guard call for a PreToolUse payload; it never throws.
 * `caseless` says the file system ignores case (macOS, Windows): the entry knows the platform, the core asks no OS.
 */
export function runFileGuard(payload: string, ports: { fs: Fs; git: Pick<Git, "repoRoot"> }, options: { caseless?: boolean } = {}): string {
  try {
    return guard(payload, ports, options.caseless === true);
  } catch {
    return "";
  }
}
