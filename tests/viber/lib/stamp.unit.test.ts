/*
 * stamp.unit.test.ts - stampOf of viber/lib/stamp.ts: the
 * `YYYY-MM-DD-HH-MM-SS` stamp the path scripts put in a file name, read from
 * the local-time fields of an instant.
 *
 * Every instant is built from local-time fields, so a stamp reads the same in
 * any time zone.
 */

import assert from "node:assert/strict";
import { test } from "../../harness/test.ts";
import { stampOf } from "../../../viber/lib/stamp.ts";

for (const [label, at, stamp] of [
  ["an afternoon in November", new Date(2026, 10, 24, 17, 14, 16), "2026-11-24-17-14-16"],
  ["a single-digit month, day, hour, minute and second", new Date(2026, 0, 5, 3, 4, 9), "2026-01-05-03-04-09"],
  ["the last second of a year", new Date(2026, 11, 31, 23, 59, 59), "2026-12-31-23-59-59"],
  ["midnight", new Date(2027, 1, 1, 0, 0, 0), "2027-02-01-00-00-00"],
] as const) {
  test(`the stamp of ${label} is ${stamp}, every field zero-padded and the month counted from 1`, () => {
    assert.equal(stampOf(at), stamp);
  });
}

test("a year below 1000 is padded to four digits (the stamp keeps its width)", () => {
  const at = new Date(2026, 5, 1, 12, 0, 0);
  at.setFullYear(987);
  assert.equal(stampOf(at), "0987-06-01-12-00-00");
});

test("the milliseconds of the instant never reach the stamp", () => {
  assert.equal(stampOf(new Date(2026, 10, 24, 17, 14, 16, 999)), "2026-11-24-17-14-16");
});
