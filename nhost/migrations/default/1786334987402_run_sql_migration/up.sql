-- 002_workflow_results.sql
-- Destination table for db_write steps ("saves a result into your own tables")

CREATE TABLE workflow_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_run_id UUID NOT NULL REFERENCES step_runs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_results_run ON workflow_results(workflow_run_id);
