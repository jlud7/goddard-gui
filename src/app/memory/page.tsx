"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, RefreshCw, Loader2, FileText } from "lucide-react";
import { GatewayClient, isConfigured, getDetails } from "@/lib/api";
import ReactMarkdown from "react-markdown";

/**
 * Extract readable text from a tool result.
 * Handles the shape: { content: [{ type: "text", text: "..." }] }
 * Also un-escapes literal \n sequences that sometimes appear in the JSON.
 */
function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const res = result as Record<string, unknown>;

  // Try result.content[0].text
  if (Array.isArray(res.content) && res.content.length > 0) {
    const first = res.content[0];
    if (first && typeof first === "object" && "text" in first) {
      const raw = String((first as Record<string, unknown>).text ?? "");
      // Replace literal \n (two chars) with actual newlines if needed
      return raw.replace(/\\n/g, "\n");
    }
  }

  // Fallback: if it's just a string at top level
  if (typeof res.text === "string") {
    return res.text.replace(/\\n/g, "\n");
  }

  return "";
}

export default function MemoryPage() {
  const [mainMemory, setMainMemory] = useState<string>("");
  const [dailyFiles, setDailyFiles] = useState<{ name: string; content: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("main");

  const loadMemory = useCallback(async () => {
    if (!isConfigured()) {
      setError("Gateway not configured");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = new GatewayClient();

      // Load MEMORY.md via memory_get
      try {
        const memResult = await client.invoke("memory_get", { path: "MEMORY.md" });
        const text = extractText(memResult);
        setMainMemory(text || "(No MEMORY.md found)");
      } catch {
        setMainMemory("(Unable to load MEMORY.md)");
      }

      // Load daily memory files
      const dailyResults: { name: string; content: string }[] = [];

      // Use memory_search to discover daily files
      try {
        const searchResult = await client.invoke("memory_search", {
          query: "daily notes memory log",
          maxResults: 30,
        });
        const details = getDetails(searchResult);
        const text = extractText(searchResult);

        // Extract unique file paths from search results
        const paths = new Set<string>();

        // Check details for results array
        const results = details.results || details.matches || details.entries;
        if (Array.isArray(results)) {
          for (const r of results) {
            const p = (r as Record<string, unknown>).path || (r as Record<string, unknown>).file;
            if (typeof p === "string" && p.match(/memory\/\d{4}-\d{2}-\d{2}\.md/)) {
              paths.add(p);
            }
          }
        }

        // Also try to extract paths from text content
        if (text) {
          const pathMatches = text.match(/memory\/\d{4}-\d{2}-\d{2}\.md/g);
          if (pathMatches) {
            for (const p of pathMatches) paths.add(p);
          }
        }

        // If search didn't find paths, try recent dates directly
        if (paths.size === 0) {
          const today = new Date();
          for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            paths.add(`memory/${dateStr}.md`);
          }
        }

        // Fetch each daily file
        const sortedPaths = Array.from(paths).sort().reverse();
        const fetches = await Promise.allSettled(
          sortedPaths.map(async (p) => {
            const res = await client.invoke("memory_get", { path: p });
            const content = extractText(res);
            if (content && !content.includes("not found") && !content.includes("ENOENT")) {
              return { name: p.replace("memory/", ""), content };
            }
            return null;
          })
        );

        for (const f of fetches) {
          if (f.status === "fulfilled" && f.value) {
            dailyResults.push(f.value);
          }
        }
      } catch {
        // Fallback: try recent dates directly
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          try {
            const res = await client.invoke("memory_get", { path: `memory/${dateStr}.md` });
            const content = extractText(res);
            if (content && !content.includes("not found") && !content.includes("ENOENT")) {
              dailyResults.push({ name: `${dateStr}.md`, content });
            }
          } catch {
            // File doesn't exist, skip
          }
        }
      }

      setDailyFiles(dailyResults);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> Memory
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Long-term memory and daily notes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadMemory}
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
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="main" className="gap-1.5">
              <Brain className="h-4 w-4" /> MEMORY.md
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-1.5">
              <FileText className="h-4 w-4" /> Daily Notes
              {dailyFiles.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {dailyFiles.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <Card>
              <CardContent className="py-6">
                <ScrollArea className="max-h-[70vh]">
                  <div className="prose-goddard text-sm leading-relaxed">
                    <ReactMarkdown>{mainMemory}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily">
            {dailyFiles.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No daily memory files found
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {dailyFiles.map((file) => (
                  <Card key={file.name}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-mono flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        {file.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="max-h-[400px]">
                        <div className="prose-goddard text-sm leading-relaxed">
                          <ReactMarkdown>{file.content}</ReactMarkdown>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
