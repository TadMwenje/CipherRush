/*
 * Release guard for the native apps: refuse to bundle a build whose API is
 * plain HTTP or localhost. On a phone, localhost is the phone itself, and iOS
 * blocks plain HTTP outright, so such a build can't sign in or load anything.
 *
 * Reads REACT_APP_BACKEND_URL the way CRA does for `yarn build`: the shell
 * first, then .env.production.local, .env.local, .env.production, .env.
 *
 * Simulator/emulator testing against a dev server: ALLOW_DEV_BACKEND=1.
 */
const fs = require("fs");
const path = require("path");

const KEY = "REACT_APP_BACKEND_URL";
const root = path.join(__dirname, "..");

function fromFile(name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${KEY}=`));
  return line === undefined ? undefined : line.slice(line.indexOf("=") + 1).trim();
}

function resolveBackendUrl() {
  if (process.env[KEY] !== undefined) return { value: process.env[KEY], source: "shell" };
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const value = fromFile(name);
    if (value !== undefined) return { value, source: name };
  }
  return { value: "", source: "nowhere" };
}

function problem(url) {
  if (!url) return "it isn't set";
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return "it isn't a valid URL";
  }
  if (parsed.protocol !== "https:") return "it isn't HTTPS";
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) return "it points at localhost";
  if (parsed.pathname !== "/" || url.endsWith("/")) return "it should be the bare origin, e.g. https://api.example.com (no path or trailing slash)";
  return null;
}

module.exports = { problem, resolveBackendUrl };

if (require.main === module) {
  const { value, source } = resolveBackendUrl();
  const why = problem(value);
  if (!why) {
    console.log(`API: ${value} (from ${source})`);
  } else if (process.env.ALLOW_DEV_BACKEND === "1") {
    console.warn(`warning: ${KEY}=${value || "(empty)"} - ${why}. Dev build only; don't ship this.`);
  } else {
    console.error(
      `\n${KEY}=${value || "(empty)"} (from ${source}): ${why}.\n` +
        "Set the production API in frontend/.env.production, for example\n" +
        `  ${KEY}=https://api.example.com\n` +
        "For a simulator build against your dev server, run with ALLOW_DEV_BACKEND=1.\n"
    );
    process.exit(1);
  }
}
