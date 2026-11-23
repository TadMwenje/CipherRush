// Cipher names and free hints in the app's language (Cipher Puzzles, Daily, home card).

/** "Caesar" is translated (César, Cezar...); Atbash and Vigenère are names everywhere. */
export function variantLabel(key, t) {
  return { caesar: t("var.caesar"), atbash: "Atbash", vigenere: "Vigenère" }[key] || key;
}

/** The free hint in the app's language; the server's English text is the fallback. */
export function freeHint(round, t) {
  if (!round) return "";
  if (round.variant === "caesar" || round.variant === "atbash") return t(`ci.free.${round.variant}`);
  const n = round.key_length;
  if (round.variant === "vigenere" && n) return t("ci.free.vigenere", { n, a: n + 1, b: 2 * n + 1 });
  return round.free_hint;
}
