# PROGRESS

## Milestones
- ✅ M0 — Scaffold, tooling, gates
  - ✅ Move requirements doc to `/docs/REQUIREMENTS.md`
  - ✅ Scaffold Vite + React + TypeScript strict baseline
  - ✅ Add ESLint, Prettier, Vitest, Playwright, and initial smoke tests
  - ✅ Create `DECISIONS.md`, `docs/TRACEABILITY.md`, `scripts/verify.sh`, CI workflows
  - ✅ Run verification gate and record output
- ⬜ M1 — Core engine
- ⬜ M2 — Output experience & app shell
- ⬜ M3 — DOCX
- ⬜ M4 — XLSX / XLS / CSV
- ⬜ M5 — PDF (text)
- ⬜ M6 — OCR (scanned PDF + images)
- ⬜ M7 — PPTX
- ⬜ M8 — P1 formats: RTF, HTML file, URL
- ⬜ M9 — P2 formats: EPUB, ZIP/folders
- ⬜ M10 — Edge cases & robustness sweep
- ⬜ M11 — Accessibility, mobile, performance, privacy hardening
- ⬜ M12 — Docs, deploy, final audit

## Iteration Log
### 2026-09-30
- Started and completed M0 baseline setup.
- Moved requirements source file to `docs/REQUIREMENTS.md` without content changes.
- Initialized Vite + React + TypeScript strict scaffold and replaced starter UI with the Unbound shell + tokenized styles + self-hosted mono fonts.
- Added ESLint/Prettier/Vitest/Playwright configuration and initial unit/e2e smoke tests.
- Added `scripts/verify.sh`, CI workflow, and `copilot-setup-steps` workflow.
- Seeded `docs/TRACEABILITY.md` from requirements sections 2, 4, 5, 6, 7, 8, 9, and 11.
- Addressed CodeQL workflow-permissions findings by adding explicit `permissions: contents: read` to workflows.
- Verification evidence:
  - `bash scripts/verify.sh` ✅
    - lint ✅
    - typecheck ✅
    - unit tests ✅ (1 passed)
    - build ✅
    - playwright e2e ✅ (2 passed)
- Next steps:
  - Start M1 with core contracts (`types`, `errors`, `detect`, `registry`, `queue`) and detection matrix tests.
- Blockers: none.
