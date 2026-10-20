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
- ✅ M4 — XLSX / XLS / CSV
  - ✅ M4.1 — SheetJS dependency vendored at `vendor/xlsx-0.20.3.tgz`, installed as `file:vendor/xlsx-0.20.3.tgz` (see DECISIONS.md 2026-10-19)
  - ✅ M4.2 — XLSX/XLS converter (`src/converters/xlsx.ts`, lazy-loaded SheetJS): one `## Sheet: <name>` section per worksheet in workbook order, empty sheets skipped with warning, GFM tables, ISO dates, merged-cell top-left values + warning, hidden sheets labelled, empty header cell → `Column N`, `.xls` via same library, typed password/corrupt errors. Verified by 13 named tests in `tests/unit/converters/xlsx.test.ts` (see docs/TRACEABILITY.md R010)
  - ✅ M4.3 — CSV/TSV converter (`src/converters/csv.ts`, custom RFC-4180 parser — SheetJS coerces `007`→`7` and `1e3`→`1000`, see DECISIONS.md 2026-10-20): quoted fields preserved exactly (`007`, `1e3`, leading/trailing spaces), `""`/`\"` escapes, newlines in quotes → `<br>`, pipes → `\|`, TSV by `.tsv` filename or MIME, semicolon/comma/tab sniffing, UTF-8 BOM stripped, windows-1252 fallback with warning. Verified by 23 named tests in `tests/unit/converters/csv.test.ts`
  - ✅ M4.4 — Register + detect: `csv` registered in `src/core/registry.ts`; `csv` + `xlsx` added to `src/core/pipeline.ts` supported kinds (previously unreachable from the app); detect already maps `.csv/.tsv` → `csv` and `.xlsx/.xls/.xlsm` → `xlsx`. Verified by `tests/unit/core/registry-more.test.ts`::detects csv/tsv files and routes them to the csv converter and `tests/unit/core/pipeline.test.ts`::converts a File named a.csv into the exact markdown table
  - ✅ M4.5 — UI accept-list + e2e: DropZone file input `accept` list and "supported formats" text now include csv, tsv, xlsx, xls, xlsm (`src/app/AppShell.tsx`); browser e2e uploads a generated `.csv` and asserts the rendered table — `tests/e2e/csv.spec.ts`::uploads a generated csv and renders the table in the output panel (passes on chromium and mobile-chromium)
- ⬜ M5 — PDF (text)
- ⬜ M6 — OCR (scanned PDF + images)
- ⬜ M7 — PPTX
- ⬜ M8 — P1 formats: RTF, HTML file, URL
- ⬜ M9 — P2 formats: EPUB, ZIP/folders
- ⬜ M10 — Edge cases & robustness sweep
- ⬜ M11 — Accessibility, mobile, performance, privacy hardening
- ⬜ M12 — Docs, deploy, final audit

## M2/M3 Self-Audit

| Checklist item                                                                                                                                 | Implementation                                                    | Test path::name                                                                                                                                                                                                                                              | Command                                                               | Result |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ |
| M2 DropZone, JobList, OutputPanel, counters, Markdown/plain toggle, copy and fallback, download, toasts, persistence, error cards, preview cap | `src/app/AppShell.tsx`                                            | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 uses the textarea clipboard fallback when Clipboard API is unavailable                                                               | `npx playwright test --project=chromium --project=mobile-chromium`    | PASS   |
| M2 structure-aware chunker and ChunkList                                                                                                       | `src/core/chunk.ts`, `src/app/AppShell.tsx`                       | `tests/unit/core/chunk.test.ts`::does not split table rows and repeats the table header; `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy                                                               | `npm run test:unit -- --coverage --reporter=verbose` and Chromium E2E | PASS   |
| M2 sequential copy and preamble option                                                                                                         | `src/app/AppShell.tsx`                                            | `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy                                                                                                                                                        | Chromium E2E                                                          | PASS   |
| M2 combine mode                                                                                                                                | `src/app/AppShell.tsx`, `src/core/combine.ts`                     | `tests/e2e/m2-output.spec.ts`::M2 supports separate and combined batch output; `tests/unit/core/extended.test.ts`::combines stable file boundaries and maps typed errors                                                                                     | Chromium E2E and unit coverage                                        | PASS   |
| M2 acceptance: text happy path, chunk invariants, counters, copy/download                                                                      | `src/app/AppShell.tsx`, `src/core/chunk.ts`, `src/core/tokens.ts` | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 downloads exact content with the mode-specific filename; `tests/unit/core/chunk.test.ts`::rejoins generated paragraph bodies exactly | Full runnable Chromium E2E and unit coverage                          | PASS   |
| M3 DOCX 7.2 implementation, fixtures, and tests                                                                                                | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts`    | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images                                                                                                                                                         | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 encrypted DOCX message                                                                                                                      | `src/converters/docx.ts`, `src/core/errors.ts`                    | `tests/unit/converters/docx.test.ts`::rejects an OLE2 encrypted Office wrapper                                                                                                                                                                               | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 golden output and image warning                                                                                                             | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts`    | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images                                                                                                                                                         | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 browser upload acceptance                                                                                                                   | `tests/e2e/docx.spec.ts`                                          | `tests/e2e/docx.spec.ts`::uploads a generated docx and renders markdown output                                                                                                                                                                               | `npx playwright test --project=chromium --project=mobile-chromium`    | PASS   |

## M2/M3 closure evidence (refreshed 2026-10-20)

Current runnable evidence (2026-10-20, supersedes the original 2026-10-01 numbers): **141 unit tests passed** (20 files); **46 Chromium/mobile-Chromium E2E tests passed**; coverage `src/core` **93.04%** lines and `src/converters` **92.18%** lines (85% gate); initial JS entry **67,745 bytes gzip** of 256,000 budget with 12 lazy chunks (docx/xlsx/csv kept out of the initial payload).

## Iteration Log

### 2026-10-01 — M2/M3 slice

- Added a real markdown-to-plain renderer using the Marked lexer (AST-like token walk), chunking with safe rejoin semantics, and a true DOCX converter via Mammoth.
- Expanded the app shell to handle multiple files, batch modes, edit mode, copy/download fallback, warnings, and persisted settings.
- Added DOCX unit and Playwright tests using generated docx fixtures from `docx`.
- Verification evidence:
  - `npx vitest run tests/unit/core/plain.test.ts tests/unit/core/chunk.test.ts tests/unit/converters/docx.test.ts` ✅ failed before implementation, then passed after the fix.
  - `npm run test:e2e -- --reporter=line` ✅ on the updated browser suite after installing Chromium.
- Added the strict 85% core/converter coverage gate, post-build initial-entry gzip check, captured-output traceability validation, and source/test hygiene enforcement.
- Added real core tests for encoding, detection, normalization, plain rendering, tokens, chunk invariants, combine, queue, errors, registry, and converter fence safety.
- Expanded DOCX fixtures/tests for structured content, tables, nested lists, emphasis, links, footnotes, images, image warnings, and encrypted Office wrappers.
- Added 11 browser tests for M2 controls, batch isolation, chunk controls, settings privacy, preview caps, copy/download, keyboard flow, CSP/font loading, and no-external-request conversion.
- Evidence at the time: 37 unit tests passed; `src/core` 92.10% lines; `src/converters` 100% lines; 30 Chromium/mobile-Chromium E2E tests passed.
- Next steps:
  - Continue by implementing the broader PDF/XLSX/PPTX/OCR families and the remaining plan-specified privacy and accessibility gates.
- Blockers: full WebKit execution is unavailable in this host because `libicudata.so.74` is missing and `apt-get` is unavailable.

### 2026-10-18 — Accessibility and CI repair

- Fixed job list accessibility: changed div to ul/li, moved error/warning elements out of buttons, removed redundant onKeyDown handlers
- Fixed E2E axe tests: replaced getByLabel with getByRole for button selections
- Updated traceability: set R033 and R040 to ✅ citing M2 happy path and six axe tests
- CI configuration: confirmed ubuntu-24.04 pin, verified e2e guards run after test execution
- Green runs: 01efd29 (run 39064632252), ad741e8 (run 39065677279)

### 2026-10-18 — M3 completion: Image handling refined

- Refined DOCX image handling to produce exactly one warning: "N embedded images were not converted"
- Ensured no base64 or data: URIs appear in markdown output
- Added unit test verifying warning format and absence of data: URIs for 2-image DOCX
- All lint, typecheck, unit tests pass
- Chromium E2E tests pass: 44 passed (17.8s)

### 2026-10-20 — M4 completion: XLSX/XLS + CSV/TSV

- Vendored the official SheetJS 0.20.3 tarball (DECISIONS.md 2026-10-19) and added the XLSX/XLS converter (`src/converters/xlsx.ts`): multi-sheet `## Sheet:` sections, ISO dates, merged/hidden/empty-sheet handling, typed password/corrupt errors; lazy-loaded SheetJS.
- Added the CSV/TSV converter (`src/converters/csv.ts`) with a custom RFC-4180 parser. Rationale recorded in DECISIONS.md 2026-10-20 with a pasted spike: SheetJS coerces cell types (`007` → `7`, `1e3` → `1000`), violating the exact-text requirement.
- Reverted `272944c` (quote escaping in markdown table cells): CSV/XLSX values must stay EXACTLY as written in the source file; the one affected CSV assertion was updated to the exact-source-text form.
- Registered `csv` in the converter registry and added `csv` + `xlsx` to the pipeline supported kinds — previously `.csv/.tsv/.xlsx` uploads reached "Unsupported format" even though the converters existed.
- DropZone `accept` list and a "supported formats" line now cover csv, tsv, xlsx, xls, xlsm.
- Tests: **141 unit** (was 129) — +12 CSV exact-text/delimiter tests (007, 1e3, quoted spaces, quoted newline → `<br>`, pipe → `\|`, TSV by filename, semicolon sniffing, BOM, windows-1252, exact quoted-quote output) plus detect/registry routing and pipeline-level CSV tests. **E2E: 46 passed** (was 44) — new `tests/e2e/csv.spec.ts` on chromium + mobile-chromium.
- Verification evidence (2026-10-20):
  - `npm run lint && npm run typecheck && npm run test:unit` → 20 files, 141 passed.
  - `TZ=Asia/Kolkata npm run test:unit` → 141 passed.
  - `npm run build` + `node scripts/check-bundle.mjs` → initial JS gzip 67,745/256,000 bytes; 12 lazy chunks (csv 0.88 kB, xlsx 161.71 kB stay out of the initial payload).
  - `npm run test:e2e -- --project=chromium --project=mobile-chromium` → 46 passed.
- Blockers: the mobile-webkit e2e project still cannot launch on this machine (`libicudata.so.74` missing; `apt-get` unavailable) — expected and accepted per docs/AGENT_PROMPT.md.
