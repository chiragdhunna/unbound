#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  echo "[verify] $1"
}

step "lint"
npm run lint

step "typecheck"
npm run typecheck

step "unit tests"
npm run test:unit

step "build"
npm run build

step "playwright e2e"
npm run test:e2e

step "summary"
echo "verify.sh complete: lint, typecheck, unit, build, e2e passed"
