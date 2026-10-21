#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  echo "[verify] $1"
}

UNIT_OUTPUT="$(mktemp)"
E2E_OUTPUT="$(mktemp)"
trap 'rm -f "$UNIT_OUTPUT" "$E2E_OUTPUT"' EXIT

step "lockfile install"
npm ci --ignore-scripts

step "absolute path guard"
if grep -RInE '/home/' src tests --exclude=verify.sh 2>/dev/null | grep -q '.'; then
  echo "verify.sh failed: found absolute local path "/home/" in src/tests" >&2
  exit 1
fi
if grep -RInE 'C:\\Users' src tests --exclude=verify.sh 2>/dev/null | grep -q '.'; then
  echo "verify.sh found C:\\Users pattern in src/tests" >&2
  exit 1
fi
if grep -RInE '/Users/' src tests --exclude=verify.sh 2>/dev/null | grep -q '.'; then
  echo "verify.sh found /Users/ pattern in src/tests" >&2
  exit 1
fi

step "lint"
npm run lint

step "typecheck"
npm run typecheck

step "unit tests with coverage"
npm run test:unit -- --coverage --reporter=verbose 2>&1 | tee "$UNIT_OUTPUT"

step "build"
npm run build

step "bundle budget"
node scripts/check-bundle.mjs

step "playwright e2e"
npm run test:e2e 2>&1 | tee "$E2E_OUTPUT"

step "e2e guards"

  # Check that all three projects (chromium, mobile-chromium, mobile-webkit) ran

  if ! grep -q "\[mobile-webkit\]" "$E2E_OUTPUT"; then

    echo "e2e guards failed: mobile-webkit project did not run - missing [mobile-webkit] in e2e output" >&2

    exit 1

  fi



  # Check that no e2e tests were skipped

  if grep -i "skipped" "$E2E_OUTPUT" | grep -vE "^s*[0-9]+ passed" | grep -q "."; then

    echo "e2e guards failed: some e2e tests were skipped" >&2

    exit 1

  fi



  # Check for inappropriate skip calls in src/ and tests/

  if grep -RInE "\.skip\(|testInfo\.skip" src tests --exclude-dir=fixtures | grep -v "//.*justification" | grep -v "^s*[0-9]*:" | grep -q "."; then

    echo "e2e guards failed: found .skip() or testInfo.skip without justification in src/ or tests/" >&2

    exit 1

  fi

  

  # Check for eslint-disable without adjacent justification

  if grep -RInE "eslint-disable-line" src tests --exclude-dir=fixtures | grep -v "justification" | grep -q "."; then

    echo "e2e guards failed: found eslint-disable without justification in src/ or tests/" >&2

    exit 1

  fi

  

  if grep -RInE "eslint-disable" src tests --exclude-dir=fixtures | grep -v "justification" | grep -q "."; then

    echo "e2e guards failed: found eslint-disable block without justification in src/ or tests/" >&2

    exit 1

  fi

step "traceability check"
TRACEABILITY_TEST_OUTPUT="$UNIT_OUTPUT:$E2E_OUTPUT" node scripts/check-traceability.mjs

step "hygiene grep"
if grep -RInE 'TODO|FIXME|XXX|not implemented|it\.skip|test\.skip|test\.todo|describe\.skip|console\.log' src tests --exclude-dir=fixtures >/dev/null; then
  echo "Hygiene grep found prohibited markers." >&2
  exit 1
fi

step "npm audit"
npm audit --omit=dev --audit-level=high

step "summary"
echo "verify.sh complete: ci, lint, typecheck, unit+coverage, build, bundle, e2e, traceability, hygiene, audit passed"
