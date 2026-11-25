/*
 * verification.ts - reads the command of a task's Verification for check.ts: the
 * integration test file it names, the git grep that reads nothing, and the inline
 * code and scratch scripts a coder's shell refuses. Text alone, no port.
 */

import { bare, trim, words } from "./text.ts";

/** The commands of a line cut at the separator, each as its words with quotes and parentheses dropped. */
function commandsOf(text: string, separator: RegExp): string[][] {
  return text.split(separator).map((command) => words(command).map((word) => word.replace(/[`"'()]/g, "")));
}

/**
 * The integration test directory of a path: the shallowest directory prefix whose
 * last segment is "integration" or holds integration[-_.]?tests?, or the path
 * itself when its file name holds ".integration."; null when it is neither. A file
 * name matching the segment pattern does not count (integration-tests.md is a
 * document, not a test).
 */
export function integrationFloor(path: string): string | null {
  const segments = path.split("/");
  const name = segments.pop() ?? "";
  const at = segments.findIndex((segment) => /^integration$|integration[-_.]?tests?/i.test(segment));
  if (at >= 0) return segments.slice(0, at + 1).join("/");
  return /\.integration\./i.test(name) ? path : null;
}

/** True when a command names the file, a directory of it at or below floor, or a file directly inside such a directory; a grep, git grep or rg names nothing. */
export function namesIntegration(command: string, path: string, floor: string): boolean {
  const inChain = (token: string): boolean => token === path || (token.length >= floor.length && path.startsWith(`${token}/`));
  return commandsOf(command, /&&|\|\||[;,|]/)
    .filter((tokens) => !/^(grep|egrep|fgrep|rg)$/.test(tokens[0] ?? "") && !(tokens[0] === "git" && tokens.includes("grep", 1)))
    .some((tokens) =>
      tokens.some((raw) => {
        const token = bare(raw).replace(/\/+$/, "");
        const cut = token.lastIndexOf("/");
        return token !== "" && (inChain(token) || (cut >= 0 && inChain(token.slice(0, cut))));
      }),
    );
}

/** True when a command is a git grep without --untracked naming the path: git grep reads tracked files only, so it never sees a file the task is about to create. */
export function blindGrep(command: string, path: string): boolean {
  return commandsOf(command, /&&|\|\||[;|]/).some((tokens) => {
    const grep = tokens[0] === "git" ? tokens.indexOf("grep", 1) : -1;
    return grep > 0 && !tokens.includes("--untracked", 1) && tokens.slice(grep + 1).some((token) => bare(token) === path);
  });
}

/** The simple commands of a line, cut at ; | || && and a newline outside quotes: a quoted argument never splits. */
function segmentsOf(command: string): string[] {
  const segments = [""];
  let quote = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote !== "") {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (/[;|\n]/.test(char) || command.startsWith("&&", i)) {
      if (char === "&") i += 1;
      segments.push("");
      continue;
    }
    segments[segments.length - 1] += char;
  }
  return segments.map(trim).filter((segment) => segment !== "");
}

const inScratch = (path: string): boolean => bare(path).startsWith(".temp/");
const INLINE: Record<string, string> = { bash: "", sh: "", node: "-e", python: "-c", python3: "-c", ruby: "-e", perl: "-e" };

/** inline: the first `<interpreter> <option>` running inline code; scratch: the first path under .temp/ run. Empty: none. A redirect and its target are no argument, nor is a quoted argument of another command a command. */
export function unprovable(command: string): { inline: string; scratch: string } {
  let inline = "";
  let scratch = "";
  for (const segment of segmentsOf(command)) {
    const tokens = words(segment).map((word) => word.replace(/["']/g, ""));
    const start = tokens.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
    const program = tokens[start];
    if (start < 0) continue;
    if (inScratch(program)) {
      scratch ||= program;
      continue;
    }
    if (!Object.hasOwn(INLINE, program)) continue;
    for (let i = start + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === "") continue;
      if (/^[0-9]*[<>]+&?$/.test(token)) i += 1;
      else if (/^[0-9]*[<>]/.test(token)) continue;
      else if (token.startsWith("-")) {
        if (token === INLINE[program]) inline ||= `${program} ${token}`;
      } else {
        if (inScratch(token)) scratch ||= token;
        break;
      }
    }
  }
  return { inline, scratch };
}
