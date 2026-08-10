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
    // Read workflow_id and payload from body
    const { workflow_id, payload } = req.body;

    // Accepts x-hasura-user-id or an API token from headers
    let userId: string | string[] | undefined =
      req.headers["x-hasura-user-id"] || 
      req.headers["X-Hasura-User-Id"] || 
      req.headers["authorization"]?.replace("Bearer ", ""); 

    const adminSecret = req.headers["x-hasura-admin-secret"] || req.headers["X-Hasura-Admin-Secret"];
    const isAdmin = adminSecret === (process.env.HASURA_GRAPHQL_ADMIN_SECRET || "nhost-admin-secret");

    if (!workflow_id) {
      return res.status(400).json({
        success: false,
        message: "Missing workflow_id in request body",
      });
    }

    if (!userId && !isAdmin) {
      return res.status(401).json({
        success: false,
        message: "Missing user authentication context (x-hasura-user-id header or x-hasura-admin-secret)",
      });
    }

    // ── 1. Fetch workflow + org ────────────────────────────────────────
    const workflowData: any = await gqlClient.request(GET_WORKFLOW_WITH_ORG, {
      workflow_id,
    });
    const workflow = workflowData.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        success: false,
        message: "Workflow not found",
      });
    }

    // If triggered by an admin system without a specific user context, attribute the run to the workflow creator
    if (!userId && isAdmin) {
      userId = workflow.created_by;
    }

    if (typeof userId !== "string") {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const orgId = workflow.org_id;
    const org = workflow.organization;

    // ── 2. Permission check ───────────────────────────────────────────
    if (!isAdmin) {
      const roleData: any = await gqlClient.request(GET_ORG_MEMBER_ROLE, {
        org_id: orgId,
        user_id: userId,
      });

      const memberRole = roleData.org_members?.[0]?.role;

      if (!memberRole || memberRole === "viewer") {
        return res.status(403).json({
          success: false,
          message: "Forbidden: you need owner or editor role to trigger workflows",
        });
      }
    }

    // ── 3. Quota check ────────────────────────────────────────────────
    if (org.quota_calls_used >= org.quota_calls_allowed) {
      return res.status(429).json({
        success: false,
        message: `Quota exhausted: ${org.quota_calls_used}/${org.quota_calls_allowed} calls used`,
      });
    }

    // ── 4. Insert workflow_run ─────────────────────────────────────────
    const runData: any = await gqlClient.request(INSERT_WORKFLOW_RUN, {
      workflow_id,
      org_id: orgId,
      triggered_by: userId,
      status: "running",
      trigger_type: "webhook", // Tagged as webhook
    });

    const runId = runData.insert_workflow_runs_one.id;

    // ── 5. Fetch steps ─────────────────────────────────────────────────
    const stepsData: any = await gqlClient.request(GET_WORKFLOW_STEPS, {
      workflow_id,
    });
    const steps = stepsData.workflow_steps;

    // ── 6. Execute ─────────────────────────────────────────────────────
    // Seed initial payload if provided via webhook
    const seedOutputs = payload ? { webhook_trigger: { payload } } : {};
    
    // We send this to executeSteps without waiting if we want it to be fully async, 
    // but the executor expects us to wait. For this test we will await it.
    executeSteps(runId, orgId, steps, seedOutputs).catch(err => {
      console.error(`Background execution failed for run ${runId}:`, err);
    });

    // Return immediately for webhooks
    return res.status(200).json({ 
      success: true, 
      run_id: runId, 
      triggered_via: "webhook" 
    });

  } catch (err: any) {
    console.error("webhook trigger error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
}
