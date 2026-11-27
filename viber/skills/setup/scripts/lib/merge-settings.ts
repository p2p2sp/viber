/*
 * merge-settings.ts - the merge-settings core: creates the host project's
 * settings file from the bundled template, replaces it on a reset once the old
 * one is saved, and merges the template into an existing one key by key. The
 * contract lives in the header of ../merge-settings.ts.
 */

import { absolutePath } from "./abs-path.ts";
import type { Fs, Git } from "./ports.ts";

type Json = Record<string, unknown>;

/** What one call answers: its stdout, its stderr and its exit code. */
export interface MapAnswer {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Counts {
  keys: number;
  entries: number;
  values: number;
  moved: number;
}

const BACKUP_DIR = ".temp/viber/setup";
const RULE_LISTS = new Set(["permissions.allow", "permissions.ask", "permissions.deny"]);
const MATCH_ALL = new Set(["*", "**", "**/*"]);

const say = (text: string, exit: number): MapAnswer => ({ stdout: `settings.json: ${text}\n`, stderr: "", exit });
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The value of a JSON text, or the reason it is none, on one line: V8 folds a snippet into its parse errors. */
function parse(text: string): { value: unknown } | { reason: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { reason: String((error as Error).message).replace(/\s+/g, " ").trim() };
  }
}

/** `Tool` or `Tool(<specifier>)`, a match-all specifier folded to null (bare); anything else: null. */
function ruleOf(entry: unknown): { tool: string; spec: string | null } | null {
  const match = typeof entry === "string" ? /^([^()\s]+)(?:\((.*)\))?$/s.exec(entry) : null;
  if (match === null) return null;
  return { tool: match[1], spec: match[2] === undefined || MATCH_ALL.has(match[2].trim()) ? null : match[2] };
}

function covers(existing: unknown, entry: unknown): boolean {
  const have = ruleOf(existing);
  const want = ruleOf(entry);
  return have !== null && want !== null && have.tool === want.tool && (have.spec === null || have.spec === want.spec);
}

function mergeInto(host: Json, template: Json, prefix: string, counts: Counts): void {
  for (const [key, value] of Object.entries(template)) {
    const at = prefix === "" ? key : `${prefix}.${key}`;
    const held = host[key];
    if (!Object.hasOwn(host, key)) {
      host[key] = value;
      counts.keys += 1;
    } else if (isObject(held) && isObject(value)) {
      mergeInto(held, value, at, counts);
    } else if (Array.isArray(held) && Array.isArray(value)) {
      for (const entry of value) {
        if (held.some((existing) => same(existing, entry) || (RULE_LISTS.has(at) && covers(existing, entry)))) continue;
        held.push(entry);
        counts.entries += 1;
      }
    } else if (!same(held, value)) {
      host[key] = value;
      counts.values += 1;
    }
  }
}

/** Drops from the host's deny list what the template asks for: deny outranks ask. */
function moveDenied(host: Json, template: Json, counts: Counts): void {
  const asked = isObject(template.permissions) ? template.permissions.ask : undefined;
  if (!Array.isArray(asked) || !isObject(host.permissions) || !Array.isArray(host.permissions.deny)) return;
  const deny: unknown[] = host.permissions.deny;
  const kept = deny.filter((entry) => !asked.includes(entry));
  counts.moved = deny.length - kept.length;
  host.permissions.deny = kept;
}

/** The target in one step through `<target>.tmp`, or false with the target left as it was. */
function replaceWith(bytes: Uint8Array, file: string, fs: Fs): boolean {
  return fs.writeBytes(`${file}.tmp`, bytes) && fs.replace(`${file}.tmp`, file);
}

/** file: the target as the port is asked for it; shown: as the caller named it. */
function merge(template: Uint8Array, templateShown: string, file: string, shown: string, fs: Fs): MapAnswer {
  const wanted = parse(new TextDecoder("utf-8", { ignoreBOM: true }).decode(template));
  if (!("value" in wanted) || !isObject(wanted.value)) return say(`template missing at ${templateShown} - skipped`, 1);
  const raw = fs.readText(file);
  if (raw === null) return say(`unreadable - left untouched (cannot read ${shown})`, 2);
  const current = parse(raw);
  if (!("value" in current)) return say(`not valid JSON - left untouched (${current.reason})`, 2);
  if (!isObject(current.value)) return say("not valid JSON - left untouched (top-level value is not an object)", 2);

  const counts: Counts = { keys: 0, entries: 0, values: 0, moved: 0 };
  mergeInto(current.value, wanted.value, "", counts);
  moveDenied(current.value, wanted.value, counts);
  if (counts.keys + counts.entries + counts.values + counts.moved === 0) return say("already up to date", 0);
  // A failed rename leaves the .tmp behind: the merged result stays inspectable beside the target.
  if (!replaceWith(new TextEncoder().encode(`${JSON.stringify(current.value, null, 2)}\n`), file, fs)) return say(`write failed (cannot write ${shown})`, 2);
  return say(`merged - added ${counts.keys} keys, ${counts.entries} list entries, updated ${counts.values} values, moved ${counts.moved} deny to ask`, 0);
}

/** Why the old file could not be saved, empty once it is. */
function backup(file: string, root: string, fs: Fs): string {
  const bytes = fs.readBytes(file);
  if (bytes === null) return "cannot read the file";
  if (!fs.makeDir(`${root}/${BACKUP_DIR}`)) return `cannot create ${BACKUP_DIR}`;
  return fs.writeBytes(`${root}/${BACKUP_DIR}/settings.json.bak`, bytes) ? "" : `cannot write ${BACKUP_DIR}/settings.json.bak`;
}

/** The stdout, stderr and exit code of one merge-settings call. Never throws. */
export function runMergeSettings(argv: string[], cwd: string, { fs, git }: { fs: Fs; git: Git }): MapAnswer {
  const reset = argv[0] === "--reset";
  const args = reset ? argv.slice(1) : argv;
  const [templateShown = "", target = ""] = args;
  if (templateShown === "" || args.length > 2) return { stdout: "", stderr: "usage: merge-settings.sh [--reset] <template> [<target>]\n", exit: 1 };

  const here = cwd.replaceAll("\\", "/");
  // The repository root holding cwd, cwd itself outside a repository: no trailing slash, so `/` is empty.
  const root = (git.repoRoot(here) ?? here).replace(/\/$/, "");
  const shown = target || `${root}/.claude/settings.json`;
  const file = absolutePath(shown.replaceAll("\\", "/"), here);
  const template = fs.readBytes(absolutePath(templateShown.replaceAll("\\", "/"), here));
  if (template === null) return say(`template missing at ${templateShown} - skipped`, 1);

  const present = fs.kind(file) === "file";
  if (present && !reset) return merge(template, templateShown, file, shown, fs);
  if (present) {
    const failed = backup(file, root, fs);
    if (failed !== "") return say(`backup failed - left untouched (${failed})`, 2);
  }
  fs.makeDir(file.slice(0, file.lastIndexOf("/")));
  if (!reset) return fs.writeBytes(file, template) ? say("created from template", 0) : say(`write failed (cannot create ${shown})`, 2);
  if (!replaceWith(template, file, fs)) {
    fs.remove(`${file}.tmp`);
    return say(`write failed (cannot write ${shown})`, 2);
  }
  return say(present ? `reset from template (previous file saved to ${BACKUP_DIR}/settings.json.bak)` : "created from template", 0);
}
