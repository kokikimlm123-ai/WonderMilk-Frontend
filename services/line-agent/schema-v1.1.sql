-- PROPOSED PostgreSQL catalog/knowledge schema. NOT applied or wired to production.
-- Application authorization and RLS/role policies must be completed before use.
-- Current development functionality uses read-only normalization and a draft SQLite journal.
BEGIN;
CREATE TABLE projects (
  project_id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE sources (
  project_id text NOT NULL REFERENCES projects,
  source_id text NOT NULL,
  provider text NOT NULL,
  external_record_id text,
  original_filename text NOT NULL,
  PRIMARY KEY (project_id, source_id)
);
CREATE TABLE source_versions (
  project_id text NOT NULL,
  version_id text NOT NULL,
  source_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'imported' CHECK(status IN ('imported','validated','approved','superseded','rejected')),
  source_updated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  supersedes_version_id text,
  PRIMARY KEY (project_id, version_id),
  FOREIGN KEY (project_id,source_id) REFERENCES sources(project_id,source_id),
  FOREIGN KEY (project_id,supersedes_version_id) REFERENCES source_versions(project_id,version_id)
);
CREATE TABLE samples (
  project_id text NOT NULL REFERENCES projects,
  sample_id text NOT NULL,
  lab_provider text,
  lab_id text,
  farm_id text,
  collection_date date,
  sample_type text,
  raw_naming_code text NOT NULL,
  parsed_metadata jsonb NOT NULL DEFAULT '{}',
  unresolved_tokens jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (project_id,sample_id)
);
CREATE TABLE lab_results (
  project_id text NOT NULL,
  result_id text NOT NULL,
  sample_id text NOT NULL,
  source_version_id text NOT NULL,
  parameter text NOT NULL,
  value numeric,
  unit text,
  basis text,
  analytical_method text,
  missing_reason text,
  source_locator jsonb NOT NULL,
  extraction_version text NOT NULL,
  verification_status text NOT NULL DEFAULT 'imported',
  PRIMARY KEY (project_id,result_id),
  CHECK ((value IS NULL AND missing_reason IS NOT NULL) OR (value IS NOT NULL AND missing_reason IS NULL)),
  FOREIGN KEY (project_id,sample_id) REFERENCES samples(project_id,sample_id),
  FOREIGN KEY (project_id,source_version_id) REFERENCES source_versions(project_id,version_id)
);
CREATE TABLE analysis_runs (
  project_id text NOT NULL REFERENCES projects,
  analysis_id text NOT NULL,
  query jsonb NOT NULL,
  rule_version text NOT NULL,
  model_version text,
  snapshot_id text NOT NULL,
  result jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','rejected','stale')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id,analysis_id)
);
CREATE TABLE analysis_sources (
  project_id text NOT NULL,
  analysis_id text NOT NULL,
  source_version_id text NOT NULL,
  PRIMARY KEY(project_id,analysis_id,source_version_id),
  FOREIGN KEY(project_id,analysis_id) REFERENCES analysis_runs(project_id,analysis_id),
  FOREIGN KEY(project_id,source_version_id) REFERENCES source_versions(project_id,version_id)
);
CREATE TABLE knowledge_items (
  project_id text NOT NULL REFERENCES projects,
  knowledge_id text NOT NULL,
  version integer NOT NULL CHECK(version>0),
  layer text NOT NULL CHECK(layer IN ('project','operational','verified')),
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','stale','superseded')),
  approved_by text,
  approved_at timestamptz,
  review_due timestamptz,
  PRIMARY KEY(project_id,knowledge_id,version),
  CHECK(status<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE knowledge_sources (
  project_id text NOT NULL,
  knowledge_id text NOT NULL,
  knowledge_version integer NOT NULL,
  source_version_id text NOT NULL,
  PRIMARY KEY(project_id,knowledge_id,knowledge_version,source_version_id),
  FOREIGN KEY(project_id,knowledge_id,knowledge_version) REFERENCES knowledge_items(project_id,knowledge_id,version),
  FOREIGN KEY(project_id,source_version_id) REFERENCES source_versions(project_id,version_id)
);
-- Approval service must check authorized reviewers and nonempty valid evidence.
-- Source supersession must mark dependent analyses/knowledge stale transactionally.
-- Do not enable verified reuse until those checks, RLS and audit permissions are tested.
COMMIT;
