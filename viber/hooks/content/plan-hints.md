Plain plan mode. The plan is the implementing agent's only brief: write the rules under "Into the plan" into the plan itself, as instructions to that agent, not as notes to yourself.

Into the plan:
- Task list: before writing any code, create one TaskCreate task per plan task and keep each status current with TaskUpdate, so progress stays visible and survives context compaction.
- Efficient execution: state that token usage, execution time and agent drift are binding constraints; name the independent tasks and order the agent to run independent tasks in parallel subagents in the background, each subagent handed only its own task.
- Source files: name the absolute path of every `.temp/` file the plan rests on (a mockup, a findings file), so the implementing agent reads it where it lies.
- Closing review: end the plan with a task in which a subagent reviews the finished implementation against the plan; its findings are fixed before the work is reported done, and the review runs again whenever those fixes surface further errors.

For you, while writing the plan:
- Plan review: with the planning.plain-plan-review switch on (the default), dispatch the plain-plan-review agent after every write to the plan file and get its PASS on that version before ExitPlanMode, since any write after a PASS voids it. The plan names at most 8 repository files: the gate refuses a plan naming more.
