/*
 * The request deadline. CapacitorHttp ignores axios's timeout on native POSTs,
 * so without this a request cut off by backgrounding hung for minutes.
 */
import { AxiosError } from "axios";
import { withDeadline } from "./api";

const never = () => new Promise(() => {});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a request that never answers fails after its timeout", async () => {
  const config = { timeout: 3000 };
  const pending = withDeadline(never)(config);
  jest.advanceTimersByTime(3000);
  await expect(pending).rejects.toMatchObject({ code: AxiosError.ECONNABORTED, config });
});

test("the adapter sees an abort signal that fires at the deadline", async () => {
  let seen = null;
  const adapter = (config) => {
    seen = config.signal;
    return new Promise((resolve, reject) => config.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  };
  const pending = withDeadline(adapter)({ timeout: 1000 });
  await Promise.resolve();
  expect(seen.aborted).toBe(false);
  jest.advanceTimersByTime(1000);
  await expect(pending).rejects.toMatchObject({ code: AxiosError.ECONNABORTED });
  expect(seen.aborted).toBe(true);
});

test("a retry of a timed-out config starts with a live signal", async () => {
  const config = { timeout: 1000 };
  const first = withDeadline(never)(config);
  jest.advanceTimersByTime(1000);
  await expect(first).rejects.toBeTruthy();
  expect(config.signal).toBeUndefined();

  const ok = withDeadline((c) => {
    expect(c.signal.aborted).toBe(false);
    return Promise.resolve({ status: 200 });
  })(config);
  await expect(ok).resolves.toEqual({ status: 200 });
});

test("fast responses pass straight through and clear the timer", async () => {
  const pending = withDeadline(() => Promise.resolve({ status: 200, data: 1 }))({ timeout: 1000 });
  await expect(pending).resolves.toEqual({ status: 200, data: 1 });
  expect(jest.getTimerCount()).toBe(0);
});

test("a server error is not reported as a timeout", async () => {
  const err = new AxiosError("bad", "ERR_BAD_RESPONSE");
  const pending = withDeadline(() => Promise.reject(err))({ timeout: 1000 });
  await expect(pending).rejects.toBe(err);
});

describe("errorMessage", () => {
  const { errorMessage } = jest.requireActual("./api");
  const { AxiosError } = jest.requireActual("axios");

  test("a request that got no answer is a signal problem", () => {
    expect(errorMessage(new AxiosError("Network Error", "ERR_NETWORK"))).toMatch(/Can't reach the server/);
  });

  test("a failure that never hit the network gets the fallback, not a signal warning", () => {
    expect(errorMessage(new Error("plugin said no"), "Google sign-in didn't go through.")).toBe(
      "Google sign-in didn't go through."
    );
  });

  test("the server's own message wins", () => {
    expect(errorMessage({ response: { data: { detail: "That handle's taken." } } })).toBe("That handle's taken.");
  });
});
