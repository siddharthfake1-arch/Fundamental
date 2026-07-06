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
    } catch {
      setUser(null);
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

  return (
    <AuthCtx.Provider value={{ user, setUser, refresh, logout, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
