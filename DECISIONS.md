# DECISIONS

## 2026-09-30 — Requirements path normalization

- **Context:** `PLAN.md` requires `docs/REQUIREMENTS.md` as the requirements source of truth, while the repository had `Requirements.md` at root.
- **Decision:** Moved the file to `docs/REQUIREMENTS.md` without changing content.
- **Consequences:** Plan and automation can consistently read requirements from a stable path.

## 2026-09-30 — M0 tooling baseline

- **Context:** The repository had no app scaffold or verification tooling required by M0.
- **Decision:** Added a Vite + React + TypeScript strict scaffold with ESLint, Prettier, Vitest, Playwright, and `scripts/verify.sh` as the initial gate.
- **Consequences:** We now have a deterministic baseline to grow milestone-by-milestone, with a single command to validate each iteration.

## 2026-09-30 — M1 initial vertical slice scope

- **Context:** M1 requires core engine pieces and an end-to-end vertical slice before broader format support.
- **Decision:** Implemented the first M1 slice for `txt/md/json/xml/code` only, with shared detection + converter registry and explicit unsupported-format messaging for all other kinds.
- **Consequences:** Core pipeline and tests are in place while keeping behavior honest; remaining M1 work focuses on queueing, cancellation/progress, and full detection matrix breadth.

## 2026-10-01 — Gate integrity for M2/M3

- **Context:** The prior working-tree gate used a global 60% threshold, had no standalone bundle or traceability validator, measured bundle output before rebuilding, and its hygiene expression matched the verifier itself and fixture text.
- **Decision:** `vitest.config.ts` includes only `src/core/**/*.ts` and `src/converters/**/*.ts` with an 85% line threshold. `scripts/check-bundle.mjs` runs after `npm run build`, measures only the HTML-referenced initial entry gzip against 250 KB, and rejects DOCX code in that entry. `scripts/check-traceability.mjs` validates every completed matrix row has an existing named test file. Hygiene scans all `src/` and test logic while excluding only `tests/fixtures/**`; `scripts/verify.sh` is outside the scanned paths.
- **Consequences:** The gate cannot pass by lowering thresholds or counting lazy converter chunks as initial payload. Open later-milestone rows remain visibly incomplete rather than being falsely marked done.

## 2026-10-01 — M2/M3 implementation details

- **Context:** The plan calls for an AST/token walk for plain text, semantic DOCX structure, strict CSP, and fixture-only dependencies kept out of the runtime bundle.
- **Decision:** `markdownToPlain()` uses Marked’s parsed token tree and recursively walks headings, inline tokens, lists, tables, code, and links; it does not strip Markdown with regular expressions. Mammoth HTML is converted through Turndown/GFM, while the test-only `docx` generator is a devDependency; runtime conversion remains Mammoth. Vite disables asset inlining so self-hosted fonts remain same-origin under the strict CSP.
- **Consequences:** Plain output preserves code and link destinations, DOCX tables/lists/footnotes are testable as Markdown, and the initial entry does not contain fixture or DOCX conversion code.

## 2026-10-01 — M2 browser assertion correction

- **Context:** The toast behavior was correct, but a Playwright `role=status` name query treated visible text as an accessible name and failed to locate the live region. The large-output test also queried the main Copy button without scoping it away from per-chunk buttons.
- **Decision:** Keep the existing `aria-live="polite"` toast behavior; assert its visible text and scope the main Copy query to the output article. Unique per-chunk accessible names make each chunk action independently addressable.
- **Consequences:** The tests now verify behavior without changing a valid toast implementation or weakening the copy assertions.

## 2026-10-19 — Vendored SheetJS tarball for XLSX/XLS/CSV

- Context: the `xlsx` package on the npm registry is stale and vulnerable; exceljs cannot read legacy .xls. The dev machine's npm 12 refuses remote-URL dependencies (allow-remote = none, error EALLOWREMOTE).
- Decision: commit the official tarball from https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz as vendor/xlsx-0.20.3.tgz and depend on it via "file:vendor/xlsx-0.20.3.tgz". sha512: a0b0eade3c3b01c2ea2961f60210a9553665f267fa5f661178ff8d7a1d12254cd5fc1759623b61f78b46e6da22301d4f3eb62dc4e09f6a850292fb6e1fedc024
- Consequences: installs need no network for this package; upgrade by replacing the tarball and the hash. The converter must lazy-load the library.

## 2026-10-20 — CSV uses a custom RFC-4180 parser; SheetJS coerces types

- Context: `src/converters/csv.ts` could have reused the already-vendored SheetJS library for CSV/TSV parsing instead of shipping a second parser. Requirements mandate that CSV values stay EXACTLY as written in the source file.
- Decision: CSV/TSV keeps its own RFC-4180-style parser (quoted fields, `""` and `\"` escapes, newlines inside quotes, BOM/windows-1252 via `decodeText`, delimiter sniffing for tab/semicolon/comma, TSV forced by `.tsv` filename or MIME). SheetJS remains XLSX/XLS-only.
- Reason (demonstrated by a 10-line spike with `XLSX.read(csv, {type:'string'})` on `id,val\n007,1e3\n" spaced ",x`; spike not committed):
  - `sheet_to_json: [{"id":7,"val":1000},{"id":" spaced ","val":"x"}]`
  - `A2 cell: n 7` — SheetJS turned `007` into the number `7`, losing the leading zeros
  - `B2 cell: n 1000` — `1e3` became `1000`, changing the exact source text
  - SheetJS also does not preserve leading/trailing spaces inside quoted cells.
- Consequences: CSV output preserves source text exactly (`007`, `1e3`, quoted spacing, quoted quotes); XLSX/XLS keep SheetJS type/date/merge handling. The custom parser is covered by exact-string unit tests including BOM, windows-1252, semicolon and TSV routing.
