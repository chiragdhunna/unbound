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
