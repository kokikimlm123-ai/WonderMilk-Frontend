CREATE TABLE IF NOT EXISTS v2_events (
 id text PRIMARY KEY, group_id text NOT NULL, farm text NOT NULL, message_id text NOT NULL,
 actor text, kind text NOT NULL, body jsonb, source_at bigint NOT NULL,
 status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(group_id,message_id)
);
CREATE TABLE IF NOT EXISTS v2_sources (group_id text NOT NULL,message_id text NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(group_id,message_id));
CREATE TABLE IF NOT EXISTS v2_drafts (
 id text PRIMARY KEY REFERENCES v2_events(id),group_id text NOT NULL,farm text NOT NULL,
 proposals jsonb NOT NULL,issues jsonb NOT NULL,method text NOT NULL,
 status text NOT NULL DEFAULT 'pending',version integer NOT NULL DEFAULT 1,
 evidence_key text,evidence_hash text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS v2_records (
 id text PRIMARY KEY,draft_id text NOT NULL REFERENCES v2_drafts(id),group_id text NOT NULL,
 identity text UNIQUE NOT NULL, value jsonb NOT NULL,status text NOT NULL DEFAULT 'approved',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS v2_audit (
 id text PRIMARY KEY,draft_id text NOT NULL,actor text NOT NULL,action text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS v2_media_deletions (key text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS v2_usage (day text PRIMARY KEY,calls integer NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS v2_queue ON v2_events(status,available_at);
CREATE INDEX IF NOT EXISTS v2_review ON v2_drafts(group_id,status);

-- Additive migration; existing farm events retain their original routing.
ALTER TABLE v2_events ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'farm';
ALTER TABLE v2_drafts ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'farm';

CREATE TABLE IF NOT EXISTS v2_pairings (token_hash text PRIMARY KEY,group_id text NOT NULL,event_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

-- Optional V2 Google authorization, independent of LINE intake and record tables.
CREATE TABLE IF NOT EXISTS v2_google_states (
 actor text PRIMARY KEY,state_hash text UNIQUE NOT NULL,cookie_hash text NOT NULL,
 verifier text NOT NULL,expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS v2_google_connection (
 id integer PRIMARY KEY CHECK(id=1),actor text NOT NULL,refresh_token text NOT NULL,
 scope text NOT NULL,connected_at timestamptz NOT NULL DEFAULT now()
);
