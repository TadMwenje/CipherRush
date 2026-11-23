/*
 * Stale-while-revalidate cache for read-only screens (home stats, the daily
 * status, leaderboards, the profile). A screen renders whatever was cached
 * last time at once, then refreshes from the server in the background, so a
 * slow server or a weak signal never leaves the player looking at a spinner.
 *
 * Display only: the cache never decides anything. Scores, rounds and the
 * session still come from the server, and every request still carries the
 * session cookie. Entries are scoped to the signed-in account and wiped on
 * logout, so one player never sees another's numbers on a shared phone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { isOnline } from "./mobile/network";

const PREFIX = "cr_cache:v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week-old screen is worse than a spinner

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null; // private mode or storage disabled: the cache is simply off
  }
}

const keyFor = (scope, path) => `${PREFIX}${scope || "public"}:${path}`;

export function readCache(scope, path) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(scope, path));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (!at || Date.now() - at > MAX_AGE_MS) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function writeCache(scope, path, data) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(scope, path), JSON.stringify({ at: Date.now(), data }));
  } catch (e) {
    // Quota full: drop our own entries and carry on without caching.
    clearCache();
  }
}

/** Forget every cached screen (logout, session expired, account deleted). */
export function clearCache() {
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) store.removeItem(k);
    }
  } catch (e) {
    // nothing to clear
  }
}

/**
 * useCachedGet("/me/dashboard", { scope: user.id })
 * -> { data, stale, error, refresh }
 * `data` starts as the cached copy (or null), `stale` is true until the
 * server has answered this time, and `refresh()` refetches without blanking.
 * `accept(data)` can reject malformed responses (returns false).
 */
export function useCachedGet(path, { scope = null, accept = () => true, enabled = true } = {}) {
  const [data, setData] = useState(() => (path ? readCache(scope, path) : null));
  const [stale, setStale] = useState(true);
  const [error, setError] = useState(null);
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  // A different board or account: show its cached copy straight away.
  useEffect(() => {
    setData(path ? readCache(scope, path) : null);
    setStale(true);
    setError(null);
  }, [path, scope]);

  const refresh = useCallback(() => {
    if (!path || !enabled || !isOnline()) return () => {};
    let cancelled = false;
    api
      .get(path)
      .then((res) => {
        if (cancelled) return;
        if (!acceptRef.current(res.data)) {
          setError(new Error("Unexpected response"));
          return;
        }
        setData(res.data);
        setStale(false);
        setError(null);
        writeCache(scope, path, res.data);
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [path, scope, enabled]);

  useEffect(() => refresh(), [refresh]);

  return { data, stale, error, refresh };
}
