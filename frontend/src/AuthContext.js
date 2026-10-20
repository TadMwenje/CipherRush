import React, { useState, useEffect, useContext, useCallback } from "react";
import api, { SESSION_EXPIRED_EVENT } from "./api";
import { syncServerClock } from "./mobile/clock";

const AuthContext = React.createContext();

// The session lives in an httpOnly cookie the page can't read; who's signed in
// is always asked of the server, never trusted from local storage.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    syncServerClock();
    try {
      localStorage.removeItem("cipherrush_user"); // pre-session-auth leftover
    } catch (e) {
      // storage unavailable - nothing to clean up
    }
    api
      .get("/auth/me")
      .then((res) => !cancelled && setUser(res.data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback((userData) => setUser(userData), []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // Session may already be gone; either way the user is signed out locally.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
