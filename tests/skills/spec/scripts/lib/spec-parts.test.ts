/*
 * The cut of an intent file with parts (lib/spec-parts.ts) and the files the
 * spec-parts.ts entry writes and names.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, it } from "node:test";
import { cutIntent, partPaths } from "../../../../../viber/skills/spec/scripts/lib/spec-parts.ts";
import { removeDir, runEntry, tempDir, writeFiles } from "../../../../temp-repo.ts";

const errors = (text: string): string[] => {
  const cut = cutIntent(text);
  return cut.ok ? [] : cut.errors;
};

describe("cutIntent", () => {
  it("gives each part the ## All lines, then its own, blank lines and headings left out", () => {
    const cut = cutIntent("## All\nI1 shared\n\n## P1 - First\nI2 one\r\n## P2 - Second\nI3 two\nI4 two more\n");
    assert.deepEqual(cut, {
      ok: true,
      parts: [
        { n: 1, title: "First", text: "I1 shared\nI2 one\n" },
        { n: 2, title: "Second", text: "I1 shared\nI3 two\nI4 two more\n" },
      ],
    });
  });

  it("takes a file with no ## All", () => {
    const cut = cutIntent("## P1 - A\nI1 a\n## P2 - B\nI2 b\n");
    assert.equal(cut.ok && cut.parts[1].text, "I2 b\n");
  });

  it("needs at least 2 parts", () => {
    assert.deepEqual(errors("## All\nI1 x\n## P1 - A\nI2 a\n"), ["1 part(s): at least 2 are needed"]);
  });

  it("needs parts numbered from 1 with no gap", () => {
    assert.deepEqual(errors("## P1 - A\nI1 a\n## P3 - C\nI2 c\n"), ["P3 stands where P2 belongs: parts are numbered from 1 with no gap"]);
    assert.deepEqual(errors("## P2 - B\nI1 b\n## P1 - A\nI2 a\n"), [
      "P2 stands where P1 belongs: parts are numbered from 1 with no gap",
      "P1 stands where P2 belongs: parts are numbered from 1 with no gap",
    ]);
  });

  it("needs a line in every part", () => {
    assert.deepEqual(errors("## All\nI1 x\n## P1 - A\n\n## P2 - B\nI2 b\n"), ["P1 holds no line"]);
  });

  it("refuses a line under no heading, another heading and a second ## All", () => {
    assert.deepEqual(errors("I0 loose\n## All\nI1 x\n## Notes\nI9 n\n## All\n## P1 - A\nI2 a\n## P2 - B\nI3 b\n"), [
      "line 1: a line under no heading",
      "line 4: a heading other than ## All or ## P<n> - <title>",
      "line 5: a line under no heading",
      "line 6: a second ## All",
    ]);
  });
});

describe("partPaths", () => {
  it("names part n of N beside the run's spec and intent", () => {
    assert.deepEqual(partPaths("/r/docs/_specs/2026-01-02-03-04-05_big-thing/spec.md", "/r/.temp/viber/2026-01-02-03-04-05_big-thing/intent.md", 2, 3), {
      spec: "/r/docs/_specs/2026-01-02-03-04-05_big-thing-p2-of-3/spec.md",
      intent: "/r/.temp/viber/2026-01-02-03-04-05_big-thing-p2-of-3/intent.md",
      review: "/r/.temp/viber/2026-01-02-03-04-05_big-thing-p2-of-3/spec-review.md",
      prototype: "/r/docs/_specs/2026-01-02-03-04-05_big-thing-p2-of-3/prototype.html",
    });
  });

  it("refuses paths of two runs or other file names", () => {
    assert.equal(partPaths("/r/docs/_specs/a/spec.md", "/r/.temp/viber/b/intent.md", 1, 2), null);
    assert.equal(partPaths("/r/docs/_specs/a/plan.md", "/r/.temp/viber/a/intent.md", 1, 2), null);
  });
});

describe("spec-parts.ts", () => {
  const ENTRY = "viber/skills/spec/scripts/spec-parts.ts";
  let dir = "";
  afterEach(() => removeDir(dir));

  it("writes each part's intent file, copies the mockup only where it is named and prints the paths", () => {
    dir = tempDir();
    writeFiles(dir, {
      ".temp/viber/s_x/intent.md": "## All\nI1 shared\n## P1 - A\nI2 the screen as prototype.html shows it\n## P2 - B\nI3 b\n",
      "mock.html": "<p>mock</p>",
    });
    const spec = `${dir}/docs/_specs/s_x/spec.md`;
    const intent = `${dir}/.temp/viber/s_x/intent.md`;
    assert.deepEqual(runEntry(ENTRY, [spec, intent, `${dir}/mock.html`], dir), [
      `spec: ${dir}/docs/_specs/s_x-p1-of-2/spec.md`,
      `intent: ${dir}/.temp/viber/s_x-p1-of-2/intent.md`,
      `review: ${dir}/.temp/viber/s_x-p1-of-2/spec-review.md`,
      `prototype: ${dir}/docs/_specs/s_x-p1-of-2/prototype.html`,
      `spec: ${dir}/docs/_specs/s_x-p2-of-2/spec.md`,
      `intent: ${dir}/.temp/viber/s_x-p2-of-2/intent.md`,
      `review: ${dir}/.temp/viber/s_x-p2-of-2/spec-review.md`,
    ]);
    assert.equal(fs.readFileSync(`${dir}/.temp/viber/s_x-p1-of-2/intent.md`, "utf-8"), "I1 shared\nI2 the screen as prototype.html shows it\n");
    assert.equal(fs.readFileSync(`${dir}/.temp/viber/s_x-p2-of-2/intent.md`, "utf-8"), "I1 shared\nI3 b\n");
    assert.equal(fs.readFileSync(`${dir}/docs/_specs/s_x-p1-of-2/prototype.html`, "utf-8"), "<p>mock</p>");
    assert.equal(fs.existsSync(`${dir}/docs/_specs/s_x-p2-of-2`), false);
  });

  it("prints the failed checks and writes nothing", () => {
    dir = tempDir();
    writeFiles(dir, { ".temp/viber/s_x/intent.md": "## P1 - A\nI1 a\n" });
    assert.deepEqual(runEntry(ENTRY, [`${dir}/docs/_specs/s_x/spec.md`, `${dir}/.temp/viber/s_x/intent.md`], dir), ["ERROR: 1 part(s): at least 2 are needed"]);
    assert.equal(fs.existsSync(`${dir}/.temp/viber/s_x-p1-of-1`), false);
  });
});
