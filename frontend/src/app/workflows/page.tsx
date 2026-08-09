"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import { GET_WORKFLOWS, GET_MY_ORGS } from "@/lib/graphql/queries";
import { INSERT_WORKFLOW } from "@/lib/graphql/mutations";

function WorkflowsContent() {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: orgsData } = useQuery<any>(GET_MY_ORGS);
  const orgId = orgsData?.org_members?.[0]?.org_id;

  const { data, loading, refetch } = useQuery<any>(GET_WORKFLOWS, {
    variables: { org_id: orgId },
    skip: !orgId,
  });

  const [insertWorkflow, { loading: inserting }] = useMutation(
    INSERT_WORKFLOW,
    {
      onCompleted: (d: any) => {
        router.push(`/workflows/${d.insert_workflows_one.id}`);
      },
    }
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newName.trim()) return;
    await insertWorkflow({
      variables: { name: newName.trim(), org_id: orgId, description: newDesc.trim() || null },
    });
  };

  const workflows = data?.workflows ?? [];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
        >
          {showNew ? "Cancel" : "New Workflow"}
        </button>
      </div>

      {showNew && (
        <form
          onSubmit={handleCreate}
          className="mb-8 p-4 border border-zinc-800 rounded-lg space-y-3"
        >
          <input
            type="text"
            placeholder="Workflow name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={inserting}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {inserting ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : workflows.length === 0 ? (
        <p className="text-zinc-500">
          No workflows yet. Click &quot;New Workflow&quot; to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {workflows.map(
            (wf: {
              id: string;
              name: string;
              description: string | null;
              created_at: string;
            }) => (
              <button
                key={wf.id}
                onClick={() => router.push(`/workflows/${wf.id}`)}
                className="w-full text-left p-4 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{wf.name}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(wf.created_at).toLocaleDateString()}
                  </span>
                </div>
                {wf.description && (
                  <p className="text-sm text-zinc-400 mt-1">{wf.description}</p>
                )}
              </button>
            )
          )}
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
