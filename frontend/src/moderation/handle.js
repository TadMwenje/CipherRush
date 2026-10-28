/*
 * Handle checks for instant feedback, mirroring backend/moderation.py with
 * the same blocklist (handleBlocklist.json is a copy of
 * backend/content/handle_blocklist.json; tests/test_moderation.py keeps them
 * identical). The server always re-checks and has the final say.
 */
import blocklist from "./handleBlocklist.json";

const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g", $: "s", "@": "a" };
// Two readings of "1" (i and l), since both show up in bypasses: n1gger, a55ho1e.
const leet = (text, one) => [...text].map((ch) => (ch === "1" ? one : LEET[ch] || ch)).join("");

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Any letter may repeat: fuck -> f+u+c+k+ catches "fuuuck".
const stretchy = (term) => [...term].map((ch) => `${escape(ch)}+`).join("");
const alternation = (terms) =>
  [...new Set(terms)]
    .sort((a, b) => b.length - a.length)
    .map((t) => stretchy(leet(t, "i")))
    .join("|");

const ANYWHERE = new RegExp(alternation(blocklist.anywhere));
const WHOLE = new RegExp(`^(?:${alternation(blocklist.whole)})$`);
const TARGET = alternation(blocklist.targets);
const INSULT = alternation(blocklist.insults);
const HATE_PAIR = new RegExp(`(?:${TARGET}).{0,3}(?:${INSULT})|(?:${INSULT}).{0,3}(?:${TARGET})`);
const ALLOW = new RegExp(blocklist.allow.map(escape).join("|"), "g");

export const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isBlockedHandle(handle) {
  const lowered = handle.trim().toLowerCase();
  for (const reading of new Set([leet(lowered, "i"), leet(lowered, "l")])) {
    const parts = reading.split("_").filter(Boolean);
    if ([...parts, parts.join("")].some((p) => WHOLE.test(p))) return true;
    const joined = parts.join("").replace(ALLOW, "#");
    if (ANYWHERE.test(joined) || HATE_PAIR.test(joined)) return true;
  }
  return false;
}

/** The message to show under the field, or "" when the handle looks fine. */
export function handleProblem(handle) {
  if (!HANDLE_PATTERN.test(handle.trim())) return "3-20 letters, numbers or underscores.";
  if (isBlockedHandle(handle)) return "That handle isn't allowed. Pick another.";
  return "";
}
