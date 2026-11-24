/*
 * strip-tag.ts - the strip-tag core: deletes a last line that is nothing but a
 * closing tag from each file, every byte before it kept. It works on bytes, so
 * a file holding invalid UTF-8 keeps them. The contract lives in the header of
 * ../skills/code-auditor/scripts/strip-tag.ts.
 */

import type { Fs } from "./ports.ts";

const NEWLINE = 0x0a;

/** A bare closing tag: blanks, the tag, blanks, one optional carriage return. */
const CLOSING_TAG = /^[ \t]*<\/[A-Za-z][A-Za-z0-9_.:-]*>[ \t]*\r?$/;

/** Where the last line starts when it is a bare closing tag, else -1. A final newline belongs to the last line. */
function tagLineStart(bytes: Uint8Array): number {
  const end = bytes.at(-1) === NEWLINE ? bytes.length - 1 : bytes.length;
  const start = end === 0 ? 0 : bytes.lastIndexOf(NEWLINE, end - 1) + 1;
  // One byte, one character: a byte outside ASCII never reads as a tag character.
  const line = new TextDecoder("latin1").decode(bytes.subarray(start, end));
  return CLOSING_TAG.test(line) ? start : -1;
}

/** Cleans every file of argv; a path that is no regular file is skipped. Never throws. */
export function runStripTag(argv: string[], ports: { fs: Fs }): void {
  for (const file of argv) {
    if (ports.fs.kind(file) !== "file") continue;
    const bytes = ports.fs.readBytes(file);
    if (bytes === null) continue;
    const start = tagLineStart(bytes);
    if (start >= 0) ports.fs.writeBytes(file, bytes.slice(0, start));
  }
}
