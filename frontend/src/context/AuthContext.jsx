import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { registerUser, loginUser, logoutUser, fetchCurrentUser } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" covers the initial session check on page load, so
  // ProtectedRoute doesn't redirect to /login before we know the answer.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await loginUser(email, password);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await registerUser(name, email, password);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
    }
  }, []);

  const value = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
