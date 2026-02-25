"use client";

import { useState, useEffect } from "react";
import { getDashboardPassword, setDashboardPassword } from "@/lib/api";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = getDashboardPassword();
    if (saved) {
      verifyPassword(saved).then((ok) => {
        if (ok) setAuthenticated(true);
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, []);

  async function verifyPassword(pw: string): Promise<boolean> {
    try {
      const res = await fetch("/api/gateway", {
        method: "GET",
        headers: { "x-dashboard-auth": pw },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    const ok = await verifyPassword(password);
    if (ok) {
      setDashboardPassword(password);
      setAuthenticated(true);
    } else {
      setError(true);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">
              🐕‍🦺 Goddard Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your password to continue
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dashboard password"
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {error && (
              <p className="text-red-400 text-sm">
                Wrong password. Try again.
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
