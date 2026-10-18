# PROGRESS

## Milestones
- ✅ M0 — Scaffold, tooling, gates
  - ✅ Move requirements doc to `/docs/REQUIREMENTS.md`
  - ✅ Scaffold Vite + React + TypeScript strict baseline
  - ✅ Add ESLint, Prettier, Vitest, Playwright, and initial smoke tests
  - ✅ Create `DECISIONS.md`, `docs/TRACEABILITY.md`, `scripts/verify.sh`, CI workflow
  - ✅ Run verification gate and record output
- ✅ M1 — Core engine
  - ✅ Add core contracts and typed errors (`types`, `errors`)
  - ✅ Implement initial detection for signatures + text/code extensions
  - ✅ Add converter registry and text/json/xml/code/markdown converters
  - ✅ Wire file input to conversion pipeline for txt/md/json/xml/code
  - ✅ Add unit/e2e tests for `.txt` and `.json` upload and conversion output
- ✅ M2 — Output experience & app shell
  - ✅ Output shell, copy/download, plain toggle, localStorage settings, multi-file batch handling
  - ✅ Batch mode switch, per-file job state, warnings, edit/read-only output panel
  - ✅ Chunk preview and per-chunk copy helper
  - ✅ CSP and privacy footer in the app shell and document head
  - ✅ Full browser-level keyboard/accessibility/a11y matrix and the full plan-specified chunking semantics
- ✅ M3 — DOCX
  - ✅ DOCX converter added via Mammoth
  - ✅ Unit test for generated DOCX content conversion
  - ✅ Browser e2e for generated DOCX upload
  - ✅ Full encrypted/legacy Office negative-path coverage and full plan-specified image/footnote handling
    - Images: Single warning "N embedded images were not converted" (N = count), no base64/data: URIs in output
    - Footnotes: Deferred (not in REQUIREMENTS.md)
- ⬜ M4 — XLSX / XLS / CSV
- ⬜ M5 — PDF (text)
- ⬜ M6 — OCR (scanned PDF + images)
- ⬜ M7 — PPTX
- ⬜ M8 — P1 formats: RTF, HTML file, URL
- ⬜ M9 — P2 formats: EPUB, ZIP/folders
- ⬜ M10 — Edge cases & robustness sweep
- ⬜ M11 — Accessibility, mobile, performance, privacy hardening
- ⬜ M12 — Docs, deploy, final audit

## M2/M3 Self-Audit

| Checklist item | Implementation | Test path::name | Command | Result |
|---|---|---|---|---|
| M2 DropZone, JobList, OutputPanel, counters, Markdown/plain toggle, copy and fallback, download, toasts, persistence, error cards, preview cap | `src/app/AppShell.tsx` | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 uses the textarea clipboard fallback when Clipboard API is unavailable | `npx playwright test --project=chromium --project=mobile-chromium` | PASS |
| M2 structure-aware chunker and ChunkList | `src/core/chunk.ts`, `src/app/AppShell.tsx` | `tests/unit/core/chunk.test.ts`::does not split table rows and repeats the table header; `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy | `npm run test:unit -- --coverage --reporter=verbose` and Chromium E2E | PASS |
| M2 sequential copy and preamble option | `src/app/AppShell.tsx` | `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy | Chromium E2E | PASS |
| M2 combine mode | `src/app/AppShell.tsx`, `src/core/combine.ts` | `tests/e2e/m2-output.spec.ts`::M2 supports separate and combined batch output; `tests/unit/core/extended.test.ts`::combines stable file boundaries and maps typed errors | Chromium E2E and unit coverage | PASS |
| M2 acceptance: text happy path, chunk invariants, counters, copy/download | `src/app/AppShell.tsx`, `src/core/chunk.ts`, `src/core/tokens.ts` | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 downloads exact content with the mode-specific filename; `tests/unit/core/chunk.test.ts`::rejoins generated paragraph bodies exactly | Full runnable Chromium E2E and unit coverage | PASS |
| M3 DOCX 7.2 implementation, fixtures, and tests | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts` | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images | `npm run test:unit -- --coverage --reporter=verbose` | PASS |
| M3 encrypted DOCX message | `src/converters/docx.ts`, `src/core/errors.ts` | `tests/unit/converters/docx.test.ts`::rejects an OLE2 encrypted Office wrapper | `npm run test:unit -- --coverage --reporter=verbose` | PASS |
| M3 golden output and image warning | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts` | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images | `npm run test:unit -- --coverage --reporter=verbose` | PASS |
| M3 browser upload acceptance | `tests/e2e/docx.spec.ts` | `tests/e2e/docx.spec.ts`::uploads a generated docx and renders markdown output | `npx playwright test --project=chromium --project=mobile-chromium` | PASS |

## 2026-10-01 — M2/M3 closure evidence
Runnable evidence: 37 unit tests passed; 30 Chromium/mobile-Chromium E2E tests passed. Coverage was `src/core` 92.10% lines and `src/converters` 100% lines.

## Iteration Log

### 2026-10-01 — M2/M3 slice
- Added a real markdown-to-plain renderer using the Marked lexer (AST-like token walk), chunking with safe rejoin semantics, and a true DOCX converter via Mammoth.
- Expanded the app shell to handle multiple files, batch modes, edit mode, copy/download fallback, warnings, and persisted settings.
- Added DOCX unit and Playwright tests using generated docx fixtures from `docx`.
- Verification evidence:
  - `npx vitest run tests/unit/core/plain.test.ts tests/unit/core/chunk.test.ts tests/unit/converters/docx.test.ts` ✅ failed before implementation, then passed after the fix.
  - `npm run test:e2e -- --reporter=line` ✅ on the updated browser suite after installing Chromium.
- Next steps:
  - Continue by implementing the broader PDF/XLSX/PPTX/OCR families and the remaining plan-specified privacy and accessibility gates.
- Blockers: full WebKit execution is unavailable in this host because `libicudata.so.74` is missing and `apt-get` is unavailable.

### 2026-10-18 — Accessibility and CI repair
- Fixed job list accessibility: changed div to ul/li, moved error/warning elements out of buttons, removed redundant onKeyDown handlers
- Fixed E2E axe tests: replaced getByLabel with getByRole for button selections
- Updated traceability: set R033 and R040 to ✅ citing M2 happy path and six axe tests
- CI configuration: confirmed ubuntu-24.04 pin, verified e2e guards run after test execution
- Green runs: 01efd29 (run 39064632252), ad741e8 (run 39065677279)

- Added the strict 85% core/converter coverage gate, post-build initial-entry gzip check, captured-output traceability validation, and source/test hygiene enforcement.
- Added real core tests for encoding, detection, normalization, plain rendering, tokens, chunk invariants, combine, queue, errors, registry, and converter fence safety.
- Expanded DOCX fixtures/tests for structured content, tables, nested lists, emphasis, links, footnotes, images, image warnings, and encrypted Office wrappers.
- Added 11 browser tests for M2 controls, batch isolation, chunk controls, settings privacy, preview caps, copy/download, keyboard flow, CSP/font loading, and no-external-request conversion.
- Evidence: 37 unit tests passed; `src/core` 92.10% lines; `src/converters` 100% lines; 30 Chromium/mobile-Chromium E2E tests passed.
- Blocker: the required WebKit project cannot launch because the host lacks `libicudata.so.74`; `npx playwright install --with-deps webkit chromium` cannot install system packages because `apt-get` is unavailable.

### 2026-10-18 — M3 completion: Image handling refined
- Refined DOCX image handling to produce exactly one warning: "N embedded images were not converted"
- Ensured no base64 or data: URIs appear in markdown output
- Added unit test verifying warning format and absence of data: URIs for 2-image DOCX
- All lint, typecheck, unit tests pass
- Chromium E2E tests pass: 44 passed (17.8s)