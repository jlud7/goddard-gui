"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Clock, RefreshCw, Play, Loader2 } from "lucide-react";
import { GatewayClient, isConfigured, getDetails } from "@/lib/api";

interface CronSchedule {
  kind?: string;
  expr?: string;
  tz?: string;
  [key: string]: unknown;
}

interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: string;
  [key: string]: unknown;
}

interface CronJob {
  id: string;
  name?: string;
  description?: string;
  schedule?: CronSchedule | string;
  enabled?: boolean;
  sessionTarget?: string;
  payload?: unknown;
  state?: CronJobState;
  [key: string]: unknown;
}

function getScheduleDisplay(schedule?: CronSchedule | string): string {
  if (!schedule) return "";
  if (typeof schedule === "string") return schedule;
  if (typeof schedule === "object") {
    const parts: string[] = [];
    if (schedule.expr) parts.push(schedule.expr);
    if (schedule.tz) parts.push(`(${schedule.tz})`);
    if (parts.length === 0 && schedule.kind) return schedule.kind;
    return parts.join(" ");
  }
  return String(schedule);
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!isConfigured()) {
      setError("Gateway not configured");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = new GatewayClient();
      const result = await client.invoke("cron", {
        action: "list",
        includeDisabled: true,
      });
      const details = getDetails(result);
      const arr = details.jobs;
      setJobs(Array.isArray(arr) ? (arr as CronJob[]) : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const toggleJob = async (jobId: string, enabled: boolean) => {
    setActionLoading(jobId);
    try {
      const client = new GatewayClient();
      await client.invoke("cron", {
        action: "update",
        jobId,
        patch: { enabled },
      });
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, enabled } : j))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const runJob = async (jobId: string) => {
    setActionLoading(`run-${jobId}`);
    try {
      const client = new GatewayClient();
      await client.invoke("cron", {
        action: "run",
        jobId,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (ms?: number) => {
    if (!ms) return null;
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return null;
    }
  };

  const renderJobs = () => {
    try {
      return jobs.map((job) => {
        const lastRun = formatTime(job.state?.lastRunAtMs);
        const nextRun = formatTime(job.state?.nextRunAtMs);
        const scheduleStr = getScheduleDisplay(job.schedule);
        return (
          <Card key={job.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <CardTitle className="text-base truncate">
                    {job.name || job.id}
                  </CardTitle>
                  <Badge
                    variant={job.enabled !== false ? "default" : "secondary"}
                  >
                    {job.enabled !== false ? "Active" : "Disabled"}
                  </Badge>
                  {job.state?.lastRunStatus && (
                    <Badge
                      variant={
                        job.state.lastRunStatus === "ok"
                          ? "default"
                          : "destructive"
                      }
                      className="text-xs"
                    >
                      {job.state.lastRunStatus}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch
                    checked={job.enabled !== false}
                    onCheckedChange={(checked) => toggleJob(job.id, checked)}
                    disabled={actionLoading === job.id}
                  />
                </div>
              </div>
              {job.description && (
                <CardDescription>{job.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                {scheduleStr && (
                  <span className="font-mono bg-secondary px-2 py-0.5 rounded">
                    {scheduleStr}
                  </span>
                )}
                {lastRun && <span>Last: {lastRun}</span>}
                {nextRun && <span>Next: {nextRun}</span>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runJob(job.id)}
                  disabled={actionLoading === `run-${job.id}`}
                  className="gap-1.5 ml-auto"
                >
                  {actionLoading === `run-${job.id}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Run Now
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      });
    } catch (renderErr: unknown) {
      return (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">
            Render error:{" "}
            {renderErr instanceof Error ? renderErr.message : "Unknown error"}
          </CardContent>
        </Card>
      );
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" /> Cron Jobs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scheduled tasks and automation
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadJobs}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No cron jobs found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">{renderJobs()}</div>
      )}
    </div>
  );
}
