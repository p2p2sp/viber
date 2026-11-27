/*
 * stamp.ts - the time stamp the path scripts put in a file name
 * (handoff-path), read from the local-time fields of an instant.
 */

/** YYYY-MM-DD-HH-MM-SS from the local-time fields of the instant. */
export function stampOf(at: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  const year = String(at.getFullYear()).padStart(4, "0");
  return [year, two(at.getMonth() + 1), two(at.getDate()), two(at.getHours()), two(at.getMinutes()), two(at.getSeconds())].join("-");
}
