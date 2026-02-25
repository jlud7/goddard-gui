"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi,
  WifiOff,
  MessageSquare,
  Clock,
  Brain,
  Activity,
  Settings,
} from "lucide-react";
import { GatewayClient, isConfigured, getDetails } from "@/lib/api";

interface SessionInfo {
  key: string;
  kind?: string;
  channel?: string;
  displayName?: string;
  updatedAt?: string;
  model?: string;
  contextTokens?: number;
  totalTokens?: number;
  [key: string]: unknown;
}

interface CronJob {
  id: string;
  enabled?: boolean;
  name?: string;
  [key: string]: unknown;
}

export default function DashboardPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isConfigured()) {
      setConnected(false);
      setLoading(false);
      return;
    }

    const client = new GatewayClient();
    let cancelled = false;

    async function load() {
      try {
        const ok = await client.testConnection();
        if (cancelled) return;
        setConnected(ok);

        if (ok) {
          const [sessRes, cronRes] = await Promise.allSettled([
            client.invoke("sessions_list", { activeMinutes: 10080 }),
            client.invoke("cron", {
              action: "list",
              includeDisabled: true,
            }),
          ]);
          if (!cancelled) {
            if (sessRes.status === "fulfilled") {
              const details = getDetails(sessRes.value);
              const arr = details.sessions;
              setSessions(Array.isArray(arr) ? arr as SessionInfo[] : []);
            }
            if (cronRes.status === "fulfilled") {
              const details = getDetails(cronRes.value);
              const arr = details.jobs;
              setCronJobs(Array.isArray(arr) ? arr as CronJob[] : []);
            }
          }
        }
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCron = cronJobs.filter((j) => j.enabled !== false);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>🐕‍🦺</span> Goddard Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mission Control Overview
          </p>
        </div>
        <Badge
          variant={
            connected === null
              ? "secondary"
              : connected
              ? "default"
              : "destructive"
          }
          className="flex items-center gap-1.5 px-3 py-1"
        >
          {connected === null ? (
            <Activity className="h-3 w-3 animate-pulse" />
          ) : connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected === null
            ? "Checking..."
            : connected
            ? "Connected"
            : "Disconnected"}
        </Badge>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wifi className="h-4 w-4" /> Connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : connected ? (
              <p className="text-lg font-semibold text-green-400">Online</p>
            ) : (
              <p className="text-lg font-semibold text-red-400">Offline</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Sessions (7d)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <p className="text-lg font-semibold">{sessions.length}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Cron Jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <p className="text-lg font-semibold">
                {activeCron.length}{" "}
                <span className="text-sm text-muted-foreground font-normal">
                  / {cronJobs.length} total
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Brain className="h-4 w-4" /> Memory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/memory">
              <Button variant="secondary" size="sm">
                View Memory
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/chat">
            <Button className="gap-2">
              <MessageSquare className="h-4 w-4" /> Chat with Goddard
            </Button>
          </Link>
          <Link href="/sessions">
            <Button variant="secondary" className="gap-2">
              <Activity className="h-4 w-4" /> View Sessions
            </Button>
          </Link>
          <Link href="/cron">
            <Button variant="secondary" className="gap-2">
              <Clock className="h-4 w-4" /> Manage Cron
            </Button>
          </Link>
          {!connected && (
            <Link href="/settings">
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" /> Configure Gateway
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Recent sessions preview */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.slice(0, 5).map((sess, i) => (
                <div
                  key={sess.key || i}
                  className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-mono truncate block">
                      {sess.displayName || sess.key}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {sess.channel && (
                        <Badge variant="secondary" className="text-xs">
                          {sess.channel}
                        </Badge>
                      )}
                      {sess.model && (
                        <span className="text-xs text-muted-foreground">
                          {sess.model}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href="/sessions">
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
