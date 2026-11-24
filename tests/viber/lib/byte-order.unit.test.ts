/*
 * byte-order.unit.test.ts - byteOrder of viber/lib/byte-order.ts: two paths
 * ordered as `LC_ALL=C sort` orders the bytes of their UTF-8 form, which is the
 * order diff-files and tree-record print their paths in. It touches no port:
 * every case is text in, a sign out.
 *
 * The one place the default sort of a string array (UTF-16 units) differs from
 * the bytes is a character past U+FFFF against one of U+E000..U+FFFF; the
 * characters below are built from their code points, so the file itself stays
 * plain ASCII.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { byteOrder } from "../../../viber/lib/byte-order.ts";

const utf8 = (text: string): number[] => [...new TextEncoder().encode(text)];

/** The order of the bytes, worked out from the encoded form itself. */
function bytewise(a: string, b: string): number {
  const [left, right] = [utf8(a), utf8(b)];
  for (let i = 0; i < left.length && i < right.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}

const PAST_BMP = String.fromCodePoint(0x1f600);
const PRIVATE_USE = String.fromCodePoint(0xe000);
const FULL_WIDTH = String.fromCodePoint(0xff21);
const ACCENTED = String.fromCodePoint(0x17c);

for (const [label, a, b] of [
  ["an upper-case letter before a lower-case one", "B.txt", "a.txt"],
  ["a digit before a letter", "1.txt", "a.txt"],
  ["a blank before a letter", "a b.txt", "ab.txt"],
  ["a path before the path it is the start of", "src", "src/a.txt"],
  ["a slash before a letter, so the files of a directory before a sibling sharing the start of its name", "src/z.txt", "srcs/a.txt"],
  ["a hyphen before a slash, so such a sibling before the files of the directory", "src-old/a.txt", "src/a.txt"],
  ["an ASCII character before an accented one", "z.txt", `${ACCENTED}.txt`],
  ["a character of U+E000..U+FFFF before one past U+FFFF (the UTF-16 units say the opposite)", `${PRIVATE_USE}.txt`, `${PAST_BMP}.txt`],
  ["a full-width letter before one past U+FFFF (the UTF-16 units say the opposite)", `a/${FULL_WIDTH}`, `a/${PAST_BMP}`],
  ["two characters past U+FFFF by their code points", String.fromCodePoint(0x1f600), String.fromCodePoint(0x1f601)],
] as const) {
  test(`${label} sorts first, both ways round, as the bytes order them`, () => {
    assert.ok(byteOrder(a, b) < 0, `${JSON.stringify(a)} before ${JSON.stringify(b)}`);
    assert.ok(byteOrder(b, a) > 0, `${JSON.stringify(b)} after ${JSON.stringify(a)}`);
    assert.ok(bytewise(a, b) < 0, "the encoded bytes agree");
  });
}

test("two equal paths compare as zero, the empty path included", () => {
  assert.deepEqual([byteOrder("a/b.txt", "a/b.txt"), byteOrder("", ""), byteOrder(PAST_BMP, PAST_BMP)], [0, 0, 0]);
});

test("the default sort puts the character past U+FFFF first and byteOrder puts it last (the difference this module exists for)", () => {
  const paths = [`${PAST_BMP}.txt`, `${PRIVATE_USE}.txt`, "a.txt"];
  assert.deepEqual([...paths].sort(), ["a.txt", `${PAST_BMP}.txt`, `${PRIVATE_USE}.txt`]);
  assert.deepEqual([...paths].sort(byteOrder), ["a.txt", `${PRIVATE_USE}.txt`, `${PAST_BMP}.txt`]);
});

test("a list sorted with byteOrder is the list sorted by its encoded bytes", () => {
  const paths = ["b", "B", "a b", "ab", `${ACCENTED}`, `${FULL_WIDTH}x`, `${PAST_BMP}`, `${PRIVATE_USE}`, "", "a", "a/", "a/b", "a-b", "~", "Z"];
  assert.deepEqual([...paths].sort(byteOrder), [...paths].sort(bytewise));
});
