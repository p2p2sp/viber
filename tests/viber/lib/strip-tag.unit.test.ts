/*
 * strip-tag.unit.test.ts - the strip-tag core on the fake file system: a last
 * line that is a bare closing tag (optional spaces or tabs, an optional
 * carriage return) is deleted from each file and every other byte stays,
 * invalid UTF-8 included; a file with no such last line is never written; a
 * path that is no regular file is skipped without stopping the others.
 *
 * Every closing-tag fixture is built from an escape (`\x3c`), so no line of
 * this file is a bare closing tag and the orphan-tags/tracked lint rule stays
 * green over it.
 */

import assert from "node:assert/strict";
import { fakeFs } from "../../harness/fakes.ts";
import { test } from "../../harness/test.ts";
import type { Fs } from "../../../viber/lib/ports.ts";
import { runStripTag } from "../../../viber/lib/strip-tag.ts";

const CONTENT = "\x3c/content>";
const PARAMETER = "\x3c/parameter>";
const FILE = "/ws/notes.md";

/** One byte per character, so a fixture can hold any byte. */
const bytesOf = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));
const textOf = (bytes: Uint8Array | null): string | null => (bytes === null ? null : String.fromCharCode(...bytes));

/** The fake wrapped to record every path written. */
function recording(fs: Fs): { fs: Fs; written: string[] } {
  const written: string[] = [];
  return {
    written,
    fs: {
      ...fs,
      writeBytes(path, bytes) {
        written.push(path);
        return fs.writeBytes(path, bytes);
      },
    },
  };
}

/** Runs the core on one file holding `before`; the bytes left and how often it was written. */
function stripOne(before: string): { after: string | null; writes: number } {
  const { fs, written } = recording(fakeFs({ [FILE]: bytesOf(before) }));
  runStripTag([FILE], { fs });
  return { after: textOf(fs.readBytes(FILE)), writes: written.length };
}

const stripped: Array<[string, string, string]> = [
  ["a closing content tag on a last line ended by a newline", `# Title\n\nbody\n${CONTENT}\n`, "# Title\n\nbody\n"],
  ["a closing parameter tag on a last line ended by a newline", `body\n${PARAMETER}\n`, "body\n"],
  ["a closing content tag on a last line with no newline", `body\n${CONTENT}`, "body\n"],
  ["a closing content tag followed by a carriage return", `a\r\nb\r\n${CONTENT}\r\n`, "a\r\nb\r\n"],
  ["a closing content tag followed by a carriage return and no newline", `a\r\n${CONTENT}\r`, "a\r\n"],
  ["a closing parameter tag with spaces around it", `body\n  ${PARAMETER}  \n`, "body\n"],
  ["a closing parameter tag with tabs around it", `body\n\t${PARAMETER}\t\n`, "body\n"],
  ["a closing tag that is the only line of the file", `${CONTENT}\n`, ""],
  ["a closing tag that is the whole file with no newline", CONTENT, ""],
  ["a closing tag whose name holds a digit, a dot, a colon, a hyphen and an underscore", "body\n\x3c/a1.b:c-d_e>\n", "body\n"],
  ["a closing tag after an empty line", `body\n\n${CONTENT}\n`, "body\n\n"],
  ["a closing tag after another closing tag (one line is cut per call)", `body\n${PARAMETER}\n${CONTENT}\n`, `body\n${PARAMETER}\n`],
  ["a closing tag after bytes that are no valid UTF-8", `caf\xe9 \xff\xfe\xc3\n\x80\x00body\n${CONTENT}\n`, "caf\xe9 \xff\xfe\xc3\n\x80\x00body\n"],
];

for (const [name, before, after] of stripped) {
  test(`a file whose last line is ${name} loses that line and keeps every byte before it`, () => {
    assert.deepEqual(stripOne(before), { after, writes: 1 });
  });
}

const untouched: Array<[string, string]> = [
  ["no closing tag at all", "# Title\n\nbody\n"],
  ["a closing tag inside a line of prose", `see ${CONTENT} in the guard\n`],
  ["text before the closing tag on its line", `body ${CONTENT}\n`],
  ["text after the closing tag on its line", `${CONTENT} body\n`],
  ["a closing tag on a line that is not the last", `a\n${CONTENT}\nb\n`],
  ["a closing tag followed by an empty last line", `a\n${CONTENT}\n\n`],
  ["an opening tag on the last line", "a\n\x3ccontent>\n"],
  ["a self-closing tag on the last line", "a\n\x3ccontent/>\n"],
  ["a closing tag with an empty name", "a\n\x3c/>\n"],
  ["a closing tag whose name starts with a digit", "a\n\x3c/1a>\n"],
  ["a closing tag holding a blank inside", "a\n\x3c/content >\n"],
  ["a closing tag followed by two carriage returns", `a\n${CONTENT}\r\r\n`],
  ["a closing tag with a carriage return before its trailing blank", `a\n${CONTENT}\r \n`],
  ["a closing tag after a byte outside ASCII on its line", `a\n\xa0${CONTENT}\n`],
  ["an empty content", ""],
  ["a single newline", "\n"],
];

for (const [name, content] of untouched) {
  test(`a file with ${name} is left byte-identical and never written`, () => {
    assert.deepEqual(stripOne(content), { after: content, writes: 0 });
  });
}

test("a missing path and a directory are skipped and the other files are still handled", () => {
  const { fs, written } = recording(
    fakeFs({ "/ws/first.md": `one\n${CONTENT}\n`, "/ws/dir/inner.md": "kept\n", "/ws/second.md": `two\n${PARAMETER}\n` }),
  );
  runStripTag(["/ws/first.md", "/ws/absent.md", "/ws/dir", "/ws/second.md"], { fs });
  assert.deepEqual([fs.readText("/ws/first.md"), fs.readText("/ws/second.md"), fs.readText("/ws/dir/inner.md")], ["one\n", "two\n", "kept\n"]);
  assert.deepEqual(written, ["/ws/first.md", "/ws/second.md"]);
});

test("a file that exists yet cannot be read is skipped and the next file is still handled", () => {
  const { fs, written } = recording(fakeFs({ "/ws/next.md": `two\n${CONTENT}\n` }, { unreadable: ["/ws/locked.md"] }));
  runStripTag(["/ws/locked.md", "/ws/next.md"], { fs });
  assert.deepEqual([fs.readText("/ws/next.md"), written], ["two\n", ["/ws/next.md"]]);
});

test("a file whose write is refused keeps its content and the next file is still handled", () => {
  const fake = fakeFs({ "/ws/a.md": `one\n${CONTENT}\n`, "/ws/b.md": `two\n${CONTENT}\n` });
  const fs: Fs = { ...fake, writeBytes: (path, bytes) => path !== "/ws/a.md" && fake.writeBytes(path, bytes) };
  runStripTag(["/ws/a.md", "/ws/b.md"], { fs });
  assert.deepEqual([fs.readText("/ws/a.md"), fs.readText("/ws/b.md")], [`one\n${CONTENT}\n`, "two\n"]);
});

test("a file named twice is cut once per naming (each call line cuts one closing tag)", () => {
  const fs = fakeFs({ [FILE]: `body\n${PARAMETER}\n${CONTENT}\n` });
  runStripTag([FILE, FILE], { fs });
  assert.equal(fs.readText(FILE), "body\n");
});

test("no argument does nothing", () => {
  const { fs, written } = recording(fakeFs({ [FILE]: `body\n${CONTENT}\n` }));
  runStripTag([], { fs });
  assert.deepEqual([fs.readText(FILE), written], [`body\n${CONTENT}\n`, []]);
});
