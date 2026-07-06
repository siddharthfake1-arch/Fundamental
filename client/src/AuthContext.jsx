import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, session } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/api/auth/me');
      setUser(user);
      session.onUser?.(user); // native: cache for offline cold starts
    } catch (e) {
      // A NETWORK failure (no HTTP status) with a cached session must not log the
      // user out — an offline app open shows the signed-in shell, not the landing
      // page. A real 401/403 (e.status set) still signs out.
      const cached = e.status === undefined && session.getCachedUser?.();
      setUser(cached || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async () => {
    await api.post('/api/auth/logout');
    session.onExpired?.(); // native: clear the stored bearer token
    setUser(null);
  };

  // Every session-user update (login, signup, profile edits) also refreshes the
  // native offline cache, so a fresh sign-in survives an offline relaunch too.
  const setUserCached = useCallback((u) => {
    setUser(u);
    if (u) session.onUser?.(u);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser: setUserCached, refresh, logout, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
