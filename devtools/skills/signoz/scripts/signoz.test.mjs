// Tests for signoz.mjs. Run: node --test signoz.test.mjs
// Live read-only smoke tests run only with SIGNOZ_LIVE=1 plus SIGNOZ_URL and SIGNOZ_API_KEY.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  SignozError, buildCountPayload, buildLogsPayload, formatKeys, formatLogLine, formatResult, formatValues,
  iso, normalizePath, prepareQueryPayload, run, timeRange, toMs, zoneName,
} from "./signoz.mjs";

const CLI = fileURLToPath(new URL("./signoz.mjs", import.meta.url));
const NOW = Date.parse("2026-09-28T12:00:00Z");

function logRow(data, timestamp = "2026-09-28T11:59:59.123456789Z") {
  return { timestamp, data };
}

describe("normalizePath", () => {
  test("keeps absolute API paths", () => assert.equal(normalizePath("/api/v2/rules"), "/api/v2/rules"));
  test("adds the leading slash", () => assert.equal(normalizePath("api/v2/rules?x=1"), "/api/v2/rules?x=1"));
  test("recovers paths mangled by Git Bash", () => {
    assert.equal(normalizePath("C:/Program Files/Git/api/v1/version"), "/api/v1/version");
    assert.equal(normalizePath("C:\\Program Files\\Git\\api\\v1\\version"), "/api/v1/version");
  });
  test("keeps prometheus paths intact", () => {
    assert.equal(normalizePath("/prometheus/api/v1/query"), "/prometheus/api/v1/query");
    assert.equal(normalizePath("D:/tools/Git/prometheus/api/v1/query"), "/prometheus/api/v1/query");
  });
  test("rejects a mangled path without an API part", () =>
    assert.throws(() => normalizePath("C:/Program Files/Git/usr/bin"), SignozError));
});

describe("display zone", () => {
  test("UTC prints like toISOString", () => assert.equal(iso(NOW), "2026-09-28T12:00:00.000Z"));
  test("a zone prints local time with its offset, DST included", () => {
    assert.equal(iso(NOW, "Europe/Warsaw"), "2026-09-28T14:00:00.000+02:00");
    assert.equal(iso(Date.parse("2026-12-31T23:30:00.5Z"), "Europe/Warsaw"), "2027-01-01T00:30:00.500+01:00");
    assert.equal(iso(NOW, "America/St_Johns"), "2026-09-28T09:30:00.000-02:30");
  });
  test("SIGNOZ_TZ overrides, a bad name fails", () => {
    assert.equal(zoneName({ SIGNOZ_TZ: "Asia/Tokyo" }), "Asia/Tokyo");
    assert.throws(() => zoneName({ SIGNOZ_TZ: "Mars/Base" }), /bad SIGNOZ_TZ: Mars\/Base/);
  });
  test("zone command reports the zone and never fails", async () => {
    const lines = [];
    assert.equal(await run(["zone"], { env: { SIGNOZ_TZ: "UTC" }, print: (l) => lines.push(l) }), 0);
    assert.equal(await run(["zone"], { env: { SIGNOZ_TZ: "Mars/Base" }, print: (l) => lines.push(l) }), 0);
    assert.deepEqual(lines, ["UTC (UTC offset now: Z)", "INVALID: bad SIGNOZ_TZ: Mars/Base (use an IANA name like Europe/Warsaw)"]);
  });
  test("log lines and series use the zone", () => {
    assert.ok(formatLogLine(logRow({ body: "x" }), [], false, "Europe/Warsaw").startsWith("2026-09-28T13:59:59.123+02:00 "));
    const out = formatResult({ data: { results: [{ queryName: "A", aggregations: [{ index: 0, series: [{ values: [{ timestamp: NOW, value: 1 }] }] }] }] } }, [], false, "Europe/Warsaw");
    assert.equal(out.at(-1), "2026-09-28T14:00:00.000+02:00\t1");
  });
});

describe("time parsing", () => {
  test("toMs accepts epoch ms and ISO 8601", () => {
    assert.equal(toMs("1790600000000"), 1790600000000);
    assert.equal(toMs("2026-09-28T12:00:00Z"), NOW);
  });
  test("toMs rejects garbage", () => assert.throws(() => toMs("yesterday"), SignozError));
  test("since durations in every unit", () => {
    for (const [since, seconds] of [["30s", 30], ["15m", 900], ["1h", 3600], ["2d", 172800], ["1w", 604800]]) {
      assert.deepEqual(timeRange({ since }, NOW), [NOW - seconds * 1000, NOW]);
    }
  });
  test("defaults to the last hour", () => assert.deepEqual(timeRange({}, NOW), [NOW - 3600_000, NOW]));
  test("start and end override since", () =>
    assert.deepEqual(timeRange({ since: "1w", start: "1000", end: "2000" }, NOW), [1000, 2000]));
  test("end anchors since", () => assert.deepEqual(timeRange({ since: "1m", end: "120000" }, NOW), [60000, 120000]));
  test("rejects a bad duration", () => {
    assert.throws(() => timeRange({ since: "5x" }, NOW), /bad duration: 5x/);
    assert.throws(() => timeRange({ since: "1.5h" }, NOW), SignozError);
  });
});

describe("prepareQueryPayload", () => {
  test("fills schemaVersion and time range", () => {
    const p = prepareQueryPayload({ requestType: "scalar" }, { since: "15m" }, NOW);
    assert.equal(p.schemaVersion, "v1");
    assert.deepEqual([p.start, p.end], [NOW - 900_000, NOW]);
  });
  test("zero-fills time_series by default", () =>
    assert.equal(prepareQueryPayload({ requestType: "time_series" }, {}, NOW).formatOptions.fillGaps, true));
  test("keeps an explicit fillGaps", () => {
    const p = prepareQueryPayload({ requestType: "time_series", formatOptions: { fillGaps: false } }, {}, NOW);
    assert.equal(p.formatOptions.fillGaps, false);
  });
  test("never adds fillGaps to other request types", () => {
    assert.equal(prepareQueryPayload({ requestType: "raw" }, {}, NOW).formatOptions, undefined);
    assert.equal(prepareQueryPayload({ requestType: "scalar" }, {}, NOW).formatOptions, undefined);
  });
  test("keeps start/end from the file unless flags are given", () => {
    const body = { requestType: "raw", start: 1, end: 2 };
    assert.deepEqual([prepareQueryPayload(body, { since: "1h" }, NOW).start, prepareQueryPayload(body, {}, NOW).end], [1, 2]);
    assert.equal(prepareQueryPayload(body, { start: "5", end: "6" }, NOW).start, 5);
  });
  test("does not mutate the input", () => {
    const body = { requestType: "time_series" };
    prepareQueryPayload(body, {}, NOW);
    assert.deepEqual(body, { requestType: "time_series" });
  });
});

describe("payload builders", () => {
  test("logs orders by timestamp and id in one direction", () => {
    const spec = buildLogsPayload({ filter: "x = 1", limit: 5 }, 1, 2).compositeQuery.queries[0].spec;
    assert.deepEqual(spec.order.map((o) => [o.key.name, o.direction]), [["timestamp", "desc"], ["id", "desc"]]);
    assert.equal(spec.limit, 5);
    assert.equal(spec.filter.expression, "x = 1");
    assert.equal(spec.cursor, undefined);
    const asc = buildLogsPayload({ asc: true, cursor: "abc" }, 1, 2).compositeQuery.queries[0].spec;
    assert.deepEqual(asc.order.map((o) => o.direction), ["asc", "asc"]);
    assert.equal(asc.cursor, "abc");
  });
  test("logs envelope is a raw v5 request", () => {
    const p = buildLogsPayload({}, 10, 20);
    assert.deepEqual([p.schemaVersion, p.requestType, p.start, p.end], ["v1", "raw", 10, 20]);
    assert.equal(p.compositeQuery.queries[0].type, "builder_query");
  });
  test("count groups, orders by the alias and honours the signal", () => {
    const p = buildCountPayload({ by: "service.name,,severity_text", signal: "traces", limit: 3 }, 1, 2);
    const spec = p.compositeQuery.queries[0].spec;
    assert.equal(p.requestType, "scalar");
    assert.equal(spec.signal, "traces");
    assert.deepEqual(spec.groupBy, [{ name: "service.name" }, { name: "severity_text" }]);
    assert.deepEqual(spec.order, [{ key: { name: "count" }, direction: "desc" }]);
    assert.equal(buildCountPayload({}, 1, 2).compositeQuery.queries[0].spec.groupBy, undefined);
  });
});

describe("formatLogLine", () => {
  const base = {
    body: "boom", severity_text: "Error", trace_id: "t1", id: "i1", timestamp: 1,
    resources_string: { "service.name": "svc" }, attributes_number: { StatusCode: 500 }, attributes_string: { "http.route": "/orders" },
  };
  test("prints time, severity, service, body and trace_id", () =>
    assert.equal(formatLogLine(logRow(base)), '2026-09-28T11:59:59.123Z Error       svc | boom | {"trace_id":"t1"}'));
  test("adds requested fields from attribute and resource bags", () =>
    assert.equal(formatLogLine(logRow(base), ["StatusCode", "http.route", "missing"]).split(" | ")[2],
      '{"StatusCode":500,"http.route":"/orders","trace_id":"t1"}'));
  test("shows selectFields columns carried at the top level", () => {
    const line = formatLogLine(logRow({ body: "x", id: "i", timestamp: 1, Elapsed: 2.5 }));
    assert.equal(line, '2026-09-28T11:59:59.123Z -           - | x | {"Elapsed":2.5}');
  });
  test("truncates and flattens long bodies unless full", () => {
    const body = "a\n" + "b".repeat(600);
    const short = formatLogLine(logRow({ body })).split(" | ")[1];
    assert.equal(short.length, 503);
    assert.ok(short.startsWith("a \\n b") && short.endsWith("..."));
    assert.equal(formatLogLine(logRow({ body }), [], true).split(" | ")[1], body);
  });
});

describe("formatResult", () => {
  test("raw rows with cursor and warnings", () => {
    const cursor = Buffer.from("1790604000000").toString("base64");
    const out = formatResult({
      warning: { message: "top", warnings: [{ message: "inner" }] },
      data: { results: [{ queryName: "A", nextCursor: cursor, rows: [logRow({ body: "b" })] }] },
    });
    assert.deepEqual(out, [
      "# warning: top", "# warning: inner", "# A: 1 rows", "2026-09-28T11:59:59.123Z -           - | b",
      `# nextCursor: ${cursor} (last row 2026-09-28T14:00:00.000Z)`,
    ]);
  });
  test("scalar table, null printed as None", () => {
    const out = formatResult({ data: { results: [{ queryName: "A", columns: [{ name: "svc" }, { name: "__result_0" }], data: [["a", 3], [null, 1]] }] } });
    assert.deepEqual(out, ["# A", "svc\t__result_0", "a\t3", "None\t1"]);
  });
  test("time series sorted chronologically with rounded values", () => {
    const out = formatResult({ data: { results: [{ queryName: "F1", aggregations: [{ index: 0, series: [{
      labels: [{ key: { name: "service.name" }, value: "svc" }],
      values: [{ timestamp: 1790604000000, value: 0.000862999 }, { timestamp: 1790603700000, value: 2 }],
    }, { values: [] }] }] }] } });
    assert.deepEqual(out, [
      "# F1 aggregation 0",
      "## service.name=svc | points=2 sum=2.00086",
      "2026-09-28T13:55:00.000Z\t2",
      "2026-09-28T14:00:00.000Z\t0.000862999",
      "## (all) | points=0 sum=0",
    ]);
  });
  test("unknown result shapes are printed as JSON", () =>
    assert.deepEqual(formatResult({ data: { results: [{ queryName: "X", other: 1 }] } }), ['{"queryName":"X","other":1}']));
});

describe("formatKeys and formatValues", () => {
  test("keys sorted with context and type, incomplete flagged", () => {
    const out = formatKeys({ complete: false, keys: {
      b: [{ fieldContext: "attribute", fieldDataType: "string" }, { fieldContext: "attribute", fieldDataType: "number" }],
      a: [{ fieldContext: "resource", fieldDataType: "string" }],
    } });
    assert.deepEqual(out, ["a\tresource:string", "b\tattribute:string, attribute:number", "# incomplete list, narrow with --search"]);
  });
  test("values of every kind", () =>
    assert.deepEqual(formatValues({ complete: true, values: { stringValues: ["x"], numberValues: [1], boolValues: null } }),
      ["x\tstringValues", "1\tnumberValues"]));
});

describe("run argument validation", () => {
  const env = { SIGNOZ_URL: "http://127.0.0.1:9", SIGNOZ_API_KEY: "k", SIGNOZ_TZ: "UTC" };
  test("unknown command", () => assert.rejects(run(["nope"], { env }), /usage/));
  test("wrong positional count", () => assert.rejects(run(["api", "GET"], { env }), /expected 2 positional/));
  test("unknown option", () => assert.rejects(run(["logs", "--bogus"], { env }), SignozError));
  test("invalid limit", async () => {
    await assert.rejects(run(["logs", "--limit=-1"], { env }), /non-negative/);
    await assert.rejects(run(["count", "--limit", "ten"], { env }), /non-negative/);
  });
  test("missing SIGNOZ_URL", () => assert.rejects(run(["api", "GET", "/api/v1/version"], { env: { SIGNOZ_API_KEY: "k" } }), /SIGNOZ_URL is not set/));
  test("missing SIGNOZ_API_KEY", () => assert.rejects(run(["api", "GET", "/api/v1/version"], { env: { SIGNOZ_URL: "http://x" } }), /SIGNOZ_API_KEY is not set/));
  test("unreachable host", () => assert.rejects(run(["api", "GET", "/api/v1/version"], { env }), /connection failed/));
});

describe("HTTP against a mock server", () => {
  let server;
  let url;
  let dir;
  const requests = [];

  const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "signoz-test-"));
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const u = new URL(req.url, "http://x");
        requests.push({ method: req.method, path: u.pathname, query: u.searchParams, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        if (u.pathname === "/api/v1/version") return json(res, 200, { version: "v0.143.0" });
        if (u.pathname === "/api/v2/rules/bad") return json(res, 400, { status: "error", error: { message: "nope" } });
        if (u.pathname === "/api/v1/fields/keys") return json(res, 200, { status: "success", data: { complete: true, keys: { "service.name": [{ fieldContext: "resource", fieldDataType: "string" }] } } });
        if (u.pathname === "/api/v1/fields/values") return json(res, 200, { status: "success", data: { complete: true, values: { stringValues: ["Error"] } } });
        if (u.pathname === "/api/v5/query_range") {
          const body = JSON.parse(raw);
          if (body.requestType === "raw") return json(res, 200, { status: "success", data: { data: { results: [{ queryName: "A", rows: [logRow({ body: "hello" })] }] } } });
          if (body.requestType === "scalar") return json(res, 200, { status: "success", data: { data: { results: [{ queryName: "A", columns: [{ name: "n" }], data: [[7]] }] } } });
          return json(res, 400, { status: "error", error: { message: "bad query" } });
        }
        if (u.pathname === "/api/v2/dashboards" && req.method === "POST") return json(res, 201, { status: "success", data: { id: "d1" } });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html>");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const env = () => ({ SIGNOZ_URL: url + "/", SIGNOZ_API_KEY: "test-key", SIGNOZ_TZ: "UTC" });
  const collect = async (argv, opts = {}) => {
    const lines = [];
    const code = await run(argv, { env: env(), print: (l) => lines.push(l), ...opts });
    return { code, lines, req: requests.at(-1) };
  };

  test("sends the API key header and strips the trailing slash of SIGNOZ_URL", async () => {
    const { code, lines, req } = await collect(["api", "get", "api/v1/version"]);
    assert.equal(code, 0);
    assert.deepEqual(lines, ["HTTP 200", '{"version":"v0.143.0"}']);
    assert.equal(req.headers["signoz-api-key"], "test-key");
    assert.equal(req.method, "GET");
    assert.equal(req.path, "/api/v1/version");
  });

  test("api returns exit code 1 on HTTP errors and prints the body", async () => {
    const { code, lines } = await collect(["api", "GET", "/api/v2/rules/bad"]);
    assert.equal(code, 1);
    assert.equal(lines[0], "HTTP 400");
    assert.match(lines[1], /nope/);
  });

  test("HTML response means the route does not exist", () =>
    assert.rejects(collect(["api", "GET", "/api/v1/dashboards"]), /route GET \/api\/v1\/dashboards does not exist/));

  test("api posts a file body and writes --out", async () => {
    const data = join(dir, "dash.json");
    const out = join(dir, "resp.json");
    writeFileSync(data, '{"schemaVersion":"v6"}');
    const { code, lines, req } = await collect(["api", "POST", "/api/v2/dashboards", "--data", data, "--out", out]);
    assert.equal(code, 0);
    assert.deepEqual(req.body, { schemaVersion: "v6" });
    assert.equal(req.headers["content-type"], "application/json");
    assert.match(lines[0], /^HTTP 201, \d+ bytes written to /);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).data.id, "d1");
  });

  test("api reads the body from stdin with --data -", async () => {
    const { req } = await collect(["api", "POST", "/api/v2/dashboards", "--data", "-"], { readStdin: () => Buffer.from('{"a":1}') });
    assert.deepEqual(req.body, { a: 1 });
  });

  test("logs sends a raw query with the time window and prints lines", async () => {
    const { lines, req } = await collect(["logs", "--filter", "severity_number >= 17", "--start", "1000", "--end", "2000", "--limit", "3"]);
    assert.equal(req.path, "/api/v5/query_range");
    assert.deepEqual([req.body.start, req.body.end, req.body.requestType], [1000, 2000, "raw"]);
    assert.equal(req.body.compositeQuery.queries[0].spec.limit, 3);
    assert.deepEqual(lines, ["# 1970-01-01T00:00:01.000Z .. 1970-01-01T00:00:02.000Z", "# A: 1 rows", "2026-09-28T11:59:59.123Z -           - | hello"]);
  });

  test("count prints a table", async () => {
    const { lines, req } = await collect(["count", "--by", "service.name", "--since", "5m"]);
    assert.equal(req.body.requestType, "scalar");
    assert.equal(req.body.end - req.body.start, 300_000);
    assert.deepEqual(lines.slice(1), ["# A", "n", "7"]);
  });

  test("query applies defaults and surfaces API errors", async () => {
    const file = join(dir, "q.json");
    writeFileSync(file, JSON.stringify({ requestType: "time_series", compositeQuery: { queries: [] } }));
    await assert.rejects(collect(["query", file, "--since", "1h"]), /HTTP 400: .*bad query/);
    const { body } = requests.at(-1);
    assert.equal(body.schemaVersion, "v1");
    assert.equal(body.formatOptions.fillGaps, true);
    assert.equal(body.end - body.start, 3600_000);
  });

  test("query --json and --out", async () => {
    const file = join(dir, "s.json");
    const out = join(dir, "s.out.json");
    writeFileSync(file, JSON.stringify({ requestType: "scalar", compositeQuery: { queries: [] } }));
    const asJson = await collect(["query", file, "--json"]);
    assert.equal(JSON.parse(asJson.lines[0]).data.results[0].queryName, "A");
    const toFile = await collect(["query", file, "--out", out]);
    assert.deepEqual(toFile.lines, [`written to ${out}`]);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).data.results[0].data[0][0], 7);
  });

  test("keys and values pass query parameters", async () => {
    const keys = await collect(["keys", "--search", "serv", "--context", "resource", "--signal", "traces"]);
    assert.deepEqual(keys.lines, ["service.name\tresource:string"]);
    assert.equal(keys.req.query.get("searchText"), "serv");
    assert.equal(keys.req.query.get("fieldContext"), "resource");
    assert.equal(keys.req.query.get("signal"), "traces");
    const values = await collect(["values", "severity_text", "--filter", "service.name = 'a'"]);
    assert.deepEqual(values.lines, ["Error\tstringValues"]);
    assert.equal(values.req.query.get("name"), "severity_text");
    assert.equal(values.req.query.get("existingQuery"), "service.name = 'a'");
  });

  test("CLI process: exit codes and stderr", async () => {
    const exec = promisify(execFile);
    const ok = await exec(process.execPath, [CLI, "api", "GET", "/api/v1/version"], { env: { ...process.env, ...env() } });
    assert.match(ok.stdout, /^HTTP 200\r?\n/);
    await assert.rejects(
      exec(process.execPath, [CLI, "api", "GET", "/api/v1/nothing"], { env: { ...process.env, ...env() } }),
      (err) => err.code === 1 && /does not exist/.test(err.stderr) && err.stdout === "",
    );
    await assert.rejects(
      exec(process.execPath, [CLI, "logs"], { env: { ...process.env, SIGNOZ_URL: "", SIGNOZ_API_KEY: "" } }),
      (err) => err.code === 1 && /SIGNOZ_URL is not set/.test(err.stderr),
    );
  });
});

const live = process.env.SIGNOZ_LIVE === "1" && process.env.SIGNOZ_URL && process.env.SIGNOZ_API_KEY;

describe("live instance (read-only)", { skip: !live && "set SIGNOZ_LIVE=1, SIGNOZ_URL and SIGNOZ_API_KEY" }, () => {
  const collect = async (argv) => {
    const lines = [];
    const code = await run(argv, { print: (l) => lines.push(l) });
    return { code, lines };
  };

  test("version", async () => {
    const { code, lines } = await collect(["api", "GET", "/api/v1/version"]);
    assert.equal(code, 0);
    assert.match(lines[1], /"version":"v\d+\.\d+\.\d+"/);
  });

  test("service.name is a known log field", async () => {
    const { lines } = await collect(["keys", "--search", "service.name"]);
    assert.ok(lines.some((l) => l.startsWith("service.name\tresource:string")));
  });

  test("count logs of the last 5 minutes", async () => {
    const { lines } = await collect(["count", "--by", "service.name", "--since", "5m", "--limit", "3"]);
    assert.equal(lines[1], "# A");
    assert.equal(lines[2], "service.name\t__result_0");
  });

  test("raw logs return rows", async () => {
    const { lines } = await collect(["logs", "--since", "15m", "--limit", "2"]);
    assert.match(lines[1], /^# A: \d+ rows$/);
  });
});
