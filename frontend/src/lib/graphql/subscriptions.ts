import { gql } from "@apollo/client";

export const SUBSCRIBE_STEP_RUNS = gql`
  subscription SubscribeStepRuns($workflow_run_id: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflow_run_id } }
      order_by: { started_at: asc }
    ) {
      id
      status
      started_at
      finished_at
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      workflow_step_id
      workflow_step {
        type
        step_order
        config
      }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUN = gql`
  subscription WatchRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      finished_at
      step_runs(order_by: { started_at: asc }) {
        id
        workflow_step_id
        status
        input
        output
        error
        workflow_step {
          type
          step_order
          config
        }
      }
    }
  }
`;

export const SUBSCRIBE_MY_ORGS = gql`
  subscription SubscribeMyOrgs {
    org_members {
      org_id
      role
      organization {
        id
        name
        quota_calls_used
        quota_calls_allowed
      }
    }
  }
`;

export const SUBSCRIBE_ORG_STATS = gql`
  subscription SubscribeOrgStats($org_id: uuid!) {
    org_run_stats(where: { org_id: { _eq: $org_id } }) {
      total_runs
      avg_duration_seconds
    }
  }
`;
