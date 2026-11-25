## Tasks

<!-- TASK -->
### T1 - <title>
- TDD: required | none
- Covers: AC1, AC2
- Uses: C1 | none
- Depends-on: none
- Files: <repo-relative path>, <repo-relative path>
- Delivers: <what the task produces - WHAT, never HOW>
- Verification: <command> -> <result that counts as proof>
- DoD: <observable done condition>; <the next one>; <each clause observable on its own>
<!-- /TASK -->

<!-- TASK -->
### T2 - <title>
- TDD: required | none
- Exclusive: true
- Covers: AC<n>
- Uses: C1, C2
- Depends-on: none
- Files: <repo-relative path>
- Delivers: <...>
- Verification: <...>
- DoD: <...>
<!-- /TASK -->

<!-- One TASK block per unit of work; leave every HTML marker intact. "Depends-on:" is written
     "none" on every task: a script computes it from "Files" and "Uses". Three lines are optional:
     "Exclusive: true", the only value it takes, on a task that needs a machine-wide resource
     alone, "Repro: <path>" on the task fixing a bug whose reproduction test is already RED in the
     tree - that path, also listed in "Files:", on a "TDD: none" task - and "Hard: <reason>" on a
     task whose design the plan cannot settle. -->

## Contracts

<!-- One block per shape this change introduces or consumes: signature, type, endpoint, schema,
     error code, dictionary key. "File:" says where the shape is declared, or "none".
     No contract at all -> drop this section and every task carries "Uses: none". -->

### C1 - <name>

File: <repo-relative path>, <repo-relative path> | none

<the shape itself>

### C2 - <name>

File: <...>

<...>
