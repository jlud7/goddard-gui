"use client";

import { useEffect, useState, useCallback, useRef, FormEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Paperclip,
  FileText,
  X,
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
  displayName?: string;
  updatedAt?: number | string;
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

interface Attachment {
  name: string;
  path: string;
  size: number;
}

function extractTopicId(key: string): string {
  const m = key.match(/topic:(\d+)/);
  return m?.[1] ?? "unknown";
}

function getTopicName(session: TopicSession): string {
  if (session.displayName && session.displayName !== "6792774934")
    return session.displayName;
  const id = extractTopicId(session.key);
  if (id === "1") return "General";
  return `Topic #${id}`;
}

function formatTokens(n?: number): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(ts?: number | string): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default function ConversationsPage() {
  const [topics, setTopics] = useState<TopicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active conversation
  const [activeView, setActiveView] = useState<"list" | "general" | "topic">("list");
  const [activeTopic, setActiveTopic] = useState<TopicSession | null>(null);

  // Chat state (general)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Topic history + send
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyText, setHistoryText] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [topicSending, setTopicSending] = useState(false);

  // Attachments
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New topic dialog
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [creating, setCreating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, history, scrollToBottom]);

  const loadTopics = useCallback(async () => {
    if (!isConfigured()) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const client = new GatewayClient();
      const result = await client.invoke("sessions_list", { activeMinutes: 10080 });
      const details = getDetails(result);
      if (Array.isArray(details.sessions)) {
        const t = (details.sessions as TopicSession[])
          .filter((s) => s.key?.includes("topic:"))
          .sort((a, b) => {
            const ta = typeof a.updatedAt === "number" ? a.updatedAt : 0;
            const tb = typeof b.updatedAt === "number" ? b.updatedAt : 0;
            return tb - ta;
          });
        setTopics(t);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  // File upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-dashboard-auth": getDashboardPassword() },
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        setAttachment({ name: data.filename, path: data.path, size: data.size });
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // General chat submit
  const handleGeneralSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if ((!text && !attachment) || streaming) return;

    let content = text;
    if (attachment) {
      content += `\n[Attached: ${attachment.name} at ${attachment.path}]`;
    }

    const userMsg: ChatMessage = { role: "user", content };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setChatInput("");
    setAttachment(null);
    setStreaming(true);
    setMessages([...newMsgs, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-auth": getDashboardPassword(),
        },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");
      const decoder = new TextDecoder();
      let buffer = "", accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const d = t.slice(6);
          if (d === "[DONE]") break;
          try {
            const p = JSON.parse(d);
            const c = p.choices?.[0]?.delta?.content;
            if (c) { accumulated += c; setMessages([...newMsgs, { role: "assistant", content: accumulated }]); }
          } catch { /* skip */ }
        }
      }
      if (!accumulated) setMessages([...newMsgs, { role: "assistant", content: "(No response)" }]);
    } catch (err: unknown) {
      setMessages([...newMsgs, { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Error"}` }]);
    } finally {
      setStreaming(false);
    }
  };

  // Open topic with history
  const openTopic = async (sess: TopicSession) => {
    setActiveTopic(sess);
    setActiveView("topic");
    setHistoryLoading(true);
    setHistory([]);
    setHistoryText("");
    try {
      const client = new GatewayClient();
      const result = await client.invoke("sessions_history", { sessionKey: sess.key, limit: 50 });
      const details = getDetails(result);
      const text = getText(result);
      if (Array.isArray(details.messages)) setHistory(details.messages as HistoryEntry[]);
      else if (Array.isArray(details.history)) setHistory(details.history as HistoryEntry[]);
      else if (text) setHistoryText(text);
    } catch { setHistoryText("(Unable to load history)"); }
    finally { setHistoryLoading(false); }
  };

  // Send message to topic
  const handleTopicSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = topicInput.trim();
    if (!text || topicSending || !activeTopic) return;

    const topicId = extractTopicId(activeTopic.key);
    setTopicSending(true);
    setTopicInput("");

    // Add to local history immediately
    setHistory(prev => [...prev, { role: "user", content: text }]);

    try {
      const client = new GatewayClient();
      await client.invoke("message", {
        action: "send",
        channel: "telegram",
        target: "-1003822826655",
        message: text,
        threadId: topicId,
      });
      // Reload history after a delay to get the response
      setTimeout(async () => {
        try {
          const result = await client.invoke("sessions_history", { sessionKey: activeTopic.key, limit: 50 });
          const details = getDetails(result);
          if (Array.isArray(details.messages)) setHistory(details.messages as HistoryEntry[]);
          else if (Array.isArray(details.history)) setHistory(details.history as HistoryEntry[]);
        } catch { /* ignore */ }
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setTopicSending(false);
    }
  };

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

  const handleKeyDown = (e: React.KeyboardEvent, handler: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handler(); }
  };

  // Attachment bar component
  const AttachmentBar = () => (
    <div className="flex items-center gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="h-[44px] w-[44px] shrink-0"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </Button>
    </div>
  );

  // ---- RENDER: General Chat ----
  if (activeView === "general") {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => setActiveView("list")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">General Chat</h1>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center text-muted-foreground py-20">
              <span className="text-5xl mb-4">🐕‍🦺</span>
              <p className="text-lg font-medium">Hey there!</p>
              <p className="text-sm mt-1">Start a conversation with Goddard.</p>
            </div>
          )}
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <Card className={`max-w-[80%] px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  {msg.role === "assistant" ? (
                    <div className="prose-goddard text-sm">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {streaming && i === messages.length - 1 && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />}
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

        {attachment && (
          <div className="px-4 py-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-2 max-w-3xl mx-auto">
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate flex-1">{attachment.name}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttachment(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-border">
          <form onSubmit={handleGeneralSubmit} className="max-w-3xl mx-auto flex gap-2 items-end">
            <AttachmentBar />
            <Textarea
              ref={inputRef}
              placeholder="Message Goddard..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, () => handleGeneralSubmit())}
              disabled={streaming}
              className="min-h-[44px] max-h-[200px] resize-none"
              rows={1}
            />
            <Button type="submit" disabled={(!chatInput.trim() && !attachment) || streaming} size="icon" className="h-[44px] w-[44px] shrink-0">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ---- RENDER: Topic Chat ----
  if (activeView === "topic" && activeTopic) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => { setActiveView("list"); setActiveTopic(null); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Hash className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{getTopicName(activeTopic)}</h1>
            <div className="flex gap-2 text-xs text-muted-foreground">
              {activeTopic.model && <span className="font-mono">{activeTopic.model}</span>}
              {activeTopic.totalTokens != null && <span>{formatTokens(activeTopic.totalTokens)} tokens</span>}
            </div>
          </div>
          <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={() => openTopic(activeTopic)}>
            <RefreshCw className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {historyLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : history.length > 0 ? (
            <div className="max-w-3xl mx-auto space-y-4">
              {history.map((entry, i) => (
                <div key={i} className={`flex gap-3 ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
                  {entry.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <Card className={`max-w-[80%] px-4 py-3 ${entry.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                    <div className="prose-goddard text-sm">
                      <ReactMarkdown>{typeof entry.content === "string" ? entry.content : JSON.stringify(entry)}</ReactMarkdown>
                    </div>
                  </Card>
                  {entry.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : historyText ? (
            <pre className="text-sm whitespace-pre-wrap max-w-3xl mx-auto">{historyText}</pre>
          ) : (
            <div className="flex flex-col items-center text-center text-muted-foreground py-20">
              <Hash className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No messages yet in this topic.</p>
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <form onSubmit={handleTopicSend} className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              placeholder={`Message in ${getTopicName(activeTopic)}...`}
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, () => handleTopicSend())}
              disabled={topicSending}
              className="min-h-[44px] max-h-[200px] resize-none"
              rows={1}
            />
            <Button type="submit" disabled={!topicInput.trim() || topicSending} size="icon" className="h-[44px] w-[44px] shrink-0">
              {topicSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ---- RENDER: Topic List ----
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Conversations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Chat threads and project topics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewTopicOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Topic
          </Button>
          <Button variant="outline" size="sm" onClick={loadTopics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* General Chat */}
      <Card className="hover:bg-secondary/50 transition-colors cursor-pointer border-primary/30" onClick={() => setActiveView("general")}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">General Chat</p>
              <p className="text-xs text-muted-foreground">Direct streaming conversation</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>

      {/* Topics */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : topics.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">No topics yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {topics.map((sess, i) => (
            <Card key={sess.key || i} className="hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => openTopic(sess)}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary flex-shrink-0" />
                    <p className="font-semibold text-sm truncate">{getTopicName(sess)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {sess.model && <Badge variant="outline" className="text-xs font-mono">{sess.model}</Badge>}
                    {sess.totalTokens != null && <span className="text-xs text-muted-foreground">{formatTokens(sess.totalTokens)} tokens</span>}
                    {sess.updatedAt && <span className="text-xs text-muted-foreground">{formatTimeAgo(sess.updatedAt)}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Topic Dialog */}
      <Dialog open={newTopicOpen} onOpenChange={setNewTopicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Topic</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="e.g. Town Skware, Trading, Writing..."
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateTopic(); }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewTopicOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTopic} disabled={!newTopicName.trim() || creating} className="gap-1.5">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
