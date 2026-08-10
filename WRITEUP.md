# Architectural Write-Up: AI Agent Workflow Builder

## 1. Schema & Relationship Reasoning
The core data model is designed for strict multitenancy and asynchronous execution tracking. 
*   **Multitenancy (`organizations`, `org_members`)**: Every resource in the system inherently belongs to an organization. Users map to organizations via an intersection table (`org_members`) that stores their RBAC `role` (owner, editor, viewer).
*   **Workflow Definition (`workflows`, `workflow_steps`, `workflow_triggers`)**: A workflow acts as a container. The `workflow_steps` table represents the nodes (LLM calls, HTTP requests, etc.) and uses an integer `step_order` to enforce sequential execution. The configurations for both steps and triggers are stored as dynamic `jsonb` payloads, allowing the schema to remain rigid while accommodating diverse step requirements (e.g., URL parameters vs. LLM prompts).
*   **Execution Tracking (`workflow_runs`, `step_runs`)**: Execution state is decoupled from the definition. A `workflow_run` tracks the overall macro-state (pending, running, paused, completed, failed) and quota attribution. `step_runs` track the micro-state of each individual node execution, capturing the IO (`input`, `output`, `error`) and acting as the source of truth for the live GraphQL subscriptions powering the real-time frontend UI.

## 2. Enforcing Dual-Layer Permissions
Security is handled through a strict two-layered approach to ensure cross-org isolation (Layer 1) and mid-execution behavioral gating (Layer 2).

**Layer 1: Row-Level Security (RLS) & Cross-Org Isolation**
Every database operation is filtered through Hasura's permission engine using the `X-Hasura-User-Id` header. The policies aggressively join against the `org_members` table. For example, a user cannot even `SELECT` a workflow unless their `user_id` exists in `org_members` for that workflow's `org_id`. This guarantees airtight isolation; guessing a UUID belonging to another org instantly yields a `404 Not Found` equivalent at the database layer. 

**Layer 2: Action-Level & Step-Level Gating**
While Layer 1 dictates *visibility*, Layer 2 dictates *behavior* based on specific roles (`owner`, `editor`, `viewer`). 
1.  **Step Insertion Gating**: Hasura insert permissions on `workflow_steps` use a complex `_or` condition. If the user's role is `editor`, they are syntactically barred from inserting high-risk steps like `db_write` or `notify`. Only an `owner` satisfies the condition required to commit those step types to the database.
2.  **Mid-Execution Gating (Approval & Webhooks)**: Database RLS cannot dynamically check mid-execution business logic. Therefore, kicking off a workflow or approving an `approval_gate` step is routed exclusively through custom **Hasura Actions** (Node.js Serverless Functions). These handlers explicitly query the `org_members` table for the caller's role before proceeding. If a `viewer` attempts to call the `approveStep` mutation, the serverless function immediately throws a `403 Forbidden`, preventing the state machine from advancing.

## 3. The State Machine & Pause/Resume Architecture (Approval Gates)
The execution engine is implemented as a recursive asynchronous loop running in a Node.js serverless function. 
When the engine encounters an `approval_gate` step type, it intentionally aborts the loop. Before exiting, it executes a GraphQL mutation to update the `step_runs` table, setting the status to `paused` and logging the exact `step_order` index at which it stopped.

Because the frontend is subscribed to the `step_runs` table via WebSockets, the UI instantly reacts to this `paused` state and reveals an "Approve" button to authorized users.

When an authorized user clicks "Approve", it hits the `approveStep` Hasura Action. This serverless function verifies their role, marks the paused step as `succeeded` (logging their user ID in `approved_by`), and then **re-invokes the execution engine**. The engine pulls the workflow, looks at the completed steps, identifies where it left off, and recursively resumes execution through the remainder of the nodes.
