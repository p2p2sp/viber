#!/usr/bin/env node
// WCAG 2.2 contrast checker. No dependencies.
//
// Usage:
//   node check_contrast.ts FG BG [TYPE] [FG BG [TYPE] ...]
//   node check_contrast.ts --json pairs.json
//
// TYPE per pair (optional, default "normal"):
//   normal - body/regular text        AA 4.5:1, AAA 7:1
//   large  - >=24px or >=18.5px bold  AA 3:1,   AAA 4.5:1
//   ui     - borders, icons, focus,   AA 3:1    (SC 1.4.11; no AAA tier)
//            state indicators
//
// JSON items: [{"fg": "#111", "bg": "#fff", "type": "ui", "label": "input border"}, ...]
// Colors: #rgb, #rrggbb, rgb(r,g,b).
// Exit 1 if any pair fails the AA threshold FOR ITS OWN TYPE (a 3.2:1 border passes; 3.2:1 body text fails).

import * as fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOC = `WCAG 2.2 contrast checker. No dependencies.

Usage:
  node check_contrast.ts FG BG [TYPE] [FG BG [TYPE] ...]
  node check_contrast.ts --json pairs.json

TYPE per pair (optional, default "normal"):
  normal - body/regular text        AA 4.5:1, AAA 7:1
  large  - >=24px or >=18.5px bold  AA 3:1,   AAA 4.5:1
  ui     - borders, icons, focus,   AA 3:1    (SC 1.4.11; no AAA tier)
           state indicators

JSON items: [{"fg": "#111", "bg": "#fff", "type": "ui", "label": "input border"}, ...]
Colors: #rgb, #rrggbb, rgb(r,g,b).
Exit 1 if any pair fails the AA threshold FOR ITS OWN TYPE (a 3.2:1 border passes; 3.2:1 body text fails).
`;

// type -> (AA threshold, AAA threshold or null)
interface Threshold {
  aa: number;
  aaa: number | null;
}

const THRESHOLDS: Record<string, Threshold> = {
  normal: { aa: 4.5, aaa: 7.0 },
  large: { aa: 3.0, aaa: 4.5 },
  ui: { aa: 3.0, aaa: null },
};

// --- Python-compat helpers -------------------------------------------------

const PY_WHITESPACE =
  " \t\n\r\v\f\u001c\u001d\u001e\u001f\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004" +
  "\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";

function pyStrip(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && PY_WHITESPACE.includes(s[a])) a++;
  while (b > a && PY_WHITESPACE.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

// Mirror Python repr() for strings (single-quote preference, minimal escapes).
function pyReprStr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += "\\" + quote;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += "\\x" + code.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + quote;
}

// Mirror Python str() for the values that can arrive from JSON.
function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}

// Mirror Python truthiness for JSON values ([] and {} are falsy in Python).
function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

// Mirror Python's float formatting in f-strings (3.0 -> "3.0", 4.5 -> "4.5").
function pyFloatStr(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

// --- Contrast math ---------------------------------------------------------

export function parseColor(input: string): [number, number, number] {
  let s = pyStrip(input).toLowerCase();
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  if (m) {
    const rgb: [number, number, number] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    for (const c of rgb) {
      if (c > 255) {
        throw new Error(`Unrecognized color: ${pyReprStr(s)} (use #rgb, #rrggbb or rgb(r,g,b))`);
      }
    }
    return rgb;
  }
  s = s.replace(/^#+/, "");
  if (/^[0-9a-f]{3}$/.test(s)) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/.test(s)) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  throw new Error(`Unrecognized color: ${pyReprStr(s)} (use #rgb, #rrggbb or rgb(r,g,b))`);
}

function relLuminance(rgb: [number, number, number]): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [channel(rgb[0]), channel(rgb[1]), channel(rgb[2])];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const lf = relLuminance(fg);
  const lb = relLuminance(bg);
  const l1 = Math.max(lf, lb);
  const l2 = Math.min(lf, lb);
  return (l1 + 0.05) / (l2 + 0.05);
}

// --- CLI -------------------------------------------------------------------

type Pair = [unknown, unknown, string, unknown];

class ValueError extends Error {}

function parseCliPairs(argv: string[]): Pair[] {
  const pairs: Pair[] = [];
  let i = 0;
  while (i < argv.length) {
    if (i + 1 >= argv.length) {
      throw new ValueError(`Dangling color ${pyReprStr(argv[i])} without a background.`);
    }
    const fg = argv[i];
    const bg = argv[i + 1];
    i += 2;
    let ptype = "normal";
    if (i < argv.length && Object.hasOwn(THRESHOLDS, argv[i].toLowerCase())) {
      ptype = argv[i].toLowerCase();
      i += 1;
    }
    pairs.push([fg, bg, ptype, ""]);
  }
  return pairs;
}

export function main(argv: string[]): number {
  if (argv.length === 0) {
    console.log(DOC);
    return 2;
  }
  let pairs: Pair[] = [];
  try {
    if (argv[0] === "--json") {
      if (argv.length !== 2) {
        console.log(DOC);
        return 2;
      }
      // Read + JSON.parse errors are deliberately uncaught (exit 1), like the original.
      const items = JSON.parse(fs.readFileSync(argv[1], "utf-8")) as unknown[];
      for (const item of items) {
        const rec = item as Record<string, unknown>;
        const rawType = Object.hasOwn(rec, "type") ? rec["type"] : "normal";
        const ptype = pyStr(rawType).toLowerCase();
        if (!Object.hasOwn(THRESHOLDS, ptype)) {
          throw new ValueError(`Unknown type ${pyReprStr(ptype)} (use normal|large|ui)`);
        }
        const label = Object.hasOwn(rec, "label") ? rec["label"] : "";
        const fg = rec["fg"];
        const bg = rec["bg"];
        if (typeof fg !== "string" || fg.length === 0) {
          throw new ValueError(`Missing or invalid 'fg' in record: ${pyReprStr(pyStr(fg))}`);
        }
        if (typeof bg !== "string" || bg.length === 0) {
          throw new ValueError(`Missing or invalid 'bg' in record: ${pyReprStr(pyStr(bg))}`);
        }
        pairs.push([fg, bg, ptype, label]);
      }
    } else {
      pairs = parseCliPairs(argv);
    }
  } catch (e) {
    if (!(e instanceof ValueError)) throw e;
    console.log(e.message);
    console.log(DOC);
    return 2;
  }

  let anyFail = false;
  try {
    for (const [fgS, bgS, ptype, label] of pairs) {
      const ratio = contrastRatio(parseColor(fgS as string), parseColor(bgS as string));
      const { aa, aaa } = THRESHOLDS[ptype];
      const aaOk = ratio >= aa;
      if (!aaOk) {
        anyFail = true;
      }
      const tag = pyTruthy(label) ? ` [${pyStr(label)}]` : "";
      const aaaPart =
        aaa !== null
          ? `  AAA(need ${pyFloatStr(aaa)}): ${ratio >= aaa ? "PASS" : "FAIL"}`
          : "";
      console.log(
        `${pyStr(fgS)} on ${pyStr(bgS)}${tag} (${ptype}): ${ratio.toFixed(2)}:1  ` +
          `AA(need ${pyFloatStr(aa)}): ${aaOk ? "PASS" : "FAIL"}${aaaPart}`,
      );
    }
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    console.log(e.message);
    console.log(DOC);
    return 2;
  }
  return anyFail ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
