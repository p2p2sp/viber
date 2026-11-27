/*
 * Characterization of the readers of .claude/viber.yml in build-config.ts,
 * on one shared sample config text, quote handling included.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { directoriesOf, extensionMap, extensionSteps, qaOn, rulesOn } from "../../../../../viber/skills/spec-implementor/scripts/lib/build-config.ts";

const SAMPLE = [
  "# viber config",
  "directories:",
  '  runs: "open-runs"   # quoted',
  "  specifications: 'done'",
  "build:",
  "  rules: FALSE",
  "  qa: True  # on",
  "  extensions:",
  "    first-agent:",
  "    second-agent:",
  "      parallel: true",
  '    "my-agent":',
  "  other: x",
].join("\n");

/** The sample with the line starting with `from` replaced by `to`. */
const swap = (from: string, to: string): string => SAMPLE.split("\n").map((line) => (line.startsWith(from) ? to : line)).join("\n");

describe("buildValue through rulesOn and qaOn", () => {
  it("reads the sample, the value lowercased", () => {
    assert.equal(rulesOn(SAMPLE), false);
    assert.equal(qaOn(SAMPLE), true);
  });

  it("no file, no key: rules on, QA off", () => {
    assert.equal(rulesOn(null), true);
    assert.equal(qaOn(null), false);
    assert.equal(rulesOn("build:\n  other: x\n"), true);
    assert.equal(qaOn("build:\n  other: x\n"), false);
  });

  it("rulesOn is off only on false, qaOn on only on true", () => {
    assert.equal(rulesOn(swap("  rules:", "  rules: no")), true);
    assert.equal(qaOn(swap("  qa:", "  qa: yes")), false);
  });

  it("a key outside build: is not read", () => {
    assert.equal(qaOn("other:\n  qa: true\n"), false);
  });

  // Changed on purpose: the surrounding quotes are stripped, so `qa: "true"` turns QA on.
  it('qa: "true" turns QA on', () => {
    assert.equal(qaOn(swap("  qa:", '  qa: "true"')), true);
  });

  // Changed on purpose: `rules: "false"` turns the rules writer off.
  it('rules: "false" turns the rules writer off', () => {
    assert.equal(rulesOn(swap("  rules:", '  rules: "false"')), false);
  });
});

describe("extensionMap", () => {
  it("reads the sample map", () => {
    assert.deepEqual(extensionMap(SAMPLE), {
      entries: [
        { name: "first-agent", parallel: false },
        { name: "second-agent", parallel: true },
        { name: '"my-agent"', parallel: false },
      ],
      key: 7,
      last: 11,
      indent: 4,
    });
  });

  it("a quoted key is no agent name", () => {
    assert.deepEqual(extensionSteps(SAMPLE), { steps: [["first-agent"], ["second-agent"]], bad: ['"my-agent"'] });
  });

  it("no file: no key", () => {
    assert.deepEqual(extensionMap(null), { entries: [], key: -1, last: -1, indent: -1 });
  });

  // Changed on purpose: `parallel: "true"` is parallel.
  it('parallel: "true" is parallel', () => {
    assert.equal(extensionMap(swap("      parallel:", "      parallel: \"true\"")).entries[1].parallel, true);
  });

  // Changed on purpose: `extensions: ""` is an empty map.
  it('extensions: "" is an empty map', () => {
    assert.deepEqual(extensionMap('build:\n  extensions: ""\n'), { entries: [], key: 1, last: 1, indent: 4 });
  });
});

describe("directoriesOf", () => {
  it("reads the sample, surrounding quotes stripped", () => {
    assert.deepEqual(directoriesOf(SAMPLE), { runs: "open-runs", specifications: "done" });
  });

  it("no file: the defaults", () => {
    assert.deepEqual(directoriesOf(null), { runs: "_specs", specifications: "specs" });
  });

  it("a value with a slash, `.` or `..` keeps the default", () => {
    assert.deepEqual(directoriesOf("directories:\n  runs: a/b\n  specifications: ..\n"), { runs: "_specs", specifications: "specs" });
  });
});

describe("the shared line rules", () => {
  const TEXT = ["# head", "", "build:   # c", "  qa: 'true'   # c", "  # rules: false", "  rules: 'false", "directories:", "", "  runs: \"r\" # c"].join("\n");

  it("cut the trailing comment, skip empty and comment lines, strip only matching quotes", () => {
    assert.equal(qaOn(TEXT), true);
    assert.equal(rulesOn(TEXT), true);
    assert.deepEqual(directoriesOf(TEXT), { runs: "r", specifications: "specs" });
  });

  it("read a key by its indent: a deeper key under build: is no child", () => {
    assert.equal(qaOn("build:\n  extensions:\n    qa: true\n"), false);
  });
});
