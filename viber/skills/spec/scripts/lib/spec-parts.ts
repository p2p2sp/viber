/*
 * spec-parts.ts - the spec-parts core: cuts one intent file with parts into
 * one intent text per part and names each part's paths. The contract lives in
 * the header of ../spec-parts.ts.
 */

export interface Part {
  n: number;
  title: string;
  /** The lines under `## All`, then the part's own lines, blank ones left out. */
  text: string;
}

export type Cut = { ok: true; parts: Part[] } | { ok: false; errors: string[] };

const ALL = /^## All[ \t]*$/;
const PART = /^## P([0-9]+) - (\S.*?)[ \t]*$/;

/** Cuts the intent text at its `## All` and `## P<n> - <title>` headings. */
export function cutIntent(text: string): Cut {
  const errors: string[] = [];
  const shared: string[] = [];
  const parts: { n: number; title: string; lines: string[] }[] = [];
  let into: string[] | null = null;
  let allSeen = false;
  let first = true;
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") return;
    // A `# <title>` opening the file is its title, no fact: no part carries it.
    const opens = first;
    first = false;
    if (opens && line.startsWith("# ")) return;
    if (ALL.test(line)) {
      if (allSeen) errors.push(`line ${i + 1}: a second ## All`);
      allSeen = true;
      into = shared;
      return;
    }
    const head = PART.exec(line);
    if (head) {
      const part = { n: Number(head[1]), title: head[2], lines: [] as string[] };
      parts.push(part);
      into = part.lines;
      return;
    }
    if (line.startsWith("## ")) {
      errors.push(`line ${i + 1}: a heading other than ## All or ## P<n> - <title>`);
      into = null;
      return;
    }
    if (into === null) {
      errors.push(`line ${i + 1}: a line under no heading`);
      return;
    }
    into.push(line);
  });
  if (parts.length < 2) errors.push(`${parts.length} part(s): at least 2 are needed`);
  parts.forEach((part, i) => {
    if (part.n !== i + 1) errors.push(`P${part.n} stands where P${i + 1} belongs: parts are numbered from 1 with no gap`);
    if (part.lines.length === 0) errors.push(`P${part.n} holds no line`);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, parts: parts.map((p) => ({ n: p.n, title: p.title, text: [...shared, ...p.lines].join("\n") + "\n" })) };
}

/** The directory name of part n of total, from the run's `<stamp>_<slug>`. */
export const partName = (name: string, n: number, total: number): string => `${name}-p${n}-of-${total}`;

export interface PartPaths {
  spec: string;
  intent: string;
  review: string;
  prototype: string;
}

/**
 * The paths of part n of total beside the run's spec and intent paths, as
 * spec-paths.sh prints them; null when they do not end in
 * `<name>/spec.md` and `<name>/intent.md` with one <name>.
 */
export function partPaths(spec: string, intent: string, n: number, total: number): PartPaths | null {
  const s = /^(.*)\/([^/]+)\/spec\.md$/.exec(spec);
  const t = /^(.*)\/([^/]+)\/intent\.md$/.exec(intent);
  if (!s || !t || s[2] !== t[2]) return null;
  const name = partName(s[2], n, total);
  return {
    spec: `${s[1]}/${name}/spec.md`,
    intent: `${t[1]}/${name}/intent.md`,
    review: `${t[1]}/${name}/spec-review.md`,
    prototype: `${s[1]}/${name}/prototype.html`,
  };
}
