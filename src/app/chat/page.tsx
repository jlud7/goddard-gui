"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { GatewayClient, isConfigured } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    if (!isConfigured()) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const client = new GatewayClient();
      const response = await client.chat(
        newMessages.map((m) => ({ role: m.role, content: m.content }))
      );

      if (response) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: response },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "(No response received)" },
        ]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `⚠️ Error: ${errorMsg}`,
        },
      ]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setStreaming(false);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Chat with Goddard</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearChat}
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-20">
            <span className="text-5xl mb-4">🐕‍🦺</span>
            <p className="text-lg font-medium">Hey there!</p>
            <p className="text-sm mt-1">
              Start a conversation with Goddard below.
            </p>
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

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-2 items-end"
        >
          <Textarea
            ref={inputRef}
            placeholder={
              isConfigured()
                ? "Message Goddard..."
                : "Configure gateway in Settings first"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConfigured() || streaming}
            className="min-h-[44px] max-h-[200px] resize-none"
            rows={1}
          />
          <Button
            type="submit"
            disabled={!input.trim() || streaming || !isConfigured()}
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
