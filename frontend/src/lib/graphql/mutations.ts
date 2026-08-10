import { gql } from "@apollo/client";

export const INSERT_WORKFLOW = gql`
  mutation InsertWorkflow($name: String!, $org_id: uuid!, $description: String) {
    insert_workflows_one(
      object: { name: $name, org_id: $org_id, description: $description }
    ) {
      id
      name
    }
  }
`;

export const INSERT_WORKFLOW_STEP = gql`
  mutation InsertWorkflowStep(
    $workflow_id: uuid!
    $type: step_type!
    $step_order: Int!
    $config: jsonb!
  ) {
    insert_workflow_steps_one(
      object: {
        workflow_id: $workflow_id
        type: $type
        step_order: $step_order
        config: $config
      }
    ) {
      id
      type
      step_order
      config
    }
  }
`;

export const DELETE_WORKFLOW_STEP = gql`
  mutation DeleteWorkflowStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

export const INSERT_WORKFLOW_TRIGGER = gql`
  mutation InsertWorkflowTrigger(
    $workflow_id: uuid!
    $type: trigger_type!
    $config: jsonb!
  ) {
    insert_workflow_triggers_one(
      object: { workflow_id: $workflow_id, type: $type, config: $config }
    ) {
      id
      type
      config
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      success
      status
    }
  }
`;

export const DELETE_WORKFLOW_BY_PK = gql`
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) {
      id
    }
  }
`;
