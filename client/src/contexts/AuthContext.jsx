/**
 * RHEO — Auth Context
 *
 * Provides: { user, token, login, guestLogin, logout, isAuthenticated }
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ds_user')) || null; }
    catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('ds_token') || null);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token: t, user: u } = res.data.data;
    localStorage.setItem('ds_token', t);
    localStorage.setItem('ds_user', JSON.stringify(u));
    initSocket(t);
    setToken(t);
    setUser(u);
    return u;
  }, []);

  const guestLogin = useCallback(async (guestUsername) => {
    const res = await api.post('/auth/guest', { username: guestUsername });
    const { token: t, user: u } = res.data.data;
    localStorage.setItem('ds_token', t);
    localStorage.setItem('ds_user', JSON.stringify(u));
    initSocket(t);
    setToken(t);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ds_token');
    localStorage.removeItem('ds_user');
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (token) {
      initSocket(token);
    } else {
      disconnectSocket();
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, guestLogin, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
