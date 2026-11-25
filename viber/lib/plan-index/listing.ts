/*
 * listing.ts - the index of a sound plan: the state lines, one row and one
 * verify line per task, the profile lines of --split, the dirty and orphan lines
 * and, on a fresh plan past 30 tasks, the threshold line.
 */

import type { Checked } from "./check.ts";
import type { PlanDoc } from "./read.ts";
import type { RunState } from "./state.ts";
import { bare, commandOf, trim } from "./text.ts";

const TIERS = ["haiku", "sonnet", "opus", "fable"];

export interface Tiers {
  min: string;
  max: string;
}

/** The tier clamped into min..max. */
export function clampTier(tier: string, { min, max }: Tiers): string {
  const at = TIERS.indexOf(tier);
  if (at < TIERS.indexOf(min)) return min;
  return at > TIERS.indexOf(max) ? max : tier;
}

export interface ListingOpts {
  /** The plan path as printed, and the run directory as printed ("." for none). */
  plan: string;
  dir: string;
  /** The changed paths, in git order. */
  changed: string[];
  /** The tiers the profile lines are clamped into; null: no profile line. */
  profile: Tiers | null;
  /** The plan is fresh, accepted the task count the user already kept; null: a landed plan, which gets no threshold line. */
  fresh: { accepted: number | null } | null;
}

/** A task's own tier and that of its review, decided before the clamp. */
function profileLine({ task, files, feeds }: Checked, tiers: Tiers): string {
  const clamp = (tier: string): string => clampTier(tier, tiers);
  const heavy = feeds.some(({ count }) => count >= 3);
  // A load-bearing task is reviewed by opus, whatever wrote it.
  const review = (tier: string): string => clamp(heavy ? "opus" : tier);
  const light = task.tdd === "none" && !heavy;
  const subject = `subject: ${task.id}${task.tdd === "required" ? " [TDD]" : ""} - ${task.title}`;
  if (task.hard !== null) return `profile: ${task.id} | tier: ${clamp("opus")} | review: ${clamp("opus")} | ${subject}`;
  if (task.tdd === "none" && files.length <= 2) {
    const other = light ? `waive? ${clamp("sonnet")}` : `review ${review("sonnet")}`;
    return `profile: ${task.id} | haiku? | mechanical: ${clamp("haiku")} review ${review("sonnet")} | else: ${clamp("sonnet")} ${other} | ${subject}`;
  }
  return `profile: ${task.id} | tier: ${clamp("sonnet")} | review: ${light ? `waive? ${clamp("sonnet")}` : review("sonnet")} | ${subject}`;
}

/** The phase after the one this plan builds. */
function nextPhase({ phases, thisPhase }: PlanDoc): string[] {
  if (thisPhase === 0 || thisPhase === phases.length) return [];
  return [`next: phase ${thisPhase + 1} of ${phases.length} - ${trim(phases[thisPhase].replace(/[ \t\v\f\r]*\((built|this plan)\)$/, ""))}`];
}

/** A plan the user is asked to split: more tasks than this, unless the user already kept that many. */
const TASK_LIMIT = 30;

function thresholdLines(count: number, accepted: number | null): string[] {
  return count > TASK_LIMIT && (accepted === null || count > accepted) ? [`threshold: ${count} tasks, past ${TASK_LIMIT}`] : [];
}

export function indexLines(doc: PlanDoc, tasks: Checked[], state: RunState, opts: ListingOpts): string[] {
  const { changed, dir } = opts;
  const done = (id: string): boolean => state.done.has(id);
  const open = tasks.filter(({ task }) => !done(task.id));
  const line = (label: string, value: string): string[] => (value === "" ? [] : [`${label}: ${value}`]);
  const list = (values: string[], empty = ""): string => values.join(",") || empty;

  // The Repro path is uncommitted by design, and a done task's dirty files are orphans: nothing dispatches onto it again.
  const dirty = open.flatMap(({ task, files }) => {
    const left = files.filter((path) => changed.includes(path) && path !== bare(task.repro));
    return left.length === 0 ? [] : [`dirty: ${task.id} | ${list(left)}`];
  });
  const claimed = new Set(open.flatMap(({ files }) => files));
  const orphans = changed.filter((path) => !claimed.has(path) && (dir === "." || !path.startsWith(`${dir}/`)));

  return [
    `plan: ${opts.plan}`,
    `title: ${doc.title}`,
    `progress: ${tasks.length - open.length}/${tasks.length}`,
    ...line("skipped", state.skippedText),
    ...line("unreviewed", state.unreviewed),
    ...line("deferred", state.deferred),
    ...line("closed", state.closed),
    ...state.decisions,
    ...state.rulings.map((ruling) => `ruling: ${ruling}`),
    ...nextPhase(doc),
    "tasks: id | state | tdd | excl | hard | deps | feeds | files | title",
    ...tasks.map(({ task, files, deps, feeds }) =>
      [
        task.id,
        done(task.id) ? "done" : state.skipped.has(task.id) ? "skipped" : "todo",
        task.tdd,
        task.exclusive === "true" ? "yes" : "-",
        task.hard !== null ? "yes" : "-",
        list(deps, "-"),
        list(feeds.map(({ block, count }) => `${block}:${count}`), "-"),
        list(files),
        task.title,
      ].join(" | "),
    ),
    ...tasks.map(({ task }) => `verify: ${task.id} | ${commandOf(task.verification)}`),
    ...(opts.profile === null ? [] : open.filter(({ task }) => !state.skipped.has(task.id)).map((each) => profileLine(each, opts.profile as Tiers))),
    ...dirty,
    ...orphans.map((path) => `orphan: ${path}`),
    ...(opts.fresh === null ? [] : thresholdLines(tasks.length, opts.fresh.accepted)),
  ];
}
