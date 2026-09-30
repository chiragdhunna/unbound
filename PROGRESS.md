# PROGRESS

## Milestones
- ✅ M0 — Scaffold, tooling, gates
  - ✅ Move requirements doc to `/docs/REQUIREMENTS.md`
  - ✅ Scaffold Vite + React + TypeScript strict baseline
  - ✅ Add ESLint, Prettier, Vitest, Playwright, and initial smoke tests
  - ✅ Create `DECISIONS.md`, `docs/TRACEABILITY.md`, `scripts/verify.sh`, CI workflows
  - ✅ Run verification gate and record output
- 🟨 M1 — Core engine
  - ✅ Add core contracts and typed errors (`types`, `errors`)
  - ✅ Implement initial detection for signatures + text/code extensions
  - ✅ Add converter registry and text/json/xml/code/markdown converters
  - ✅ Wire file input to conversion pipeline for txt/md/json/xml/code
  - ✅ Add unit/e2e tests for `.txt` and `.json` upload and conversion output
  - ⬜ Implement queue (concurrency, cancel, progress)
  - ⬜ Add worker RPC + ADR-5 spike decision record
  - ⬜ Expand detection matrix coverage for mismatches + ZIP introspection
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

### 2026-09-30 — Security patch: Vite
- Upgraded `vite` from 5.4.21 to 6.4.3 to address `server.fs.deny` bypass advisory ranges affecting older versions.
- Verification evidence:
  - `bash scripts/verify.sh` ✅
  - `npm audit --omit=dev --audit-level=high` ✅ (0 vulnerabilities)
- Next steps:
  - Continue M1 queue/cancel/progress and worker RPC slice.
- Blockers: none.

### 2026-09-30 — M1 slice 1
- Added core contracts in `src/core/types.ts` and typed errors in `src/core/errors.ts`.
- Added shared markdown normalizer and baseline `detectFileKind()` implementation.
- Added lazy converter registry and converters for text, markdown, json, xml, and code.
- Wired the app shell file picker to conversion pipeline and output preview.
- Added unit tests for detection, pipeline, JSON conversion, and app upload flow.
- Expanded e2e smoke coverage for `.txt` and `.json` uploads on desktop + mobile Chromium.
- Verification evidence:
  - `bash scripts/verify.sh` ✅
    - lint ✅
    - typecheck ✅
    - unit tests ✅ (10 passed)
    - build ✅
    - playwright e2e ✅ (6 passed)
- Next steps:
  - Implement `queue.ts` with cancel/progress/concurrency and wire through UI state model.
  - Add ZIP introspection detection and mismatch-warning plumbing.
  - Run ADR-5 worker spike and record outcome in `DECISIONS.md`.
- Blockers: none.

### 2026-09-30 — M0 completion
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
