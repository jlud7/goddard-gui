"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { List, RefreshCw, ChevronRight, Loader2 } from "lucide-react";
import { GatewayClient, isConfigured } from "@/lib/api";

interface Session {
  id: string;
  channel?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  [key: string]: unknown;
}

interface HistoryEntry {
  role?: string;
  content?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadSessions = async () => {
    if (!isConfigured()) {
      setError("Gateway not configured");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = new GatewayClient();
      const result = await client.invoke<Session[]>("sessions_list");
      setSessions(Array.isArray(result) ? result : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const openHistory = async (sessionId: string) => {
    setSelected(sessionId);
    setHistoryLoading(true);
    try {
      const client = new GatewayClient();
      const result = await client.invoke<HistoryEntry[]>("sessions_history", {
        sessionId,
      });
      setHistory(Array.isArray(result) ? result : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <List className="h-6 w-6" /> Sessions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Active and recent sessions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSessions}
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
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No sessions found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((sess, i) => (
            <Card
              key={sess.id || i}
              className="hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => openHistory(sess.id)}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm truncate">{sess.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {sess.channel && (
                      <Badge variant="secondary" className="text-xs">
                        {sess.channel}
                      </Badge>
                    )}
                    {sess.model && (
                      <Badge variant="outline" className="text-xs">
                        {sess.model}
                      </Badge>
                    )}
                    {sess.messageCount != null && (
                      <span className="text-xs text-muted-foreground">
                        {sess.messageCount} messages
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm truncate pr-8">
              {selected}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              No history available
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                {history.map((entry, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          entry.role === "assistant" ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        {entry.role || "unknown"}
                      </Badge>
                      {entry.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {entry.timestamp}
                        </span>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap pl-2">
                      {typeof entry.content === "string"
                        ? entry.content.slice(0, 500)
                        : JSON.stringify(entry).slice(0, 500)}
                    </p>
                    {i < history.length - 1 && <Separator className="mt-3" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
