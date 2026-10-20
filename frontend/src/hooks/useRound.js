import { useCallback, useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../api";
import { monoNow } from "../mobile/clock";

/**
 * Load-or-resume for a game round. On mount it asks the server for an
 * unfinished round of this mode (the app may have been killed mid-game) and
 * only starts a new one if there isn't one.
 *
 * Returns { round, setRound, loading, error, startNew }.
 */
export default function useRound(gameKey, initialBody) {
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bodyRef = useRef(initialBody);

  const startNew = useCallback(
    async (body = bodyRef.current) => {
      bodyRef.current = body;
      setLoading(true);
      setError("");
      try {
        const res = await api.post(`/games/${gameKey}/rounds`, body);
        setRound({ ...res.data, receivedAt: monoNow() });
      } catch (err) {
        setError(errorMessage(err, "Couldn't start a round. Try again."));
      } finally {
        setLoading(false);
      }
    },
    [gameKey]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/games/${gameKey}/rounds/active`);
        if (cancelled) return;
        if (res.data.round) {
          setRound({ ...res.data.round, receivedAt: monoNow() });
          setLoading(false);
          return;
        }
      } catch (err) {
        // Fall through and start fresh.
      }
      if (!cancelled) startNew();
    })();
    return () => {
      cancelled = true;
    };
  }, [gameKey, startNew]);

  return { round, setRound, loading, error, setError, startNew };
}
