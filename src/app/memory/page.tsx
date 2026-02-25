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
import { GatewayClient, isConfigured } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface ExecResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  output?: string;
  [key: string]: unknown;
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

      // Load MEMORY.md
      const memResult = await client.invoke<ExecResult>("exec", {
        command: "cat MEMORY.md 2>/dev/null || echo '(No MEMORY.md found)'",
      });
      setMainMemory(
        memResult?.stdout || memResult?.output || String(memResult) || ""
      );

      // List and load daily memory files
      try {
        const listResult = await client.invoke<ExecResult>("exec", {
          command:
            "ls -1 memory/*.md 2>/dev/null | sort -r | head -10",
        });
        const files = (listResult?.stdout || listResult?.output || "")
          .split("\n")
          .filter((f: string) => f.trim());

        const dailyResults = await Promise.all(
          files.map(async (f: string) => {
            const res = await client.invoke<ExecResult>("exec", {
              command: `cat "${f}"`,
            });
            return {
              name: f.replace("memory/", ""),
              content: res?.stdout || res?.output || String(res) || "",
            };
          })
        );
        setDailyFiles(dailyResults);
      } catch {
        setDailyFiles([]);
      }
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
                  <div className="prose-goddard text-sm">
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
                        <div className="prose-goddard text-sm">
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
