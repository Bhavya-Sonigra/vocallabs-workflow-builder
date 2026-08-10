"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@apollo/client/react";
import AuthGuard from "@/components/auth-guard";
import { useAuth } from "@/hooks/useAuth";
import { GET_WORKFLOW, GET_ORG_MEMBER_ROLE } from "@/lib/graphql/queries";
import {
  INSERT_WORKFLOW_STEP,
  DELETE_WORKFLOW_STEP,
  INSERT_WORKFLOW_TRIGGER,
  TRIGGER_WORKFLOW_RUN,
} from "@/lib/graphql/mutations";
import { FiPlay, FiArrowUp, FiArrowDown, FiTrash2, FiPlus } from "react-icons/fi";

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
    case "succeeded":
    case "completed":
      return "text-teal-600";
    case "running":
      return "text-blue-400";
    case "failed":
      return "text-rose-600";
    case "paused":
      return "text-yellow-400";
    default:
      return "text-slate-400";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "succeeded":
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
  const router = useRouter();
  const workflowId = params.id as string;
  const { user } = useAuth();

  // --- State ---
  const [newStepType, setNewStepType] = useState<string>(STEP_TYPES[0]);
  const [newStepConfig, setNewStepConfig] = useState("{}");
  const [triggerType, setTriggerType] = useState<string>(TRIGGER_TYPES[0]);
  const [triggerConfig, setTriggerConfig] = useState("{}");
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
        const runId = d.triggerWorkflowRun.run_id;
        router.push(`/workflows/${workflowId}/runs/${runId}`);
      },
      onError: (e) => setRunError(e.message),
    }
  );

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
        step_order: steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1,
        config,
      },
    });
    setNewStepConfig("{}");
  };

  const handleReorder = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= steps.length) return;
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
        <p className="text-slate-400">Workflow not found.</p>
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
            <p className="text-sm text-slate-500 mt-1">{workflow.description}</p>
          )}
        </div>
        {!isViewer && (
          <button
            onClick={handleRun}
            disabled={triggering}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-500 disabled:opacity-50 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
          >
            {triggering ? "Starting..." : <><FiPlay className="w-4 h-4" /> Run</>}
          </button>
        )}
      </div>

      {runError && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-red-900 rounded-lg px-3 py-2 mb-6">
          {runError}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Steps */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Steps</h2>

          {steps.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">No steps yet.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className="p-3 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">
                        #{step.step_order}
                      </span>
                      <span className="text-sm font-medium px-2 py-0.5 bg-slate-100 rounded">
                        {step.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleReorder(i, "up")}
                        disabled={i === 0}
                        className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md disabled:opacity-30 transition-colors"
                        title="Move up"
                      >
                        <FiArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleReorder(i, "down")}
                        disabled={i === steps.length - 1}
                        className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md disabled:opacity-30 transition-colors"
                        title="Move down"
                      >
                        <FiArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          deleteStep({ variables: { id: step.id } })
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md ml-2 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <pre className="text-xs text-slate-400 mt-2 overflow-auto max-h-24">
                    {JSON.stringify(step.config, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Add Step form */}
          <form
            onSubmit={handleAddStep}
            className="p-4 border border-slate-200 rounded-lg space-y-3"
          >
            <h3 className="text-sm font-medium text-slate-500">Add Step</h3>
            <select
              value={newStepType}
              onChange={(e) => setNewStepType(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-zinc-500"
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
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              disabled={addingStep}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {addingStep ? "Adding..." : <><FiPlus className="w-4 h-4" /> Add Step</>}
            </button>
          </form>
        </div>

        {/* Right column: Trigger + Run status */}
        <div className="space-y-8">
          {/* Trigger section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Trigger</h2>
            {triggers.length > 0 ? (
              <div className="p-3 border border-slate-200 rounded-lg">
                <span className="text-sm font-medium px-2 py-0.5 bg-slate-100 rounded">
                  {triggers[0].type}
                </span>
                <pre className="text-xs text-slate-400 mt-2 overflow-auto max-h-24">
                  {JSON.stringify(triggers[0].config, null, 2)}
                </pre>
              </div>
            ) : (
              <form
                onSubmit={handleAttachTrigger}
                className="p-4 border border-slate-200 rounded-lg space-y-3"
              >
                <h3 className="text-sm font-medium text-slate-500">
                  Attach Trigger
                </h3>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-zinc-500"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  disabled={addingTrigger}
                  className="px-4 py-2 bg-slate-200 text-slate-800 text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                >
                  {addingTrigger ? "Attaching..." : "Attach Trigger"}
                </button>
              </form>
            )}
          </div>

          {/* Trigger run info */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl text-sm text-slate-500 shadow-sm">
            <p className="font-bold text-slate-800 flex items-center gap-2 mb-2">
              <FiPlay className="w-4 h-4 text-teal-600" /> Trigger a Run
            </p>
            <p className="text-xs leading-relaxed">
              Click the Run button above to start a live execution. You&apos;ll be
              taken to the run view where you can watch each step execute in
              real-time and approve any paused steps.
            </p>
          </div>
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
