#!/usr/bin/env bash
# Hostile-data check: every screen with (1) everything empty and (2) realistic data with fields
# randomly blanked (several patterns). A screen showing the error safety net is a failure.
# Uses the visual test's fake server. Needs a web build in dist/ first.
set -euo pipefail
cd "$(dirname "$0")/.."
gen=scripts/.hostile.generated.mjs
n=$(grep -n "^for (const \[vpName, vp\]" scripts/e2e-web-visual.mjs | cut -d: -f1)
head -n $((n-1)) scripts/e2e-web-visual.mjs > $gen
sed -n '/^const FIT_ROUTES = \[/,/^\];/p' scripts/e2e-web-visual.mjs >> $gen
cat scripts/e2e-web-hostile.body.mjs >> $gen
status=0
MODE=empty node $gen || status=1
for seed in ${HOSTILE_SEEDS:-7 11 23 101 202 303 404}; do SEED=$seed MODE=holes node $gen || status=1; done
rm -f $gen
exit $status
