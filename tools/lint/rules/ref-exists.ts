/*
 * ref-exists.ts - the `ref-exists` rule type: every plugin path, agent or skill name, command and
 * manifest entry a swept file names must exist in the tracked tree.
 */

import type { Finding, RuleType, Tree } from "../engine.ts";

export interface RefExistsParams {
  sweep: string[];
  pluginRoot: string;
  manifest?: string;
  except: Array<{ file: string; ref: string }>;
}

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") {
      source += "[^/]*";
    } else {
      source += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function exists(tree: Tree, p: string): boolean {
  return tree.files.some((f) => f.path === p || f.path.startsWith(`${p}/`));
}

function skillDirOf(file: string, pluginRoot: string): string | null {
  const m = file.match(new RegExp(`^${pluginRoot.replace(/[.+?^${}()|[\]\\]/g, "\\$&")}/skills/[^/]+(?=/)`));
  return m ? m[0] : null;
}

function check(tree: Tree, params: RefExistsParams): Finding[] {
  const findings: Finding[] = [];
  const sweep = params.sweep.map(globToRegExp);
  const root = params.pluginRoot;
  const report = (file: string, line: number, ref: string, message: string): void => {
    if (params.except.some((e) => e.file === file && e.ref === ref)) return;
    findings.push({ path: file, line, message });
  };

  for (const { path: file } of tree.files) {
    if (!sweep.some((re) => re.test(file))) continue;
    const text = tree.read(file);
    if (text === null) continue;
    const skillDir = skillDirOf(file, root);
    text.split("\n").forEach((line, i) => {
      const at = i + 1;
      for (const m of line.matchAll(/\$\{(CLAUDE_PLUGIN_ROOT|CLAUDE_SKILL_DIR)\}\/([A-Za-z0-9._/-]+)/g)) {
        const next = line[m.index + m[0].length];
        if (next !== undefined && /[<$*{[]/.test(next)) continue;
        const rest = m[2].replace(/[./]+$/, "");
        if (rest === "") continue;
        const base = m[1] === "CLAUDE_PLUGIN_ROOT" ? root : skillDir;
        if (base === null) continue;
        const ref = `\${${m[1]}}/${rest}`;
        if (!exists(tree, `${base}/${rest}`)) report(file, at, ref, `${ref} names no tracked file or directory`);
      }
      for (const m of line.matchAll(/viber:([a-z][a-z0-9-]*)/g)) {
        const before = line[m.index - 1];
        if (before === "<") continue;
        const name = m[1];
        if (before === "/") {
          if (line[m.index - 2] === "<") continue;
          const ref = `/viber:${name}`;
          if (!exists(tree, `${root}/skills/${name}`)) report(file, at, ref, `${ref} names no skill directory`);
        } else {
          const ref = `viber:${name}`;
          if (!exists(tree, `${root}/agents/${name}.md`) && !exists(tree, `${root}/skills/${name}`)) {
            report(file, at, ref, `${ref} is neither an agent file nor a skill directory`);
          }
        }
      }
    });
  }

  if (params.manifest !== undefined) {
    const text = tree.read(params.manifest);
    if (text === null) {
      findings.push({ path: params.manifest, line: 0, message: "file not found" });
    } else {
      const json = JSON.parse(text) as { skills?: string[]; agents?: string[] };
      for (const entry of [...(json.skills ?? []), ...(json.agents ?? [])]) {
        const rel = entry.replace(/^\.\//, "").replace(/\/$/, "");
        if (!exists(tree, `${root}/${rel}`)) report(params.manifest, 0, entry, `manifest entry ${entry} names no tracked file or directory`);
      }
    }
  }
  return findings;
}

const refExists: RuleType<RefExistsParams> = {
  name: "ref-exists",
  check,
  selfCheck: {
    tree: {
      files: [{ path: "p/a.md", mode: "100644" }],
      read: () => "see ${CLAUDE_PLUGIN_ROOT}/missing.sh",
      list: () => [],
    },
    params: { sweep: ["p/*.md"], pluginRoot: "p", except: [] },
  },
};

export default refExists;
