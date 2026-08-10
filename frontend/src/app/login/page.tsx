"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import nhost from "@/lib/nhost";
import { useAuth } from "@/hooks/useAuth";
import { FiAlertTriangle, FiStar } from "react-icons/fi";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/workflows");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (isSignUp) {
        const response = await nhost.auth.signUpEmailPassword({ email, password });
        if (!response.body?.session) {
          setInfo("Sign-up successful! Check your email to verify your account, then log in.");
          setIsSignUp(false);
        } else {
          router.replace("/workflows");
        }
      } else {
        const response = await nhost.auth.signInEmailPassword({ email, password });
        if (response.body?.session) {
          router.replace("/workflows");
        } else {
          setInfo("Please verify your email before logging in.");
        }
      }
    } catch (e: any) {
      setError(e?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-slate-50 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-200/40 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-200/40 rounded-full blur-3xl" />
      
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-teal-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            Vocallabs
          </h1>
          <p className="text-slate-500 font-medium text-sm">
            {isSignUp ? "Create your account to get started" : "Welcome back! Sign in to continue"}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-slate-200 p-8 rounded-3xl shadow-xl shadow-slate-200/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all font-medium text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={9}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all font-medium text-sm"
                placeholder="Min. 9 characters"
              />
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 font-medium flex items-start gap-2">
                <FiAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
              </p>
            )}

            {info && (
              <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 font-medium flex items-start gap-2">
                <FiStar className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-500" /> {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Processing...
                </span>
              ) : isSignUp ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-sm font-medium text-slate-500 mt-8">
            {isSignUp ? "Already have an account?" : "Don\u2019t have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setInfo("");
              }}
              className="text-teal-600 hover:text-teal-500 font-bold hover:underline transition-colors ml-1"
            >
              {isSignUp ? "Sign in instead" : "Create one now"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
