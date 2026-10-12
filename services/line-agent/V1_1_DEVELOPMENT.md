# ARGO-WM V1.1 development candidate

Status: DEVELOPMENT ONLY. Not deployed, not production-approved.

## Baseline and isolation

- Baseline: `8efe23964e4be81952710659b5a47be3932fcea9` on `wonder-milk-line-agent`.
- Remote deployment status re-read on 2026-10-12: SUCCESS at this baseline.
- Source cloned from the existing repository; primary backend files independently matched Git blob hashes.
- Development branch: `argo-wm-v1.1-development`.
- No changes to production webhook, credentials, source rows, source PDF permissions or hosting configuration.
- `LAB_SEARCH_V11` defaults to false. Development requires explicit opt-in.
- Production API key reuse was authorized. Railway OAuth confirms its name exists but does not expose its value. No key was copied, written or used. Live AI checks have not run.

## Implemented

1. Read-only normalized lab catalog with immutable PDF hashes, filename aliases, unresolved naming tokens, units/basis, extracted-text locators, extraction status and snapshot identity.
2. Unified all-match search for list/PDF/compare/ranking-screen requests. Model-assisted queries compile to a validated structured plan; common requests need no model call.
3. Numeric comparisons execute in code. Missing and invalid measurements do not pass numeric filters. Exact thresholds retain strictness.
4. ID constraints intersect naming filters. All original report versions remain visible; no latest version is guessed.
5. CS screening is separate from overall quality ranking. No invented weighted score or single-parameter winner. Multi-version IDs are excluded from the provisional screening shortlist, while their reports remain displayed.
6. Deterministic comparison includes every matching report and existing LINE queue splitting can deliver the resulting text.
7. Optional analysis journal is created lazily only on a V1.1 analysis. Records are draft-only, idempotent by event, and separate from farm records. No promotion or reuse as verified knowledge.
8. Production V1 behavior and manual routing remain behind the existing path when the flag is false.

## Explicit limitations and next gates

- This is Phase 1/2 development functionality, not completion of all V1.1 roadmap phases.
- No PostgreSQL service or production database migration has been provisioned. `schema-v1.1.sql` is an unexecuted draft schema, not an active database.
- Source date formats, country anomalies (such as TA), plot/bag/replicate semantics and customer versus farm need an approved naming dictionary. Raw codes are preserved. Farm and collection_date are intentionally null in normalization until authoritative mapping exists.
- Imported PDF values are extracted evidence, not human-approved measurements. The current fixed-column parser supports known CVAS layouts only.
- No complete nutritional ranking policy is approved. The bot returns screen candidates and comparisons, not an unsupported definitive best/worst.
- Real-data acceptance uses the local October 4 index snapshot, not a newly fetched production index. That snapshot has no manual entries; live manual contents still require inspection.
- Novel natural-language plans and live three-language model interpretation remain unverified without a usable development runtime key.
- Full verified knowledge approval/revalidation, Baserow integration, report exports, source backups and scheduled reports remain future work.
- No production database backup was made and no production restore has been rehearsed. These remain release blockers.

## Verification

From `services/line-agent`:

```sh
npm test
node scripts/check-lab-v11.mjs /absolute/private/path/cvas-index.json
```

Tests use temporary stores, synthetic test records and mocked AI calls. The second command reads a private index, performs six representative requests without an API call, checks link counts and numeric constraints, and verifies the source bytes were unchanged. Do not commit real farm/lab datasets, generated catalog snapshots, secrets or runtime databases.

### Results recorded on 2026-10-12

- 51 automated tests passed (37 retained V1 tests plus 14 development tests).
- Six real-data snapshot requests passed without network or credentials.
- CS list/PDF/compare/screen scope: 51 report versions, 48 distinct Lab IDs, 3 multi-version IDs.
- Numeric-only sample filter `DM >32 AND Starch >30`: 23 report versions, 21 distinct Lab IDs. This query is across sample types, not CS-only.
- TMR comparison: 3 matching report versions.
- Original index bytes remained unchanged.
- `git diff --check` passed.
- No live AI, LINE delivery, PostgreSQL execution, production backup/restore or PDF access-permission test was performed.

## Pre-release backup and rollback procedure (not executed)

1. Record exact deployed commit/image, current schema version, configuration names and feature flag values. Store secret backups only in approved secret storage.
2. Take an application-consistent SQLite backup using SQLite's backup facility; do not copy a live database file without its WAL consistency guarantees. Record checksums and protect access.
3. Export bot-owned Sheets plus change history; preserve immutable versions of the CVAS index and original source references. Keep original workbooks untouched.
4. Restore the database into an isolated environment with no production LINE token or Sheets write access. Check record counts, versions, pending operations, outgoing queue and pending sync. Suppress replay deliveries during restore.
5. Run tests and bilingual/trilingual user acceptance in a separate channel/group. Obtain release approval before enabling or deploying.
6. Roll back by disabling `LAB_SEARCH_V11` with an explicitly approved configuration change and deployment/restart if required. Return to the baseline image only after compatibility checks. The additive draft journal can remain inert.
7. Do not restore an old database over newer business records. Reconcile post-release records, events and Sheets sync before any data restore. Deployment rollback does not roll back data.

## Remaining reviewer decisions

- Approve naming dictionary and authoritative report-version selection rules.
- Approve multi-parameter CS ranking criteria and eligible reviewers.
- Establish production backups and recovery objectives.
- Provide a secure development runtime with authorized API access and isolated LINE/Sheets resources for live acceptance.

No production release is implied by approval to work on this development branch.
