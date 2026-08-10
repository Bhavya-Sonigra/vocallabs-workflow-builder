# VocaLabs Workflow Builder - Architecture & Security Write-up

This document outlines the schema reasoning, the dual-layer permission model, and the implementation of the state-machine execution engine—specifically the approval gate pause/resume functionality.

## 1. Schema Reasoning & Relationships

The database is built on PostgreSQL (via Nhost/Hasura) and is designed for strict multi-tenancy and execution tracking.

*   **`organizations` & `org_members`**: The root of the multi-tenant model. An organization holds a `quota_calls_used` and `quota_calls_allowed` integer to track API limits. Users belong to organizations via `org_members`, which assigns them a `role` (`owner`, `editor`, `viewer`).
*   **`workflows`**: Belongs to an `organization` and a `created_by` user. It acts as the container for an automation.
*   **`workflow_steps` & `workflow_triggers`**: Steps are ordered via a `step_order` integer and contain a `config` JSONB column for arbitrary payload parameters. Triggers define how the workflow starts (e.g., manual, webhook).
*   **`workflow_runs` & `step_runs`**: The execution trace. A `workflow_run` holds the overall status (`running`, `paused`, `completed`, `failed`). `step_runs` tracks the granular input, output, errors, and attempt counts of individual nodes.
*   **`org_run_stats` (View)**: A PostgreSQL View that aggregates the total runs and average execution duration grouped by `org_id`. It is exposed via Hasura as a read-only computed aggregation.

## 2. The Dual-Layer Permission Model

Security is enforced in two distinct layers to prevent cross-organization data leakage and unauthorized mid-execution mutations.

### Layer 1: Row-Level Security (Hasura Org + Role Scoping)
Role-based access alone is insufficient for multi-tenancy. A user might be an `editor` in Org A, but they should have zero access to Org B.
*   We enforce this via Hasura **Select/Insert/Update/Delete Permissions**.
*   Every query automatically filters where the `org_id` of the row maps to an `org_members` record where `user_id = X-Hasura-User-Id`.
*   Therefore, direct ID guessing (e.g., querying a Workflow UUID from another org) fails at the PostgreSQL level returning `0 rows`.
*   Additionally, mutation permissions check the specific role in that org (e.g., `viewer` is restricted from `workflows` updates).

### Layer 2: Action-Level Execution Gating
Some operations reach outside the sandbox (e.g., executing an LLM call or HTTP request) or require modifying execution state. Hasura RLS cannot safely evaluate these mid-execution decisions.
*   We use **Hasura Actions** backed by Node.js serverless functions (`trigger-workflow-run` and `approve-step`).
*   When `triggerWorkflowRun` is called, the Node.js function assumes an Admin role to fetch the workflow, but then explicitly queries the caller's role in that specific organization. If the caller is not an `owner` or `editor`, it throws a `403 Forbidden`.
*   This prevents viewers from manually bypassing the UI to trigger workflows, and ensures strict quota enforcement before the execution loop begins.

## 3. State Machine: Approval Gate Pause/Resume

The execution engine is a recursive, asynchronous loop running in Node.js that evaluates `step_runs` in order.

**Pausing Execution:**
When the engine encounters a step of type `approval_gate`:
1. It updates the `step_run` status to `paused`.
2. It updates the parent `workflow_run` status to `paused`.
3. The Node.js function gracefully exits (`return result`). The loop terminates.
4. Because the frontend uses GraphQL Subscriptions on `step_runs`, the UI immediately updates to show the "Awaiting Approval" state.

**Resuming Execution:**
To resume, an authorized user must explicitly call the `approveStep` Hasura Action.
1. The Action handler fetches the paused `step_run` and its parent `workflow_run`.
2. **Security Gate**: It verifies the caller is an `owner` or `editor` in the workflow's organization.
3. It updates the `step_run` to `succeeded` and logs the `approved_by` UUID and timestamp.
4. It updates the parent `workflow_run` back to `running`.
5. It fetches all remaining `workflow_steps` (where `step_order > current_order`) and re-invokes the asynchronous execution loop to process the rest of the pipeline.
