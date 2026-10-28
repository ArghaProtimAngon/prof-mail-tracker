import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, clearToken, getToken, setToken } from './api';

export interface User {
  user_id: string;
  name: string;
  role: 'admin' | 'member';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  join: (code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On start: if we have a saved token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api<{ user: User }>('me')
      .then((d) => setUser(d.user))
      .catch((e) => { if (e instanceof ApiError && e.code === 'AUTH') clearToken(); })
      .finally(() => setLoading(false));
  }, []);

  async function join(code: string) {
    const d = await api<{ token: string; user: User }>('join', { code });
    setToken(d.token);
    setUser(d.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, join, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
