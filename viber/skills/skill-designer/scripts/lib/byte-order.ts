/*
 * byte-order.ts - orders two paths as `LC_ALL=C sort` orders their UTF-8
 * bytes, the order the skill lint walks a directory in.
 */

/**
 * Negative, zero or positive as a sorts before, with or after b by the bytes of
 * their UTF-8 form, which is the order of their code points. The default sort
 * of a string array compares UTF-16 units and differs in one place: it puts a
 * character past U+FFFF (two units, the first below U+E000) before a character
 * of U+E000..U+FFFF, where the bytes put it after.
 */
export function byteOrder(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length) {
    const left = a.codePointAt(i) ?? 0;
    const right = b.codePointAt(i) ?? 0;
    if (left !== right) return left < right ? -1 : 1;
    i += left > 0xffff ? 2 : 1;
  }
  return a.length - b.length;
}
