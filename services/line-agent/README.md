# Wonder Milk LINE farm agent

Pilot backend for a single authorized LINE group, scoped to Farm 2, Farm 4, and Ryokusan. Group members can ask grounded questions, submit text or form photos, and edit bot-created records. Original source workbook rows remain read-only.

## Deployment

This branch adds the backend under `services/line-agent`. The repository-root Dockerfile builds only this service; the original frontend source is preserved. Deploy this branch with the root Dockerfile and `railway.json`. Use one replica and attach a persistent volume at `/data`. The service refuses activation on Railway without a volume mounted at its configured data directory.

Keep `BOT_ENABLED=false` during setup. Configure the variables in `.env.example` using the hosting provider's private settings. No real credentials, group IDs, source file IDs, farm records, or submitted photos belong in this repository.

Required settings:

- `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN`.
- `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-5.4-mini`).
- `GOOGLE_SERVICE_ACCOUNT_JSON`, `AGENT_SPREADSHEET_ID`, `COW_SOURCE_SPREADSHEET_ID`, `MILK_TEST_SOURCE_SPREADSHEET_ID`, and `DAILY_SOURCE_FILE_ID`.
- A verified `LINE_GROUP_ID`, or a cryptographically random `PAIRING_CODE` of at least 24 characters.

Enable Google Sheets and Drive APIs for the service account. Grant it Viewer access to the three source files and Editor access to the separate agent output spreadsheet. Runtime Google access is separate from a ChatGPT Google Drive connection. `Agent_Records` and `Agent_Changes` are created in the output workbook; their headers are checked before writing.

The webhook endpoint is `POST /webhook/line` at the actual deployed HTTPS origin. Set it in LINE Developers and verify the signed empty event request. Then enable webhooks and redelivery. Enable the fully configured service, send `/pair <code>` only in the intended group if needed, and test `/help`. The invite URL is not a LINE group ID.

`GET /healthz` checks process health. `GET /readyz` checks setting presence and activation only; it does not validate external credentials. Verify real API access and a clearly marked test record before using production records.

## Data handling

- Verify the LINE signature against the exact raw request bytes and acknowledge after durable enqueue.
- Preserve Cow IDs as strings, scope identities by farm, and reject ambiguous dates or units.
- Ask the submitting group member to clarify unclear form fields; do not guess.
- Retain old/new versions and actor IDs in an audit trail. A batch with an invalid record writes nothing.
- Deduplicate webhook IDs, natural record identities, and repeated photo hashes.
- Save locally before syncing to Google Sheets; tell the group when Sheets synchronization is still pending.
- Use LINE push retry keys for responses. Push replies count under the applicable LINE messaging plan.

Keep one replica, back up the persistent volume, and do not manually edit bot-owned output tabs. Photos are retained privately for up to 30 days, unresolved drafts for 15 minutes, and delivered outgoing text for seven days. LINE unsend events remove retained corresponding photos and pending messages; they do not silently delete committed business records.

## Scope and verification

The historical Excel reader uses an explicit, validated source layout and reads the first two worksheets only. It returns at most 40 matching populated rows per farm/type. Historical Ryokusan cow and daily records require additional source mapping. Photo extraction needs acceptance testing on actual forms. Original source-row editing is not implemented in this pilot.

Run `npm test` in this directory with Node 24 and Python/openpyxl 3.1.5. Tests cover signatures, group isolation, validation, duplicate writes, edit history, clarification, Sheets synchronization, source mapping, and persistent-volume activation. Local tests use synthetic data and mocked external services; they do not prove the live credentials or handwritten forms work.

Questions normally make two AI calls; form extraction normally makes one. `MAX_AI_CALLS_PER_DAY` limits call count, not dollar spending. Hosting, LINE, and OpenAI API charges are separate.
