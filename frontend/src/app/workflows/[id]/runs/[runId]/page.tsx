"use client";

import { useParams, useRouter } from "next/navigation";
import { useSubscription, useMutation } from "@apollo/client/react";
import AuthGuard from "@/components/auth-guard";
import { SUBSCRIBE_WORKFLOW_RUN } from "@/lib/graphql/subscriptions";
import { APPROVE_STEP } from "@/lib/graphql/mutations";
import { 
  FiGlobe, 
  FiCpu, 
  FiLock, 
  FiDatabase, 
  FiBell, 
  FiGitBranch, 
  FiActivity,
  FiCheck,
  FiX,
  FiLoader,
  FiPauseCircle,
  FiArrowLeft
} from "react-icons/fi";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StepRun {
  id: string;
  status: "pending" | "running" | "paused" | "succeeded" | "failed";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  workflow_step_id: string;
  workflow_step: {
    type: string;
    step_order: number;
    config: Record<string, unknown>;
  };
}

interface WorkflowRun {
  id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  started_at: string | null;
  finished_at: string | null;
  step_runs: StepRun[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runStatusBadge(status: string) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider";
  switch (status) {
    case "running":
      return (
        <span className={`${base} bg-blue-50 text-blue-600 border border-blue-200 shadow-sm`}>
          <FiLoader className="w-3.5 h-3.5 animate-spin" />
          Running
        </span>
      );
    case "paused":
      return (
        <span className={`${base} bg-amber-50 text-amber-600 border border-amber-200 shadow-sm`}>
          <FiPauseCircle className="w-3.5 h-3.5 animate-pulse" />
          Awaiting Approval
        </span>
      );
    case "completed":
      return (
        <span className={`${base} bg-teal-50 text-teal-600 border border-teal-200 shadow-sm`}>
          <FiCheck className="w-3.5 h-3.5" />
          Completed
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-rose-50 text-rose-600 border border-rose-200 shadow-sm`}>
          <FiX className="w-3.5 h-3.5" />
          Failed
        </span>
      );
    default:
      return (
        <span className={`${base} bg-slate-100 text-slate-500 border border-slate-200`}>
          <FiActivity className="w-3.5 h-3.5" />
          {status}
        </span>
      );
  }
}

function StepTypeIcon({ type, className }: { type: string, className?: string }) {
  const props = { className: `w-5 h-5 ${className || ""}` };
  switch (type) {
    case "http_request": return <FiGlobe {...props} />;
    case "llm_call": return <FiCpu {...props} />;
    case "approval_gate": return <FiLock {...props} />;
    case "db_write": return <FiDatabase {...props} />;
    case "notify": return <FiBell {...props} />;
    case "conditional_branch": return <FiGitBranch {...props} />;
    default: return <FiActivity {...props} />;
  }
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "succeeded":
      return (
        <div className="w-10 h-10 rounded-xl bg-teal-50 border-2 border-teal-500 flex items-center justify-center text-teal-600 shadow-sm shadow-teal-500/20 flex-shrink-0">
          <FiCheck className="w-5 h-5 stroke-[3]" />
        </div>
      );
    case "running":
      return (
        <div className="w-10 h-10 rounded-xl bg-blue-50 border-2 border-blue-500 flex items-center justify-center text-blue-600 shadow-sm shadow-blue-500/20 flex-shrink-0">
          <FiLoader className="w-5 h-5 animate-spin stroke-[3]" />
        </div>
      );
    case "paused":
      return (
        <div className="w-10 h-10 rounded-xl bg-amber-50 border-2 border-amber-500 flex items-center justify-center text-amber-500 shadow-sm shadow-amber-500/20 flex-shrink-0">
          <FiPauseCircle className="w-5 h-5 animate-pulse stroke-[2.5]" />
        </div>
      );
    case "failed":
      return (
        <div className="w-10 h-10 rounded-xl bg-rose-50 border-2 border-rose-500 flex items-center justify-center text-rose-600 shadow-sm shadow-rose-500/20 flex-shrink-0">
          <FiX className="w-5 h-5 stroke-[3]" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-slate-300" />
        </div>
      );
  }
}

// ─── Step Run Card ────────────────────────────────────────────────────────────

function StepRunCard({
  stepRun,
  onApprove,
  approving,
}: {
  stepRun: StepRun;
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const { status, workflow_step, output, error } = stepRun;
  const type = workflow_step?.type ?? "unknown";
  const order = workflow_step?.step_order ?? "?";

  return (
    <div
      className={`relative flex gap-5 p-6 rounded-2xl border transition-all duration-300 ${
        status === "running"
          ? "border-blue-200 bg-white shadow-[0_8px_30px_rgb(59,130,246,0.12)]"
          : status === "paused"
          ? "border-amber-200 bg-amber-50/30 shadow-[0_8px_30px_rgb(245,158,11,0.08)]"
          : status === "succeeded"
          ? "border-teal-100 bg-white hover:border-teal-200 hover:shadow-md"
          : status === "failed"
          ? "border-rose-200 bg-rose-50/30"
          : "border-slate-200 bg-slate-50/50"
      }`}
    >
      {/* Status icon */}
      <StepStatusIcon status={status} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
            <StepTypeIcon type={type} className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold text-slate-800">{type}</span>
          <span className="text-sm font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">Step {order}</span>

          {/* Status chip */}
          <span
            className={`ml-auto text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
              status === "succeeded"
                ? "bg-teal-100 text-teal-700"
                : status === "running"
                ? "bg-blue-100 text-blue-700"
                : status === "paused"
                ? "bg-amber-100 text-amber-700"
                : status === "failed"
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {status}
          </span>
        </div>

        {/* Output */}
        {status === "succeeded" && output && type !== "llm_call" && (
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
              <FiDatabase className="w-3.5 h-3.5" /> Output Payload
            </p>
            <pre className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-auto max-h-60 font-mono shadow-inner leading-relaxed">
              {typeof output === "string"
                ? output
                : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}

        {/* LLM call — show output as readable text */}
        {type === "llm_call" && status === "succeeded" && output && (
          <div className="mt-4">
             <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
              <FiCpu className="w-3.5 h-3.5" /> AI Response
            </p>
            <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200 shadow-sm text-slate-700">
              <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">
                {(output as any)?.text ?? JSON.stringify(output)}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl shadow-sm">
            <p className="text-xs font-bold text-rose-600 mb-1 flex items-center gap-2 uppercase tracking-wider">
              <FiX className="w-3.5 h-3.5" /> Error details
            </p>
            <p className="text-sm text-rose-700 font-mono font-medium">{error}</p>
          </div>
        )}

        {/* Approval gate — Approve button */}
        {status === "paused" && (
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 bg-white border border-amber-200 rounded-xl shadow-sm">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FiLock className="w-4 h-4 text-amber-500" /> Human Approval Required
              </h4>
              <p className="text-sm text-slate-500 mt-1 font-medium">
                Review the previous step's output and approve this gate to continue execution.
              </p>
            </div>
            <button
              id={`approve-step-${stepRun.id}`}
              onClick={() => onApprove(stepRun.id)}
              disabled={approving}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:-translate-y-0.5 whitespace-nowrap"
            >
              {approving ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FiCheck className="w-4 h-4" />
                  Approve & Continue
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Connector between steps ──────────────────────────────────────────────────

function StepConnector({ active }: { active: boolean }) {
  return (
    <div className="flex justify-start ml-11">
      <div
        className={`w-0.5 h-8 transition-colors ${
          active ? "bg-teal-500/50" : "bg-slate-200"
        }`}
      />
    </div>
  );
}

// ─── Run View Content ─────────────────────────────────────────────────────────

function RunViewContent() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const runId = params.runId as string;

  const { data, loading, error } = useSubscription<{
    workflow_runs_by_pk: WorkflowRun | null;
  }>(SUBSCRIBE_WORKFLOW_RUN, {
    variables: { runId },
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  const handleApprove = async (stepRunId: string) => {
    await approveStep({ variables: { step_run_id: stepRunId } });
  };

  const run = data?.workflow_runs_by_pk;
  const stepRuns = run?.step_runs ?? [];

  // Duration formatting
  const durationMs =
    run?.started_at && run?.finished_at
      ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
      : null;
  const durationStr = durationMs != null
    ? durationMs > 60000
      ? `${(durationMs / 60000).toFixed(1)}m`
      : `${(durationMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Back breadcrumb */}
      <nav className="mb-8">
        <button
          onClick={() => router.push(`/workflows/${workflowId}`)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal-600 transition-colors bg-slate-100 hover:bg-teal-50 px-4 py-2 rounded-lg"
        >
          <FiArrowLeft className="w-4 h-4" /> Back to Workflow
        </button>
      </nav>

      {/* Run Header */}
      <div className="mb-12 p-8 bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/40 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-60" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-4">
              Execution Trace
              {run && runStatusBadge(run.status)}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500 mt-3">
              <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <FiActivity className="w-4 h-4 text-slate-400" />
                ID: <span className="text-slate-700 font-mono">{runId.slice(0, 8)}…</span>
              </span>
              {run?.started_at && (
                <span className="flex items-center gap-1.5">
                  Started at <span className="text-slate-700">{new Date(run.started_at).toLocaleTimeString()}</span>
                </span>
              )}
            </div>
          </div>
          
          {durationStr && (
            <div className="bg-slate-50 border border-slate-200 px-6 py-4 rounded-2xl text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Duration</p>
              <p className="text-2xl font-black text-slate-700">{durationStr}</p>
            </div>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && !run && (
        <div className="flex flex-col items-center justify-center py-32 gap-6 bg-white border border-slate-200 rounded-3xl border-dashed">
          <div className="w-12 h-12 border-4 border-slate-100 border-t-teal-500 rounded-full animate-spin shadow-sm" />
          <p className="text-slate-500 font-semibold text-lg">Connecting to live execution engine...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 font-medium flex items-start gap-3 shadow-sm">
          <FiX className="w-5 h-5 mt-0.5 flex-shrink-0" />
          Failed to connect to live run stream: {error.message}
        </div>
      )}

      {/* Run not found */}
      {!loading && !error && !run && (
        <div className="text-center py-32 bg-slate-50 border border-slate-200 rounded-3xl border-dashed">
          <p className="text-slate-500 font-semibold text-lg">Execution trace not found.</p>
        </div>
      )}

      {/* Step Pipeline */}
      {run && (
        <div className="space-y-0 pl-2 md:pl-8">
          {/* Waiting for steps to start */}
          {stepRuns.length === 0 && run.status === "running" && (
            <div className="flex items-center gap-4 p-6 bg-blue-50/50 border border-blue-200 rounded-2xl text-blue-700 shadow-sm">
              <FiLoader className="w-5 h-5 animate-spin text-blue-500" />
              <span className="font-semibold">Booting runtime and initializing steps...</span>
            </div>
          )}

          {stepRuns.map((sr, i) => (
            <div key={sr.id}>
              <StepRunCard
                stepRun={sr}
                onApprove={handleApprove}
                approving={approving}
              />
              {i < stepRuns.length - 1 && (
                <StepConnector active={i < stepRuns.length - 1 || run.status === "completed"} />
              )}
            </div>
          ))}

          {/* Final status banner */}
          {(run.status === "completed" || run.status === "failed") && (
            <>
              {stepRuns.length > 0 && <StepConnector active={run.status === "completed"} />}
              <div
                className={`p-6 rounded-2xl border flex items-center justify-between shadow-sm ${
                  run.status === "completed"
                    ? "bg-teal-50 border-teal-200 text-teal-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 ${
                    run.status === "completed" ? "bg-white border-teal-100 text-teal-500" : "bg-white border-rose-100 text-rose-500"
                  }`}>
                    {run.status === "completed" ? <FiCheck className="w-6 h-6 stroke-[3]" /> : <FiX className="w-6 h-6 stroke-[3]" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">
                      {run.status === "completed"
                        ? "Workflow execution completed"
                        : "Workflow execution failed"}
                    </h3>
                    <p className="text-sm font-medium opacity-80 mt-1">
                      {run.status === "completed" ? "All steps were executed successfully." : "The workflow stopped due to an error."}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function RunPage() {
  return (
    <AuthGuard>
      <RunViewContent />
    </AuthGuard>
  );
}
