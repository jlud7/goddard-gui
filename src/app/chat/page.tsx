"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Send,
  Bot,
  User,
  Loader2,
  Trash2,
  Paperclip,
  X,
  FileText,
  Download,
} from "lucide-react";
import { GatewayClient, isConfigured, getDashboardPassword } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Attachment {
  filename: string;
  relativePath: string;
  url: string;
  type: string;
  size: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

function FilePreview({
  attachment,
  removable,
  onRemove,
}: {
  attachment: Attachment;
  removable?: boolean;
  onRemove?: () => void;
}) {
  const authUrl = `${attachment.url}?auth=${encodeURIComponent(getDashboardPassword())}`;

  if (isImageType(attachment.type)) {
    return (
      <div className="relative group inline-block">
        <img
          src={authUrl}
          alt={attachment.filename}
          className="max-w-[300px] max-h-[200px] rounded-lg border border-border object-cover cursor-pointer"
          onClick={() => window.open(authUrl, "_blank")}
        />
        {removable && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 max-w-[250px]">
      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <a
        href={authUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Render markdown with workspace file awareness */
function ChatMarkdown({ content }: { content: string }) {
  const password = getDashboardPassword();

  return (
    <ReactMarkdown
      components={{
        img: ({ src, alt, ...props }) => {
          // Add auth to workspace file URLs
          let imgSrc = src || "";
          if (imgSrc.startsWith("/api/files/")) {
            imgSrc = `${imgSrc}${imgSrc.includes("?") ? "&" : "?"}auth=${encodeURIComponent(password)}`;
          }
          return (
            <img
              src={imgSrc}
              alt={alt || ""}
              className="max-w-full max-h-[400px] rounded-lg border border-border my-2 cursor-pointer"
              onClick={() => window.open(imgSrc, "_blank")}
              {...props}
            />
          );
        },
        a: ({ href, children, ...props }) => {
          // Make workspace file links work with auth
          let linkHref = href || "";
          if (linkHref.startsWith("/api/files/")) {
            linkHref = `${linkHref}${linkHref.includes("?") ? "&" : "?"}auth=${encodeURIComponent(password)}`;
          }
          return (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              {...props}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const password = getDashboardPassword();

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-dashboard-auth": password },
          body: formData,
        });

        const data = await res.json();
        if (data.ok) {
          setPendingFiles((prev) => [
            ...prev,
            {
              filename: data.filename,
              relativePath: data.relativePath,
              url: data.url,
              type: data.type,
              size: data.size,
            },
          ]);
        } else {
          console.error("Upload failed:", data.error);
        }
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    setUploading(false);
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!text && !hasFiles) || streaming) return;
    if (!isConfigured()) return;

    // Build the message content - include file references so Goddard knows about them
    let messageContent = text;
    if (hasFiles) {
      const fileRefs = pendingFiles
        .map(
          (f) =>
            `[Attached file: ${f.filename} (${f.type}, ${formatFileSize(f.size)}) — workspace path: clawd/${f.relativePath}]`
        )
        .join("\n");
      messageContent = messageContent
        ? `${messageContent}\n\n${fileRefs}`
        : fileRefs;
    }

    const userMsg: Message = {
      role: "user",
      content: text || "(attached files)",
      attachments: hasFiles ? [...pendingFiles] : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingFiles([]);
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMsg]);

    try {
      const client = new GatewayClient();

      // Build chat messages for the API - use the full content with file refs
      const apiMessages = newMessages.map((m) => {
        if (m === userMsg) {
          return { role: m.role, content: messageContent };
        }
        // For previous messages with attachments, include file refs too
        if (m.attachments && m.attachments.length > 0) {
          const refs = m.attachments
            .map(
              (f) =>
                `[Attached file: ${f.filename} (${f.type}, ${formatFileSize(f.size)}) — workspace path: clawd/${f.relativePath}]`
            )
            .join("\n");
          return {
            role: m.role,
            content: m.content ? `${m.content}\n\n${refs}` : refs,
          };
        }
        return { role: m.role, content: m.content };
      });

      const stream = client.chatStream(apiMessages);

      let accumulated = "";
      for await (const chunk of stream) {
        accumulated += chunk;
        setMessages([
          ...newMessages,
          { role: "assistant", content: accumulated },
        ]);
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

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) =>
      item.type.startsWith("image/")
    );
    if (imageItems.length === 0) return;

    // Prevent the default paste of the image as text
    e.preventDefault();

    setUploading(true);
    const password = getDashboardPassword();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;

      // Give pasted images a nice name
      const ext = file.type.split("/")[1] || "png";
      const pastedFile = new File(
        [file],
        `pasted-image-${Date.now()}.${ext}`,
        { type: file.type }
      );

      try {
        const formData = new FormData();
        formData.append("file", pastedFile);

        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-dashboard-auth": password },
          body: formData,
        });

        const data = await res.json();
        if (data.ok) {
          setPendingFiles((prev) => [
            ...prev,
            {
              filename: data.filename,
              relativePath: data.relativePath,
              url: data.url,
              type: data.type,
              size: data.size,
            },
          ]);
        }
      } catch (err) {
        console.error("Paste upload error:", err);
      }
    }

    setUploading(false);
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setPendingFiles([]);
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
              <div className="max-w-[80%]">
                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div
                    className={`flex flex-wrap gap-2 mb-2 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.attachments.map((att, j) => (
                      <FilePreview key={j} attachment={att} />
                    ))}
                  </div>
                )}
                {/* Message bubble */}
                {msg.content && (
                  <Card
                    className={`px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose-goddard text-sm">
                        <ChatMarkdown content={msg.content} />
                        {streaming && i === messages.length - 1 && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        )}
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                  </Card>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="px-4 pt-2 border-t border-border">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
            {pendingFiles.map((file, i) => (
              <FilePreview
                key={i}
                attachment={file}
                removable
                onRemove={() => removePendingFile(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-2 items-end"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx"
          />

          {/* Attach button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-[44px] w-[44px] shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConfigured() || uploading}
            title="Attach file"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>

          <Textarea
            ref={inputRef}
            placeholder={
              isConfigured()
                ? "Message Goddard... (paste images or click 📎)"
                : "Configure gateway in Settings first"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={!isConfigured() || streaming}
            className="min-h-[44px] max-h-[200px] resize-none"
            rows={1}
          />
          <Button
            type="submit"
            disabled={
              (!input.trim() && pendingFiles.length === 0) ||
              streaming ||
              !isConfigured()
            }
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
