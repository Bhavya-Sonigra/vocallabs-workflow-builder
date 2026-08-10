"use client";

import { useState } from "react";
import { useQuery, useMutation, useSubscription } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import { GET_WORKFLOWS, GET_MY_ORGS } from "@/lib/graphql/queries";
import { SUBSCRIBE_ORG_STATS } from "@/lib/graphql/subscriptions";
import { INSERT_WORKFLOW, TRIGGER_WORKFLOW_RUN, DELETE_WORKFLOW_BY_PK } from "@/lib/graphql/mutations";
import Link from "next/link";
import { FiPlus, FiAlertTriangle, FiZap, FiTrash2, FiPlay, FiStar } from "react-icons/fi";

function WorkflowsContent() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const { data: orgsData } = useQuery<any>(GET_MY_ORGS);
  const orgId = orgsData?.org_members?.[0]?.org_id;

  const { data, loading, refetch } = useQuery<any>(GET_WORKFLOWS, {
    variables: { org_id: orgId },
    skip: !orgId,
  });

  const { data: statsData, error: statsError } = useSubscription<any>(SUBSCRIBE_ORG_STATS, {
    variables: { org_id: orgId },
    skip: !orgId,
  });

  const [deleteWorkflow] = useMutation(DELETE_WORKFLOW_BY_PK);

  const [insertWorkflow, { loading: inserting }] = useMutation(INSERT_WORKFLOW, {
    onCompleted: (d: any) => {
      router.push(`/workflows/${d.insert_workflows_one.id}`);
    },
  });

  const [triggerWorkflowRun] = useMutation<{
    triggerWorkflowRun: { run_id: string; status: string };
  }>(TRIGGER_WORKFLOW_RUN);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newName.trim()) return;
    await insertWorkflow({
      variables: {
        name: newName.trim(),
        org_id: orgId,
        description: newDesc.trim() || null,
      },
    });
  };

  const handleTriggerRun = async (workflowId: string) => {
    setTriggeringId(workflowId);
    setTriggerError(null);
    try {
      const result = await triggerWorkflowRun({
        variables: { workflow_id: workflowId },
      });
      const runId = result.data?.triggerWorkflowRun?.run_id;
      if (runId) {
        router.push(`/workflows/${workflowId}/runs/${runId}`);
      }
    } catch (err: any) {
      setTriggerError(err.message || "Failed to trigger run");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, workflowId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this workflow? This cannot be undone.")) {
      return;
    }
    try {
      await deleteWorkflow({ variables: { id: workflowId } });
      refetch();
    } catch (err: any) {
      setTriggerError(err.message || "Failed to delete workflow");
    }
  };

  const workflows = data?.workflows ?? [];
  const stats = statsData?.org_run_stats?.[0];
  const avgDuration = stats?.avg_duration_seconds ? stats.avg_duration_seconds.toFixed(2) : "0.00";
  const totalRuns = stats?.total_runs ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 flex items-center gap-4">
            Your Workflows
          </h1>
          <div className="flex items-center gap-4 mt-3">
            <p className="text-slate-500 font-medium">
              {workflows.length > 0
                ? `Managing ${workflows.length} active automation${workflows.length !== 1 ? "s" : ""}`
                : "No workflows created yet."}
            </p>
            <div className="flex items-center gap-3 px-3 py-1 bg-teal-50 border border-teal-100 rounded-lg text-xs font-semibold text-teal-700 shadow-sm">
              <span>Total Runs: {totalRuns}</span>
              <span className="w-1 h-1 rounded-full bg-teal-300" />
              <span>Avg Duration: {avgDuration}s</span>
            </div>
            {statsError && <span className="text-xs text-red-500">Error: {statsError.message}</span>}
          </div>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 shadow-sm ${
            showNew 
            ? "bg-slate-200 text-slate-700 hover:bg-slate-300" 
            : "bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white shadow-teal-500/20 hover:shadow-teal-500/30 hover:-translate-y-0.5"
          }`}
        >
          {showNew ? "Cancel" : "+ New Workflow"}
        </button>
      </div>

      {/* Global trigger error */}
      {triggerError && (
        <div className="mb-8 px-5 py-4 bg-rose-50 border border-rose-200 rounded-xl text-sm font-medium text-rose-700 flex items-center gap-3">
          <FiAlertTriangle className="w-5 h-5 flex-shrink-0" /> {triggerError}
        </div>
      )}

      {/* New Workflow Form */}
      {showNew && (
        <form
          onSubmit={handleCreate}
          className="mb-10 p-6 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xl shadow-slate-200/50"
        >
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FiStar className="w-5 h-5 text-teal-500" /> Create New Automation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Workflow Name (e.g. Daily Summary)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all text-sm font-medium"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all text-sm font-medium"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={inserting}
              className="px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-500 disabled:opacity-50 disabled:hover:-translate-y-0 transition-all shadow-md shadow-teal-600/20 hover:-translate-y-0.5"
            >
              {inserting ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="px-6 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Workflow List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">Loading your workflows...</span>
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-white/50 rounded-3xl border border-slate-200 border-dashed">
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center mb-6 text-2xl shadow-xl shadow-slate-200/50">
            <FiZap className="w-8 h-8 text-teal-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Ready to automate?</h3>
          <p className="text-slate-500 max-w-sm mb-6 font-medium">
            Build your first AI-powered workflow to start saving time and scaling your operations.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="px-6 py-3 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-all hover:-translate-y-0.5 shadow-lg shadow-slate-800/20"
          >
            Get Started
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {workflows.map((w: any) => (
            <div
              key={w.id}
              className="group flex flex-col p-6 rounded-3xl bg-white border border-slate-200 hover:border-teal-200 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(20,184,166,0.12)] hover:-translate-y-1"
            >
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-lg shadow-sm group-hover:scale-110 group-hover:bg-teal-50 group-hover:border-teal-100 transition-all duration-300">
                    <FiZap className="w-5 h-5 text-slate-600 group-hover:text-teal-600" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                    {new Date(w.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, w.id)}
                    className="ml-auto p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete workflow"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-teal-600 transition-colors">
                  {w.name}
                </h2>
                <p className="text-sm font-medium text-slate-500 mb-6 line-clamp-2 leading-relaxed">
                  {w.description || "No description provided. Add one to keep things organized."}
                </p>
              </div>
              
              <div className="flex items-center gap-3 pt-5 border-t border-slate-100 mt-auto">
                <Link
                  href={`/workflows/${w.id}`}
                  className="flex-1 text-center py-2.5 px-4 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all"
                >
                  Edit Flow
                </Link>
                <button
                  onClick={() => handleTriggerRun(w.id)}
                  disabled={triggeringId === w.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-600 hover:text-white hover:border-teal-600 disabled:opacity-50 text-sm font-bold transition-all shadow-sm hover:shadow-md hover:shadow-teal-600/20 hover:-translate-y-0.5"
                >
                  {triggeringId === w.id ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FiPlay className="w-4 h-4" /> Run
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <AuthGuard>
      <WorkflowsContent />
    </AuthGuard>
  );
}
