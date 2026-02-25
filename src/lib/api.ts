const STORAGE_KEY_URL = "goddard-gateway-url";
const STORAGE_KEY_TOKEN = "goddard-gateway-token";
const STORAGE_KEY_MODE = "goddard-connection-mode";
const STORAGE_KEY_PASSWORD = "goddard-dashboard-password";

export type ConnectionMode = "proxy" | "direct";

export function getDashboardPassword(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY_PASSWORD) || "";
}

export function setDashboardPassword(pw: string) {
  localStorage.setItem(STORAGE_KEY_PASSWORD, pw);
}

export function getGatewayConfig(): {
  url: string;
  token: string;
  mode: ConnectionMode;
} {
  if (typeof window === "undefined") return { url: "", token: "", mode: "proxy" };
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || "",
    token: localStorage.getItem(STORAGE_KEY_TOKEN) || "",
    mode: (localStorage.getItem(STORAGE_KEY_MODE) as ConnectionMode) || "proxy",
  };
}

export function setGatewayConfig(url: string, token: string, mode?: ConnectionMode) {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  if (mode) localStorage.setItem(STORAGE_KEY_MODE, mode);
}

export function isConfigured(): boolean {
  // Proxy mode works without user config (server has env vars)
  const { mode, url, token } = getGatewayConfig();
  if (mode === "proxy") return true;
  return !!(url && token);
}

export class GatewayClient {
  private baseUrl: string;
  private token: string;
  private mode: ConnectionMode;

  constructor(baseUrl?: string, token?: string, mode?: ConnectionMode) {
    const config = getGatewayConfig();
    this.baseUrl = (baseUrl || config.url).replace(/\/+$/, "");
    this.token = token || config.token;
    this.mode = mode || config.mode || "proxy";
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async invoke<T = unknown>(
    tool: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    if (this.mode === "proxy") {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-auth": getDashboardPassword(),
        },
        body: JSON.stringify({ tool, args }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || "Unknown error");
      return data.result as T;
    }

    const res = await fetch(`${this.baseUrl}/tools/invoke`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ tool, args }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error?.message || "Unknown error");
    return data.result as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.mode === "proxy") {
        const res = await fetch("/api/gateway", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dashboard-auth": getDashboardPassword(),
          },
          body: JSON.stringify({ tool: "session_status" }),
        });
        const data = await res.json();
        return !!data.ok;
      }

      const res = await fetch(`${this.baseUrl}/tools/invoke`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ tool: "session_status" }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch {
      return false;
    }
  }

  async chat(
    messages: { role: string; content: string }[]
  ): Promise<string> {
    let res: Response;

    if (this.mode === "proxy") {
      res = await fetch("/api/gateway", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-auth": getDashboardPassword(),
        },
        body: JSON.stringify({
          endpoint: "chat",
          model: "openclaw:main",
          messages,
          stream: false,
        }),
      });
    } else {
      res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: "openclaw:main",
          messages,
          stream: false,
        }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat error: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async *chatStream(
    messages: { role: string; content: string }[]
  ): AsyncGenerator<string, void, unknown> {
    let res: Response;

    if (this.mode === "proxy") {
      res = await fetch("/api/gateway", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-auth": getDashboardPassword(),
        },
        body: JSON.stringify({
          endpoint: "chat",
          model: "openclaw:main",
          messages,
          stream: true,
        }),
      });
    } else {
      res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: "openclaw:main",
          messages,
          stream: true,
        }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat error: ${res.status} ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

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
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
