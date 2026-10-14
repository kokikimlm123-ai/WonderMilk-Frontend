# Google Drive archive — development preparation

Status: routing helper plus standalone Drive API adapter, with local mocked-API
tests. No real Drive upload, credentials, database migration, background
synchronization or deployment was performed for this change.
The existing S3 evidence and database paths remain active.

## Folder arrangement

Use a private `ARGO-WM V2 Test` root chosen by James. Under it:
`<LINE group label + stable group hash>/<category>/<YYYY-MM>/<receipt-date_source-hash.ext>`.
Categories: Petty Cash, Corn Field Records, Warehouse Fixing Records,
Cleaning Records, and Needs Review. Categories are distinct from LINE groups;
one mixed group may contain all categories. Group names alone are not identity.
The month is the LINE event receipt month in Asia/Bangkok, not an inferred
business date. A later record-date view should preserve this distinction.

`archivePlan` accepts a trusted enabled-group registry and an explicit reviewer
category or group default. Unknown content goes to Needs Review. It performs no
OCR or automatic categorization. Stable source keys support future retry handling;
they do not alone provide remote idempotency or business-record deduplication.

## Activation blockers

1. James must identify the destination Drive folder/account. Searches for ARGO
   and Wonder folders returned no matches in the connected Drive; this does not
   establish that no such folders exist elsewhere.
2. Configure V2-only Google authorization. A connected ChatGPT Drive tool does
   not provide a reusable runtime credential to the deployed application.
   Personal My Drive requires user OAuth; standalone service accounts cannot
   own files and need a writable Shared Drive. Do not copy V1 credentials.
3. Implement durable upload outbox and folder/file ID mappings, preallocated Drive
   file IDs for retry safety, serialized folder creation, bounded backoff, and
   a reviewer-visible synchronization status. Keep PostgreSQL authoritative for
   approval/audit; Drive stores evidence and explicit exports.
4. Integrate LINE Unsend with withdrawal and deletion of all archived copies,
   including upload-in-flight races and retries. Do not activate an upload-only
   path that leaves withdrawn evidence behind.
5. Verify inherited folder permissions, root write access, upload/readback,
   no public sharing, group separation, retry idempotency, withdrawal, and source
   retention behavior using synthetic files in the test root.
6. Decide approved export representation (JSON/CSV or a separate Sheets module)
   and archive retention before migrating any existing data. No existing photos
   have been moved or copied by this change.

## Sources

- https://developers.google.com/workspace/drive/api/guides/folder
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://developers.google.com/workspace/drive/api/guides/about-shareddrives

## Standalone adapter added

`src/drive-client.mjs` supports bounded resumable uploads (up to the existing
8 MiB evidence limit), writable-root ancestry checks, generated Drive file IDs,
folder creation, readback with content checksum verification, and retry reuse of
the same reserved file ID. It rejects unexpected upload-session destinations and
redacts provider/authentication error details. It does not change permissions.

The caller must persist reserved IDs before invoking creates/uploads. The adapter
does not yet provide a durable outbox, concurrent folder reservation, withdrawal
processing or automatic retries. It is deliberately not imported by the server.
Six mocked-API tests cover lost upload responses, root boundaries, token
destination boundaries, folder retry identity, 8 MiB files, and safe errors.
The complete local suite has 38 passing tests; no live Drive test has run.

## Optional Google OAuth setup (October 14)

The Review page now includes an administrator-only Google connection flow.
Configure `V2_GOOGLE_CLIENT_ID`, `V2_GOOGLE_CLIENT_SECRET`,
`V2_GOOGLE_TOKEN_KEY` (64 hex characters, generated securely once), and
`V2_GOOGLE_ADMIN_ACTOR` (exact existing reviewer actor). Never put these credentials
in git. Missing configuration disables Google setup without interrupting LINE.
Register the web client redirect URI:
`https://argo-wm-v2-farm-development.up.railway.app/oauth/google/callback`.

The flow requests only `drive.file` offline access. It uses a browser-bound Secure
HttpOnly cookie, PKCE S256, a hashed, single-use ten-minute database state, and
AES-256-GCM encryption for the stored refresh token and temporary verifier.
The key must be preserved across deployments. An existing connection cannot be
silently replaced. Tokens and authorization codes are not logged by the app.

Authorization alone does NOT grant access to the existing user-created archive
folder. Google Picker selection (not implemented yet) is required for that folder
under the per-file scope. Do not switch to full-Drive access to bypass that step.
Uploads, automatic refresh, outbox and withdrawal synchronization remain disabled
and unimplemented. The UI states this explicitly. OAuth setup and Google Picker
will need live verification using the user's client and chosen account.

44 local tests pass, including six OAuth tests with real SQL and a simulated
Google token endpoint. No live Google consent/token exchange has been tested yet.
