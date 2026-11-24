# viber/lib - the Node core of the plugin's scripts, behind two ports

Owns the Node modules holding script logic (the config core under `config/`, `arg-kind.ts`, `switch-text.ts`), the port types and their real adapters. It owns no entry (`../scripts/<name>.ts`) and no fake (`tests/harness/fakes.ts`).

## Terms

- Core: every module outside `adapters/` and `ports.ts`; it imports no file system, process, network or OS module and reaches the outside only through a port.
- Port: `Fs` (`readText`, `exists`, `listDir`) and `Git` (`repoRoot`, `trackedFiles`) in `ports.ts`. The ports for GitHub, the clock and the environment arrive with the first script that needs them.
- Adapter: `adapters/fs.ts` (`nodeFs`) and `adapters/git.ts` (`gitCommand`); each maps every failure to the port's empty answer (`null`, `false`, an empty list).

## Relationships

- `config/run.ts` `runConfig(argv, cwd, ports)` is the one public entry of the config core: it returns the whole stdout and never throws. `../scripts/config.ts` calls it with the adapters and prints; `../scripts/config.sh` runs that entry.
- `arg-kind.ts` `runArgKind(argv)` touches no port and returns stdout, stderr and the exit code; `switch-text.ts` `runSwitchText(argv, cwd, ports)` takes its value from `runConfig` and returns the whole stdout. Each has its entry `../scripts/<name>.ts`, run by the wrapper `../scripts/<name>.sh`.
- `tools/lint/run.ts` reads its tree through the same adapters.
- Tests: `tests/viber/config/<module>.unit.test.ts` per config module, `tests/viber/lib/<module>.unit.test.ts` per module outside `config/` (the `layering/core` rule holds both), `tests/viber/lib/fakes.unit.test.ts` and `tests/viber/lib/adapters.integration.test.ts`.

## Contracts

- The key grammar of `.claude/viber.yml` and every stdout line live in the header of `../scripts/config.ts`; the modules of `config/` split it: `lines` (groups and children), `block`, `extensions`, `branching`, `reports`, `local`.
- A fake and its adapter pass the same contract cases (`fsContract`, `gitContract` in `tests/harness/ports-contract.ts`).
- `Fs.readText` answers `null` for an absent path, a directory and an unreadable file alike.

## Change together

- A port method: `ports.ts`, its adapter, its fake in `tests/harness/fakes.ts` and the contract cases with their scene state.
- A config key or report line: the header of `../scripts/config.ts` and the module that resolves it, with its unit test.
- A switch key: the `KEYS` set of `switch-text.ts`, the header of `../scripts/switch-text.ts` and the switch table of `tools/lint/data/invocations.ts`.

## Traps

- `Fs.exists` is true for a directory: a directory named `<name>.md` under `.claude/agents/` counts as a found extension agent.
- A `.claude/viber.local.yml` that is a directory prints `# local: none | ignored: none`: the port cannot tell a directory from an unreadable file.
- A value is cut at the first blank or `#`: a quoted name holding a blank reports its cut text. An empty quote pair for a title gives the default.
- The red-check lists cut a value at a blank followed by `#`, `--questions` at the first blank or `#`: the two rules differ on purpose.
- `runSwitchText` hands the skill directory to `Fs.readText` as given, so a relative one resolves against the process cwd in the adapter.
- The map lines of `build.extensions` are classified in `config/lines.ts`, and `readChildren` skips them, so no map line is read as a child of `build:`.
