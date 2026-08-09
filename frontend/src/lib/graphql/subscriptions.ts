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
