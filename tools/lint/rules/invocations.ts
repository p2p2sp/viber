/*
 * invocations.ts - the `invocations` rule type: how a plugin's skills, parts, fragments and
 * hooks.json call its scripts. A script invoked bare must carry the 100755 index mode, a preload
 * must quote its glob characters and root variables, and every switch-text.sh call must name a
 * known key and a fragment that exists, with every fragment called by its own skill.
 */

import path from "node:path";
import type { Finding, RuleType, Tree } from "../engine.ts";

export interface InvocationsParams {
  plugin: string;
  /** every key switch-text.sh recognizes, with its valid values */
  switches: Record<string, string[]>;
}

interface Doc { file: string; content: string }

const INTERPRETER_WORDS = new Set(["bash", "sh", "node"]);
const GLOB_CHARS = ["?", "*", "["];
const ROOT_VARS = ["${CLAUDE_PLUGIN_ROOT}", "${CLAUDE_SKILL_DIR}"];

type Quote = "none" | "single" | "double";

function quoteStates(word: string): Quote[] {
  const states: Quote[] = [];
  let state: Quote = "none";
  for (const ch of word) {
    if (state === "none" && ch === "'") {
      state = "single";
      states.push("single");
    } else if (state === "none" && ch === '"') {
      state = "double";
      states.push("double");
    } else if (state === "single" && ch === "'") {
      states.push("single");
      state = "none";
    } else if (state === "double" && ch === '"') {
      states.push("double");
      state = "none";
    } else {
      states.push(state);
    }
  }
  return states;
}

/** Splits on whitespace outside quotes: enough for the fixed invocation shapes preloads use. */
function splitWords(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (const ch of line) {
    if (quote === null && (ch === " " || ch === "\t")) {
      if (current.length > 0) words.push(current);
      current = "";
      continue;
    }
    if (quote === null && (ch === "'" || ch === '"')) quote = ch;
    else if (quote !== null && ch === quote) quote = null;
    current += ch;
  }
  if (current.length > 0) words.push(current);
  return words;
}

function preloadLineMessages(line: string): string[] {
  const messages: string[] = [];
  for (const word of splitWords(line)) {
    const states = quoteStates(word);
    for (let i = 0; i < word.length; i++) {
      if (GLOB_CHARS.includes(word[i]) && states[i] === "none") {
        messages.push(`unquoted '${word[i]}' in argument "${word}" (zsh nomatch risk)`);
      }
    }
    for (const rootVar of ROOT_VARS) {
      const idx = word.indexOf(rootVar);
      if (idx !== -1 && states[idx] !== "double") messages.push(`${rootVar} must be double-quoted in argument "${word}"`);
    }
  }
  return messages;
}

/** A backtick preload counts only when its closing backtick ends the line: prose that merely
 *  mentions the syntax mid-sentence stays out. */
function preloadFindings({ file, content }: Doc): Finding[] {
  const findings: Finding[] = [];
  let inFence = false;
  content.split("\n").forEach((line, i) => {
    if (!inFence && line.trim() === "```!") {
      inFence = true;
      return;
    }
    if (inFence && line.trim() === "```") {
      inFence = false;
      return;
    }
    const source = inFence ? line : line.match(/!`(.*)`\s*$/)?.[1];
    if (source === undefined) return;
    for (const message of preloadLineMessages(source)) findings.push({ path: file, line: i + 1, message });
  });
  return findings;
}

interface Pattern {
  text: string;
  /** only documents under this directory are searched: a bare skill-relative call must never be
   *  attributed to a same-named script of another skill */
  ownerDir?: string;
  /** the match counts only where it begins a whitespace-delimited token */
  standalone?: boolean;
}

function patternsOf(script: string, plugin: string): Pattern[] {
  const segments = script.split("/");
  const patterns: Pattern[] = [{ text: `\${CLAUDE_PLUGIN_ROOT}/${segments.slice(1).join("/")}` }];
  if (segments[1] === "skills" && segments.length > 3 && segments[0] === plugin) {
    const skillRelative = segments.slice(3).join("/");
    patterns.push({ text: `\${CLAUDE_SKILL_DIR}/${skillRelative}` });
    patterns.push({ text: skillRelative, ownerDir: segments.slice(0, 3).join("/"), standalone: true });
  }
  return patterns;
}

function bareCall(script: string, plugin: string, docs: Doc[]): { file: string; line: number } | null {
  for (const { text, ownerDir, standalone } of patternsOf(script, plugin)) {
    for (const { file, content } of docs) {
      if (ownerDir !== undefined && !file.startsWith(`${ownerDir}/`)) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let from = 0;
        for (;;) {
          const at = line.indexOf(text, from);
          if (at === -1) break;
          from = at + text.length;
          if (standalone && at > 0 && !/\s/.test(line[at - 1])) continue;
          const before = line.slice(0, at - 1).trimEnd();
          const lastWord = (before.split(/\s+/).pop() ?? "").replace(/^`+|`+$/g, "");
          if (!INTERPRETER_WORDS.has(lastWord)) return { file, line: i + 1 };
        }
      }
    }
  }
  return null;
}

interface Call { line: number; key: string; name: string; file: string }

const CALL_RE = /"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/switch-text\.sh"\s+(\S+)\s+"\$\{CLAUDE_SKILL_DIR\}"\s+(\S+)/;

/** A key may carry a `""` splice (`branching.""mode`) that keeps the raw key out of a grep ban:
 *  quote characters carry no expansion here, so they are stripped. */
function callsOf({ file, content }: Doc): Call[] {
  const calls: Call[] = [];
  content.split("\n").forEach((line, i) => {
    const m = line.match(CALL_RE);
    if (m) calls.push({ line: i + 1, key: m[1].replace(/['"]/g, ""), name: m[2].replace(/['"]/g, ""), file });
  });
  return calls;
}

function fragmentFindings(skillDir: string, docs: Doc[], fragments: string[], switches: Record<string, string[]>): Finding[] {
  const findings: Finding[] = [];
  const byName = new Map<string, Call[]>();
  for (const call of docs.flatMap(callsOf)) {
    if (!(call.key in switches)) {
      findings.push({ path: call.file, line: call.line, message: `switch-text.sh call names unknown key '${call.key}'` });
      continue;
    }
    byName.set(call.name, [...(byName.get(call.name) ?? []), call]);
  }
  for (const [name, calls] of byName) {
    for (const call of calls) {
      if (!switches[call.key].some((v) => fragments.includes(`${name}.${v}.md`))) {
        findings.push({
          path: call.file,
          line: call.line,
          message: `switch-text.sh call names fragment '${name}' with no file for any value of key '${call.key}'`,
        });
      }
    }
  }
  for (const base of fragments) {
    const m = base.match(/^([a-z0-9-]+)\.([a-z]+)\.md$/);
    if (!m) continue;
    const file = `${skillDir}/fragments/${base}`;
    const calls = byName.get(m[1]);
    if (!calls || calls.length === 0) {
      findings.push({ path: file, line: 0, message: "called by no SKILL.md of its own skill" });
      continue;
    }
    for (const call of calls) {
      if (!switches[call.key].includes(m[2])) {
        findings.push({ path: file, line: 0, message: `value '${m[2]}' is not valid for key '${call.key}'` });
      }
    }
  }
  return findings;
}

function check(tree: Tree, params: InvocationsParams): Finding[] {
  const prefix = `${params.plugin}/`;
  const tracked = tree.files.filter((f) => f.path.startsWith(prefix));
  const skillMds = tracked.map((f) => f.path).filter((p) => /^[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(p));
  const hooks = tracked.map((f) => f.path).filter((p) => path.posix.basename(p) === "hooks.json");
  const fragmentFiles = tracked.map((f) => f.path).filter((p) => /\/fragments\/[^/]+\.md$/.test(p));
  const parts = skillMds.flatMap((md) => {
    const dir = `${path.posix.dirname(md)}/parts`;
    return tree.list(dir).filter((n) => n.endsWith(".md")).sort().map((n) => `${dir}/${n}`);
  });

  const load = (files: string[], unescape = false): Doc[] =>
    files.flatMap((file) => {
      const raw = tree.read(file);
      return raw === null ? [] : [{ file, content: unescape ? raw.replace(/\\"/g, '"') : raw }];
    });
  const skillDocs = load(skillMds);
  const partDocs = load(parts);
  const corpus = [...skillDocs, ...load(hooks, true), ...load(fragmentFiles), ...partDocs];

  const findings: Finding[] = [];
  for (const { path: script, mode } of tracked) {
    if (!script.endsWith(".sh") || mode === "100755") continue;
    const hit = bareCall(script, params.plugin, corpus);
    if (hit) findings.push({ path: script, line: 0, message: `invoked bare at ${hit.file}:${hit.line} but git mode is ${mode} (expected 100755)` });
  }
  for (const doc of [...skillDocs, ...partDocs]) findings.push(...preloadFindings(doc));
  for (const md of skillMds) {
    const skillDir = path.posix.dirname(md);
    const own = [...skillDocs.filter((d) => d.file === md), ...partDocs.filter((d) => path.posix.dirname(path.posix.dirname(d.file)) === skillDir)];
    const names = fragmentFiles.filter((f) => path.posix.dirname(path.posix.dirname(f)) === skillDir).map((f) => path.posix.basename(f));
    findings.push(...fragmentFindings(skillDir, own, names, params.switches));
  }
  return findings;
}

const invocations: RuleType<InvocationsParams> = {
  name: "invocations",
  check,
  selfCheck: {
    tree: {
      files: [
        { path: "p/scripts/bare.sh", mode: "100644" },
        { path: "p/skills/s/SKILL.md", mode: "100644" },
      ],
      read: (f) => (f === "p/skills/s/SKILL.md" ? 'Run: !`"${CLAUDE_PLUGIN_ROOT}/scripts/bare.sh"`\n' : null),
      list: () => [],
    },
    params: { plugin: "p", switches: {} },
  },
};

export default invocations;
