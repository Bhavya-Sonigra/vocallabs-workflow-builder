CREATE OR REPLACE VIEW public.org_run_stats AS
 SELECT workflow_runs.org_id,
    count(workflow_runs.id) AS total_runs,
    avg(EXTRACT(epoch FROM (workflow_runs.finished_at - workflow_runs.started_at))) AS avg_duration_seconds
   FROM public.workflow_runs
  WHERE (workflow_runs.finished_at IS NOT NULL) AND (workflow_runs.status = 'completed')
  GROUP BY workflow_runs.org_id;
