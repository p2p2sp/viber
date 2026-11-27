/*
 * pr-review.ts - the pr-review core: reads the findings of one review, tells
 * which of them sit on a line the pull request's diff shows, and builds the
 * review that carries them. It touches no port; the contract lives in the
 * header of ../pr-review.ts.
 */

export interface Finding {
  file: string;
  line: number | null;
  severity: string;
  summary: string;
  scenario: string;
}

export interface PullRef {
  host: string;
  slug: string;
  number: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export interface Review {
  payload: { commit_id: string; event: "COMMENT"; comments: ReviewComment[]; body?: string };
  inline: number;
  outside: number;
}

/** The parts of `https://<host>/<owner>/<repo>/pull/<N>`; null for any other text. */
export function parsePullUrl(url: string): PullRef | null {
  const m = /^https:\/\/([^/\s]+)\/([^/\s]+\/[^/\s]+)\/pull\/([0-9]+)$/.exec(url);
  return m ? { host: m[1], slug: m[2], number: m[3] } : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The findings of a findings file, or the reason it holds none to post. */
export function parseFindings(text: string): Finding[] | string {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return "the findings file is not JSON";
  }
  if (!Array.isArray(data)) return "the findings file is not a JSON array";
  if (data.length === 0) return "the findings file holds no finding";
  const findings: Finding[] = [];
  for (const [i, item] of data.entries()) {
    const o = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const file = textOf(o.file).replaceAll("\\", "/").replace(/^\.\//, "");
    const summary = textOf(o.summary);
    if (file === "" || summary === "") return `finding ${i + 1} has no file or no summary`;
    const line = typeof o.line === "number" || typeof o.line === "string" ? Number(o.line) : 0;
    findings.push({
      file,
      line: Number.isInteger(line) && line > 0 ? line : null,
      severity: textOf(o.severity),
      summary,
      scenario: textOf(o.failure_scenario),
    });
  }
  return findings;
}

/** The new-side line numbers a unified diff patch shows: its added and context lines. */
export function patchLines(patch: string): Set<number> {
  const lines = new Set<number>();
  // 0 until the first hunk header: a patch never numbers a line 0.
  let next = 0;
  for (const row of patch.split("\n")) {
    const head = /^@@ -[0-9]+(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/.exec(row);
    if (head) {
      next = Number(head[1]);
      continue;
    }
    if (next > 0 && (row.startsWith("+") || row.startsWith(" "))) lines.add(next++);
  }
  return lines;
}

function show(f: Finding): string {
  const head = f.severity === "" ? f.summary : `**${f.severity}**: ${f.summary}`;
  return f.scenario === "" ? head : `${head}\n\nFailure scenario: ${f.scenario}`;
}

/**
 * One COMMENT review on `commit`: a finding whose line `shown` holds for its file
 * becomes a comment on that line, every other one a section of the review text
 * with a link under `blob` (`https://<host>/<owner>/<repo>/blob/<commit>`).
 */
export function buildReview(findings: Finding[], shown: Map<string, Set<number>>, blob: string, commit: string): Review {
  const comments: ReviewComment[] = [];
  const outside: string[] = [];
  for (const f of findings) {
    if (f.line !== null && shown.get(f.file)?.has(f.line)) {
      comments.push({ path: f.file, line: f.line, side: "RIGHT", body: show(f) });
      continue;
    }
    const where = f.line === null ? f.file : `${f.file}:${f.line}`;
    const path = f.file.split("/").map(encodeURIComponent).join("/");
    // The link stands on its own line: GitHub renders it there as the code it points at.
    outside.push(`### \`${where}\`\n\n${show(f)}\n\n${blob}/${path}${f.line === null ? "" : `#L${f.line}`}`);
  }
  const payload: Review["payload"] = { commit_id: commit, event: "COMMENT", comments };
  if (outside.length > 0) payload.body = `## Findings outside the diff\n\n${outside.join("\n\n")}`;
  return { payload, inline: comments.length, outside: outside.length };
}
