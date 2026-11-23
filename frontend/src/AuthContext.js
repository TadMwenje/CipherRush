import React, { useState, useEffect, useContext, useCallback } from "react";
import api, { SESSION_EXPIRED_EVENT } from "./api";
import { syncServerClock } from "./mobile/clock";
import { isOnline, onNetworkChange } from "./mobile/network";
import { clearCache, readCache, writeCache } from "./cache";

// The last confirmed profile, so a returning player sees their home screen at
// once instead of waiting on a sleepy server. Display only (cache.js).
const SESSION_SCOPE = "session";
const SESSION_PATH = "/auth/me";
const remember = (user) => (user ? writeCache(SESSION_SCOPE, SESSION_PATH, user) : clearCache());

const AuthContext = React.createContext();

// The session lives in an httpOnly cookie the page can't read; who's signed in
// is always asked of the server. A cached copy of the last answer is only shown
// while that question is in flight: every request still needs the cookie, and
// a "no" from the server signs the player out and wipes the cache.
export function AuthProvider({ children }) {
  const [cached] = useState(() => readCache(SESSION_SCOPE, SESSION_PATH));
  const [user, setUser] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    // true while we couldn't reach the server to ask - re-asked on reconnect.
    let unknown = false;
    const check = () => {
      unknown = false;
      syncServerClock();
      return api
        .get("/auth/me")
        .then((res) => {
          if (cancelled) return;
          setUser(res.data.user);
          remember(res.data.user);
        })
        .catch((err) => {
          if (cancelled) return;
          if (!err.response) {
            // Couldn't reach the server: keep showing the cached player, ask again later.
            unknown = true;
            return;
          }
          setUser(null);
          remember(null);
        })
        .finally(() => !cancelled && setLoading(false));
    };
    try {
      localStorage.removeItem("cipherrush_user"); // pre-session-auth leftover
    } catch (e) {
      // storage unavailable - nothing to clean up
    }
    // Launched with no signal: don't hold the splash waiting for a server we
    // can't reach. Practice Mode works offline; the session is checked as soon
    // as the connection is back.
    if (isOnline()) check();
    else {
      unknown = true;
      setLoading(false);
    }
    const off = onNetworkChange((net) => net.online && unknown && check());
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      remember(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback((userData) => {
    setUser(userData);
    remember(userData);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      if (next) remember(next);
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // Session may already be gone; either way the user is signed out locally.
    }
    setUser(null);
    remember(null);
  }, []);

  // The server already ended the session (e.g. account deleted) - just forget it locally.
  const clearSession = useCallback(() => {
    setUser(null);
    remember(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, clearSession, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
