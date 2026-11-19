/*
 * say-prose.unit.test.ts - pins that the three skill texts reacting to an
 * `issue-templates.sh` skip state its `SAY=` line and no reason to sentence list.
 *
 * `scripts/issue-templates.sh` prints `SAY=<sentence>` after each `REASON=`; the
 * fixer `issues-save` fragment, the no issue bullet of the intent `issues-done`
 * fragment and `issue-create/SKILL.md` say that line in the conversation's
 * language and hold no `REASON=no-templates` list of their own. The files read
 * here are shipped prompts, whose text is the behaviour. Nothing is spawned.
 *
 * Run directly by Node's type stripping:
 *   node --test tests/viber/say-prose.unit.test.ts
 */

import { test } from "../harness/test.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const VIBER = path.resolve(import.meta.dirname, "../../viber");

const SAY_SENTENCE = "say its `SAY=` line in one line in the conversation's language";

const CONSUMERS = [
  "skills/fixer/fragments/issues-save.true.md",
  "skills/intent/fragments/issues-done.true.md",
  "skills/issue-create/SKILL.md",
];

function read(rel: string): string {
  return fs.readFileSync(path.join(VIBER, rel), "utf8");
}

for (const rel of CONSUMERS) {
  test(`${rel} tells the model to say the SAY= line of a skip in the conversation's language`, () => {
    assert.ok(read(rel).includes(SAY_SENTENCE));
  });

  test(`${rel} holds no REASON=no-templates list (the script words each reason)`, () => {
    assert.ok(!read(rel).includes("REASON=no-templates"));
  });
}
