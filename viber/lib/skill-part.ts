/*
 * skill-part.ts - the skill-part core: prints one part file of a skill, each
 * switch fragment block in it replaced by the fragment the switch-text core
 * selects, both root placeholders expanded. The contract lives in the header
 * of ../scripts/skill-part.ts.
 */

import type { Fs, Git } from "./ports.ts";
import { pluginRootOf, runSwitchText } from "./switch-text.ts";

export interface SkillPartResult {
  stdout: string;
  stderr: string;
  exit: number;
}

const OPEN_FENCE = "```!";
const CLOSE_FENCE = "```";

/** The one body line a block must hold to be run: the switch-text call, its key and its fragment name. */
const CALL = /^"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/switch-text\.sh" ([A-Za-z0-9._"-]+) "\$\{CLAUDE_SKILL_DIR\}" ([a-z0-9-]+)$/;

function fail(reason: string): SkillPartResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 1 };
}

/** The stdout, stderr and exit code of one skill-part call. Never throws. */
export function runSkillPart(argv: string[], cwd: string, ports: { fs: Fs; git: Git }): SkillPartResult {
  const [skillDir = "", part = ""] = argv;
  if (skillDir === "" || part === "") return fail("usage: skill-part.sh <skill dir> <part>");
  if (!/^[a-z0-9-]+$/.test(part)) return fail(`part name must match [a-z0-9-]+: ${part}`);
  // Looked up as switch-text looks up a fragment: the directory as given, its trailing slashes dropped.
  const file = `${skillDir.replace(/\/+$/, "")}/parts/${part}.md`;
  const text = ports.fs.kind(file) === "file" ? ports.fs.readText(file) : null;
  if (text === null) return fail(`no such part file: ${skillDir}/parts/${part}.md`);

  const pluginRoot = pluginRootOf(skillDir);
  // A function replacement keeps a `$` of the path literal.
  const expand = (raw: string): string => raw.replaceAll("${CLAUDE_SKILL_DIR}", () => skillDir).replaceAll("${CLAUDE_PLUGIN_ROOT}", () => pluginRoot);

  const lines = text.split("\n");
  // A final newline ends the last line: it opens no line of its own.
  const count = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  let out = "";
  // The lines of the block being read, fences included; null outside a block.
  let block: string[] | null = null;
  let body: string[] = [];
  for (let i = 0; i < count; i++) {
    const line = i < lines.length - 1 ? `${lines[i]}\n` : lines[i];
    const bare = lines[i].replace(/\r$/, "");
    if (block === null) {
      if (bare === OPEN_FENCE) {
        block = [line];
        body = [];
      } else {
        out += expand(line);
      }
    } else if (bare === CLOSE_FENCE) {
      const call = body.length === 1 ? CALL.exec(body[0]) : null;
      // A fragment arrives expanded by the switch-text core, never expanded twice;
      // a block that is not exactly one call stays as it was written.
      out += call === null ? expand(block.join("") + line) : runSwitchText([call[1].replaceAll('"', ""), skillDir, call[2]], cwd, ports);
      block = null;
    } else {
      block.push(line);
      body.push(bare);
    }
  }
  // A block still open at the end of the file was never closed: plain text.
  if (block !== null) out += expand(block.join(""));
  return { stdout: out, stderr: "", exit: 0 };
}
