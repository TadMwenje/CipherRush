/*
 * Interface language: the 8 supported languages, the player's choice (kept in
 * localStorage, defaulting to the phone's language when it's one of ours),
 * and lookups that fall back to English for anything not yet translated.
 *
 * Translated: menus, the home screen, game names, rules and walkthroughs,
 * profile, ranks and settings. Puzzles, quiz questions and true/false claims
 * come from the server in English and stay that way for now.
 */
import { useSyncExternalStore } from "react";
import EN from "./en";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";

// Names are written in their own language, as players look for them.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
];

export const LOCALES = { es, fr, de, pt, it, nl, pl };
const STORAGE_KEY = "cr_lang";
const supported = (code) => LANGUAGES.some((l) => l.code === code);

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (supported(saved)) return saved;
  } catch (e) {
    // storage unavailable: fall through to the phone's language
  }
  const phone = (typeof navigator !== "undefined" && (navigator.language || "")).slice(0, 2).toLowerCase();
  return supported(phone) ? phone : "en";
}

let current = initialLanguage();
const listeners = new Set();

function applyToDocument() {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}
applyToDocument();

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  if (!supported(code) || code === current) return;
  current = code;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    // not persisted, but still switched for this session
  }
  applyToDocument();
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current language code; re-renders the component when it changes. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

/** t("dash.level", { n: 3 }) in the current (or given) language, English as fallback. */
export function t(key, vars, lang = current) {
  const text = (lang !== "en" && LOCALES[lang]?.ui?.[key]) || EN[key] || key;
  return fill(text, vars);
}

/** A mode's label, tagline and rules in the current language. */
export function modeText(mode, lang = current) {
  const tr = lang !== "en" ? LOCALES[lang]?.modes?.[mode.key] : null;
  return {
    label: tr?.label || mode.label,
    tagline: tr?.tagline || mode.tagline,
    rules: tr?.rules?.length === mode.rules.length ? tr.rules : mode.rules,
  };
}

/** A walkthrough step's title, body and tip in the current language. */
export function stepText(step, lang = current) {
  const tr = lang !== "en" ? LOCALES[lang]?.steps?.[step.id] : null;
  return {
    title: tr?.title || step.title,
    body: tr?.body || step.body,
    tip: step.tip ? tr?.tip || step.tip : undefined,
  };
}

/** Hook form: components call useT() and get a t() that tracks the language. */
export function useT() {
  const lang = useLanguage();
  return (key, vars) => t(key, vars, lang);
}
