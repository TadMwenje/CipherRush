/*
 * Reminder consent and scheduling. Nothing may reach the OS before the player
 * opts in, the answer must persist, and a revoke in the OS settings must
 * cancel what's pending.
 */
import {
  planReminders,
  politeTime,
  nextUtcResets,
  enableNotifications,
  disableNotifications,
  declineNotifications,
  notificationPreference,
  syncDailyReminders,
  installNotifications,
  QUIET_START,
  QUIET_END,
} from "./notifications";
import { enterBackground, enterForeground } from "./mobile/lifecycle";

function fakePlugin({ display = "prompt", grant = true } = {}) {
  const ln = {
    display,
    scheduled: [],
    cancelled: [],
    checkPermissions: jest.fn(async () => ({ display: ln.display })),
    requestPermissions: jest.fn(async () => {
      ln.display = grant ? "granted" : "denied";
      return { display: ln.display };
    }),
    schedule: jest.fn(async ({ notifications }) => ln.scheduled.push(...notifications)),
    cancel: jest.fn(async ({ notifications }) => ln.cancelled.push(...notifications.map((n) => n.id))),
    addListener: jest.fn(),
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { LocalNotifications: ln } };
  return ln;
}

const isPolite = (d) => d.getHours() >= QUIET_END && d.getHours() < QUIET_START;

beforeEach(() => localStorage.clear());
afterEach(() => delete window.Capacitor);

describe("planning", () => {
  test("nothing is planned for quiet hours or the past", () => {
    const now = new Date(2026, 9, 28, 23, 30);
    const plan = planReminders(now, {
      includeComeback: true,
      daily: { played: false, resets_at: nextUtcResets(now, 1)[0].toISOString() },
    });
    expect(plan.length).toBeGreaterThan(0);
    plan.forEach((n) => {
      expect(isPolite(n.schedule.at)).toBe(true);
      expect(n.schedule.at.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  test("no 'still open' reminder once today's daily is played", () => {
    const now = new Date(2026, 9, 28, 10, 0);
    const resets = nextUtcResets(now, 1)[0].toISOString();
    const open = planReminders(now, { daily: { played: false, resets_at: resets } }).map((n) => n.id);
    const done = planReminders(now, { daily: { played: true, resets_at: resets } }).map((n) => n.id);
    expect(done).not.toContain(3001);
    expect(open.filter((id) => id !== 3001)).toEqual(done);
  });

  test("come-back nudges only when asked for (app put away)", () => {
    const now = new Date(2026, 9, 28, 12, 0);
    expect(planReminders(now).map((n) => n.id)).not.toContain(1001);
    expect(planReminders(now, { includeComeback: true }).map((n) => n.id)).toEqual(expect.arrayContaining([1001, 1002]));
  });

  test("politeTime moves night-time forward to the morning and back to the evening", () => {
    expect(politeTime(new Date(2026, 0, 1, 23, 0)).getHours()).toBe(QUIET_END);
    expect(politeTime(new Date(2026, 0, 1, 23, 0)).getDate()).toBe(2);
    expect(politeTime(new Date(2026, 0, 2, 3, 0), "backward").getHours()).toBe(QUIET_START - 1);
    expect(politeTime(new Date(2026, 0, 2, 3, 0), "backward").getDate()).toBe(1);
    expect(politeTime(new Date(2026, 0, 1, 14, 0)).getHours()).toBe(14);
  });
});

describe("consent", () => {
  test("nothing is scheduled before the player opts in", async () => {
    const ln = fakePlugin();
    await syncDailyReminders({ played: false, resets_at: new Date(Date.now() + 8 * 3600e3).toISOString() });
    expect(ln.requestPermissions).not.toHaveBeenCalled();
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  test("opting in asks the OS, persists the choice and schedules", async () => {
    const ln = fakePlugin({ grant: true });
    await expect(enableNotifications()).resolves.toBe("granted");
    expect(ln.requestPermissions).toHaveBeenCalledTimes(1);
    expect(notificationPreference()).toBe("on");
    expect(ln.schedule).toHaveBeenCalled();
  });

  test("an OS 'no' is respected and nothing is scheduled", async () => {
    const ln = fakePlugin({ grant: false });
    await expect(enableNotifications()).resolves.toBe("denied");
    expect(notificationPreference()).not.toBe("on");
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  test("'Not now' is remembered", () => {
    fakePlugin();
    declineNotifications();
    expect(notificationPreference()).toBe("off");
  });

  test("turning reminders off cancels everything pending", async () => {
    const ln = fakePlugin({ display: "granted" });
    await enableNotifications();
    await disableNotifications();
    expect(notificationPreference()).toBe("off");
    expect(ln.cancelled).toEqual(expect.arrayContaining([1001, 1002, 2001, 2002, 2003, 3001, 3002]));
  });

  test("revoking permission in OS settings cancels pending reminders on resume", async () => {
    const ln = fakePlugin({ display: "granted" });
    installNotifications();
    await enableNotifications();
    ln.display = "denied";
    ln.cancelled = [];
    enterBackground(0);
    enterForeground(1000);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(ln.cancelled).toEqual(expect.arrayContaining([2001, 3001]));
  });
});
