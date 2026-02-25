const STORAGE_KEY_PASSWORD = "goddard-dashboard-password";

export function getDashboardPassword(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY_PASSWORD) || "";
}

export function setDashboardPassword(pw: string) {
  localStorage.setItem(STORAGE_KEY_PASSWORD, pw);
}

export function isConfigured(): boolean {
  return !!getDashboardPassword();
}

/** Raw tool response shape from the gateway */
export interface ToolResponse {
  content?: { type: string; text: string }[];
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Extract the structured details from a tool response */
export function getDetails(res: ToolResponse): Record<string, unknown> {
  return res?.details ?? {};
}

/** Extract the text content from a tool response */
export function getText(res: ToolResponse): string {
  if (res?.content && Array.isArray(res.content) && res.content.length > 0) {
    return res.content[0].text ?? "";
  }
  return "";
}

export class GatewayClient {
  /**
   * Invoke a gateway tool. Returns the raw tool response
   * which has { content: [...], details: {...} }.
   * Use getDetails() or getText() helpers to extract data.
   */
  async invoke(
    tool: string,
    args?: Record<string, unknown>
  ): Promise<ToolResponse> {
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
    return data.result as ToolResponse;
  }

  async testConnection(): Promise<boolean> {
    try {
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
    } catch {
      return false;
    }
  }

  async chat(
    messages: { role: string; content: string }[]
  ): Promise<string> {
    const res = await fetch("/api/gateway", {
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dashboard-auth": getDashboardPassword(),
      },
      body: JSON.stringify({ messages }),
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
          // skip
        }
      }
    }
  }
}
