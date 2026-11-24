/*
 * branching.ts - the --branching report: the mode line, one entry line per valid
 * work entry, one map line per mapping naming a valid entry, then the errors.
 * Nesting is told by indentation alone: the first line inside the group fixes
 * the depth of its direct children, the first line under `work` or
 * `issue-type-mappings` the depth of theirs.
 */

const FIELDS = ["base", "name", "target"] as const;
type Field = (typeof FIELDS)[number];

/** One surrounding quote pair removed, when something sits between the quotes. */
function unquote(s: string): string {
  const q = s.charAt(0);
  if (s.length >= 3 && (q === "'" || q === '"') && s.endsWith(q)) return s.slice(1, -1);
  return s;
}

/** The lines of the report for the text of viber.yml (null: no file). */
export function resolveBranching(text: string | null): string[] {
  let inGroup = false;
  let section = "";
  let l1 = -1;
  let l2 = -1;
  let mode = "";
  let modeSet = false;
  let legacy = false;
  const entries: { key: string; fields: Map<Field, string> }[] = [];
  const mappings: { type: string; key: string }[] = [];

  for (const raw of (text ?? "").split("\n")) {
    const full = raw.replace(/\r$/, "");
    if (/^[^\s#]/.test(full)) {
      inGroup = /^branching[ \t]*:/.test(full);
      section = "";
      continue;
    }
    if (!inGroup || /^\s*(#|$)/.test(full)) continue;
    const ind = /^\s*/.exec(full)![0].length;
    const line = full.slice(ind);
    const q = line.charAt(0);
    const closeAt = q === "'" || q === '"' ? line.indexOf(q, 1) : -1;
    let key: string;
    let rest: string;
    if (closeAt > 0) {
      key = line.slice(1, closeAt);
      rest = line.slice(closeAt + 1);
    } else {
      key = line.replace(/\s*:.*$/, "");
      rest = line.slice(key.length);
    }
    const val = rest.replace(/^\s*:\s*/, "").replace(/[\s#].*$/, "");

    if (l1 < 0 || ind <= l1) {
      if (l1 < 0) l1 = ind;
      section = key;
      l2 = -1;
      if (key === "mode" && !modeSet) {
        mode = val.toLowerCase();
        modeSet = true;
      }
      if (key === "base" || key === "name") legacy = true;
      continue;
    }
    if (section === "work") {
      if (l2 < 0 || ind <= l2) {
        if (l2 < 0) l2 = ind;
        entries.push({ key, fields: new Map() });
        continue;
      }
      const cur = entries[entries.length - 1];
      if ((key === "base" || key === "name" || key === "target") && !cur.fields.has(key)) cur.fields.set(key, val);
      continue;
    }
    if (section === "issue-type-mappings") {
      if (l2 < 0) l2 = ind;
      if (ind > l2) continue;
      mappings.push({ type: key, key: unquote(val) });
    }
  }

  if (mode !== "allowed" && mode !== "required") mode = "off";
  const out = [`mode: ${mode}`];
  const errors: string[] = [];
  if (legacy) errors.push("branching.base and branching.name are no longer read - move them into a branching.work entry");

  const valid = new Set<string>();
  for (const e of entries) {
    let bad = false;
    const value: Record<string, string> = {};
    if (!/^[A-Za-z0-9._-]+$/.test(e.key)) {
      errors.push(`work entry ${e.key}: invalid key: ${e.key}`);
      bad = true;
    }
    for (const f of FIELDS) {
      let v = e.fields.get(f) ?? "";
      if (f === "name") v = unquote(v);
      if (v === "") {
        errors.push(`work entry ${e.key}: missing ${f}`);
        bad = true;
        continue;
      }
      const ok = f === "name" ? /^[A-Za-z0-9._/{}-]+$/.test(v) : /^[A-Za-z0-9._/-]+$/.test(v) && !/^[-/]/.test(v) && !v.includes("..");
      if (!ok) {
        errors.push(`work entry ${e.key}: invalid ${f}: ${v}`);
        bad = true;
        continue;
      }
      if (f === "name" && v.includes("{issue}")) {
        errors.push(`work entry ${e.key}: {issue} is now {issue-number}`);
        bad = true;
      }
      value[f] = v;
    }
    if (bad) continue;
    valid.add(e.key);
    out.push(`entry: ${e.key} | base: ${value.base} | name: ${value.name} | target: ${value.target}`);
  }
  for (const m of mappings) {
    if (valid.has(m.key)) out.push(`map: ${m.type} | ${m.key}`);
    else errors.push(`issue-type-mappings: ${m.type} names no work entry: ${m.key}`);
  }
  if (mode !== "off" && valid.size === 0) errors.push("no valid branching.work entry");
  return [...out, ...errors.map((e) => `error: ${e}`)];
}
