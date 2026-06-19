# Backend Core — Changelog

Semantic versioning (`MAJOR.MINOR.PATCH`). This file is the **propagation instruction set**: each entry tells every client repo exactly what to apply when syncing this core version. See `docs/PLATFORM_VERSIONING_AND_SYNC_GUIDE.md`.

- **PATCH** — bug/security fix, no contract change. Safe to merge into all clients.
- **MINOR** — backward-compatible feature. Ships **OFF** behind a flag where it adds surface area.
- **MAJOR** — breaking change / migration required. Deliberate per-client upgrade.

Each entry MUST carry the **Propagation** block (layers · migration · flag · design impact · severity · breaking · rollback).

---

## [Unreleased]

_Add entries here as core changes land; cut a version + tag on release._

---

## [0.1.0] — 2026-06-19
Baseline. First versioned backend core (raghava-organics + sbgs in production).

**Propagation:**
- Severity: NORMAL
- Layers: backend (full baseline)
- Migration: baseline schema (`prisma migrate deploy`)
- Flag: n/a (baseline feature set governed by existing `FEATURE_*` + Ops config)
- Design impact: none
- Breaking: n/a (baseline)
- Rollback: n/a (baseline)

<!--
TEMPLATE — copy for each new entry:

## [X.Y.Z] — YYYY-MM-DD
### Added | Changed | Fixed | Security | Removed
- <one-line summary of the change>

**Propagation:**
- Severity: NORMAL | SECURITY | CRITICAL
- Layers: backend(routes/service/migration) · docs(<which>)
- Migration: NO | YES → `npx prisma migrate deploy` (expand-contract, additive-first)
- Flag: <FLAG_NAME> (default OFF — enable per client via Ops) | n/a
- Design impact: none | requires frontend-core >= A.B.C
- Breaking: NO | YES (<what breaks + upgrade note>)
- Rollback: <down-migration available? revert to tag vX.Y.Z>
-->
