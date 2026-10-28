import axios, { AxiosError } from "axios";
import { isOnline, whenOnline } from "./mobile/network";
import { onAppResume } from "./mobile/lifecycle";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const CSRF_HEADERS = { "X-Requested-With": "CipherRush" };
export const SESSION_EXPIRED_EVENT = "cipherrush:session-expired";
export const NETWORK_EVENT = "cipherrush:network";

export const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 4;
const OFFLINE_WAIT_MS = 20000;
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];
// Access tokens last 15 minutes. Back from a longer break, refresh once up
// front so the first screen's requests don't each bounce off a 401 first.
const RESUME_REFRESH_AFTER_MS = 10 * 60 * 1000;

/**
 * Enforces the request timeout by aborting. In the native app CapacitorHttp
 * sends POSTs through the OS HTTP stack and ignores axios's `timeout` (iOS
 * then waits up to 10 minutes), so a request cut off by backgrounding the app
 * used to hang with the screen's buttons disabled. Every transport honours an
 * abort signal, so this works the same in the browser and the native shells.
 */
export function withDeadline(adapter) {
  return function deadlineAdapter(config) {
    const ms = config.timeout || REQUEST_TIMEOUT_MS;
    if (config.__callerSignal === undefined) config.__callerSignal = config.signal || null;
    const caller = config.__callerSignal;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    if (caller?.aborted) controller.abort();
    else caller?.addEventListener?.("abort", onCallerAbort, { once: true });

    config.signal = controller.signal;

    // Settle at the deadline even if the transport ignores the abort.
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        caller?.removeEventListener?.("abort", onCallerAbort);
        // A retry of this config must not start with an already-aborted signal.
        config.signal = caller || undefined;
        fn(value);
      };
      const timer = setTimeout(() => {
        settle(reject, new AxiosError(`timeout of ${ms}ms exceeded`, AxiosError.ECONNABORTED, config));
        controller.abort();
      }, ms);
      Promise.resolve()
        .then(() => adapter(config))
        .then(
          (response) => settle(resolve, response),
          (error) => settle(reject, error)
        );
    });
  };
}

const deadlineAdapter = withDeadline(axios.getAdapter(axios.defaults.adapter));

// Session auth rides on httpOnly cookies the browser attaches automatically;
// the custom header is the CSRF guard the backend requires on every POST.
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: CSRF_HEADERS,
  timeout: REQUEST_TIMEOUT_MS,
  adapter: deadlineAdapter,
});

function requestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function announce(state) {
  window.dispatchEvent(new CustomEvent(NETWORK_EVENT, { detail: state }));
}

// One refresh at a time: a phone waking up fires several requests at once,
// and they should all wait on the same refresh rather than racing.
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, null, {
        withCredentials: true,
        headers: CSRF_HEADERS,
        timeout: REQUEST_TIMEOUT_MS,
        adapter: deadlineAdapter,
      })
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

// Every game action carries an id, so a retry after a dropped connection is
// recognised by the server and never applied twice. Requests made while a
// refresh is running wait for it instead of collecting a 401 first.
api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (method === "post" && /^\/(games|daily)\//.test(config.url || "") && !config.headers["X-Request-Id"]) {
    config.headers["X-Request-Id"] = requestId();
  }
  if (refreshing && !NO_REFRESH.includes(config.url || "")) {
    await refreshing.catch(() => {});
  }
  return config;
});

function isRetryable(config) {
  const method = (config.method || "get").toLowerCase();
  return method === "get" || Boolean(config.headers?.["X-Request-Id"]);
}

api.interceptors.response.use(
  (response) => {
    announce("ok");
    return response;
  },
  async (error) => {
    const config = error.config;
    if (!config || axios.isCancel(error)) return Promise.reject(error);

    // No response at all: dropped connection, network switch, tunnel, lift.
    if (!error.response && isRetryable(config) && (config.__retries || 0) < MAX_RETRIES) {
      config.__retries = (config.__retries || 0) + 1;
      announce("retrying");
      // Wait for the signal to come back, but not forever: the screen behind
      // this request needs an answer so it can offer a retry.
      if (!(await whenOnline(OFFLINE_WAIT_MS))) {
        announce("failed");
        return Promise.reject(error);
      }
      await sleep(400 * 2 ** (config.__retries - 1));
      return api(config);
    }

    const url = config.url || "";
    if (error.response?.status === 401 && !config.__refreshed && !NO_REFRESH.includes(url)) {
      config.__refreshed = true;
      try {
        await refreshSession();
        return api(config);
      } catch (refreshError) {
        // Only a 401 from /auth/refresh means signed out. A dropped connection
        // on the refresh used to sign players out after every flaky resume.
        if (refreshError.response?.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        return Promise.reject(error);
      }
    }

    announce(error.response ? "ok" : "failed");
    return Promise.reject(error);
  }
);

onAppResume(({ awayMs }) => {
  if (awayMs < RESUME_REFRESH_AFTER_MS || !isOnline()) return;
  refreshSession().catch((err) => {
    // 401 here means the session really is over; no response just means the
    // signal isn't back yet, and the normal 401 path will retry later.
    if (err.response?.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  });
});

export function errorMessage(err, fallback = "That didn't go through. Try again.") {
  // Only a request that got no answer is a signal problem; anything else that
  // failed before reaching us (a native sign-in plugin, say) gets the fallback.
  if (!err?.response) return axios.isAxiosError(err) ? "Can't reach the server. Check your signal." : fallback;
  const detail = err.response.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default api;
