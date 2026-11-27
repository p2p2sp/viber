/*
 * simple-state.ts - the run of the simple flow between two calls, kept in
 * <root>/.temp/viber/<session-id>/simple/state.json, never committed.
 */

/** The step in flight; `end` once END was printed. */
export type Step = "stage" | "tests" | "review" | "fix" | "writers" | "end";

export interface State {
  step: Step;
  /** The index of the stage in flight; the stage count once every stage is done. */
  stage: number;
  /** The id awaited; a return of any other id changes nothing. Empty at `writers`, which awaits `waiting`. */
  open: string;
  /** The sequence number of the last id issued. */
  seq: number;
  /** The returns of the dispatch in flight that were no `DONE`. */
  tries: number;
  /** The repo-relative paths that differed from HEAD at `start`: the user's own files. */
  before: string[];
  /** True once the full test run returned `DONE`. */
  tested: boolean;
  /** The numbers the review gave, `lost` when it gave none, null before it returned. */
  review: { count: number; notNit: number } | "lost" | null;
  /** True once the fix of the findings returned `DONE`. */
  fixed: boolean;
  /** The ids of the memory and rules writers awaited, in any order. */
  waiting: string[];
  /**
   * The memory files and files under .claude/rules/viber/ that differed from HEAD on entering `writers`, none of `before`: a coder
   * of this run changed them. Each is snapshotted at <dir>/kept/<path> on that entry; a writer is measured and restored against it.
   */
  kept: string[];
  /** The paths of `kept` absent from disk on entering `writers`: no snapshot, restored by removal. */
  gone?: string[];
  /** The change list handed to the writers, `<status>\t<path>` lines, set on entering `writers`: empty when no writer was sent. */
  listed: string[];
  /** The overrun dispatches of each writer: a second overrun restores its files. */
  overruns: { memory: number; rules: number };
  /** The writers' lines under END. */
  notes: string[];
  /** The lines under END. */
  end: string[];
}

export const freshState = (before: string[]): State => ({
  step: "stage",
  stage: 0,
  open: "",
  seq: 0,
  tries: 0,
  before,
  tested: false,
  review: null,
  fixed: false,
  waiting: [],
  kept: [],
  gone: [],
  listed: [],
  overruns: { memory: 0, rules: 0 },
  notes: [],
  end: [],
});
