import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
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

  useMaintenanceWatch(site);

  return { site, error, loading, reload };
}

const MAINTENANCE_POLL_MS = 20_000;

/**
 * A page left open must not keep working after maintenance is switched on, and
 * must come back by itself when it is switched off. Rather than reconciling
 * half-loaded state, reload the page whenever the flag changes.
 */
function useMaintenanceWatch(site: SiteData | null): void {
  const known = site ? site.content.maintenance_mode === true : null;

  useEffect(() => {
    if (known === null) return;

    let cancelled = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const status = await api.get<{ maintenance: boolean }>(
          "/api/public/status",
        );
        if (!cancelled && status.maintenance !== known)
          window.location.reload();
      } catch {
        // Offline or the backend is restarting; try again on the next tick.
      }
    };

    const timer = window.setInterval(() => void check(), MAINTENANCE_POLL_MS);
    // A tab that has been in the background can be badly out of date.
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [known]);
}
