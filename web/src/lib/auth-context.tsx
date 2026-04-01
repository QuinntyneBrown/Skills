import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from './api';

interface User {
  id: string;
  email: string;
  roles: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let token = sessionStorage.getItem('accessToken');
    // Fall back to cookie if sessionStorage doesn't have the token
    if (!token) {
      const match = document.cookie.match(/(?:^|;\s*)accessToken=([^;]*)/);
      if (match) {
        token = decodeURIComponent(match[1]);
        sessionStorage.setItem('accessToken', token);
      }
    }
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.sub, email: '', roles: payload.roles || [] });
      } catch {
        sessionStorage.clear();
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    sessionStorage.setItem('accessToken', data.accessToken);
    sessionStorage.setItem('refreshToken', data.refreshToken);
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    setUser({ id: payload.sub, email, roles: payload.roles || [] });
  };

  const register = async (email: string, password: string) => {
    const { data } = await api.post('/auth/register', { email, password });
    return data;
  };

  const logout = async () => {
    try {
      const refreshToken = sessionStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // ignore errors on logout
    }
    sessionStorage.clear();
    document.cookie = 'accessToken=; path=/; max-age=0';
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
