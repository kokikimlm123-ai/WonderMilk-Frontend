# ARGO-WM V2 Farm Automation — development pilot

Status: development only. A new service; V1 source files, database, Google settings and LINE webhook are not modified. Baseline is the exact V1 tree deployed as `db2a920` (local equivalent `b335cc3`).

## Implemented scope

- Signed LINE webhook, durable PostgreSQL queue, group-to-farm registry and silent text/photo intake without @mention.
- Three farm record kinds: `pregnancy`, `milk`, `feed_leftover`. Farm is fixed by the authorized group, never chosen by AI or a review request.
- Explicit semicolon/newline forms in English/Myanmar/Thai; Unicode digits normalized while cow IDs stay strings. Structured forms do not need AI.
- Optional OpenAI structured extraction for free text/photos. Disabled by default, configured only with V2-specific credentials/model; every output is a draft. Unconfigured OCR produces a review-needed draft, never fabricated values.
- Private S3 image storage, authenticated evidence retrieval, 8 MiB limit and MIME/signature validation. Unsupported/expired media becomes a retryable failure.
- Bearer-authenticated reviewer API, scoped per group. Pending drafts can be corrected/approved/rejected; all approval requires version and reason. Approved rows are immutable in this pilot. Retrying an approval cannot duplicate records.
- SQL transactions, natural-key duplicates across groups for the same farm, strict numeric/date/unit validation, reviewer audit and durable AI call caps (not dollar caps).
- Unsend tombstones also handle events arriving out of order: revoke the draft, suppress downstream records, purge text/proposals and queue image deletion. No withdrawn record is exposed as approved. The record ID and identity stay reserved for a future explicit correction/reconciliation workflow.
- Lease recovery, bounded retries, failed-event view and authorized retry. No LINE push replies; no Google Sheets writes. API export of approved records is available.
- Development guard: V2_ENV and Railway environment must be `development`. Does not read V1 credential environment names.

## Runtime setup

Use Node 24, `npm ci`, `npm test`. Production adapter uses node-postgres. Tests use the actual PostgreSQL engine compiled as PGlite, temporary databases and synthetic LINE/media fixtures; they do not call LINE or OpenAI.

Build from repository root with `services/farm-automation/Dockerfile`. Use `/healthz` for infrastructure health (checks DB). `/readyz` returns 503 until intake, allowed groups, LINE, reviewers and media are configured. A healthy deployment is not evidence of live LINE/OCR readiness.

In the NEW Railway project only, reference `Postgres.DATABASE_URL` and the `v2-evidence` bucket's `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`. Keep credentials in Railway; no production credential reuse.

`V2_SELFTEST_ON_START=true` runs synthetic ingest/draft/approval/replay/unsend checks against an isolated randomly named schema in the development DB, drops that schema, and tests put/get/delete of a synthetic image under `selftest/`. No business records or external messaging are involved. It must pass before the service listens.

Before activation supply a separate LINE development channel and a new test group, verified group IDs, and reviewer mappings. Do not redirect the V1 webhook. A group with the V1 Official Account cannot also host a second Official Account. Configure the NEW channel endpoint as `/webhook/line`; verify signatures and redelivery, then enable intake. Empty signed verification requests work while intake is paused.

Group JSON example (replace synthetic ID with the actual development group ID):

```json
[{"id":"C11111111111111111111111111111111","farm":"Farm 2","module":"farm","enabled":true}]
```

Reviewer JSON maps a random bearer token's SHA-256 hash to a named reviewer and explicit group IDs. The token itself belongs in that reviewer's password manager. Never use LINE user IDs as bearer tokens. Keys, tokens and private group IDs must not be committed. No reviewer is provisioned by default.

## Sample intake forms

English:

```text
type: pregnancy; date: 2026-10-13; cow_id: 001; pregnancy_result: pregnant

type: milk; date: 2026-10-13; session: AM; milk_kg: 520; cows_milked: 49

type: feed_leftover; date: 2026-10-13; session: daily; group_name: milking; feed_name: TMR; leftover_kg: 45; delivered_kg: 1200
```

Myanmar:

```text
အမျိုးအစား: ကိုယ်ဝန်; ရက်စွဲ: ၂၀၂၆-၁၀-၁၃; နွားနံပါတ်: ၀၀၁; ကိုယ်ဝန်ရလဒ်: ကိုယ်ဝန်ရှိ
```

Thai:

```text
ประเภท: ตรวจท้อง; วันที่: ๒๐๒๖-๑๐-๑๓; รหัสโค: ๐๐๑; ผลตรวจท้อง: ท้อง
```

Dates must be explicit and unambiguous. No litres-to-kg conversion. Missing values are not zero. Feed leftovers require feed name, group and session. Values and natural keys require human review before approval. Free-form accuracy is not established by these examples.

## Reviewer API

All `/v2/` routes require `Authorization: Bearer <reviewer-token>`; no token is accepted in query strings. No CORS is enabled. Requests may only access the reviewer's configured groups.

- `GET /v2/drafts`: most recent 100 drafts with source text/issues/version.
- `GET /v2/drafts/{event-id}/evidence`: private retained image.
- `POST /v2/drafts/{event-id}/review`: `{ "version":1, "decision":"approve", "reason":"Checked against source", "records":[...] }`. `records` can be omitted to approve existing valid proposals. Reject with `decision:"reject"` and reason. Invalid fields are rejected; a draft cannot change its farm.
- `GET /v2/records`: most recent 1000 approved records only. This is a bounded API view, not a complete backup/export or Sheets sync.
- `GET /v2/events`: most recent 100 processing states; no secret/error detail leakage.
- `POST /v2/events/{event-id}/retry`: authorized retry of a failed event.

A basic mobile-friendly review page is served at `/review` in English/Myanmar/Thai. It keeps a reviewer token in page memory only, displays source text/photo, and permits manual JSON corrections with an approval/rejection reason. LINE review commands are not included. A trusted API client can also use these endpoints. Do not expose a shared reviewer token on a public web page.

## Retention, backup and rollback

Pilot source text/photos are retained for at most 30 days, subject to a healthy cleanup worker; unsend schedules earlier deletion. Records and reviewer audit are retained. Bucket is private; automated offsite backups and production recovery are not established. Do not use it as Warehouse historical storage without an approved retention policy and archive design.

Before any real-business pilot, take a development PostgreSQL backup with `pg_dump`, verify a restore into a separate temporary database, and verify image backup coverage. Never treat a deployment rollback as a database restore. This pilot creates only new `v2_*` tables and does not perform V1 migrations. To stop intake set `V2_INTAKE_ENABLED=false` in this development service; source withdrawals remain processed. Do not restore older data over newer records.

## Remaining activation/release gates

- Separate development LINE channel/token/secret and verified group mapping; test mention-free receipt on that channel.
- Named reviewers and secure tokens; test an actual review session.
- Separate development AI key/model if free text/OCR is required; benchmark Myanmar/Thai/English and actual handwriting before accepting accuracy claims.
- Approved record examples, units, sessions, duplicate/correction rules and reviewers.
- Dev-only Sheets output/sync is not implemented. The human review page requires provisioned reviewer tokens and a live acceptance session.
- Edit events, multi-message/album correlation, corrections of approved records and full historical imports require subsequent work. Unknown event types are ignored, not claimed as supported.
- Full retention/unsend reconciliation policy, workload and budget limits, monitoring/alerts, backup restore drill, and user acceptance before any production migration.
- Accounting and Warehouse implementations are not included in this Farm-first pilot.
