import { useCallback, useEffect, useState } from "react";
import { API_BASE, api } from "../api/client";
import type { SiteData } from "../api/types";

export function text(
  content: Record<string, string | boolean>,
  key: string,
): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

/** The public site payload: competition copy, dates, houses and categories. */
export function useSite() {
  const [site, setSite] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setSite(await api.get<SiteData>("/api/public/site"));
      setError(null);
    } catch {
      setError(
        "The competition information could not be loaded. Please refresh the page.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useMaintenanceWatch();

  return { site, error, loading, reload };
}

/**
 * A page left open must not keep working after maintenance is switched on, and
 * must come back by itself when it is switched off. The backend pushes a
 * message on one idle connection when the Owner flips the switch, so nothing
 * is requested while nothing changes. Reloading, rather than reconciling
 * half-loaded state, guarantees the page cannot be left partly in one mode.
 */
function useMaintenanceWatch(): void {
  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/public/events`);
    source.addEventListener("maintenance", () => window.location.reload());
    return () => source.close();
  }, []);
}
