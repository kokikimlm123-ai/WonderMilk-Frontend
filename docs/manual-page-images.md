# CVAS manual page images — V1

Based on production ff6a28f928b1c1742447d4712b0b5a4f06f86a62, not the older forage branch.

Commands: `/manual page 29` uses PRINTED pages 1–36 (cover excluded). Printed29 = viewer30 = index29; printed34 = viewer35. `/manual pdf page 30` explicitly uses viewer numbering. One page per request. English, Myanmar and Thai natural image requests require the existing group @mention. The explicit /manual page command also works without mention in the bound group. Private requests require existing lab authorization.

Only the exact SHA256-pinned CVAS Manual 1.6 source is accepted. The original private Drive index supplies its file ID. No PDF or rendered pages are committed to the repository. Google credentials stay server-side. Runtime caches the private source and JPEGs on the volume. Poppler plus font substitutes render at 2400px width, preview800px; preserved page layout and disclaimer. Check source fonts if upgrading the renderer.

`MANUAL_IMAGE_ORIGIN` can override `https://${RAILWAY_PUBLIC_DOMAIN}`; only HTTPS origins are accepted. Opaque 256-bit capability URLs expire after two hours; no authentication header is required by LINE. URLs must be treated as secrets: anyone possessing one can fetch that one page until expiry. No listing, no predictable page URL, no PDF route. Responses are no-store/noindex. Recipient authorization is checked before queueing, sending and fetching. 100 fetches/ticket, 5 requests/10min/person, 30/day/person and 100/day globally. Internal recipients must not redistribute received images. This is access restriction, not DRM.

Image delivery uses a separate additive SQLite outbox. Stable LINE retry UUID and URLs survive restarts. Retries stop after ten attempts or 15min; other text outbox behavior is unchanged. Runtime logs never print image tickets. Requests can receive a localized fallback if the private source, rendering or HTTPS configuration fails. No OpenAI call is needed for image requests.

## Verification

`CVAS_TEST_PDF=/private/path/to/manual.pdf npm test` inside services/line-agent includes real PDF render and HTTP authorization tests. Without fixture the render integration test is explicitly skipped. Tests cover mapping, multilingual digits, bounds/ranges, group/user authorization, rate limits, duplicate events, retries, expiration and unchanged existing routes. Verify production warmup reports `manual_images:ready`, and separately ask the bot for a page to verify delivery in the LINE client.

## Rollback

Prior successful Railway deployment: 4b4a055e-4a73-4fd4-b71a-814990b460e8.
Prior source: argo-wm-v1-chinese-20261017 at ff6a28f928b1c1742447d4712b0b5a4f06f86a62.
Redeploy that build and reconnect/pin that commit if needed. New image outbox table is additive; the older application ignores it. No farm records or existing schema columns are changed. Old runtime will return 404 for image URLs.

Before first startup the entrypoint creates `/data/backups/before-manual-images-v1.sqlite` with SQLite online backup and verifies PRAGMA quick_check. Startup fails if snapshot verification fails. Keep this private; it contains business data. Same-volume snapshot is a rollback aid, not offsite disaster recovery. Prefer code rollback without restoring DB so subsequent farm records are preserved. Restore snapshot only after stopping service and checking whether later records must be retained. V2 services and webhooks are untouched.
