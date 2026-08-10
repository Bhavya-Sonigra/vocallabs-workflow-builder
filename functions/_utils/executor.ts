/**
 * Shared execution engine used by both triggerWorkflowRun and approveStep.
 *
 * Contains:
 *  - GraphQL client + all admin-level operations
 *  - Step executor functions (http_request, llm_call, conditional_branch, etc.)
 *  - The reusable executeSteps() loop
 */

import { GraphQLClient, gql } from "graphql-request";

// ────────────────────────────────────────────────────────────────────────────
// GraphQL client (admin — bypasses RLS)
// ────────────────────────────────────────────────────────────────────────────

const GRAPHQL_URL =
  process.env.NHOST_GRAPHQL_URL ||
  (process.env.NHOST_BACKEND_URL ? `${process.env.NHOST_BACKEND_URL}/v1/graphql` : "http://graphql:8080/v1/graphql");

const ADMIN_SECRET =
  process.env.NHOST_ADMIN_SECRET ||
  process.env.HASURA_GRAPHQL_ADMIN_SECRET ||
  "nhost-admin-secret";

export const gqlClient = new GraphQLClient(GRAPHQL_URL, {
  headers: { "x-hasura-admin-secret": ADMIN_SECRET },
});

// ────────────────────────────────────────────────────────────────────────────
// GraphQL operations
// ────────────────────────────────────────────────────────────────────────────

export const GET_WORKFLOW_WITH_ORG = gql`
  query GetWorkflowWithOrg($workflow_id: uuid!) {
    workflows_by_pk(id: $workflow_id) {
      id
      org_id
      name
      organization {
        id
        quota_calls_used
        quota_calls_allowed
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

export const GET_WORKFLOW_STEPS = gql`
  query GetWorkflowSteps($workflow_id: uuid!) {
    workflow_steps(
      where: { workflow_id: { _eq: $workflow_id } }
      order_by: { step_order: asc }
    ) {
      id
      type
      step_order
      config
    }
  }
`;

export const GET_REMAINING_STEPS = gql`
  query GetRemainingSteps($workflow_id: uuid!, $after_order: Int!) {
    workflow_steps(
      where: {
        workflow_id: { _eq: $workflow_id }
        step_order: { _gt: $after_order }
      }
      order_by: { step_order: asc }
    ) {
      id
      type
      step_order
      config
    }
  }
`;

export const GET_STEP_RUN_WITH_CONTEXT = gql`
  query GetStepRunWithContext($step_run_id: uuid!) {
    step_runs_by_pk(id: $step_run_id) {
      id
      status
      workflow_run_id
      workflow_step_id
      output
      workflow_step {
        id
        type
        step_order
        workflow_id
        workflow {
          id
          org_id
        }
      }
      workflow_run {
        id
        status
        org_id
        workflow_id
      }
    }
  }
`;

export const INSERT_WORKFLOW_RUN = gql`
  mutation InsertWorkflowRun(
    $workflow_id: uuid!
    $org_id: uuid!
    $triggered_by: uuid!
    $status: run_status!
    $trigger_type: trigger_type!
  ) {
    insert_workflow_runs_one(
      object: {
        workflow_id: $workflow_id
        org_id: $org_id
        triggered_by: $triggered_by
        status: $status
        trigger_type: $trigger_type
        started_at: "now()"
      }
    ) {
      id
    }
  }
`;

export const UPDATE_WORKFLOW_RUN = gql`
  mutation UpdateWorkflowRun(
    $run_id: uuid!
    $status: run_status!
    $finished_at: timestamptz
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $run_id }
      _set: { status: $status, finished_at: $finished_at }
    ) {
      id
    }
  }
`;

export const INSERT_STEP_RUN = gql`
  mutation InsertStepRun(
    $workflow_run_id: uuid!
    $workflow_step_id: uuid!
    $status: step_run_status!
    $input: jsonb
  ) {
    insert_step_runs_one(
      object: {
        workflow_run_id: $workflow_run_id
        workflow_step_id: $workflow_step_id
        status: $status
        started_at: "now()"
        attempt_count: 1
        input: $input
      }
    ) {
      id
    }
  }
`;

export const UPDATE_STEP_RUN = gql`
  mutation UpdateStepRun(
    $step_run_id: uuid!
    $status: step_run_status!
    $output: jsonb
    $error: String
    $finished_at: timestamptz
    $attempt_count: Int
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $step_run_id }
      _set: {
        status: $status
        output: $output
        error: $error
        finished_at: $finished_at
        attempt_count: $attempt_count
      }
    ) {
      id
    }
  }
`;

export const APPROVE_STEP_RUN = gql`
  mutation ApproveStepRun(
    $step_run_id: uuid!
    $approved_by: uuid!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $step_run_id }
      _set: {
        status: "succeeded"
        approved_by: $approved_by
        approved_at: "now()"
        finished_at: "now()"
      }
    ) {
      id
    }
  }
`;

export const INCREMENT_QUOTA = gql`
  mutation IncrementQuota($org_id: uuid!) {
    update_organizations_by_pk(
      pk_columns: { id: $org_id }
      _inc: { quota_calls_used: 1 }
    ) {
      id
      quota_calls_used
    }
  }
`;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type StepConfig = Record<string, any>;
export type StepOutput = Record<string, any>;

export interface WorkflowStep {
  id: string;
  type: string;
  step_order: number;
  config: any;
}

export interface StepResult {
  success: boolean;
  output?: StepOutput;
  error?: string;
  skipRemaining?: boolean;
}

export interface ExecuteStepsResult {
  status: "completed" | "paused" | "failed";
  paused_at_step_order?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Step executors
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute an http_request step with 1 retry on failure.
 */
export async function executeHttpRequest(
  config: StepConfig
): Promise<StepResult> {
  const { url, method = "GET", headers = {}, body } = config;

  if (!url) {
    return { success: false, error: "http_request: missing 'url' in config" };
  }

  const fetchOnce = async (): Promise<globalThis.Response> => {
    const opts: RequestInit = {
      method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    if (body && method !== "GET" && method !== "HEAD") {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    return fetch(url, opts);
  };

  // Attempt 1
  try {
    const resp = await fetchOnce();
    if (resp.ok) {
      const text = await resp.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { text };
      }
      return { success: true, output: { status: resp.status, data } };
    }
  } catch {
    // fall through to retry
  }

  // Attempt 2 (retry)
  try {
    const resp = await fetchOnce();
    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
    if (resp.ok) {
      return {
        success: true,
        output: { status: resp.status, data, retried: true },
      };
    }
    return {
      success: false,
      error: `http_request failed after retry: ${resp.status} — ${text.slice(0, 500)}`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `http_request failed after retry: ${e.message}`,
    };
  }
}

/**
 * Execute an llm_call step via OpenRouter.
 *
 * Config shape expected in the step's config:
 *   {
 *     "prompt": "Summarize the previous step output",
 *     "model": "meta-llama/llama-3-8b-instruct:free",  // optional override
 *     "system": "You are a helpful assistant."          // optional system prompt
 *   }
 *
 * Previous step outputs are injected into the user message as JSON context.
 */
export async function executeLlmCall(
  config: StepConfig,
  previousOutputs: Record<string, StepOutput>
): Promise<StepResult> {
  // ── 1. Read & validate env key ────────────────────────────────────────────
  let apiKey = process.env.LLM_API_KEY;
  
  // Local fallback: read directly from file if Nhost CLI didn't inject it
  if (!apiKey) {
    try {
      const fs = require("fs");
      const envDev = fs.readFileSync("/opt/project/.env.development", "utf8");
      const match = envDev.match(/LLM_API_KEY\s*=\s*['"]?(gsk_[^'"\n\r]+)['"]?/);
      if (match) apiKey = match[1];
    } catch {}
  }
  
  if (!apiKey) {
    try {
      const fs = require("fs");
      const secrets = fs.readFileSync("/opt/project/.secrets", "utf8");
      const match = secrets.match(/LLM_API_KEY\s*=\s*['"]?(gsk_[^'"\n\r]+)['"]?/);
      if (match) apiKey = match[1];
    } catch {}
  }

  if (!apiKey) {
    return {
      success: false,
      error:
        "llm_call: LLM_API_KEY is not configured. Add it to your Nhost secrets and [functions.env] in nhost.toml.",
    };
  }

  // ── 2. Build messages ─────────────────────────────────────────────────────
  const prompt: string =
    config.prompt || "Analyze the input and return a concise summary.";
  const model: string =
    config.model || "llama-3.1-8b-instant"; // Groq's current Llama 3.1 8B model
  const systemPrompt: string =
    config.system || "You are a helpful AI assistant in an automated workflow.";

  // Inject context from previous steps so the LLM can use upstream outputs
  const contextBlock =
    Object.keys(previousOutputs).length > 0
      ? `\n\n---\nContext from previous workflow steps:\n${JSON.stringify(previousOutputs, null, 2)}`
      : "";

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `${prompt}${contextBlock}` },
  ];

  // ── 3. Make the API call (with one retry on transient failure) ────────────
  const callGroq = async (): Promise<StepResult> => {
    let resp: globalThis.Response;
    try {
      resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
        // Groq is very fast but let's give it 30s headroom
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e: any) {
      return {
        success: false,
        error: `llm_call: network error — ${e.message}`,
      };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "(unreadable)");
      return {
        success: false,
        error: `llm_call: Groq returned ${resp.status} — ${errText.slice(0, 500)}`,
      };
    }

    let json: any;
    try {
      json = await resp.json();
    } catch (e: any) {
      return {
        success: false,
        error: `llm_call: failed to parse Groq response — ${e.message}`,
      };
    }

    const text: string | undefined = json?.choices?.[0]?.message?.content;

    if (!text) {
      return {
        success: false,
        error: `llm_call: unexpected response shape — ${JSON.stringify(json).slice(0, 500)}`,
      };
    }

    return {
      success: true,
      output: {
        text,
        model: json?.model ?? model,
        usage: json?.usage ?? null,
      },
    };
  };

  // ── 4. First attempt ──────────────────────────────────────────────────────
  const first = await callGroq();
  if (first.success) return first;

  // ── 5. One retry on failure ───────────────────────────────────────────────
  console.warn(`[executor] llm_call first attempt failed: ${first.error} — retrying…`);
  return callGroq();
}


/**
 * Execute a conditional_branch step.
 */
export function executeConditionalBranch(
  config: StepConfig,
  previousOutputs: Record<string, StepOutput>,
  stepKeys: string[]
): StepResult {
  const field = config.field || "text";
  const operator = config.operator || "truthy";
  const expectedValue = config.value;

  // Find the immediate previous step's output if stepKeys is populated
  const prevStepKey = stepKeys.length > 1 ? stepKeys[stepKeys.length - 2] : null;
  const prevOutput = prevStepKey ? previousOutputs[prevStepKey] : {};

  // Extract the actual value based on the field name
  const actualValue = prevOutput ? prevOutput[field] : undefined;
  let passed = false;

  switch (operator) {
    case "equals":
      passed = String(actualValue) === String(expectedValue);
      break;
    case "not_equals":
      passed = String(actualValue) !== String(expectedValue);
      break;
    case "contains":
      passed = String(actualValue).includes(String(expectedValue));
      break;
    case "truthy":
      passed = !!actualValue;
      break;
    default:
      return {
        success: false,
        error: `conditional_branch: Unknown operator '${operator}'`,
      };
  }

  return {
    success: true,
    output: {
      result: passed,
      branch_taken: passed ? "true_path" : "false_path",
      evaluated_value: actualValue,
    },
  };
}

/**
 * Execute a db_write step.
 */
export async function executeDbWrite(
  config: StepConfig,
  stepRunId: string,
  workflowRunId: string,
  gqlClient: GraphQLClient
): Promise<StepResult> {
  const dataToSave = config.data || { note: "Workflow execution log" };
  
  const mutation = `
    mutation InsertResult($workflow_run_id: uuid!, $step_run_id: uuid!, $data: jsonb!) {
      insert_workflow_results_one(object: {
        workflow_run_id: $workflow_run_id,
        step_run_id: $step_run_id,
        data: $data
      }) {
        id
      }
    }
  `;

  await gqlClient.request(mutation, {
    workflow_run_id: workflowRunId,
    step_run_id: stepRunId,
    data: dataToSave
  });

  return {
    success: true,
    output: {
      action: "db_write",
      saved_data: dataToSave,
      message: "Successfully saved to workflow_results table",
    },
  };
}

/**
 * Execute a notify step.
 */
export async function executeNotify(
  config: StepConfig,
  workflowRunId: string,
  gqlClient: GraphQLClient
): Promise<StepResult> {
  const channel = config.channel || "email";
  const recipient = config.to || "admin@example.com";
  const message = config.message || "Workflow notification triggered";

  const mutation = `
    mutation InsertNotification($workflow_run_id: uuid!, $channel: String!, $message: String!, $recipient: String!) {
      insert_notifications_one(object: {
        workflow_run_id: $workflow_run_id,
        channel: $channel,
        message: $message,
        recipient: $recipient
      }) {
        id
      }
    }
  `;

  await gqlClient.request(mutation, {
    workflow_run_id: workflowRunId,
    channel,
    message,
    recipient
  });

  return {
    success: true,
    output: {
      action: "notify",
      channel,
      recipient,
      message: "Notification queued and Event Trigger fired successfully",
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Shared execution loop
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute an ordered array of workflow steps within an existing workflow run.
 *
 * - Creates step_run rows, dispatches by type, records results.
 * - On approval_gate: pauses and returns immediately.
 * - On failure: marks run as failed and returns.
 * - On success / skip: marks run as completed and increments quota.
 *
 * @param runId         The workflow_runs.id to attach step_runs to.
 * @param orgId         The org owning this run (for quota increment).
 * @param steps         Ordered steps to execute.
 * @param seedOutputs   Pre-existing outputs context (e.g. from steps before a pause).
 * @param seedStepKeys  Pre-existing step keys (for conditional_branch lookups).
 */
export async function executeSteps(
  runId: string,
  orgId: string,
  steps: WorkflowStep[],
  seedOutputs: Record<string, StepOutput> = {},
  seedStepKeys: string[] = []
): Promise<ExecuteStepsResult> {
  const outputs = { ...seedOutputs };
  const stepKeys = [...seedStepKeys];

  for (const step of steps) {
    const stepKey = `step_${step.step_order}_${step.type}`;
    stepKeys.push(stepKey);

    // Create step_run row (status: running)
    const stepRunData: any = await gqlClient.request(INSERT_STEP_RUN, {
      workflow_run_id: runId,
      workflow_step_id: step.id,
      status: "running",
      input: outputs,
    });
    const stepRunId = stepRunData.insert_step_runs_one.id;

    let result: StepResult;

    // ── Dispatch by step type ────────────────────────────────────────
    switch (step.type) {
      case "http_request":
        result = await executeHttpRequest(step.config || {});
        break;

      case "llm_call":
        result = await executeLlmCall(step.config || {}, outputs);
        break;

      case "conditional_branch":
        result = executeConditionalBranch(step.config || {}, outputs, stepKeys);
        break;

      case "db_write":
        result = await executeDbWrite(step.config || {}, stepRunId, runId, gqlClient);
        break;

      case "notify":
        result = await executeNotify(step.config || {}, runId, gqlClient);
        break;

      case "approval_gate":
        // ── Pause ────────────────────────────────────────────────────
        await gqlClient.request(UPDATE_STEP_RUN, {
          step_run_id: stepRunId,
          status: "paused",
          output: {
            message: "Awaiting human approval",
            paused_at_step_order: step.step_order,
          },
          error: null,
          finished_at: null,
          attempt_count: 1,
        });

        await gqlClient.request(UPDATE_WORKFLOW_RUN, {
          run_id: runId,
          status: "paused",
          finished_at: null,
        });

        return { status: "paused", paused_at_step_order: step.step_order };

      default:
        result = { success: false, error: `Unknown step type: ${step.type}` };
    }

    // ── Record result ────────────────────────────────────────────────
    if (result.success) {
      outputs[stepKey] = result.output || {};

      await gqlClient.request(UPDATE_STEP_RUN, {
        step_run_id: stepRunId,
        status: "succeeded",
        output: result.output || {},
        error: null,
        finished_at: new Date().toISOString(),
        attempt_count: 1,
      });

      if (result.skipRemaining) {
        break; // conditional_branch said skip — still counts as completed
      }
    } else {
      // Step failed → fail the entire run
      await gqlClient.request(UPDATE_STEP_RUN, {
        step_run_id: stepRunId,
        status: "failed",
        output: result.output || null,
        error: result.error || "Unknown error",
        finished_at: new Date().toISOString(),
        attempt_count: step.type === "http_request" ? 2 : 1,
      });

      await gqlClient.request(UPDATE_WORKFLOW_RUN, {
        run_id: runId,
        status: "failed",
        finished_at: new Date().toISOString(),
      });

      return { status: "failed" };
    }
  }

  // ── All steps completed ──────────────────────────────────────────────
  await gqlClient.request(UPDATE_WORKFLOW_RUN, {
    run_id: runId,
    status: "completed",
    finished_at: new Date().toISOString(),
  });

  await gqlClient.request(INCREMENT_QUOTA, { org_id: orgId });

  return { status: "completed" };
}
