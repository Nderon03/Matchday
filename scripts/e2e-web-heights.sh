#!/usr/bin/env bash
# Compactness check: measures every screen's content height (phone + desktop). With HEIGHTS_BASE set
# to an earlier measurement, fails if any screen got taller. Needs a web build in dist/ first.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p node_modules/.cache
gen=node_modules/.cache/matchday-heights.mjs
n=$(grep -n "^for (const \[vpName, vp\]" scripts/e2e-web-visual.mjs | cut -d: -f1)
head -n $((n-1)) scripts/e2e-web-visual.mjs > $gen
sed -n '/^const FIT_ROUTES = \[/,/^\];/p' scripts/e2e-web-visual.mjs >> $gen
sed '/^import /d' scripts/e2e-web-heights.body.mjs >> $gen
sed -i "1i import { writeFileSync, readFileSync, existsSync } from 'node:fs';" $gen
node $gen
