/*
 * answer.ts - the shape of what one script call answers: its stdout, its
 * stderr and its exit code.
 */

export interface MapAnswer {
  stdout: string;
  stderr: string;
  exit: number;
}

/** The lines on stdout, each ended by a line feed. */
export function answer(lines: string[], exit = 0): MapAnswer {
  return { stdout: lines.map((line) => `${line}\n`).join(""), stderr: "", exit };
}
