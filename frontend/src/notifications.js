/*
 * Reminders, as OS notifications scheduled on the phone itself (Capacitor
 * LocalNotifications). Opt-in only: nothing is scheduled until the player
 * turns reminders on and the OS permission prompt says yes.
 *
 * Scheduled locally, so they cost no data and need no server:
 *  - come back:   24h and 48h after the app was last used
 *  - new daily:   when the next UTC Daily Cipher unlocks (next 3 days)
 *  - daily open:  a few hours before today's cipher resets, if not played yet
 *  - daily done:  a while after a solve, "see where you rank"
 *
 * Nothing lands between 22:00 and 09:00 on the phone's clock; those are
 * moved to the nearest polite time instead.
 *
 * Revoking permission in the OS settings is respected on the next resume:
 * every pending reminder is cancelled, and the settings row says it's blocked.
 *
 * Android: reminders are inexact (isExactNotification: false). Asking for
 * exact alarms without SCHEDULE_EXACT_ALARM makes the plugin open the
 * "Alarms & reminders" settings page on every schedule call, and since we
 * re-arm on every pause and resume, that page reopened every time the player
 * came back to the app. A reminder a few minutes late doesn't matter.
 *
 * Every OS call goes through one queue, so pause, resume and /daily refreshes
 * can't interleave their cancel/schedule pairs and leave duplicate alarms.
 */
import { onAppPause, onAppResume } from "./mobile/lifecycle";

const PREF_KEY = "cipherrush_notifications"; // "on" | "off"; missing = never asked
const CHANNEL = "reminders";
export const NOTIFICATION_ROUTE_EVENT = "cipherrush:notification-route";

const ID = {
  comeback24: 1001,
  comeback48: 1002,
  newDaily: [2001, 2002, 2003],
  dailyOpen: 3001,
  dailyDone: 3002,
};
const PLANNED_IDS = [ID.comeback24, ID.comeback48, ...ID.newDaily, ID.dailyOpen];
const ALL_IDS = [...PLANNED_IDS, ID.dailyDone];

const HOUR = 60 * 60 * 1000;
export const QUIET_START = 22; // local hour
export const QUIET_END = 9;

function plugin() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.LocalNotifications || null;
}

function platform() {
  return typeof window !== "undefined" ? window.Capacitor?.getPlatform?.() || "web" : "web";
}

export function notificationsSupported() {
  return Boolean(plugin());
}

export function notificationPreference() {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch (e) {
    return null;
  }
}

function savePreference(value) {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch (e) {
    // storage unavailable - the OS permission still gates everything
  }
}

/** "granted" | "denied" | "prompt" | "unsupported" */
export async function permissionState() {
  const ln = plugin();
  if (!ln) return "unsupported";
  try {
    const { display } = await ln.checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch (e) {
    return "unsupported";
  }
}

/** Move a time out of quiet hours: forward to 09:00, or back to 21:00. */
export function politeTime(date, direction = "forward") {
  const d = new Date(date.getTime());
  const h = d.getHours();
  if (h >= QUIET_END && h < QUIET_START) return d;
  if (direction === "forward") {
    if (h >= QUIET_START) d.setDate(d.getDate() + 1);
    d.setHours(QUIET_END, 0, 0, 0);
  } else {
    if (h < QUIET_END) d.setDate(d.getDate() - 1);
    d.setHours(QUIET_START - 1, 0, 0, 0);
  }
  return d;
}

/** The next `count` UTC midnights after `now`. */
export function nextUtcResets(now, count) {
  const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Array.from({ length: count }, (_, i) => new Date(first + i * 24 * HOUR));
}

export function formatSolveTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function note(id, at, title, body, route) {
  return {
    id,
    title,
    body,
    schedule: { at, allowWhileIdle: true },
    isExactNotification: false,
    extra: { route },
    ...(platform() === "android" ? { channelId: CHANNEL } : {}),
  };
}

/** Which reminders to schedule, given the time and today's daily status. Pure, for tests. */
export function planReminders(now, { daily = null, includeComeback = false } = {}) {
  const plan = [];
  const future = (d) => d.getTime() > now.getTime() + 60 * 1000;

  if (includeComeback) {
    plan.push(note(ID.comeback24, politeTime(new Date(now.getTime() + 24 * HOUR)),
      "Ciphers don't crack themselves", "A fresh round is waiting. Ninety seconds is all it takes.", "/dashboard"));
    plan.push(note(ID.comeback48, politeTime(new Date(now.getTime() + 48 * HOUR)),
      "Still got it?", "New ciphers, new scams, same clock. Jump back in.", "/dashboard"));
  }

  nextUtcResets(now, ID.newDaily.length).forEach((reset, i) => {
    plan.push(note(ID.newDaily[i], politeTime(reset),
      "New Daily Cipher unlocked", "Same cipher for everyone, one shot. Go first.", "/game/daily"));
  });

  if (daily?.resets_at && !daily.played) {
    const at = politeTime(new Date(new Date(daily.resets_at).getTime() - 3 * HOUR), "backward");
    if (future(at) && at.getTime() < new Date(daily.resets_at).getTime()) {
      plan.push(note(ID.dailyOpen, at,
        "Today's cipher is still open", "A few hours left before it resets. One shot, make it count.", "/game/daily"));
    }
  }

  return plan.filter((n) => future(n.schedule.at));
}

async function cancel(ids) {
  const ln = plugin();
  if (!ln) return;
  try {
    await ln.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch (e) {
    // nothing pending with these ids
  }
}

async function schedule(notifications) {
  const ln = plugin();
  if (!ln || notifications.length === 0) return;
  try {
    await ln.schedule({ notifications });
  } catch (e) {
    // scheduling failed (permission revoked mid-call) - next resume retries
  }
}

// One OS operation at a time, in call order. A failed step doesn't block the next.
let queue = Promise.resolve();
function serially(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// What the OS was last given for the planned reminders, to skip identical re-arms.
let armed = "";
const signature = (plan) => plan.map((n) => `${n.id}@${Math.floor(n.schedule.at.getTime() / 60000)}`).join(",");

async function allowed() {
  return notificationPreference() === "on" && (await permissionState()) === "granted";
}

let lastDaily = null;

/** Re-arm the daily reminders. Call whenever fresh /daily status arrives. */
export function syncDailyReminders(daily) {
  if (daily) lastDaily = daily;
  return serially(async () => {
    if (!(await allowed())) return;
    // Come-back nudges are re-armed from "now" every time the app is used, so
    // they still exist if iOS suspends us before the pause handler finishes.
    const plan = planReminders(new Date(), { daily: lastDaily, includeComeback: true });
    const sig = signature(plan);
    if (sig === armed) return;
    // Replace the whole planned set, so a reminder that dropped out of the plan
    // (today's daily got played) goes too.
    await cancel(PLANNED_IDS);
    await schedule(plan);
    armed = sig;
  });
}

/** After a Daily Cipher solve: nudge them to check the board once others have played. */
export async function noteDailySolved(seconds) {
  if (lastDaily) lastDaily = { ...lastDaily, played: true };
  await serially(async () => {
    if (!(await allowed())) return;
    await cancel([ID.dailyOpen, ID.dailyDone]);
    armed = "";
    const at = politeTime(new Date(Date.now() + 2 * HOUR));
    await schedule([note(ID.dailyDone, at, "Check your rank",
      `You cracked today's cipher in ${formatSolveTime(seconds)}. See where that put you on Today's board.`,
      "/leaderboard?board=daily")]);
  });
}

/** Ask the OS (this shows the system prompt the first time). Returns the permission state. */
export async function enableNotifications() {
  const ln = plugin();
  if (!ln) return "unsupported";
  let state = await permissionState();
  if (state === "prompt") {
    try {
      const { display } = await ln.requestPermissions();
      state = display === "granted" ? "granted" : "denied";
    } catch (e) {
      state = "denied";
    }
  }
  if (state === "granted") {
    savePreference("on");
    await syncDailyReminders(null);
  }
  return state;
}

export async function disableNotifications() {
  savePreference("off");
  await serially(() => cancelEverything());
}

async function cancelEverything() {
  await cancel(ALL_IDS);
  armed = "";
}

/** "Not now" on the opt-in card: remember the answer, don't ask again. */
export function declineNotifications() {
  savePreference("off");
}

let pendingRoute = null;
/** The screen a tapped reminder asked for, once. */
export function takePendingRoute() {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

let installed = false;
export function installNotifications() {
  const ln = plugin();
  if (installed || !ln) return;
  installed = true;

  if (platform() === "android") {
    ln.createChannel?.({ id: CHANNEL, name: "Reminders", description: "Daily Cipher and come-back reminders", importance: 3 })
      ?.catch?.(() => {});
  }

  try {
    ln.addListener("localNotificationActionPerformed", (event) => {
      const route = event?.notification?.extra?.route;
      // Only our own in-app paths; anything else just opens the app where it was.
      if (typeof route !== "string" || !route.startsWith("/")) return;
      // On a cold start the router may not be listening yet; it picks this up on mount.
      pendingRoute = route;
      try {
        window.dispatchEvent(new CustomEvent(NOTIFICATION_ROUTE_EVENT, { detail: route }));
      } catch (e) {
        // the router collects pendingRoute on mount instead
      }
    });
  } catch (e) {
    // listener unavailable - tapping still opens the app
  }

  // Put away or back again: push the come-back nudges out to 24h/48h from now.
  onAppPause(() => syncDailyReminders(null));
  onAppResume(async () => {
    // Permission revoked in the OS settings while we were away: clear everything.
    if (notificationPreference() === "on" && (await permissionState()) !== "granted") {
      await serially(() => cancelEverything());
    } else syncDailyReminders(null);
  });
}
