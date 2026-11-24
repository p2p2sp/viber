/*
 * orphan-tags.ts - the `orphan-tags` rule type: no swept file carries a line that is only a
 * closing tag while no opener of that name exists anywhere in the same file.
 *
 * Why: writer agents have appended a bare closing tag of their own Write call as the last line
 * of a file (one shipped in a release). An agent guard works on what the model plans to write,
 * this artifact appears when the call is emitted, so the sweep is the deterministic half.
 * Namespaced and HTML templates are legitimate: each has its opener in the same file.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface OrphanTagsParams {
  /** path prefixes left out of the sweep. */
  exclude: string[];
  /** lower-case extensions of files skipped as binaries. */
  binaryExtensions: string[];
}

const CLOSING_TAG_LINE = /^[ \t]*<\/([A-Za-z][A-Za-z0-9_.:-]*)>[ \t]*$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** `<name` followed by a tag terminator, so an attribute-bearing opener counts and a closing tag never does. */
function hasOpeningTag(content: string, name: string): boolean {
  return new RegExp(`<${escapeRegExp(name)}(?=[\\s/>])`).test(content);
}

function check(tree: Tree, params: OrphanTagsParams): Finding[] {
  const findings: Finding[] = [];
  for (const file of tree.files) {
    const lower = file.path.toLowerCase();
    if (params.exclude.some((p) => file.path.startsWith(p))) continue;
    if (params.binaryExtensions.some((ext) => lower.endsWith(ext))) continue;
    const content = tree.read(file.path);
    if (content === null) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = CLOSING_TAG_LINE.exec(lines[i]);
      if (match === null || hasOpeningTag(content, match[1])) continue;
      findings.push({
        path: file.path,
        line: i + 1,
        message: `orphan closing tag </${match[1]}> - no <${match[1]}> opener in this file; a write-call artifact, delete the line`,
      });
    }
  }
  return findings;
}

const orphanTags: RuleType<OrphanTagsParams> = {
  name: "orphan-tags",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "a.md", mode: "100644" }],
      read: () => "text\n</content>\n",
      list: () => [],
    },
    params: { exclude: [], binaryExtensions: [] },
  },
};

export default orphanTags;
