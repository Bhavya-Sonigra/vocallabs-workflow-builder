"use client";

import { useQuery } from "@apollo/client/react";
import { useAuth } from "@/hooks/useAuth";
import { GET_MY_ORGS } from "@/lib/graphql/queries";
import nhost from "@/lib/nhost";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Header() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  const { data } = useQuery<any>(GET_MY_ORGS, {
    skip: !isAuthenticated,
  });

  const org = data?.org_members?.[0]?.organization;
  const quotaUsed = org?.quota_calls_used ?? 0;
  const quotaAllowed = org?.quota_calls_allowed ?? 1;
  const quotaPct = Math.min((quotaUsed / quotaAllowed) * 100, 100);

  const handleSignOut = async () => {
    await nhost.auth.signOut({});
    router.replace("/login");
  };

  if (!isAuthenticated) return null;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link href="/workflows" className="text-lg font-semibold text-white">
            VocaLabs
          </Link>
          {org && (
            <span className="text-sm text-zinc-400">{org.name}</span>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Quota indicator */}
          {org && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Quota</span>
              <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    quotaPct > 90
                      ? "bg-red-500"
                      : quotaPct > 70
                        ? "bg-yellow-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 tabular-nums">
                {quotaUsed}/{quotaAllowed}
              </span>
            </div>
          )}

          <span className="text-sm text-zinc-400">{user?.email}</span>

          <button
            onClick={handleSignOut}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
