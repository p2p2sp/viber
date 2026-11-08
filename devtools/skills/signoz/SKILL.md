---
name: signoz
description: SigNoz logs, dashboards and alerts through its HTTP API.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/scripts/signoz.mjs" zone)
---

# signoz

Environment: !`for v in SIGNOZ_URL SIGNOZ_API_KEY; do if test -n "$(printenv "$v")"; then echo "$v set"; else echo "$v MISSING"; fi; done`

Display zone: !`node "${CLAUDE_SKILL_DIR}/scripts/signoz.mjs" zone`

## Connection

- If the Environment line shows MISSING, name each missing variable to the user (`SIGNOZ_URL`: instance base URL, e.g. `http://host:8080`; `SIGNOZ_API_KEY`: API key) and stop: run nothing else. Never hardcode a value.
- The key is sent as header `SIGNOZ-API-KEY`.
- Before the first write, read the key's role with `api GET /api/v1/service_accounts/me`.
- The references target SigNoz v0.143.0. If `api GET /api/v1/version` reports another version, grep the instance's own OpenAPI spec before trusting a route or schema.
- Run every call through the helper, never raw curl: `node "${CLAUDE_SKILL_DIR}/scripts/signoz.mjs" <command>` (Node 20+, no dependencies). It adds auth, fixes Git Bash path mangling, fills time ranges and prints compact output.
- After changing the helper, run `node --test "${CLAUDE_SKILL_DIR}/scripts/signoz.test.mjs"`; add `SIGNOZ_LIVE=1` to include read-only checks against the instance.
- Save payloads, backups and dumps under `.temp/signoz/` at the repo root.

## Helper commands

- `logs [--filter EXPR] [--since 1h] [--limit 50] [--fields a,b] [--asc] [--cursor C] [--full]`: raw logs, one line each (time, severity, service, body, extra fields, trace_id). Prints `nextCursor` when more rows exist; pass it back with `--cursor` and the same filter and range.
- `count [--filter EXPR] [--by a,b] [--since 1h] [--limit 20]`: log count grouped by fields, sorted desc.
- `keys [--search TEXT] [--context resource|attribute|log]`: field names with context and type.
- `values NAME [--search TEXT] [--filter EXPR]`: known values of one field.
- `query FILE [--since 1h | --start T --end T] [--json | --out FILE]`: POST a `/api/v5/query_range` body; `start`/`end` are filled from the flags. Prints tables for scalar, chronological zero-filled series for time_series, log lines for raw.
- `api METHOD PATH [--data FILE|-] [--out FILE]`: any endpoint. Use `--out` for dashboards and large lists so they do not flood the context.
- Time: `--since` takes `30s`, `15m`, `1h`, `2d`, `1w`; `--start`/`--end` take epoch ms or ISO 8601, read in the display zone when the ISO carries no offset.
- SigNoz stores and returns UTC; the helper prints every time in the display zone with its offset. Give the user times in that zone exactly as printed, never converted back to UTC. If the Display zone line shows INVALID, tell the user to fix `SIGNOZ_TZ` (an IANA name like `Europe/Warsaw`) and stop. Raw `--json`/`--out` dumps, `api` responses and ClickHouse SQL stay UTC: convert them to the display zone before reporting; in SQL use `toTimeZone(timestamp, '<zone>')`.

## Log analysis

1. Resolve names first: `keys --search <word>` for fields, `values service.name --search <part>` for exact values. Never guess a service or attribute name.
2. Aggregate before reading: `count --by service.name,severity_text`, then narrow with `--filter`. For trends write a `time_series` query.
3. Read raw logs last, filtered and with a small `--limit`. Add `--fields` for the attributes that matter.
4. Follow a request across services with `--filter "trace_id = '<id>'" --asc`.
5. Report numbers with the time range the helper printed.

Log facts:
- Filter errors with `severity_number >= 17`, not `severity_text`: text values depend on the logging library and compare case-sensitively. List them with `values severity_text`.
- `service.name` is a resource field; resource filters are the cheapest, so include one when the question allows.
- Structured log properties are attributes; find their names with `keys`.

Writing a filter, an aggregation, a formula, ClickHouse SQL or paginating: read `${CLAUDE_SKILL_DIR}/references/logs-query.md`.

## Role permissions

- Viewer: read all telemetry and objects, no writes.
- Editor: also full CRUD on dashboards, alert rules, planned maintenance, saved views, log pipelines; read and test notification channels. Lock and unlock only dashboards the key's account created.
- Admin only: creating, editing or deleting notification channels, public dashboards, users, service accounts, roles, TTL settings.
- When the role lacks a permission, tell the user which role is needed; never look for a workaround.

## Write safety

- Before PUT, PATCH or DELETE on an object this session did not create, show the user what changes and get confirmation.
- Before any PUT or PATCH, save the current object to `.temp/signoz/backup-<type>-<id>.json` with `api GET ... --out`.
- Prefer PATCH for small dashboard edits; PUT replaces the whole object.
- Never edit dashboards with `source` other than `user` or with `locked: true`; the API rejects them.
- Never call a channel test or rule test endpoint without asking: both send real notifications.
- Confirm the notification channel with the user before creating an alert rule.
- After a write, GET the object again and verify the change.

## Resources

- Dashboards (v2 API, Perses-based `schemaVersion: "v6"`): read `${CLAUDE_SKILL_DIR}/references/dashboards.md`; start from `${CLAUDE_SKILL_DIR}/templates/dashboard-v6.json`.
- Alert rules, channels, planned maintenance, alert history, firing alerts: read `${CLAUDE_SKILL_DIR}/references/alerts.md`; start from `${CLAUDE_SKILL_DIR}/templates/rule-logs-threshold.json`.
- Any other endpoint (saved views, services, metrics, traces, pipelines, fields): read `${CLAUDE_SKILL_DIR}/references/endpoints.md`.
- A schema or route none of the above covers: grep `${CLAUDE_SKILL_DIR}/references/openapi-v0.143.0.yml` (28k lines, never read it whole). Routes: `grep -n "^  /api/v2/dashboards" FILE`, then read about 80 lines from the hit. Schemas: `grep -n "^    DashboardtypesPostableDashboardV2:" FILE`.

## Errors

- `got the web UI HTML`: the route does not exist in this version; check `endpoints.md` or the OpenAPI file.
- HTTP 400 with `error.message`: fix the payload as the message says. Unknown JSON fields are rejected, so never add fields the reference does not list.
- HTTP 403 `authz_forbidden`: Editor lacks the permission; report it, do not retry.
