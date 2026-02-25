"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Save,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Cloud,
  Monitor,
} from "lucide-react";
import {
  GatewayClient,
  getGatewayConfig,
  setGatewayConfig,
  ConnectionMode,
} from "@/lib/api";

export default function SettingsPage() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<ConnectionMode>("proxy");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  useEffect(() => {
    const config = getGatewayConfig();
    setUrl(config.url);
    setToken(config.token);
    setMode(config.mode);
  }, []);

  const handleSave = () => {
    setGatewayConfig(url.trim(), token.trim(), mode);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const client = new GatewayClient(
        mode === "direct" ? url.trim() : "",
        mode === "direct" ? token.trim() : "",
        mode
      );
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
          Configure your OpenClaw Gateway connection
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection Mode</CardTitle>
          <CardDescription>
            Choose how to connect to the Gateway
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("proxy")}
              className={`p-4 rounded-lg border text-left transition-colors ${
                mode === "proxy"
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <Cloud
                className={`h-5 w-5 mb-2 ${
                  mode === "proxy" ? "text-blue-400" : "text-muted-foreground"
                }`}
              />
              <p className="font-medium text-sm">Cloud Proxy</p>
              <p className="text-xs text-muted-foreground mt-1">
                Recommended. Routes through Vercel — works from anywhere.
              </p>
            </button>
            <button
              onClick={() => setMode("direct")}
              className={`p-4 rounded-lg border text-left transition-colors ${
                mode === "direct"
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <Monitor
                className={`h-5 w-5 mb-2 ${
                  mode === "direct" ? "text-blue-400" : "text-muted-foreground"
                }`}
              />
              <p className="font-medium text-sm">Direct</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect directly to Gateway URL. Requires same network or
                tunnel.
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {mode === "direct" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gateway Connection</CardTitle>
            <CardDescription>
              Enter your OpenClaw Gateway URL and authentication token. Stored
              locally in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway URL</label>
              <Input
                placeholder="https://your-gateway.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The base URL of your OpenClaw Gateway instance
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Auth Token</label>
              <Input
                type="password"
                placeholder="your-auth-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Bearer token for API authentication
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} className="gap-1.5">
              {saved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Saved!" : "Save Settings"}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={
                testing || (mode === "direct" && (!url.trim() || !token.trim()))
              }
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
                  Connection successful! Gateway is reachable.
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Connection failed. Check your configuration.
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
            Built with Next.js, Tailwind CSS, and shadcn/ui.
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
