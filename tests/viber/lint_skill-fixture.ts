/*
 * lint_skill-fixture.ts - what lint_skill.critical.test.ts uses to seed a case
 * and run viber/skills/skill-designer/scripts/lint_skill.sh. It holds no case
 * of its own.
 */

import fs from "node:fs";
import path from "node:path";

import { runScript } from "../harness/run.ts";
import { withTempDir } from "../harness/tmp.ts";

export const SUT = path.resolve(import.meta.dirname, "../../viber/skills/skill-designer/scripts/lint_skill.sh");

export const VALID_LINES = [
  "---",
  "name: sample-skill",
  "description: Summarizes a changelog into release notes for a project. Use when the user asks for release notes or a changelog digest.",
  "---",
  "",
  "# Sample skill",
  "",
  "Read the changelog and write the notes.",
  "",
];

export async function lint(content: string) {
  return withTempDir("p2p2-lint-", async (dir) => {
    const file = path.join(dir, "SKILL.md");
    fs.writeFileSync(file, content);
    return runScript(SUT, [file], { shell: "bash" });
  });
}
