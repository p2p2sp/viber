/*
 * extension.ts - the extension core: reports which agents the host project has
 * and what `build.extensions` lists, and registers one more name in the
 * `extensions:` map of .claude/viber.yml. The contract lives in the header of
 * ../skills/extension/scripts/extension.ts.
 */

import { byteOrder } from "./byte-order.ts";
import { mapClassifier } from "./config/lines.ts";
import { runConfig } from "./config/run.ts";
import type { Fs, Git } from "./ports.ts";

const NEWLINE = 0x0a;
const MARKER = /^<!-- viber:extension -->[ \t\r\v\f]*$/;

/** What the map of one viber.yml text holds, lines counted from 1. keyLine 0: no usable `extensions:` key under `build:`. */
interface MapFacts {
  keyLine: number;
  /** The last map line that is neither blank nor a comment, 0 when the map holds none. */
  lastKept: number;
  /** The indentation a new entry takes. */
  entryIndent: string;
  names: Set<string>;
}

function readMap(lines: string[]): MapFacts {
  const role = mapClassifier();
  const names = new Set<string>();
  let keyLine = 0;
  let keyIndent = "";
  let inline = false;
  let lastKept = 0;
  let entryIndent = "";
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const r = role(line);
    if (r === "key") {
      keyLine = index + 1;
      keyIndent = /^\s*/.exec(line)![0];
      inline = !/^(#|$)/.test(line.slice(line.indexOf(":") + 1).trimStart());
      return;
    }
    if (r !== "map" || /^\s*(#|$)/.test(line)) return;
    lastKept = index + 1;
    if (inline) return;
    const indent = /^\s*/.exec(line)![0];
    const rest = line.slice(indent.length);
    const colon = rest.indexOf(":");
    const key = colon < 0 ? "" : rest.slice(0, colon).trimEnd();
    if (key === "") return;
    if (entryIndent === "") entryIndent = indent;
    if (indent.length === entryIndent.length) names.add(key);
  });
  // A key carrying an inline value owns no map a line could join.
  return { keyLine: inline ? 0 : keyLine, lastKept, entryIndent: entryIndent || `${keyIndent}  `, names };
}

/** The lines of a text as awk counts them: a final newline ends the last line and opens no other. */
function linesOf(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** The byte offset right after the n-th line, its newline included; the length of the file when that line has none. */
function endOfLine(bytes: Uint8Array, n: number): number {
  let at = -1;
  for (let line = 0; line < n; line++) {
    at = bytes.indexOf(NEWLINE, at + 1);
    if (at < 0) return bytes.length;
  }
  return at + 1;
}

function add(name: string, config: string, fs: Fs): string {
  if (name === "" || name.startsWith("-") || /[^a-z0-9-]/.test(name)) return "invalid-name";
  if (fs.kind(config) !== "file") return "no-config";
  const bytes = fs.readBytes(config);
  if (bytes === null) return "stale";
  const lines = linesOf(new TextDecoder().decode(bytes));
  const map = readMap(lines);
  if (map.keyLine === 0) return "stale";
  if (map.names.has(name)) return "present";

  // The two lines go in after the last kept map line, in the line ending of the key line.
  const cr = lines[map.keyLine - 1].includes("\r") ? "\r" : "";
  const cut = endOfLine(bytes, map.lastKept || map.keyLine);
  const open = cut > 0 && bytes[cut - 1] !== NEWLINE ? `${cr}\n` : "";
  const entry = new TextEncoder().encode(`${open}${map.entryIndent}${name}:${cr}\n${map.entryIndent}  parallel: false${cr}\n`);
  const out = new Uint8Array(bytes.length + entry.length);
  out.set(bytes.subarray(0, cut));
  out.set(entry, cut);
  out.set(bytes.subarray(cut), cut + entry.length);
  return fs.writeBytes(config, out) ? "added" : "stale";
}

function report(base: string, config: string, cwd: string, ports: { fs: Fs; git: Git }): string[] {
  let state = "no-config";
  if (ports.fs.kind(config) === "file") {
    const text = ports.fs.readText(config);
    state = text !== null && readMap(linesOf(text)).keyLine > 0 ? "ok" : "stale";
  }
  let listed = "none";
  let missing = "none";
  for (const line of runConfig([], cwd, ports).split("\n")) {
    if (line.startsWith("build.extensions: ")) listed = line.slice("build.extensions: ".length);
    if (line.startsWith("build.extensions-missing: ")) missing = line.slice("build.extensions-missing: ".length);
  }
  const agents = `${base}/.claude/agents`;
  const names = ports.fs
    .listDir(agents)
    .filter((entry) => entry.endsWith(".md") && !entry.startsWith(".") && ports.fs.kind(`${agents}/${entry}`) === "file")
    .map((entry) => entry.slice(0, -3))
    .sort(byteOrder);
  const kindOf = (name: string): string => ((ports.fs.readText(`${agents}/${name}.md`) ?? "").split("\n").some((line) => MARKER.test(line)) ? "contract" : "plain");
  return [`CONFIG=${state}`, `LISTED=${listed.replaceAll(" + ", ", ")}`, `MISSING=${missing}`, ...names.map((name) => `AGENT=${name} | ${kindOf(name)}`)];
}

/** The whole stdout of one extension call, every line ended by "\n". Never throws. */
export function runExtension(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): string {
  const here = cwd.replaceAll("\\", "/").replace(/(.)\/$/, "$1");
  const base = (ports.git.repoRoot(here) ?? here).replace(/\/$/, "");
  const config = `${base}/.claude/viber.yml`;
  const lines = argv[0] === "--add" ? [`STATUS=${add(argv[1] ?? "", config, ports.fs)}`] : report(base, config, here, ports);
  return lines.map((line) => `${line}\n`).join("");
}
