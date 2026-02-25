const STORAGE_KEY_URL = "goddard-gateway-url";
const STORAGE_KEY_TOKEN = "goddard-gateway-token";

export function getGatewayConfig(): { url: string; token: string } {
  if (typeof window === "undefined") return { url: "", token: "" };
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || "",
    token: localStorage.getItem(STORAGE_KEY_TOKEN) || "",
  };
}

export function setGatewayConfig(url: string, token: string) {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

export function isConfigured(): boolean {
  const { url, token } = getGatewayConfig();
  return !!(url && token);
}

export class GatewayClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl?: string, token?: string) {
    const config = getGatewayConfig();
    this.baseUrl = (baseUrl || config.url).replace(/\/+$/, "");
    this.token = token || config.token;
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

  async *chatStream(
    messages: { role: string; content: string }[]
  ): AsyncGenerator<string, void, unknown> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: "openclaw:main",
        messages,
        stream: true,
      }),
    });

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
