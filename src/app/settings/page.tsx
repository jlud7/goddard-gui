"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { GatewayClient } from "@/lib/api";

export default function SettingsPage() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  useEffect(() => {
    // Auto-test on load
    handleTest();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const client = new GatewayClient();
      const ok = await client.testConnection();
      setTestResult(ok);
    } catch {
      setTestResult(false);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          System configuration
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gateway Connection</CardTitle>
          <CardDescription>
            Status of the connection to the OpenClaw Gateway running on this machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="gap-1.5"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : testResult === true ? (
                <Wifi className="h-4 w-4 text-green-400" />
              ) : testResult === false ? (
                <WifiOff className="h-4 w-4 text-red-400" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Test Connection
            </Button>
          </div>

          {testResult !== null && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                testResult
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {testResult ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Connected to Gateway.
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Cannot reach Gateway. Check that OpenClaw is running.
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Goddard GUI</strong> v1.0 —
            Mission Control for OpenClaw 🐕‍🦺
          </p>
          <p>
            Self-hosted on Mac mini. Connected to Gateway via localhost.
          </p>
          <div className="flex gap-2 mt-3">
            <Badge variant="secondary">Next.js 14</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Tailwind CSS</Badge>
            <Badge variant="secondary">shadcn/ui</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
