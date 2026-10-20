#!/usr/bin/env bash
# Launch one Codex worker; raw JSONL goes to logs/ unedited.
# usage: run_worker.sh <brief-name-without-.md> [model] [effort]
set -u
R="C:/Users/Nxiss/AppData/Local/hermes/profiles/helios-local/workspaces/policycanary"
cd "$R"
B="$1"; M="${2:-gpt-6-astra}"; E="${3:-high}"
codex exec --json --skip-git-repo-check -m "$M" -c model_reasoning_effort="$E" -C "$R" "$(cat "briefs/$B.md")" \
  > "logs/$B.jsonl" 2> "logs/$B.stderr.log"
echo "$B exit $?"
