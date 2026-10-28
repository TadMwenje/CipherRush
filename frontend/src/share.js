/*
 * Badge sharing. Each target gets plain, casual copy. LinkedIn and Facebook
 * ignore any text passed in their share URLs (they only take a link), so for
 * those the text goes to the clipboard first and the player pastes it.
 */
import { openExternal } from "./legal";

// The page shared links point at. Swap for the Play / App Store listing once live.
export const SHARE_URL = "https://aximoix.com";

const rankLine = (rank) => (rank ? ` Leaderboard rank: #${rank}.` : "");

export function shareText(target, { badge, rank }) {
  switch (target) {
    case "linkedin":
      return `Just earned the ${badge} badge on CipherRush. Keeping the cryptography skills sharp.${rankLine(rank)}`;
    case "email":
      return `Check out my latest badge earned on CipherRush: ${badge}.${rankLine(rank)}\n\n${SHARE_URL}`;
    default:
      return `Unlocked the ${badge} badge on CipherRush.${rankLine(rank)} Think you can beat my score?`;
  }
}

export function shareUrl(target, details) {
  const enc = encodeURIComponent;
  switch (target) {
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(SHARE_URL)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL)}`;
    case "whatsapp":
      return `https://wa.me/?text=${enc(`${shareText("whatsapp", details)} ${SHARE_URL}`)}`;
    case "email":
      return `mailto:?subject=${enc("CipherRush Achievement")}&body=${enc(shareText("email", details))}`;
    default:
      return null;
  }
}

/** Targets whose share page drops our text, so we copy it for the player. */
export const PASTE_TARGETS = new Set(["linkedin", "facebook"]);

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function openShare(target, details) {
  const url = shareUrl(target, details);
  if (!url) return;
  // mailto: hands off to the mail app; the in-app browser can't open it.
  if (url.startsWith("mailto:")) window.location.href = url;
  else openExternal(url);
}
