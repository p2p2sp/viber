# Rulings

- T6: accept | why: The last review (review-T6-7.md) blocks only on the untracked scratch file work/T6-notes.md and says nothing else in the task needs to change. review-round.sh carries the start event and docs/files.md names its state file, so the work appears to meet DoD.1-6 in substance (an inference, since no review flagged any DoD gap). | cost if wrong: If a DoD gap is hidden, T7 builds its returned events on a faulty start and has to redo it. The stray T6-notes.md placeholder stays untracked in the run's work directory until something removes it.
