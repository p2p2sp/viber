/*
 * text.ts - how the plan-index modules read plan text: blanks, code fences, the
 * clauses of a DoD, the criteria of a Covers and the command of a Verification.
 * A blank is an ASCII one, as it is to the awk the plans were first read with.
 */

export const trim = (text: string): string => text.replace(/^[ \t\n\v\f\r]+/, "").replace(/[ \t\n\v\f\r]+$/, "");

/** The blank-separated words of the text. */
export function words(text: string): string[] {
  const rest = trim(text);
  return rest === "" ? [] : rest.split(/[ \t\n\v\f\r]+/);
}

/** The comma- or blank-separated entries of a Uses or Depends-on value. */
export const entriesOf = (value: string): string[] => words(value.replaceAll(",", " "));

/** The lines of a text, a carriage return kept, the empty one after a final line feed dropped. */
export function linesOf(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** What a `<label>: <value>` line holds after its first colon. */
export const valueOf = (line: string): string => trim(line.replace(/^[^:]*:/, ""));

/** The path without one leading `./`. */
export const bare = (path: string): string => path.replace(/^\.\//, "");

export interface Fence {
  mark: string;
  length: number;
}

/** The fence a trimmed line opens; null when it opens none. */
export function opensFence(line: string): Fence | null {
  const run = /^(`{3,}|~{3,})/.exec(line);
  return run === null ? null : { mark: line[0], length: run[1].length };
}

/** A fence ends only on a bare run of its own character, at least as long as the one that opened it. */
export const closesFence = (line: string, fence: Fence): boolean => line[0] === fence.mark && /^(`+|~+)$/.test(line) && line.length >= fence.length;

/**
 * Fed every line in order: true when the line sits inside a fence, the fence
 * lines included, so a heading-looking line there is body text. A comment opened
 * outside a fence runs to its closing arrow and opens no fence; inside a fence a
 * comment opener is text.
 */
export function fenceReader(): (line: string) => boolean {
  let fence: Fence | null = null;
  let comment = false;
  return (raw) => {
    const line = trim(raw);
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      return true;
    }
    if (comment || line.startsWith("<!--")) {
      comment = !line.includes("-->");
      return false;
    }
    fence = opensFence(line);
    return fence !== null;
  };
}

export const withoutTicks = (text: string): string => text.replace(/`[^`]*`/g, " ");

/** The clauses of a DoD value, cut on each semicolon outside a backtick span, the empty ones dropped; a backtick with no closing partner is plain text. */
export function clausesOf(value: string): string[] {
  return (value.match(/(`[^`]*`|[^;])+/g) ?? []).map(trim).filter((clause) => clause !== "");
}

/** The criterion numbers of a Covers value, as written: only the `AC<n>` tokens count, so `#3`, `3` and a note like `(see S3)` name none. */
export function criteriaOf(value: string): string[] {
  return value.split(/[, \t\n\v\f\r]+/).flatMap((token) => /^AC([0-9]+)$/.exec(token)?.[1] ?? []);
}

/** The command of a Verification: the text up to its first ` -> `, one pair of wrapping backticks dropped. */
export function commandOf(verification: string): string {
  const command = trim(verification.split(" -> ")[0]);
  return wrapped(command) ? trim(command.slice(1, -1)) : command;
}

export const wrapped = (text: string): boolean => text.length >= 2 && text.startsWith("`") && text.endsWith("`");
