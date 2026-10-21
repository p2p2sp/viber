## Roadmap

Part 1 of 3 - Build and publish scripts

1. Build and publish scripts (`viber/scripts/`, `task-reviewer.md`) (this plan)
2. Hooks, setup and the commit skill: findings 8, 9, 10 and U18-1, U18-2, U9-2, U9-3, U10-1, U13-1, U13-2, U13-3, U16-1
   - Each finding gets a regression test built from its reproduction.
   - `shell-guard.sh` tokenizes the command in one awk pass reading stdin.
   - `bootstrap.sh` ends a group by the same rule as `config.sh`.
3. Remaining skills, release and devtools: findings 3, 5 and U22-2, U14-1, U14-2, U15-1, U15-2, U15-3, U20-1, U20-2, U19-1, U19-2, U19-3
   - Each finding gets a regression test built from its reproduction.
   - `release.sh` builds its manifest list from `marketplace.json`.
   - `query` in `signoz.mjs` has no default `--since`.
   - Unknown: whether the devtools plugin cache is keyed by its version, resolved by reading the Claude Code plugin documentation at the start of part 3's plan.
