"use client";

import { useEffect, useState, useCallback } from "react";
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
import {
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Hash,
} from "lucide-react";
import { GatewayClient, isConfigured, getDetails, getText } from "@/lib/api";

interface TopicSession {
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

function extractTopicInfo(key: string): { topicId: string; groupId: string } {
  // key pattern: agent:main:telegram:group:-1003822826655:topic:123
  const topicMatch = key.match(/topic:(\d+)/);
  const groupMatch = key.match(/group:(-?\d+)/);
  return {
    topicId: topicMatch?.[1] ?? "unknown",
    groupId: groupMatch?.[1] ?? "",
  };
}

function getTopicDisplayName(session: TopicSession): string {
  if (session.displayName) return session.displayName;
  const { topicId } = extractTopicInfo(session.key);
  if (topicId === "1") return "General";
  return `Topic #${topicId}`;
}

function formatTokens(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(ts?: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  } catch {
    return ts;
  }
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<TopicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TopicSession | null>(null);
  const [historyText, setHistoryText] = useState<string>("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadTopics = useCallback(async () => {
    if (!isConfigured()) {
      setError("Gateway not configured");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = new GatewayClient();
      const result = await client.invoke("sessions_list", {
        activeMinutes: 10080,
      });
      const details = getDetails(result);
      const sessions = details.sessions;
      if (Array.isArray(sessions)) {
        const topicSessions = (sessions as TopicSession[]).filter((s) =>
          s.key?.includes("topic:")
        );
        // Sort by updatedAt descending
        topicSessions.sort((a, b) => {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        });
        setTopics(topicSessions);
      } else {
        setTopics([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load topics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const openHistory = async (sess: TopicSession) => {
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

      if (details.messages && Array.isArray(details.messages)) {
        setHistoryEntries(details.messages as HistoryEntry[]);
      } else if (details.history && Array.isArray(details.history)) {
        setHistoryEntries(details.history as HistoryEntry[]);
      } else if (text) {
        setHistoryText(text);
      }
    } catch {
      setHistoryText("(Unable to load history)");
    } finally {
      setHistoryLoading(false);
    }
  };

  const tokenPercent = (sess: TopicSession): number | null => {
    if (sess.contextTokens && sess.totalTokens && sess.contextTokens > 0) {
      return Math.round((sess.totalTokens / sess.contextTokens) * 100);
    }
    return null;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Topics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Telegram forum threads and conversations
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadTopics}
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
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No topic sessions found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {topics.map((sess, i) => {
            const info = extractTopicInfo(sess.key);
            const pct = tokenPercent(sess);
            return (
              <Card
                key={sess.key || i}
                className="hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => openHistory(sess)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-primary flex-shrink-0" />
                      <p className="font-semibold text-sm truncate">
                        {getTopicDisplayName(sess)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        topic:{info.topicId}
                      </Badge>
                      {sess.model && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {sess.model}
                        </Badge>
                      )}
                      {sess.totalTokens != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatTokens(sess.totalTokens)} tokens
                          {pct != null && (
                            <span className="ml-1 opacity-70">({pct}% ctx)</span>
                          )}
                        </span>
                      )}
                      {sess.updatedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(sess.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-4" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm pr-8">
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Hash className="h-4 w-4 text-primary" />
              {selected ? getTopicDisplayName(selected) : ""}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selected.model && (
                <Badge variant="outline" className="text-xs font-mono">
                  {selected.model}
                </Badge>
              )}
              {selected.totalTokens != null && (
                <Badge variant="secondary" className="text-xs">
                  {formatTokens(selected.totalTokens)} total
                </Badge>
              )}
              {selected.contextTokens != null && (
                <Badge variant="secondary" className="text-xs">
                  {formatTokens(selected.contextTokens)} ctx window
                </Badge>
              )}
            </div>
          )}

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
                    {i < historyEntries.length - 1 && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : historyText ? (
            <ScrollArea className="max-h-[60vh]">
              <pre className="text-sm whitespace-pre-wrap pr-4">
                {historyText}
              </pre>
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
