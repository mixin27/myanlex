ALTER TABLE api_usage ALTER COLUMN api_key_id DROP NOT NULL;
ALTER TABLE api_usage ADD COLUMN source varchar(24) NOT NULL DEFAULT 'api_key';
ALTER TABLE api_usage ADD CONSTRAINT api_usage_source_key_check CHECK (
  (source = 'api_key' AND api_key_id IS NOT NULL) OR
  (source = 'playground' AND api_key_id IS NULL)
);
CREATE TABLE playground_runs (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,
  -- Serialized JSON preserves NUL and lone-surrogate text that jsonb rejects.
  snapshot text NOT NULL,
  content_hash char(64) NOT NULL,
  payload_size integer NOT NULL CHECK (payload_size > 0 AND payload_size <= 1048576),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz(3) NOT NULL
);
CREATE INDEX playground_runs_creator_id_expires_at_idx ON playground_runs(creator_id, expires_at);
CREATE INDEX playground_runs_project_id_creator_id_id_idx ON playground_runs(project_id, creator_id, id);
CREATE INDEX playground_runs_expires_at_idx ON playground_runs(expires_at);
