"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useSubscription } from "@apollo/client/react";
import AuthGuard from "@/components/auth-guard";
import { useAuth } from "@/hooks/useAuth";
import { GET_WORKFLOW, GET_ORG_MEMBER_ROLE } from "@/lib/graphql/queries";
import {
  INSERT_WORKFLOW_STEP,
  DELETE_WORKFLOW_STEP,
  INSERT_WORKFLOW_TRIGGER,
  TRIGGER_WORKFLOW_RUN,
  APPROVE_STEP,
} from "@/lib/graphql/mutations";
import { SUBSCRIBE_STEP_RUNS } from "@/lib/graphql/subscriptions";

const STEP_TYPES = [
  "llm_call",
  "http_request",
  "db_write",
  "notify",
  "conditional_branch",
  "approval_gate",
] as const;

const TRIGGER_TYPES = ["webhook", "schedule", "manual"] as const;

interface WorkflowStep {
  id: string;
  type: string;
  step_order: number;
  config: Record<string, unknown>;
}

interface WorkflowTrigger {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

interface StepRun {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  output: unknown;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  workflow_step_id: string;
  workflow_step: {
    type: string;
    step_order: number;
  };
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "text-emerald-400";
    case "running":
      return "text-blue-400";
    case "failed":
      return "text-red-400";
    case "paused":
      return "text-yellow-400";
    default:
      return "text-zinc-500";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-400";
    case "running":
      return "bg-blue-400 animate-pulse";
    case "failed":
      return "bg-red-400";
    case "paused":
      return "bg-yellow-400 animate-pulse";
    default:
      return "bg-zinc-600";
  }
}

function BuilderContent() {
  const params = useParams();
  const workflowId = params.id as string;
  const { user } = useAuth();

  // --- State ---
  const [newStepType, setNewStepType] = useState<string>(STEP_TYPES[0]);
  const [newStepConfig, setNewStepConfig] = useState("{}");
  const [triggerType, setTriggerType] = useState<string>(TRIGGER_TYPES[0]);
  const [triggerConfig, setTriggerConfig] = useState("{}");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState("");

  // --- Queries ---
  const { data, loading, refetch } = useQuery<any>(GET_WORKFLOW, {
    variables: { id: workflowId },
  });

  const workflow = data?.workflows_by_pk;
  const steps: WorkflowStep[] = workflow?.workflow_steps ?? [];
  const triggers: WorkflowTrigger[] = workflow?.workflow_triggers ?? [];
  const orgId = workflow?.org_id;

  const { data: roleData } = useQuery<any>(GET_ORG_MEMBER_ROLE, {
    variables: { org_id: orgId, user_id: user?.id },
    skip: !orgId || !user?.id,
  });

  const userRole = roleData?.org_members?.[0]?.role;
  const isViewer = userRole === "viewer";

  // --- Mutations ---
  const [insertStep, { loading: addingStep }] = useMutation(
    INSERT_WORKFLOW_STEP,
    { onCompleted: () => refetch() }
  );

  const [deleteStep] = useMutation(DELETE_WORKFLOW_STEP, {
    onCompleted: () => refetch(),
  });

  const [insertTrigger, { loading: addingTrigger }] = useMutation(
    INSERT_WORKFLOW_TRIGGER,
    { onCompleted: () => refetch() }
  );

  const [triggerRun, { loading: triggering }] = useMutation(
    TRIGGER_WORKFLOW_RUN,
    {
      onCompleted: (d: any) => {
        setActiveRunId(d.triggerWorkflowRun.run_id);
        setRunError("");
      },
      onError: (e) => setRunError(e.message),
    }
  );

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  // --- Subscription ---
  const { data: subData } = useSubscription<any>(SUBSCRIBE_STEP_RUNS, {
    variables: { workflow_run_id: activeRunId },
    skip: !activeRunId,
  });

  const stepRuns: StepRun[] = subData?.step_runs ?? [];

  // --- Handlers ---
  const handleAddStep = async (e: React.FormEvent) => {
    e.preventDefault();
    let config;
    try {
      config = JSON.parse(newStepConfig);
    } catch {
      alert("Invalid JSON in config");
      return;
    }
    await insertStep({
      variables: {
        workflow_id: workflowId,
        type: newStepType,
        step_order: steps.length + 1,
        config,
      },
    });
    setNewStepConfig("{}");
  };

  const handleReorder = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= steps.length) return;

    // Delete both and re-insert with swapped orders
    // Simpler: delete both, refetch, re-insert. But that's complex.
    // Instead we'll delete and re-insert — but the simplest approach for now
    // is just to delete all and re-insert in new order.
    // Actually, let's just swap step_order via two deletes and inserts.
    const a = steps[index];
    const b = steps[swapIndex];
    await deleteStep({ variables: { id: a.id } });
    await deleteStep({ variables: { id: b.id } });
    await insertStep({
      variables: {
        workflow_id: workflowId,
        type: a.type,
        step_order: b.step_order,
        config: a.config,
      },
    });
    await insertStep({
      variables: {
        workflow_id: workflowId,
        type: b.type,
        step_order: a.step_order,
        config: b.config,
      },
    });
  };

  const handleAttachTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    let config;
    try {
      config = JSON.parse(triggerConfig);
    } catch {
      alert("Invalid JSON in trigger config");
      return;
    }
    await insertTrigger({
      variables: { workflow_id: workflowId, type: triggerType, config },
    });
    setTriggerConfig("{}");
  };

  const handleRun = () => {
    triggerRun({ variables: { workflow_id: workflowId } });
  };

  const handleApprove = async (stepRunId: string) => {
    await approveStep({ variables: { step_run_id: stepRunId } });
  };

  // --- Render ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-zinc-500">Workflow not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{workflow.name}</h1>
          {workflow.description && (
            <p className="text-sm text-zinc-400 mt-1">{workflow.description}</p>
          )}
        </div>
        {!isViewer && (
          <button
            onClick={handleRun}
            disabled={triggering}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {triggering ? "Starting..." : "▶ Run"}
          </button>
        )}
      </div>

      {runError && (
        <p className="text-sm text-red-400 bg-red-950 border border-red-900 rounded-lg px-3 py-2 mb-6">
          {runError}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Steps */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Steps</h2>

          {steps.length === 0 ? (
            <p className="text-sm text-zinc-500 mb-4">No steps yet.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className="p-3 border border-zinc-800 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">
                        #{step.step_order}
                      </span>
                      <span className="text-sm font-medium px-2 py-0.5 bg-zinc-800 rounded">
                        {step.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleReorder(i, "up")}
                        disabled={i === 0}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 text-xs"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleReorder(i, "down")}
                        disabled={i === steps.length - 1}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 text-xs"
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() =>
                          deleteStep({ variables: { id: step.id } })
                        }
                        className="p-1 text-zinc-500 hover:text-red-400 text-xs ml-2"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <pre className="text-xs text-zinc-500 mt-2 overflow-auto max-h-24">
                    {JSON.stringify(step.config, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Add Step form */}
          <form
            onSubmit={handleAddStep}
            className="p-4 border border-zinc-800 rounded-lg space-y-3"
          >
            <h3 className="text-sm font-medium text-zinc-400">Add Step</h3>
            <select
              value={newStepType}
              onChange={(e) => setNewStepType(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500"
            >
              {STEP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <textarea
              value={newStepConfig}
              onChange={(e) => setNewStepConfig(e.target.value)}
              rows={4}
              placeholder='{"key": "value"}'
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={addingStep}
              className="px-4 py-2 bg-zinc-700 text-white text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-50 transition-colors"
            >
              {addingStep ? "Adding..." : "+ Add Step"}
            </button>
          </form>
        </div>

        {/* Right column: Trigger + Run status */}
        <div className="space-y-8">
          {/* Trigger section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Trigger</h2>
            {triggers.length > 0 ? (
              <div className="p-3 border border-zinc-800 rounded-lg">
                <span className="text-sm font-medium px-2 py-0.5 bg-zinc-800 rounded">
                  {triggers[0].type}
                </span>
                <pre className="text-xs text-zinc-500 mt-2 overflow-auto max-h-24">
                  {JSON.stringify(triggers[0].config, null, 2)}
                </pre>
              </div>
            ) : (
              <form
                onSubmit={handleAttachTrigger}
                className="p-4 border border-zinc-800 rounded-lg space-y-3"
              >
                <h3 className="text-sm font-medium text-zinc-400">
                  Attach Trigger
                </h3>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <textarea
                  value={triggerConfig}
                  onChange={(e) => setTriggerConfig(e.target.value)}
                  rows={3}
                  placeholder='{"key": "value"}'
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white font-mono text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  disabled={addingTrigger}
                  className="px-4 py-2 bg-zinc-700 text-white text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                >
                  {addingTrigger ? "Attaching..." : "Attach Trigger"}
                </button>
              </form>
            )}
          </div>

          {/* Live run status */}
          {activeRunId && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Run Status</h2>
              <p className="text-xs text-zinc-500 mb-3 font-mono">
                Run: {activeRunId}
              </p>

              {stepRuns.length === 0 ? (
                <p className="text-sm text-zinc-500">Waiting for steps...</p>
              ) : (
                <div className="space-y-2">
                  {stepRuns.map((sr) => (
                    <div
                      key={sr.id}
                      className="p-3 border border-zinc-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${statusDot(sr.status)}`}
                          />
                          <span className="text-xs font-mono text-zinc-500">
                            #{sr.workflow_step?.step_order}
                          </span>
                          <span className="text-sm">
                            {sr.workflow_step?.type}
                          </span>
                        </div>
                        <span className={`text-xs font-medium ${statusColor(sr.status)}`}>
                          {sr.status}
                        </span>
                      </div>

                      {sr.error && (
                        <p className="text-xs text-red-400 mt-1">{sr.error}</p>
                      )}

                      {sr.status === "paused" && (
                        <button
                          onClick={() => handleApprove(sr.id)}
                          disabled={approving}
                          className="mt-2 px-3 py-1 bg-yellow-600 text-white text-xs font-medium rounded hover:bg-yellow-500 disabled:opacity-50 transition-colors"
                        >
                          {approving ? "Approving..." : "Approve"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <AuthGuard>
      <BuilderContent />
    </AuthGuard>
  );
}
