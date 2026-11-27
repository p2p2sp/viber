# Przeniesienie z `viber` 0.x do `viber` 1.0

Decyzje o tym, co z brakujących elementów `viber` 0.x trafia do `viber` 1.0.

## Przenosimy
Przeniesienie oznacza przepisanie pod kątem optymalizacji, z ekstremalnym cięciem tekstów instrukcji skilli i agentów.

Nic nie zostało: wszystko z tej listy jest przeniesione.

## Pomijamy
- `e2e`: instalacja Playwrighta przez skill, commit testów, lista zadań sesji, pytanie po drugim `FAIL`, werdykt `DENIED`, tabela ASCII w raporcie.
- `tiers` (zakres modeli `min`/`max`).
- `red-check` w osobnym worktree, `baseline-tests`, `arbiter`.
- Wyłączniki `build.final-review`, `build.memory`, `build.cleanup`.
- GitHub: `github.issues`, `issue-title`, `pr-title`.
- Konfiguracja: `planning.questions-per-round`, `.claude/viber.local.yml`.
- Hooki: `kill-guard`, `shell-guard`, `file-guard`, `verdict-nudge`, `plan-hints` z `outside-plan-review`, `register.tsx`.
- `extension`: fazy jako forkowane skille, adaptacja istniejącego agenta, marker `<!-- viber:extension -->`, przegląd przez `skill-designer`, `Bash` w szablonie agenta, raport `LISTED`/`MISSING`, linia `parallel: false` we wpisie.
- `memory` i `rules`: mapa kandydatów katalogów, osobni audytorzy, ślad `failures.md`, podkatalogi obszarów i prefiks `_` w regułach.

## Nierozstrzygnięte
- Branching (własna gałąź runu, `run-branch.sh`): krok builda czy konfiguracja.
- Martwy klucz `branching` w `skills/setup/templates/viber.yml`: nic go nie czyta.
