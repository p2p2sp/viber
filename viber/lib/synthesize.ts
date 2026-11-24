/*
 * synthesize.ts - the synthesize core: folds the critic verdicts of a
 * code-auditor run into its findings, ranks and merges them, writes
 * findings.md and builds the summary and the fill block. The contract lives in
 * the header of ../skills/code-auditor/scripts/synthesize.ts.
 */

import type { Fs } from "./ports.ts";

export interface SynthesizeResult {
  stdout: string;
  stderr: string;
  exit: number;
}

interface Span {
  file: string;
  from: number;
  to: number;
}

/** sev, filed: tenths of a point. verdict: an index of VERDICTS. conf: an index of CONFIDENCE. tail: the hunt order. key: the rank. */
interface Finding {
  id: string;
  title: string;
  loc: string;
  klass: string;
  obs: string;
  filed: number;
  sev: number;
  verdict: number;
  conf: number;
  status: string;
  reports: string;
  tail: string;
  key: string;
  span: Span | null;
  dead: boolean;
}

interface Hunt {
  id: string;
  unit: string;
  key: string;
  state: "none" | "nofinding" | "found";
}

const USAGE = "usage: synthesize.sh <ws> [--merge <id>,<id>[,<id>]...]... | [--merge none]";
const DOT = "·";
const VERDICTS = ["VERIFIED", "PARTIALLY VERIFIED", "INCONCLUSIVE"];
const CONFIDENCE = ["high", "medium", "low"];
const NUMBER = /^[0-9]+(\.[0-9]+)?$/;
const UNIT = /^U[0-9]+$/;
const FILL = "<!-- fill -->";

function fail(reason: string): SynthesizeResult {
  return { stdout: "", stderr: `error: ${reason}\n`, exit: 2 };
}

const text = (lines: string[]): string => lines.map((line) => `${line}\n`).join("");
const trim = (s: string): string => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
const after = (line: string, key: string): string => trim(line.slice(key.length));
const tenths = (points: string): number => Math.floor(Number(points) * 10 + 0.5);
const points = (t: number): string => (t / 10).toFixed(1);
const pad = (n: number): string => String(n).padStart(6, "0");
const rank = (f: Finding): string => `k${pad(100000 - f.sev)}${f.verdict}${f.conf}${f.tail}`;
const list = (items: string[]): string => (items.length === 0 ? "none" : items.join(", "));

/** The items in the order of their keys, items of one key in the order given. */
function byKey<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** The lines of a file, each without its line end; none for an absent, unreadable or empty file. */
function linesOf(fs: Fs, path: string): string[] {
  const body = fs.readText(path);
  if (body === null || body === "") return [];
  return body
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
}

/** The file and line range a LOCATION ends on (`<file>:L<n>` or `<file>:L<n>-L<m>`), a leading ./ of the file dropped once; null for any other text. */
function spanOf(loc: string): Span | null {
  const found = /:L([0-9]+)(?:-L([0-9]+))?$/.exec(loc);
  if (found === null) return null;
  const file = loc.slice(0, found.index).replace(/^\.\//, "");
  const from = Number(found[1]);
  const to = found[2] === undefined ? from : Number(found[2]);
  return file === "" || from > to ? null : { file, from, to };
}

/** True for two ranges of one file that overlap or have at most 5 lines between them. */
function near(a: Finding, b: Finding): boolean {
  if (a.span === null || b.span === null || a.span.file !== b.span.file) return false;
  return Math.max(a.span.from, b.span.from) - Math.min(a.span.to, b.span.to) <= 6;
}

/** The paragraphs and the STATUS line of every entry of an earlier findings.md that holds no fill marker any more, by finding id. */
function keptEntries(lines: string[]): Map<string, { body: string[]; status: string }> {
  const kept = new Map<string, { body: string[]; status: string }>();
  let inEntry = false;
  let status = "";
  let id = "";
  let body: string[] = [];
  let open = false;
  let skipAdopted = false;
  const flush = (): void => {
    let first = 0;
    let last = body.length;
    while (first < last && body[first] === "") first++;
    while (last > first && body[last - 1] === "") last--;
    if (id !== "" && !open && first < last) kept.set(id, { body: body.slice(first, last), status });
    id = "";
    body = [];
    open = false;
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      inEntry = /^## [0-9]+\. /.test(line);
      status = "";
    } else if (!inEntry) {
      continue;
    } else if (id === "") {
      if (line.startsWith("STATUS: ")) status = line;
      else if (line.length >= 18 && line.startsWith("<!-- finding: ") && line.endsWith(" -->")) {
        id = line.slice(14, -4);
        skipAdopted = true;
      }
    } else if (skipAdopted && line.startsWith("Severity adopted from the critic:")) {
      skipAdopted = false;
    } else {
      if (line !== "") skipAdopted = false;
      if (line === FILL) open = true;
      body.push(line);
    }
  }
  flush();
  return kept;
}

/** The file with the lines added at its end; false when it cannot be written. */
function append(fs: Fs, path: string, lines: string[]): boolean {
  const old = fs.readBytes(path) ?? new Uint8Array(0);
  const added = new TextEncoder().encode(text(lines));
  const whole = new Uint8Array(old.length + added.length);
  whole.set(old);
  whole.set(added, old.length);
  return fs.writeBytes(path, whole);
}

/** The stdout, stderr and exit code of one synthesize call. Never throws. */
export function runSynthesize(argv: string[], ports: { fs: Fs }): SynthesizeResult {
  const { fs } = ports;
  let ws = "";
  let none = false;
  const asked: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--merge") {
      if (i + 1 >= argv.length) return fail("--merge needs a value");
      i += 1;
      if (argv[i] === "none") none = true;
      else asked.push(argv[i]);
    } else {
      if (ws !== "") return fail(`unexpected argument: ${argv[i]}`);
      ws = argv[i];
    }
  }
  if (ws === "") return fail(USAGE);
  if (none && asked.length > 0) return fail("--merge none cannot join merge groups");
  ws = ws.replace(/[/\\]+$/, "");
  const ledger = `${ws}/ledger.md`;
  if (fs.kind(`${ws}/run.md`) !== "file") return fail(`run file not found: ${ws}/run.md`);
  if (fs.kind(ledger) !== "file") return fail(`ledger not found: ${ledger}`);
  const runId = ws.split(/[/\\]/).pop() ?? "";

  let lens = "";
  let lensFile = "";
  let scope = "";
  let header = true;
  let inUnits = false;
  const units: string[] = [];
  for (const line of linesOf(fs, `${ws}/run.md`)) {
    if (line.startsWith("## ")) header = false;
    if (header) {
      if (line.startsWith("Lens: ") && lens === "") lens = after(line, "Lens:");
      else if (line.startsWith("Lens file: ") && lensFile === "") lensFile = after(line, "Lens file:");
      else if (line.startsWith("Scope: ") && scope === "") scope = after(line, "Scope:");
    }
    if (/^## Units[ \t]*$/.test(line)) inUnits = true;
    else if (line.startsWith("## ")) inUnits = false;
    else if (inUnits) units.push(...(/^- (U[0-9]+)/.exec(line) ?? []).slice(1));
  }

  const angles = new Map<string, number>();
  let inHunts = false;
  for (const line of lensFile === "" ? [] : linesOf(fs, lensFile)) {
    if (line.startsWith("## ")) inHunts = /^## Hunts[ \t]*$/.test(line);
    else if (inHunts && line.startsWith("### ") && !angles.has(trim(line.slice(4)))) angles.set(trim(line.slice(4)), angles.size + 1);
  }

  const hunts: Hunt[] = [];
  const merged: string[] = [];
  const apart = new Set<string>();
  let offered = false;
  for (const line of linesOf(fs, ledger)) {
    if (line.startsWith("hunt: ")) {
      const fields = line.split("|").map(trim);
      const id = trim(fields[0].slice(6));
      const unit = fields.slice(1).findLast((field) => field.startsWith("unit: "));
      if (id !== "" && !hunts.some((hunt) => hunt.id === id)) hunts.push({ id, unit: unit === undefined ? "" : trim(unit.slice(6)), key: "", state: "none" });
    } else if (line.startsWith("merge: ")) {
      merged.push(trim(line.slice(7)));
    } else if (line.startsWith("apart: ")) {
      const ids = line.slice(7).split(/[ \t]+/).filter((id) => id !== "");
      if (ids.length === 2) apart.add(`${ids[0]} ${ids[1]}`).add(`${ids[1]} ${ids[0]}`);
    } else if (/^wave-offered[ \t]*$/.test(line)) {
      offered = true;
    }
  }

  const findings: Finding[] = [];
  const investigated = new Set<string>();
  hunts.forEach((hunt, index) => {
    const { id } = hunt;
    // U<n> by n with its re-hunt R-U<n> right after, then the angles in the lens order, then V-<n> by n, then any other hunt.
    let order = `3${pad(0)}0`;
    if (UNIT.test(id)) order = `0${pad(Number(id.slice(1)))}0`;
    else if (id.startsWith("A-")) order = `1${pad(angles.get(id.slice(2)) ?? 999999)}0`;
    else if (/^R-U[0-9]+$/.test(id)) order = `0${pad(Number(id.slice(3)))}1`;
    else if (/^V-[0-9]+$/.test(id)) order = `2${pad(Number(id.slice(2)))}0`;
    hunt.key = `k${order}${pad(index + 1)}`;
    let files = 0;
    let found = 0;
    for (let k = 0; k <= 9; k++) {
      const report = `${ws}/reports/${id}-${k}.md`;
      const head = linesOf(fs, report).slice(0, 5);
      if (head.length === 0) continue;
      files += 1;
      if (k === 0) continue;
      found += 1;
      const filed = { title: "", loc: "", klass: "", sev: "", conf: "" };
      for (const line of head) {
        if (filed.title === "" && line.startsWith("# ")) filed.title = trim(line.slice(2));
        else if (line.startsWith("LOCATION:")) filed.loc = after(line, "LOCATION:");
        else if (line.startsWith("CLASS:")) filed.klass = after(line, "CLASS:");
        else if (line.startsWith("SEVERITY:")) filed.sev = after(line, "SEVERITY:");
        else if (line.startsWith("CONFIDENCE:")) filed.conf = after(line, "CONFIDENCE:");
      }
      let verdict = "none";
      let critic: string | null = null;
      let obs: string | null = null;
      for (const line of linesOf(fs, `${ws}/verdicts/${id}-${k}.md`)) {
        if (verdict === "none" && line.startsWith("VERDICT:")) {
          const value = after(line, "VERDICT:");
          if (value === "REFUTED" || VERDICTS.includes(value)) verdict = value;
        } else if (obs === null && line.startsWith("OBSERVED:")) {
          obs = after(line, "OBSERVED:");
        } else if (critic === null && line.startsWith("SEVERITY:")) {
          critic = after(line, "SEVERITY:");
        }
      }
      if (verdict === "REFUTED") continue;
      const sev = tenths(NUMBER.test(filed.sev) ? filed.sev : "0");
      const strength = verdict === "none" ? 2 : VERDICTS.indexOf(verdict);
      // Anything but high or medium reads as low.
      const conf = (CONFIDENCE.indexOf(filed.conf.toLowerCase()) + 3) % 3;
      const finding: Finding = {
        id: `${id}-${k}`,
        title: filed.title,
        loc: filed.loc,
        klass: filed.klass,
        obs: obs ?? "",
        filed: sev,
        sev: Math.min(strength < 2 && critic !== null && NUMBER.test(critic) ? tenths(critic) : sev, 1000),
        verdict: strength,
        // No confirmed verdict takes the confidence one step down.
        conf: strength === 2 ? Math.min(conf + 1, 2) : conf,
        status: verdict === "none" ? "critic returned no verdict" : "<!-- oracle -->",
        reports: report,
        tail: `${hunt.key}${k}`,
        key: "",
        span: spanOf(filed.loc),
        dead: false,
      };
      finding.key = rank(finding);
      findings.push(finding);
    }
    hunt.state = files === 0 ? "none" : found === 0 ? "nofinding" : "found";
    const unit = UNIT.test(hunt.unit) ? hunt.unit : UNIT.test(id) ? id : "";
    if (hunt.state !== "none" && unit !== "") investigated.add(unit);
  });

  const known = new Set(findings.map((finding) => finding.id));
  const group = new Map<string, number>();
  let labels = 0;
  /** Makes one group of the ids and of every group one of them is in already. */
  const join = (ids: string[]): void => {
    labels += 1;
    const old = new Set(ids.map((id) => group.get(id)));
    for (const [id, label] of group) if (old.has(label)) group.set(id, labels);
    for (const id of ids) group.set(id, labels);
  };
  const together = (a: Finding, b: Finding): boolean => group.has(a.id) && group.get(a.id) === group.get(b.id);
  for (const line of merged) {
    const ids = line.split(",").map(trim).filter((id) => known.has(id));
    if (ids.length >= 2) join(ids);
  }

  const inHuntOrder = byKey(findings, (finding) => finding.tail);
  const pairs: Array<[Finding, Finding]> = [];
  inHuntOrder.forEach((a, index) => {
    for (const b of inHuntOrder.slice(index + 1)) {
      if (near(a, b) && !together(a, b) && !apart.has(`${a.id} ${b.id}`)) pairs.push([a, b]);
    }
  });

  const groups: string[][] = [];
  for (const raw of asked) {
    if (raw === "") continue;
    const ids: string[] = [];
    for (const id of raw.split(",").map(trim)) {
      if (!known.has(id)) return fail(`merge id names no finding: ${id}`);
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length < 2) return fail(`merge group needs two findings: ${trim(raw)}`);
    groups.push(ids);
  }

  const decided = none || asked.length > 0;
  if (!decided && pairs.length > 0) {
    const line = (f: Finding): string => `finding: ${f.id} | ${f.loc} | ${f.klass} | ${f.obs === "" ? "none" : f.obs}`;
    return { stdout: text(["NEXT: merge", ...pairs.flatMap(([a, b]) => [`merge?: ${a.id} ${b.id}`, line(a), line(b)])]), stderr: "", exit: 0 };
  }
  if (decided) {
    for (const ids of groups) join(ids);
    const record = [...groups.map((ids) => `merge: ${ids.join(",")}`), ...pairs.filter(([a, b]) => !together(a, b)).map(([a, b]) => `apart: ${a.id} ${b.id}`)];
    if (record.length > 0 && !append(fs, ledger, record)) return fail(`cannot write ${ledger}`);
  }

  // A group is its first member in hunt order, holding every location and report and the strongest of each rank field.
  const lead = new Map<number, Finding>();
  for (const finding of inHuntOrder) {
    const label = group.get(finding.id);
    if (label === undefined) continue;
    const first = lead.get(label);
    if (first === undefined) {
      lead.set(label, finding);
      continue;
    }
    finding.dead = true;
    first.loc += `, ${finding.loc}`;
    first.reports += `, ${finding.reports}`;
    first.sev = Math.max(first.sev, finding.sev);
    first.filed = Math.max(first.filed, finding.filed);
    first.conf = Math.min(first.conf, finding.conf);
    if (finding.verdict < first.verdict || (finding.verdict === first.verdict && first.obs === "")) first.obs = finding.obs;
    first.verdict = Math.min(first.verdict, finding.verdict);
    first.key = rank(first);
  }

  const ranked = byKey(findings, (finding) => finding.key).filter((finding) => !finding.dead);
  const confirmed = ranked.filter((finding) => finding.verdict < 2);
  const full: Finding[] = [];
  const further: Finding[] = [];
  for (const finding of ranked) (finding.sev >= 40 && full.length < 10 ? full : further).push(finding);
  const diff = scope === "diff";
  const missed = diff ? [] : units.filter((unit) => !investigated.has(unit));
  const huntOrder = byKey(hunts, (hunt) => hunt.key);

  const out = `${ws}/findings.md`;
  const kept = keptEntries(linesOf(fs, out));
  const toFill: number[] = [];
  const page = [`# Findings - ${runId} (${lens}, ${scope})`, `${lens} ${DOT} ${scope} ${DOT} ${units.length} units mapped ${DOT} ${hunts.length} hunts ${DOT} ${confirmed.length} confirmed findings ${DOT} ${missed.length} units not investigated.`, ""];
  full.forEach((finding, index) => {
    const earlier = kept.get(finding.id);
    page.push(`## ${index + 1}. ${finding.title}`, `SEVERITY: ${points(finding.sev)}`, `CONFIDENCE: ${CONFIDENCE[finding.conf]}`, `VERDICT: ${VERDICTS[finding.verdict]}`);
    if (finding.verdict === 2) page.push(earlier !== undefined && earlier.status !== "" ? earlier.status : `STATUS: INCONCLUSIVE - ${finding.status}`);
    page.push(`LOCATION: ${finding.loc}`, `CLASS: ${finding.klass}`, `<!-- finding: ${finding.id} -->`);
    if (finding.verdict < 2) page.push(`Severity adopted from the critic: ${points(finding.sev)} (filed ${points(finding.filed)})`);
    if (earlier === undefined) toFill.push(index + 1);
    page.push(...(earlier?.body ?? [FILL]), "");
  });
  page.push(`## Further findings (${further.length})`);
  for (const finding of further) page.push([points(finding.sev), finding.loc, finding.klass, finding.title, finding.reports].join(` ${DOT} `));
  page.push(
    "",
    "## Coverage notes",
    `- Units not investigated: ${list(missed)}`,
    `- Hunts with no finding: ${list(huntOrder.filter((hunt) => hunt.state === "nofinding").map((hunt) => hunt.id))}`,
    `- Hunts with no report: ${list(huntOrder.filter((hunt) => hunt.state === "none").map((hunt) => hunt.id))}`,
  );
  if (!fs.writeBytes(out, new TextEncoder().encode(text(page)))) return fail(`cannot write ${out}`);

  const stdout = [`summary: units ${units.length} | hunts ${hunts.length} | confirmed ${confirmed.length} | not investigated ${missed.length}`];
  if (confirmed.length >= 1) stdout.push(`last-line: /viber:intent ${out}`);
  if (toFill.length === 0) stdout.push("NEXT: none");
  else stdout.push(`NEXT: fill | findings: ${out}`);
  for (const n of toFill) {
    const finding = full[n - 1];
    stdout.push(`entry: ${n} | reports: ${finding.reports} | verdict: ${VERDICTS[finding.verdict]} | observed: ${finding.obs === "" ? "none" : finding.obs}`);
  }

  if (confirmed.length >= 1 && !offered && (diff || missed.length > 0)) {
    const classes = [...new Set(confirmed.map((finding) => finding.klass).filter((klass) => klass !== ""))];
    if (!fs.writeBytes(`${ws}/seeds.md`, new TextEncoder().encode(text(classes.map((klass) => `Seed: ${klass}`))))) return fail(`cannot write ${ws}/seeds.md`);
    if (!append(fs, ledger, ["wave-offered"])) return fail(`cannot write ${ledger}`);
    stdout.push("ASK: run the variant wave -> wave | end the run -> end");
  }
  return { stdout: text(stdout), stderr: "", exit: 0 };
}
