# Final review 1 (T1-T8)

## Minor

1. viber/scripts/plan-index.sh:907-908 and 918-919 - the comments say the contract `File:` rule is "exempted under --split alone" / "required everywhere outside --split", and that only `--split` may meet an appendix predating the field. T2 made the awk `mode` `--split` for a plain call with `status.md` beside the plan (line 403) and `--extra` already ran as `--split`, so a landed plan in plain mode gets the same exemption. Proof: `awk_mode="--split"` at line 403 feeds the `mode == "--split"` test at line 908. Fix: reword both comments to "under --split, under --extra and on a landed plan in plain mode", as the header at lines 240-247 now does.
