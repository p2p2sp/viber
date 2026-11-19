After a `NEXT: fix` fix that changes the plan's title, issue reference or a task's `Repro:` line, run the branch step's last `plan-path.sh --branch` command again before dispatching:

- `next: write` replaces the recorded `work:` and `branch:` keys only when its values differ, then shows `show:` again.
- A question is asked again only when its `option:` lines differ from the ones last answered; otherwise the recorded keys stand.
