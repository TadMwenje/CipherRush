import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const CSRF_HEADERS = { "X-Requested-With": "CipherRush" };
export const SESSION_EXPIRED_EVENT = "cipherrush:session-expired";
export const NETWORK_EVENT = "cipherrush:network";

// Session auth rides on httpOnly cookies the browser attaches automatically;
// the custom header is the CSRF guard the backend requires on every POST.
const api = axios.create({ baseURL: API_BASE, withCredentials: true, headers: CSRF_HEADERS, timeout: 15000 });

const MAX_RETRIES = 4;
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

function requestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForOnline() {
  if (navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

function announce(state) {
  window.dispatchEvent(new CustomEvent(NETWORK_EVENT, { detail: state }));
}

// Every game action carries an id, so a retry after a dropped connection is
// recognised by the server and never applied twice.
api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (method === "post" && /^\/(games|daily)\//.test(config.url || "") && !config.headers["X-Request-Id"]) {
    config.headers["X-Request-Id"] = requestId();
  }
  return config;
});

// One refresh at a time: a phone waking up fires several requests at once,
// and they should all wait on the same refresh rather than racing.
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/auth/refresh`, null, { withCredentials: true, headers: CSRF_HEADERS, timeout: 15000 })
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

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
    if (!config) return Promise.reject(error);

    // No response at all: dropped connection, network switch, tunnel, lift.
    if (!error.response && isRetryable(config) && (config.__retries || 0) < MAX_RETRIES) {
      config.__retries = (config.__retries || 0) + 1;
      announce("retrying");
      await waitForOnline();
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
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        return Promise.reject(error);
      }
    }

    if (!error.response) announce("failed");
    return Promise.reject(error);
  }
);

export function errorMessage(err, fallback = "That didn't go through. Try again.") {
  if (!err?.response) return "Can't reach the server. Check your signal.";
  const detail = err.response.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default api;
