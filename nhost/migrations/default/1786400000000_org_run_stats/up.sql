CREATE OR REPLACE VIEW org_run_stats AS
SELECT 
  org_id,
  COUNT(id) AS total_runs,
  AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) AS avg_duration_seconds
FROM workflow_runs
WHERE finished_at IS NOT NULL
GROUP BY org_id;
