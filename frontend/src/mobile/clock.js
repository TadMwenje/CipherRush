import api from "../api";

/*
 * Two clocks, neither of which is the phone's wall clock:
 *
 *  - serverNow(): the server's UTC time, estimated from one /api/time sync.
 *    Used for anything calendar-shaped (daily rollover countdown). Players
 *    changing their device date/time can't move it.
 *  - monoNow(): performance.now(), a monotonic clock that only ever ticks
 *    forward at real speed. Used for in-round countdowns, so editing the
 *    device clock mid-round does nothing. (The server times rounds anyway.)
 */
let offsetMs = 0;
let synced = false;
let syncing = null;

export function monoNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Estimate server time = device time + offset, correcting for half the round trip. */
export function syncServerClock() {
  if (!syncing) {
    const sentAt = Date.now();
    syncing = api
      .get("/time")
      .then((res) => {
        const receivedAt = Date.now();
        const rtt = receivedAt - sentAt;
        offsetMs = res.data.epoch_ms + rtt / 2 - receivedAt;
        synced = true;
        return res.data;
      })
      .catch(() => null)
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
}

export function serverNow() {
  return Date.now() + offsetMs;
}

export function isClockSynced() {
  return synced;
}

/** Device clock vs server, in ms. Big numbers mean the phone's clock is off (or was changed). */
export function clockSkewMs() {
  return offsetMs;
}

if (typeof window !== "undefined") {
  // Re-sync when the app comes back to the foreground - the phone may have
  // slept for hours, crossed timezones, or had its clock changed meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncServerClock();
  });
}
