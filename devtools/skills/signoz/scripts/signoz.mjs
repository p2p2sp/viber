#!/usr/bin/env node
// SigNoz API helper. No dependencies, Node 20+.
//
// Env: SIGNOZ_URL and SIGNOZ_API_KEY (both required); SIGNOZ_TZ (optional IANA zone, default: system zone).
//
//   signoz.mjs zone                                               display zone; never fails
//   signoz.mjs api METHOD PATH [--data FILE|-] [--out FILE]      PATH like api/v2/rules or /api/v2/rules
//   signoz.mjs query FILE [--since 1h | --start T --end T] [--json] [--out FILE]
//   signoz.mjs logs [--filter EXPR] [--since 1h] [--limit 50] [--fields a,b] [--asc] [--cursor C] [--full]
//   signoz.mjs count [--filter EXPR] [--by a,b] [--signal logs] [--since 1h] [--limit 20]
//   signoz.mjs keys [--search TEXT] [--signal logs] [--context resource|attribute|log|body|scope]
//   signoz.mjs values NAME [--search TEXT] [--signal logs] [--filter EXPR]
//
// T = epoch ms or ISO 8601 (2026-09-28T10:00:00Z); ISO without an offset is read in the display zone.
// Durations: 30s, 15m, 1h, 2d, 1w. Printed times are in the display zone, with their UTC offset.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const UNITS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
const INTRINSIC = new Set(["body", "id", "timestamp", "severity_text", "severity_number", "trace_id", "span_id",
  "trace_flags", "scope_name", "scope_version", "service.name"]);
const BAGS = ["attributes_string", "attributes_number", "attributes_bool", "resources_string", "scope_string"];

export class SignozError extends Error {}

const isObject = (v) => v !== null && typeof v === "object";

export function normalizePath(path) {
  // Git Bash rewrites /api/... into C:/Program Files/Git/api/...; recover the API part.
  const p = path.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(p)) {
    const m = p.match(/\/(?:api|prometheus)\/.*$/);
    if (!m) throw new SignozError(`cannot recover API path from ${p}`);
    return m[0];
  }
  return p.startsWith("/") ? p : "/" + p;
}

export function toMs(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new SignozError(`bad time: ${value}`);
  return ms;
}

export function timeRange({ since = "1h", start, end } = {}, now = Date.now()) {
  const e = end ? toMs(end) : now;
  if (start) return [toMs(start), e];
  const m = /^(\d+)([smhdw])$/.exec(since);
  if (!m) throw new SignozError(`bad duration: ${since}`);
  return [e - Number(m[1]) * UNITS[m[2]] * 1000, e];
}

export function zoneName(env = process.env) {
  const tz = env.SIGNOZ_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new SignozError(`bad SIGNOZ_TZ: ${tz} (use an IANA name like Europe/Warsaw)`);
  }
  return tz;
}

// ISO 8601 in the given zone with its offset; UTC prints the same as toISOString().
export function iso(ms, tz = "UTC") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, timeZoneName: "longOffset",
  }).formatToParts(ms).map((x) => [x.type, x.value]));
  const offset = p.timeZoneName.replace(/^GMT(\+00:00)?$/, "Z").replace("GMT", "");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}${offset}`;
}

const num = (v) => (typeof v === "number" ? String(Number(v.toPrecision(6))) : String(v));

export async function request(method, path, body, env = process.env) {
  const url = normalizePath(path);
  const base = (env.SIGNOZ_URL || "").replace(/\/+$/, "");
  if (!base) throw new SignozError("SIGNOZ_URL is not set (e.g. http://host:8080)");
  const key = env.SIGNOZ_API_KEY;
  if (!key) throw new SignozError("SIGNOZ_API_KEY is not set");
  const headers = { "SIGNOZ-API-KEY": key, Accept: "application/json" };
  let data;
  if (body !== undefined && body !== null) {
    data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(base + url, { method: method.toUpperCase(), headers, body: data, signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    throw new SignozError(`connection failed: ${err.cause?.message || err.message}`);
  }
  const text = await res.text();
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    throw new SignozError(`HTTP ${res.status}: got the web UI HTML, so the route ${method.toUpperCase()} ${url} does not exist`);
  }
  return { status: res.status, text };
}

export async function callJson(method, path, body, env) {
  const { status, text } = await request(method, path, body, env);
  if (status >= 400) throw new SignozError(`HTTP ${status}: ${text}`);
  return text.trim() ? JSON.parse(text) : null;
}

export async function queryRange(payload, env) {
  return (await callJson("POST", "/api/v5/query_range", payload, env)).data;
}

export function prepareQueryPayload(payload, opts = {}, now = Date.now()) {
  const p = structuredClone(payload);
  p.schemaVersion ??= "v1";
  if (p.requestType === "time_series") {
    // zero-fill empty buckets so trends are not misread as missing data
    p.formatOptions ??= {};
    p.formatOptions.fillGaps ??= true;
  }
  if (opts.start || opts.end || p.start === undefined) [p.start, p.end] = timeRange(opts, now);
  return p;
}

const envelope = (requestType, start, end, spec) => ({
  schemaVersion: "v1", start, end, requestType,
  compositeQuery: { queries: [{ type: "builder_query", spec }] },
});

export function buildLogsPayload({ filter = "", limit = 50, asc = false, cursor } = {}, start, end) {
  const direction = asc ? "asc" : "desc";
  const spec = {
    name: "A", signal: "logs", filter: { expression: filter },
    order: [{ key: { name: "timestamp" }, direction }, { key: { name: "id" }, direction }],
    limit,
  };
  if (cursor) spec.cursor = cursor;
  return envelope("raw", start, end, spec);
}

export function buildCountPayload({ filter = "", by, signal = "logs", limit = 20 } = {}, start, end) {
  const spec = {
    name: "A", signal, filter: { expression: filter },
    aggregations: [{ expression: "count()", alias: "count" }],
    order: [{ key: { name: "count" }, direction: "desc" }], limit,
  };
  const groups = splitList(by);
  if (groups.length) spec.groupBy = groups.map((name) => ({ name }));
  return envelope("scalar", start, end, spec);
}

const splitList = (s) => (s ? s.split(",").filter(Boolean) : []);

export function formatLogLine(row, fields = [], full = false, tz = "UTC") {
  const d = row.data;
  const res = d.resources_string || {};
  const ms = Date.parse(row.timestamp || "");
  const ts = Number.isNaN(ms) ? (row.timestamp || "") : iso(ms, tz);
  const head = `${ts} ${String(d.severity_text ?? "-").padEnd(11)} ${res["service.name"] ?? d["service.name"] ?? "-"}`;
  let body = d.body ?? "";
  if (!full) {
    body = body.replaceAll("\n", " \\n ");
    body = body.length > 500 ? body.slice(0, 500) + "..." : body;
  }
  const parts = [head, body];
  // selectFields rows carry the chosen fields as top-level keys
  const extra = {};
  for (const [k, v] of Object.entries(d)) if (!INTRINSIC.has(k) && !isObject(v)) extra[k] = v;
  for (const f of fields) {
    for (const bag of BAGS) if (d[bag] && f in d[bag]) extra[f] = d[bag][f];
    if (f in d && !isObject(d[f])) extra[f] = d[f];
  }
  if (d.trace_id && !("trace_id" in extra)) extra.trace_id = d.trace_id;
  if (Object.keys(extra).length) parts.push(JSON.stringify(extra));
  return parts.join(" | ");
}

const labelStr = (labels) => (labels || []).map((l) => `${l.key.name}=${l.value}`).join(", ") || "(all)";

export function formatWarnings(data) {
  const w = data.warning || {};
  return [w, ...(w.warnings || [])].filter((i) => i.message).map((i) => `# warning: ${i.message}`);
}

export function formatResult(data, fields = [], full = false, tz = "UTC") {
  const out = formatWarnings(data);
  for (const res of data.data.results) {
    const name = res.queryName;
    if ("rows" in res) {
      const rows = res.rows || [];
      out.push(`# ${name}: ${rows.length} rows`);
      for (const row of rows) out.push(formatLogLine(row, fields, full, tz));
      if (res.nextCursor) {
        const last = Number(Buffer.from(res.nextCursor, "base64").toString());
        out.push(`# nextCursor: ${res.nextCursor} (last row ${iso(last, tz)})`);
      }
    } else if ("columns" in res) {
      out.push(`# ${name}`, res.columns.map((c) => c.name).join("\t"));
      for (const r of res.data || []) out.push(r.map((v) => (v === null ? "None" : String(v))).join("\t"));
    } else if ("aggregations" in res) {
      for (const agg of res.aggregations || []) {
        out.push(`# ${name} aggregation ${agg.index} ${agg.alias || ""}`.trimEnd());
        for (const s of agg.series || []) {
          const vals = [...(s.values || [])].sort((a, b) => a.timestamp - b.timestamp);
          const total = vals.reduce((acc, v) => acc + v.value, 0);
          out.push(`## ${labelStr(s.labels)} | points=${vals.length} sum=${num(total)}`);
          for (const v of vals) out.push(`${iso(v.timestamp, tz)}\t${num(v.value)}`);
        }
      }
    } else {
      out.push(JSON.stringify(res));
    }
  }
  return out;
}

export function formatKeys(data) {
  const out = Object.keys(data.keys).sort().map((name) =>
    `${name}\t${data.keys[name].map((v) => `${v.fieldContext}:${v.fieldDataType}`).join(", ")}`);
  if (data.complete === false) out.push("# incomplete list, narrow with --search");
  return out;
}

export function formatValues(data) {
  const out = [];
  for (const [kind, vals] of Object.entries(data.values || {})) for (const v of vals || []) out.push(`${v}\t${kind}`);
  if (data.complete === false) out.push("# incomplete list, narrow with --search");
  return out;
}

const TIME = { since: { type: "string", default: "1h" }, start: { type: "string" }, end: { type: "string" } };
const COMMANDS = {
  zone: { positionals: 0, options: {} },
  api: { positionals: 2, options: { data: { type: "string" }, out: { type: "string" } } },
  query: { positionals: 1, options: { ...TIME, json: { type: "boolean" }, out: { type: "string" } } },
  logs: {
    positionals: 0,
    options: { ...TIME, filter: { type: "string", default: "" }, limit: { type: "string", default: "50" },
      fields: { type: "string" }, asc: { type: "boolean" }, cursor: { type: "string" }, full: { type: "boolean" } },
  },
  count: {
    positionals: 0,
    options: { ...TIME, filter: { type: "string", default: "" }, by: { type: "string" },
      signal: { type: "string", default: "logs" }, limit: { type: "string", default: "20" } },
  },
  keys: {
    positionals: 0,
    options: { search: { type: "string", default: "" }, signal: { type: "string", default: "logs" },
      context: { type: "string" }, limit: { type: "string", default: "200" } },
  },
  values: {
    positionals: 1,
    options: { search: { type: "string", default: "" }, signal: { type: "string", default: "logs" },
      filter: { type: "string" }, limit: { type: "string", default: "50" } },
  },
};

function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new SignozError(`--${name} must be a non-negative integer`);
  return n;
}

// Runs one CLI invocation; returns the exit code. `print` receives one output line per call.
export async function run(argv, { env = process.env, print = console.log, readStdin = () => readFileSync(0) } = {}) {
  const [cmd, ...rest] = argv;
  const def = COMMANDS[cmd];
  if (!def) throw new SignozError(`usage: signoz.mjs <${Object.keys(COMMANDS).join("|")}> ...`);
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options: def.options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new SignozError(err.message);
  }
  const { values: o, positionals: pos } = parsed;
  if (pos.length !== def.positionals) throw new SignozError(`${cmd}: expected ${def.positionals} positional argument(s), got ${pos.length}`);
  const printAll = (lines) => lines.forEach((l) => print(l));

  if (cmd === "zone") {
    // skill preload: report a bad zone as text, since a non-zero exit would abort the skill load
    try {
      const tz = zoneName(env);
      print(`${tz} (UTC offset now: ${iso(Date.now(), tz).slice(23)})`);
    } catch (err) {
      if (!(err instanceof SignozError)) throw err;
      print(`INVALID: ${err.message}`);
    }
    return 0;
  }
  const tz = zoneName(env);
  if (cmd === "api") {
    const body = o.data === undefined ? undefined : o.data === "-" ? readStdin() : readFileSync(o.data);
    const { status, text } = await request(pos[0], pos[1], body, env);
    if (o.out) {
      writeFileSync(o.out, text, "utf8");
      print(`HTTP ${status}, ${Buffer.byteLength(text)} bytes written to ${o.out}`);
    } else {
      print(`HTTP ${status}`);
      if (text) print(text);
    }
    return status >= 400 ? 1 : 0;
  }
  if (cmd === "query") {
    const payload = prepareQueryPayload(JSON.parse(readFileSync(pos[0], "utf8")), o);
    const data = await queryRange(payload, env);
    if (o.out) {
      writeFileSync(o.out, JSON.stringify(data), "utf8");
      print(`written to ${o.out}`);
    } else if (o.json) {
      print(JSON.stringify(data));
    } else {
      printAll(formatResult(data, [], false, tz));
    }
    return 0;
  }
  if (cmd === "logs") {
    const [start, end] = timeRange(o);
    const payload = buildLogsPayload({ ...o, limit: toInt(o.limit, "limit") }, start, end);
    print(`# ${iso(start, tz)} .. ${iso(end, tz)}`);
    printAll(formatResult(await queryRange(payload, env), splitList(o.fields), o.full, tz));
    return 0;
  }
  if (cmd === "count") {
    const [start, end] = timeRange(o);
    const payload = buildCountPayload({ ...o, limit: toInt(o.limit, "limit") }, start, end);
    print(`# ${iso(start, tz)} .. ${iso(end, tz)}`);
    printAll(formatResult(await queryRange(payload, env), [], false, tz));
    return 0;
  }
  if (cmd === "keys") {
    const q = new URLSearchParams({ signal: o.signal, searchText: o.search, limit: String(toInt(o.limit, "limit")) });
    if (o.context) q.set("fieldContext", o.context);
    printAll(formatKeys((await callJson("GET", `/api/v1/fields/keys?${q}`, undefined, env)).data));
    return 0;
  }
  // values
  const q = new URLSearchParams({ signal: o.signal, name: pos[0], searchText: o.search, limit: String(toInt(o.limit, "limit")) });
  if (o.filter) q.set("existingQuery", o.filter);
  printAll(formatValues((await callJson("GET", `/api/v1/fields/values?${q}`, undefined, env)).data));
  return 0;
}

async function main() {
  process.stdout.on("error", (err) => {
    // output piped into head; exit quietly
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
  try {
    // offsetless ISO in --start/--end is then parsed in the display zone
    if (process.env.SIGNOZ_TZ) process.env.TZ = process.env.SIGNOZ_TZ;
    process.exitCode = await run(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof SignozError)) throw err;
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
