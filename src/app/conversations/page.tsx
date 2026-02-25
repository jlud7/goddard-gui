"use client";

import { useEffect, useState, useCallback, useRef, FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
  Plus,
  Send,
  Bot,
  User,
} from "lucide-react";
import {
  GatewayClient,
  isConfigured,
  getDetails,
  getText,
  getDashboardPassword,
} from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface TopicSession {
  key: string;
  kind?: string;
  channel?: string;
  displayName?: string;
  updatedAt?: number | string;
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function extractTopicInfo(key: string): { topicId: string } {
  const topicMatch = key.match(/topic:(\d+)/);
  return { topicId: topicMatch?.[1] ?? "unknown" };
}

function getTopicDisplayName(session: TopicSession): string {
  if (session.displayName && session.displayName !== "6792774934")
    return session.displayName;
  const { topicId } = extractTopicInfo(session.key);
  if (topicId === "1") return "General";
  return `Topic #${topicId}`;
}

function formatTokens(n?: number): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(ts?: number | string): string {
  if (!ts) return "";
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
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
    return "";
  }
}

export default function ConversationsPage() {
  const [topics, setTopics] = useState<TopicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Topic history view
  const [selected, setSelected] = useState<TopicSession | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyText, setHistoryText] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  // General chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // New topic
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [creating, setCreating] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadTopics = useCallback(async () => {
    if (!isConfigured()) {
      setError("Not authenticated");
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
        topicSessions.sort((a, b) => {
          const ta =
            typeof a.updatedAt === "number"
              ? a.updatedAt
              : a.updatedAt
              ? new Date(a.updatedAt).getTime()
              : 0;
          const tb =
            typeof b.updatedAt === "number"
              ? b.updatedAt
              : b.updatedAt
              ? new Date(b.updatedAt).getTime()
              : 0;
          return tb - ta;
        });
        setTopics(topicSessions);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
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

  // General chat handlers
  const handleChatSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setStreaming(true);
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-auth": getDashboardPassword(),
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error(`Chat error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setMessages([
                ...newMessages,
                { role: "assistant", content: accumulated },
              ]);
            }
          } catch {
            /* skip */
          }
        }
      }

      if (!accumulated) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "(No response received)" },
        ]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages([
        ...newMessages,
        { role: "assistant", content: `⚠️ Error: ${errorMsg}` },
      ]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  // Create new topic
  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    setCreating(true);
    try {
      const client = new GatewayClient();
      await client.invoke("message", {
        action: "topic-create",
        channel: "telegram",
        target: "-1003822826655",
        name: newTopicName.trim(),
      });
      setNewTopicName("");
      setNewTopicOpen(false);
      await loadTopics();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create topic");
    } finally {
      setCreating(false);
    }
  };

  // ---- RENDER ----

  // General chat view
  if (chatOpen) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setChatOpen(false)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">General Chat</h1>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-20">
              <span className="text-5xl mb-4">🐕‍🦺</span>
              <p className="text-lg font-medium">Hey there!</p>
              <p className="text-sm mt-1">Start a conversation with Goddard.</p>
            </div>
          )}
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Card
                  className={`max-w-[80%] px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose-goddard text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {streaming && i === messages.length - 1 && (
                        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </Card>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <form
            onSubmit={handleChatSubmit}
            className="max-w-3xl mx-auto flex gap-2 items-end"
          >
            <Textarea
              ref={inputRef}
              placeholder="Message Goddard..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              disabled={streaming}
              className="min-h-[44px] max-h-[200px] resize-none"
              rows={1}
            />
            <Button
              type="submit"
              disabled={!chatInput.trim() || streaming}
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Topic list view
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Conversations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Chat threads and project topics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewTopicOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Topic
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadTopics}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {/* General Chat card */}
      <Card
        className="hover:bg-secondary/50 transition-colors cursor-pointer border-primary/30"
        onClick={() => setChatOpen(true)}
      >
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">General Chat</p>
              <p className="text-xs text-muted-foreground">
                Direct conversation with Goddard
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            No topic threads yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {topics.map((sess, i) => {
            const info = extractTopicInfo(sess.key);
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
                        <Badge
                          variant="outline"
                          className="text-xs font-mono"
                        >
                          {sess.model}
                        </Badge>
                      )}
                      {sess.totalTokens != null && (
                        <span className="text-xs text-muted-foreground">
                          {formatTokens(sess.totalTokens)} tokens
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

      {/* Topic History Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm pr-8">
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
                  {formatTokens(selected.totalTokens)} tokens
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

      {/* New Topic Dialog */}
      <Dialog open={newTopicOpen} onOpenChange={setNewTopicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic Name</label>
              <Input
                placeholder="e.g. Town Skware, Trading, Writing..."
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTopic();
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setNewTopicOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTopic}
                disabled={!newTopicName.trim() || creating}
                className="gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
