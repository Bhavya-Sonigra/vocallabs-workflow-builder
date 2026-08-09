import type { Request, Response } from "express";
import {
  gqlClient,
  GET_WORKFLOW_WITH_ORG,
  GET_ORG_MEMBER_ROLE,
  GET_WORKFLOW_STEPS,
  INSERT_WORKFLOW_RUN,
  executeSteps,
} from "./_utils/executor";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // ── Parse Hasura Action payload ────────────────────────────────────
    const {
      input: { workflow_id },
      session_variables,
    } = req.body;

    const userId: string =
      session_variables?.["x-hasura-user-id"] ||
      session_variables?.["X-Hasura-User-Id"];

    if (!workflow_id || !userId) {
      return res.status(400).json({
        message: "Missing workflow_id or user session",
        extensions: { code: "BAD_REQUEST" },
      });
    }

    // ── 1. Fetch workflow + org ────────────────────────────────────────
    const workflowData: any = await gqlClient.request(GET_WORKFLOW_WITH_ORG, {
      workflow_id,
    });
    const workflow = workflowData.workflows_by_pk;

    if (!workflow) {
      return res.status(400).json({
        message: "Workflow not found",
        extensions: { code: "NOT_FOUND" },
      });
    }

    const orgId = workflow.org_id;
    const org = workflow.organization;

    // ── 2. Permission check (Layer 2) ─────────────────────────────────
    const roleData: any = await gqlClient.request(GET_ORG_MEMBER_ROLE, {
      org_id: orgId,
      user_id: userId,
    });

    const memberRole = roleData.org_members?.[0]?.role;

    if (!memberRole || memberRole === "viewer") {
      return res.status(400).json({
        message: "Forbidden: you need owner or editor role to run workflows",
        extensions: { code: "FORBIDDEN" },
      });
    }

    // ── 3. Quota check ────────────────────────────────────────────────
    if (org.quota_calls_used >= org.quota_calls_allowed) {
      return res.status(400).json({
        message: `Quota exhausted: ${org.quota_calls_used}/${org.quota_calls_allowed} calls used`,
        extensions: { code: "QUOTA_EXCEEDED" },
      });
    }

    // ── 4. Insert workflow_run ─────────────────────────────────────────
    const runData: any = await gqlClient.request(INSERT_WORKFLOW_RUN, {
      workflow_id,
      org_id: orgId,
      triggered_by: userId,
      status: "running",
      trigger_type: "manual",
    });

    const runId = runData.insert_workflow_runs_one.id;

    // ── 5. Fetch steps ─────────────────────────────────────────────────
    const stepsData: any = await gqlClient.request(GET_WORKFLOW_STEPS, {
      workflow_id,
    });
    const steps = stepsData.workflow_steps;

    // ── 6. Execute ─────────────────────────────────────────────────────
    const result = await executeSteps(runId, orgId, steps);

    return res.status(200).json({ run_id: runId, status: result.status });
  } catch (err: any) {
    console.error("triggerWorkflowRun error:", err);
    return res.status(500).json({
      message: err.message || "Internal server error",
      extensions: { code: "INTERNAL_ERROR" },
    });
  }
}
