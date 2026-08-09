import type { Request, Response } from "express";
import {
  gqlClient,
  GET_STEP_RUN_WITH_CONTEXT,
  GET_ORG_MEMBER_ROLE,
  GET_REMAINING_STEPS,
  APPROVE_STEP_RUN,
  UPDATE_WORKFLOW_RUN,
  executeSteps,
} from "./_utils/executor";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // ── Parse Hasura Action payload ────────────────────────────────────
    const {
      input: { step_run_id },
      session_variables,
    } = req.body;

    const userId: string =
      session_variables?.["x-hasura-user-id"] ||
      session_variables?.["X-Hasura-User-Id"];

    if (!step_run_id || !userId) {
      return res.status(400).json({
        message: "Missing step_run_id or user session",
        extensions: { code: "BAD_REQUEST" },
      });
    }

    // ── 1. Hydrate: fetch step_run with full context ──────────────────
    const data: any = await gqlClient.request(GET_STEP_RUN_WITH_CONTEXT, {
      step_run_id,
    });
    const stepRun = data.step_runs_by_pk;

    if (!stepRun) {
      return res.status(400).json({
        message: "Step run not found",
        extensions: { code: "NOT_FOUND" },
      });
    }

    if (stepRun.status !== "paused") {
      return res.status(400).json({
        message: `Step run is not paused (current status: ${stepRun.status})`,
        extensions: { code: "INVALID_STATE" },
      });
    }

    const workflowRun = stepRun.workflow_run;
    const workflowStep = stepRun.workflow_step;

    if (!workflowRun || !workflowStep) {
      return res.status(400).json({
        message: "Could not resolve workflow run or step from this step_run",
        extensions: { code: "NOT_FOUND" },
      });
    }

    const runId = workflowRun.id;
    const orgId = workflowRun.org_id;
    const workflowId = workflowRun.workflow_id;
    const pausedStepOrder = workflowStep.step_order;

    // ── 2. Permission check (Layer 2) ─────────────────────────────────
    const roleData: any = await gqlClient.request(GET_ORG_MEMBER_ROLE, {
      org_id: orgId,
      user_id: userId,
    });

    const memberRole = roleData.org_members?.[0]?.role;

    if (!memberRole || memberRole === "viewer") {
      return res.status(400).json({
        message:
          "Forbidden: you need owner or editor role to approve workflow steps",
        extensions: { code: "FORBIDDEN" },
      });
    }

    // ── 3. Approve the paused step_run ────────────────────────────────
    await gqlClient.request(APPROVE_STEP_RUN, {
      step_run_id,
      approved_by: userId,
    });

    // ── 4. Set workflow_run back to running ───────────────────────────
    await gqlClient.request(UPDATE_WORKFLOW_RUN, {
      run_id: runId,
      status: "running",
      finished_at: null,
    });

    // ── 5. Fetch remaining steps (after the paused one) ──────────────
    const remainingData: any = await gqlClient.request(GET_REMAINING_STEPS, {
      workflow_id: workflowId,
      after_order: pausedStepOrder,
    });
    const remainingSteps = remainingData.workflow_steps;

    // ── 6. Resume execution loop ─────────────────────────────────────
    if (remainingSteps.length === 0) {
      // No more steps — mark as completed and increment quota
      await gqlClient.request(UPDATE_WORKFLOW_RUN, {
        run_id: runId,
        status: "completed",
        finished_at: new Date().toISOString(),
      });

      // Don't double-increment quota here — the original triggerWorkflowRun
      // didn't increment because it paused. We increment on final completion.
      const { INCREMENT_QUOTA } = await import("./_utils/executor");
      await gqlClient.request(INCREMENT_QUOTA, { org_id: orgId });

      return res.status(200).json({
        success: true,
        status: "completed",
      });
    }

    // Execute remaining steps using the shared loop.
    // Seed outputs from the approved step (if any were stored as output).
    const seedOutputs: Record<string, any> = {};
    if (stepRun.output && typeof stepRun.output === "object") {
      const gateKey = `step_${pausedStepOrder}_approval_gate`;
      seedOutputs[gateKey] = {
        ...stepRun.output,
        approved_by: userId,
        approved: true,
      };
    }
    const seedStepKeys = Object.keys(seedOutputs);

    const result = await executeSteps(
      runId,
      orgId,
      remainingSteps,
      seedOutputs,
      seedStepKeys
    );

    return res.status(200).json({
      success: true,
      status: result.status,
    });
  } catch (err: any) {
    console.error("approveStep error:", err);
    return res.status(500).json({
      message: err.message || "Internal server error",
      extensions: { code: "INTERNAL_ERROR" },
    });
  }
}
