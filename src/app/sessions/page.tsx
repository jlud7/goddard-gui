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
import { GatewayClient, isConfigured, getDetails, getText } from "@/lib/api";

interface Session {
  key: string;
  kind?: string;
  channel?: string;
  displayName?: string;
  updatedAt?: string;
  sessionId?: string;
  model?: string;
  contextTokens?: number;
  totalTokens?: number;
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
  const [selected, setSelected] = useState<Session | null>(null);
  const [historyText, setHistoryText] = useState<string>("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
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
      const result = await client.invoke("sessions_list", { activeMinutes: 10080 });
      const details = getDetails(result);
      const arr = details.sessions;
      setSessions(Array.isArray(arr) ? arr as Session[] : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const openHistory = async (sess: Session) => {
    setSelected(sess);
    setHistoryLoading(true);
    setHistoryText("");
    setHistoryEntries([]);
    try {
      const client = new GatewayClient();
      const result = await client.invoke("sessions_history", {
        sessionKey: sess.key,
        limit: 50,
      });
      const details = getDetails(result);
      const text = getText(result);

      // Try to get structured entries from details
      if (details.messages && Array.isArray(details.messages)) {
        setHistoryEntries(details.messages as HistoryEntry[]);
      } else if (details.history && Array.isArray(details.history)) {
        setHistoryEntries(details.history as HistoryEntry[]);
      } else if (text) {
        // Fall back to text representation
        setHistoryText(text);
      }
    } catch {
      setHistoryText("(Unable to load history)");
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatTime = (ts?: string) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
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
            Active and recent sessions (last 7 days)
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
              key={sess.key || i}
              className="hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => openHistory(sess)}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm truncate">
                    {sess.displayName || sess.key}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {sess.channel && (
                      <Badge variant="secondary" className="text-xs">
                        {sess.channel}
                      </Badge>
                    )}
                    {sess.kind && (
                      <Badge variant="outline" className="text-xs">
                        {sess.kind}
                      </Badge>
                    )}
                    {sess.model && (
                      <span className="text-xs text-muted-foreground">
                        {sess.model}
                      </span>
                    )}
                    {sess.totalTokens != null && (
                      <span className="text-xs text-muted-foreground">
                        {sess.totalTokens.toLocaleString()} tokens
                      </span>
                    )}
                    {sess.updatedAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(sess.updatedAt)}
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
              {selected?.displayName || selected?.key}
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyEntries.length > 0 ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                {historyEntries.map((entry, i) => (
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
                    {i < historyEntries.length - 1 && <Separator className="mt-3" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : historyText ? (
            <ScrollArea className="max-h-[60vh]">
              <pre className="text-sm whitespace-pre-wrap pr-4">{historyText}</pre>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              No history available
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
