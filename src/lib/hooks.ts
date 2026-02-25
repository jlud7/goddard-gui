"use client";

import { useState, useEffect, useCallback } from "react";
import { GatewayClient, isConfigured } from "./api";

export function useGateway() {
  const [configured, setConfigured] = useState(false);
  const [client, setClient] = useState<GatewayClient | null>(null);

  useEffect(() => {
    const ok = isConfigured();
    setConfigured(ok);
    if (ok) setClient(new GatewayClient());
  }, []);

  const refresh = useCallback(() => {
    const ok = isConfigured();
    setConfigured(ok);
    if (ok) setClient(new GatewayClient());
  }, []);

  return { configured, client, refresh };
}

export function useInvoke<T = unknown>(
  tool: string,
  args?: Record<string, unknown>,
  deps: unknown[] = []
) {
  const { client } = useGateway();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.invoke<T>(tool, args);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tool, JSON.stringify(args), ...deps]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
