import { DAILY_MODE, getGameMode } from "../constants/gameModes";
import { modeText, useLanguage } from "../i18n";

/** A mode's display name ("Vrai ou faux") in the app's language. */
export function modeLabel(key, lang) {
  const mode = key === DAILY_MODE.key ? DAILY_MODE : getGameMode(key);
  return mode ? modeText(mode, lang).label : key;
}

export default function useModeLabel(key) {
  return modeLabel(key, useLanguage());
}
