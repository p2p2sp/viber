/*
 * plugin-refs.ts - the ref-exists instance over viber: every file that names a plugin path, an
 * agent or skill name or a command must name one the tree holds.
 */

import type { RuleInstance } from "../engine.ts";

export const rules: RuleInstance[] = [
  {
    id: "ref-exists/viber",
    type: "ref-exists",
    why: "a renamed or deleted script, agent or skill must not leave a dangling reference in a shipped file",
    params: {
      sweep: [
        "viber/skills/**/SKILL.md",
        "viber/skills/*/parts/*.md",
        "viber/skills/*/fragments/*.md",
        "viber/agents/*.md",
        "viber/hooks/hooks.json",
        "viber/.claude-plugin/plugin.json",
      ],
      pluginRoot: "viber",
      manifest: "viber/.claude-plugin/plugin.json",
      except: [
        // the skill-designer's own template example names a file a designed skill would hold
        { file: "viber/skills/skill-designer/SKILL.md", ref: "${CLAUDE_SKILL_DIR}/templates/report.md" },
      ],
    },
  },
];
