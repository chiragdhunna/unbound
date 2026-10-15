# AGENTS.md — Agent Guidance for Unbound

## Authoritative Documents
- **Requirements**: `docs/REQUIREMENTS.md` (scope and mandatory behavior)
- **Plan**: `PLAN.md` (implementation order and acceptance criteria)
- **Architecture**: `docs/ARCHITECTURE.md` (module boundaries, data flow, current state)
- **Decisions**: `DECISIONS.md` (justified deviations and consequences)
- **Progress**: `PROGRESS.md` (milestone checklist and verification results)
- **Traceability**: `docs/TRACEABILITY.md` (requirement ↔ test mapping and status)

## Active Task and Acceptance Criteria
Before starting work, the agent **must**:
1. Read the current active task description (if provided by the user).
2. Review the acceptance criteria in `PLAN.md` and `docs/TRACEABILITY.md` for the relevant requirement(s).
3. Understand the `Definition of Done`: the gate script (`scripts/verify.sh`) exits 0 and every row in `docs/TRACEABILITY.md` relevant to the task is ✅ with a real test path that exists and passes.

## Build/Test Commands and Browser Provisioning
- **Install**: `npm ci`
- **Dev server**: `npm run dev`
- **Build**: `npm run build`
- **Unit tests**: `npm run test:unit`
- **E2E tests**: `npm run test:e2e` (requires Chromium and WebKit with system dependencies)
- **Verification gate**: `npm run verify` (runs lint, typecheck, build, unit tests, and E2E tests)
- **Browser provisioning**: The CI installs Chromium and WebKit via Playwright. Locally, run `npx playwright install-deps` to install system dependencies, then `npx playwright install` to install browsers.

## Implementation Requirements
- **Implementation plus meaningful regression tests**: For every fix or feature, add a regression test that captures the defect and verifies the fix. Do not rely solely on existing test totals, comments, or toasts to claim completion.
- **Explicit blocked/unverified statuses**: In `docs/TRACEABILITY.md`, use ⬜ for blocked/unverified, ✅ for passing, and ❌ for failing. Do not weaken thresholds or skip failing required checks.
- **No completion claims from old evidence**: Do not claim a requirement is implemented based on old test totals, comments, or toasts alone. Verify with current test runs and explicit assertions.

## Prohibitions
- Do not weaken test thresholds, budgets, or timeouts to make a test pass.
- Do not skip failing required checks; fix the code or document why infeasible in `DECISIONS.md`.
- Do not claim completion from historical audit reports or outdated traceability.
- Do not add backend, summarization, accounts, or unrelated scope to compensate for unfinished acceptance criteria.
- Do not edit `scripts/verify.sh`, `.github/workflows/*`, or lint and test configs to reduce what is checked.

## Concise Guidance
This file links to the authoritative documents. Read the active task and acceptance criteria first. Implement with regression tests. Update traceability and decisions as needed. Verify with the gate script before claiming completion.