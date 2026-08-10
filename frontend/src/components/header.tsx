"use client";

import { useSubscription } from "@apollo/client/react";
import { useAuth } from "@/hooks/useAuth";
import { SUBSCRIBE_MY_ORGS } from "@/lib/graphql/subscriptions";
import nhost from "@/lib/nhost";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Header() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  const { data } = useSubscription<any>(SUBSCRIBE_MY_ORGS, {
    skip: !isAuthenticated,
  });

  const org = data?.org_members?.[0]?.organization;
  const quotaUsed = org?.quota_calls_used ?? 0;
  const quotaAllowed = org?.quota_calls_allowed ?? 1;
  const quotaPct = Math.min((quotaUsed / quotaAllowed) * 100, 100);

  const handleSignOut = async () => {
    try {
      await nhost.auth.signOut();
    } catch (err) {
      console.warn("Nhost signout error:", err);
    }
    router.replace("/login");
  };

  if (!isAuthenticated) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
      <div className="flex items-center justify-between h-16 max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-6">
          <Link 
            href="/workflows" 
            className="text-xl font-bold bg-gradient-to-r from-teal-600 to-indigo-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            Vocallabs
          </Link>
          {org && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100/80 border border-slate-200 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]"></div>
              <span className="text-sm font-medium text-slate-700">{org.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Real-time Quota indicator */}
          {org && (
            <div className="flex items-center gap-4 bg-slate-50/80 px-4 py-1.5 rounded-xl border border-slate-200/80 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">API Quota</span>
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  {quotaUsed} / {quotaAllowed}
                </span>
              </div>
              <div className="w-32 h-2.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    quotaPct > 90
                      ? "bg-gradient-to-r from-rose-400 to-red-500"
                      : quotaPct > 70
                        ? "bg-gradient-to-r from-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-teal-400 to-emerald-500"
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="h-6 w-px bg-slate-200"></div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all shadow-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
