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

  return { site, error, loading, reload };
}

export const MAINTENANCE_WARNING_SECONDS = 10;

/**
 * A page left open must not keep working after maintenance is switched on, and
 * must come back by itself when it is switched off. The backend pushes a
 * message on one idle connection when the Owner flips the switch, so nothing
 * is requested while nothing changes.
 *
 * Switching on counts down first so a student mid-upload is warned; switching
 * off restores the site immediately. Either way the page moves itself, and
 * reloading rather than reconciling state guarantees it cannot be left partly
 * in one mode.
 *
 * Returns the seconds remaining before maintenance begins, or null when no
 * change is pending.
 */
export function useMaintenanceWatch(active: boolean): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const source = new EventSource(`${API_BASE}/api/public/events`);
    source.addEventListener("maintenance", (event) => {
      const enabled = readEnabled(event);
      if (!enabled) {
        window.location.reload();
        return;
      }
      setSecondsLeft(MAINTENANCE_WARNING_SECONDS);
    });
    return () => source.close();
  }, [active]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      window.location.reload();
      return;
    }
    const timer = window.setTimeout(
      () => setSecondsLeft(secondsLeft - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  return secondsLeft;
}

function readEnabled(event: Event): boolean {
  if (!(event instanceof MessageEvent)) return true;
  try {
    const parsed: unknown = JSON.parse(event.data as string);
    return typeof parsed === "object" && parsed !== null && "enabled" in parsed
      ? (parsed as { enabled: unknown }).enabled === true
      : true;
  } catch {
    return true;
  }
}
