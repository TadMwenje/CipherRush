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
// Exact words: no letter stretching, so "god" never catches "good".
const EXACT = new Set(blocklist.exact || []);
const TARGET = alternation(blocklist.targets);
const INSULT = alternation(blocklist.insults);
const HATE_PAIR = new RegExp(`(?:${TARGET}).{0,3}(?:${INSULT})|(?:${INSULT}).{0,3}(?:${TARGET})`);
// Longest first, so "grapefruit" is blanked before "grape" gets a chance.
const ALLOW = new RegExp([...new Set(blocklist.allow)].sort((a, b) => b.length - a.length).map(escape).join("|"), "g");

// Every one-swap typo of a term (adolf -> daolf, aodlf, adlof, adofl).
const swaps = (term) => {
  const out = new Set();
  for (let i = 0; i < term.length - 1; i++) {
    if (term[i] !== term[i + 1]) out.add(term.slice(0, i) + term[i + 1] + term[i] + term.slice(i + 2));
  }
  out.delete(term);
  return [...out];
};
// Swapped spellings of the worst names. Long ones match anywhere; short ones
// (adlof, osmaa) only a whole handle or part ("astan" is inside astana).
const ALLOWED_WORDS = new Set(blocklist.allow);
const ALL_SWAPS = (blocklist.transpose || []).flatMap(swaps).filter((s) => !ALLOWED_WORDS.has(s));
const SWAPS_SHORT = new Set(ALL_SWAPS.filter((s) => s.length < 6));
const SWAPS_LONG = ALL_SWAPS.filter((s) => s.length >= 6);
const SWAPPED = SWAPS_LONG.length ? new RegExp(alternation(SWAPS_LONG)) : null;

export const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isBlockedHandle(handle) {
  const lowered = handle.trim().toLowerCase();
  for (const reading of new Set([leet(lowered, "i"), leet(lowered, "l")])) {
    const parts = reading.split(/[_.-]+/).filter(Boolean);
    if ([...parts, parts.join("")].some((p) => WHOLE.test(p) || EXACT.has(p) || SWAPS_SHORT.has(p))) return true;
    const joined = parts.join("").replace(ALLOW, "#");
    if (ANYWHERE.test(joined) || HATE_PAIR.test(joined)) return true;
    if (SWAPPED && SWAPPED.test(joined)) return true;
  }
  return false;
}

/** The i18n key of what's wrong with a handle ("handle.shape" / "handle.taken"), or "". */
export function handleProblemKey(handle) {
  if (!HANDLE_PATTERN.test(handle.trim())) return "handle.shape";
  if (isBlockedHandle(handle)) return "handle.taken";
  return "";
}

const ENGLISH = {
  "handle.shape": "3-20 letters, numbers or underscores.",
  "handle.taken": "That username isn't available. Please choose another.",
};

/** The English message to show under the field, or "" when the handle looks fine. */
export function handleProblem(handle) {
  return ENGLISH[handleProblemKey(handle)] || "";
}
