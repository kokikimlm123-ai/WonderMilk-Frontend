# V1 source file images

Use `/image <Lab ID or exact filename> page 1` or `/image list` in the approved group (no mention needed for these commands), or from an approved private lab account. Natural English, Myanmar and Thai image requests with a Lab ID are supported after the usual group mention. One file and one page per request; ambiguous report versions require an exact filename.

PDFs use viewer numbering starting at 1. Office documents are converted to PDF print pages; slides use slide/page numbers. `/manual page 29` keeps printed CVAS numbering (viewer page 30). JPEG/PNG originals use page 1. Files must be in the existing catalog; arbitrary Drive IDs/URLs cannot grant access. Text-only indexes report missing originals instead of inventing images.

`/image Farm 2 milk page 1`, `/image Farm 4 feed page 1`, `/image Ryokusan cow page 1` show source-data snapshots from existing scoped adapters. These are explicitly labeled and do not reproduce the workbook layout. Whole farm workbooks are not exposed because they may contain out-of-scope farms. Private lab users cannot access farm snapshots.

All sources require the bot service account's read access. Downloads are capped at 50 MB. PDF/Office conversion has time limits, JPEG size caps and bounded child-process output. Images are delivered through a persisted retry-key outbox. Random 256-bit tickets expire in two hours; revoked group/user authorization immediately blocks fetches. Images are deleted after three hours, delivery metadata after one day. Failed attempts count toward 5/10min, 30/person/day, 100/day limits. No AI model is used for image requests.

A read-only startup smoke check renders one indexed lab report without sending a LINE message; success is recorded once. Confirm actual delivery in LINE after deployment. Existing manual-image routes and V2 are unchanged.
