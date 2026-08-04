import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  api,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setSessionListener,
} from '../api/client';
import type { Role, SessionResponse, SessionUser } from '../api/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<SessionUser>;
  applySession: (session: SessionResponse) => SessionUser;
  signOut: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: SessionResponse) => {
    setAccessToken(session.accessToken);
    setRefreshToken(session.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  useEffect(() => {
    // The API client refreshes in the background on a 401; keep React in sync.
    setSessionListener((session) => setUser(session?.user ?? null));
    return () => setSessionListener(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!getRefreshToken()) {
        setLoading(false);
        return;
      }
      await api.refreshSession();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const session = await api.post<SessionResponse>('/api/auth/login', { identifier, password });
      return applySession(session);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await api.post('/api/auth/logout', { refreshToken });
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn,
      applySession,
      signOut,
      hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, signIn, applySession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
