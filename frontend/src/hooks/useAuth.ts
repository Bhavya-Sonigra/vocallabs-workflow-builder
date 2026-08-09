"use client";

import { useState, useEffect } from "react";
import nhost from "@/lib/nhost";
import type { User } from "@nhost/nhost-js/auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    // Read the session after mount to avoid server/client hydration mismatch
    const session = nhost.getUserSession();
    setAuthState({
      user: (session?.user as User) ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    });

    // sessionStorage.onChange fires whenever login/logout/refresh updates
    // the stored session — this replaces the old onAuthStateChanged API.
    const unsubscribe = nhost.sessionStorage.onChange((session) => {
      setAuthState({
        user: (session?.user as User) ?? null,
        isAuthenticated: !!session,
        isLoading: false,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return authState;
}