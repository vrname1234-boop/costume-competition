import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SiteData } from '../api/types';

export function text(content: Record<string, string | boolean>, key: string): string {
  const value = content[key];
  return typeof value === 'string' ? value : '';
}

/** The public site payload: competition copy, dates, houses and categories. */
export function useSite() {
  const [site, setSite] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setSite(await api.get<SiteData>('/api/public/site'));
      setError(null);
    } catch {
      setError('The competition information could not be loaded. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { site, error, loading, reload };
}
