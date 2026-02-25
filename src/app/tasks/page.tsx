"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Activity,
} from "lucide-react";
import { GatewayClient, isConfigured, getDetails, getText } from "@/lib/api";

interface SubAgent {
  runId?: string;
  sessionKey?: string;
  label?: string;
  task?: string;
  status?: string;
  runtime?: string;
  runtimeMs?: number;
  model?: string;
  totalTokens?: number;
  startedAt?: number;
  endedAt?: number;
  [key: string]: unknown;
}

function formatTime(ms?: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTokens(n?: number): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeSince(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

export default function TasksPage() {
  const [active, setActive] = useState<SubAgent[]>([]);
  const [recent, setRecent] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadTasks = useCallback(async () => {
    if (!isConfigured()) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    try {
      const client = new GatewayClient();

      // Get sub-agents
      const subResult = await client.invoke("subagents", {
        action: "list",
        recentMinutes: 120,
      });
      const details = getDetails(subResult);
      if (Array.isArray(details.active)) setActive(details.active as SubAgent[]);
      if (Array.isArray(details.recent)) setRecent(details.recent as SubAgent[]);

      // Get session status for overall state
      const statusResult = await client.invoke("session_status", {});
      const text = getText(statusResult);
      setStatusText(text);

      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Auto-refresh every 10s when there are active tasks
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadTasks();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadTasks]);

  const statusIcon = (status?: string) => {
    switch (status) {
      case "running":
        return <Zap className="h-4 w-4 text-yellow-400 animate-pulse" />;
      case "completed":
      case "ok":
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "border-yellow-500/50 bg-yellow-500/5";
      case "completed":
      case "ok":
        return "border-green-500/30";
      case "failed":
        return "border-red-500/30";
      default:
        return "";
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Task Board
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live view of what Goddard is working on
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="gap-1.5 text-xs"
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); loadTasks(); }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* System Status */}
      {statusText && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{statusText}</pre>
          </CardContent>
        </Card>
      )}

      {/* Active Tasks */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          In Progress
          {active.length > 0 && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              {active.length}
            </Badge>
          )}
        </h2>

        {active.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              ) : (
                "No active tasks — Goddard is idle"
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map((agent, i) => (
              <Card key={agent.runId || i} className={`${statusColor(agent.status)}`}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(agent.status)}
                        <span className="font-semibold text-sm">Running</span>
                        {agent.model && (
                          <Badge variant="outline" className="text-xs font-mono">
                            {agent.model}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                        {agent.task || agent.label || "Working..."}
                      </p>
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        {agent.startedAt && (
                          <span>Started {timeSince(agent.startedAt)}</span>
                        )}
                        {agent.totalTokens != null && agent.totalTokens > 0 && (
                          <span>{formatTokens(agent.totalTokens)} tokens</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent Tasks */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Recent
          {recent.length > 0 && (
            <Badge variant="secondary">{recent.length}</Badge>
          )}
        </h2>

        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No recent tasks
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((agent, i) => (
              <Card key={agent.runId || i} className={statusColor(agent.status)}>
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{statusIcon(agent.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm line-clamp-2">
                        {agent.task || agent.label || "Task"}
                      </p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <Badge
                          variant={agent.status === "failed" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {agent.status || "unknown"}
                        </Badge>
                        {agent.model && (
                          <span className="font-mono">{agent.model}</span>
                        )}
                        {agent.runtimeMs != null && agent.runtimeMs > 0 && (
                          <span>{formatTime(agent.runtimeMs)}</span>
                        )}
                        {agent.totalTokens != null && agent.totalTokens > 0 && (
                          <span>{formatTokens(agent.totalTokens)} tokens</span>
                        )}
                        {agent.endedAt && (
                          <span>{timeSince(agent.endedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
