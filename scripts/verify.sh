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
