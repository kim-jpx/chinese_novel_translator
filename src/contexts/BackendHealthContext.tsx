"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getHealth } from "@/lib/api";
import type { HealthCheck } from "@/lib/types";

type BackendHealthStatus = "loading" | "ready" | "error";

interface BackendHealthContextValue {
  health: HealthCheck | null;
  status: BackendHealthStatus;
  error: string | null;
  refresh: () => Promise<void>;
}

const BackendHealthContext = createContext<BackendHealthContextValue>({
  health: null,
  status: "loading",
  error: null,
  refresh: async () => {},
});

const REFRESH_INTERVAL_MS = 30000;

export function BackendHealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [status, setStatus] = useState<BackendHealthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getHealth();
      setHealth(next);
      setStatus("ready");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not load backend health");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const value = useMemo(
    () => ({ health, status, error, refresh }),
    [error, health, refresh, status]
  );

  return (
    <BackendHealthContext.Provider value={value}>
      {children}
    </BackendHealthContext.Provider>
  );
}

export function useBackendHealth() {
  return useContext(BackendHealthContext);
}
