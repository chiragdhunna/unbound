# AGENTS.md — Maintenance Guide for Unbound

## Authoritative Documents
- **Requirements**: `docs/REQUIREMENTS.md` (mandatory behaviors and format limits)
- **Plan**: `PLAN.md` (implementation phases and acceptance criteria)
- **Architecture**: `docs/ARCHITECTURE.md` (module boundaries, pipeline flow)
- **Decisions**: `DECISIONS.md` (append-only ADRs and deviation rationale)
- **Progress**: `PROGRESS.md` (append-only milestone log and test evidence)
- **Traceability**: `docs/TRACEABILITY.md` (requirement ↔ automated test matrix)
- **Historical**: `docs/archive/` (superseded audit reports and legacy prompts)

## Standard Commands
- **Install**: `npm ci`
- **Dev Server**: `npm run dev`
- **Build**: `npm run build`
- **Unit Tests**: `npm run test:unit` (or `npm run test:unit -- --coverage`)
- **E2E Tests**: `npm run test:e2e` (Chromium, Mobile Chromium, Mobile WebKit)
- **Verification Gate**: `npm run verify` (runs full CI suite locally)

## Core Prohibitions
- Never weaken test thresholds, coverage targets, bundle budgets, or timeouts.
- Never edit `scripts/verify.sh`, `.github/workflows/*`, or test/lint configs to pass checks.
- Never loosen the Content Security Policy in `index.html`, `_headers`, or `vercel.json`.
- Never commit absolute local paths (`/home/`, `/Users/`, `C:\Users`).
- Never run `npm audit fix --force` or touch vendored libraries (`vendor/`).
- Never claim completion without current passing test runs and explicit evidence.

## Definition of Done
Before claiming any task complete:
1. Run `npm run verify` and ensure it exits 0.
2. Ensure every touched requirement in `docs/TRACEABILITY.md` points to passing tests.
3. Keep `PROGRESS.md` and `DECISIONS.md` append-only; update `README.md` as needed.
