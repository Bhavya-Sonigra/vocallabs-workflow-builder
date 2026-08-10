import { gql } from "@apollo/client";

export const GET_WORKFLOWS = gql`
  query GetWorkflows($org_id: uuid!) {
    workflows(
      where: { org_id: { _eq: $org_id } }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      created_at
      updated_at
    }
  }
`;

export const GET_WORKFLOW = gql`
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      created_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        type
        step_order
        config
      }
      workflow_triggers {
        id
        type
        config
      }
    }
  }
`;

export const GET_ORG_MEMBER_ROLE = gql`
  query GetOrgMemberRole($org_id: uuid!, $user_id: uuid!) {
    org_members(
      where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }
      limit: 1
    ) {
      role
    }
  }
`;

export const GET_ORGANIZATION = gql`
  query GetOrganization($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id
      name
      quota_calls_used
      quota_calls_allowed
    }
  }
`;

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
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

export const GET_ORG_STATS = gql`
  query GetOrgStats($org_id: uuid!) {
    org_run_stats(where: { org_id: { _eq: $org_id } }) {
      total_runs
      avg_duration_seconds
    }
  }
`;
