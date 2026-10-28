import { PASTE_TARGETS, SHARE_URL, shareText, shareUrl } from "./share";

const details = { badge: "Cipher Master", rank: 4 };

test("each target carries the badge and, when known, the rank", () => {
  for (const target of ["linkedin", "whatsapp", "facebook", "email"]) {
    expect(shareText(target, details)).toContain("Cipher Master");
    expect(shareText(target, details)).toContain("#4");
    expect(shareText(target, { badge: "Cipher Master" })).not.toMatch(/rank/i);
  }
});

test("share links put the text where each service reads it", () => {
  const wa = decodeURIComponent(shareUrl("whatsapp", details).split("text=")[1]);
  expect(wa).toContain("Cipher Master");
  expect(wa).toContain(SHARE_URL);

  const mail = shareUrl("email", details);
  expect(mail.startsWith("mailto:?subject=CipherRush%20Achievement&body=")).toBe(true);
  expect(decodeURIComponent(mail)).toContain("Check out my latest badge earned on CipherRush: Cipher Master.");

  expect(shareUrl("linkedin", details)).toBe(
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SHARE_URL)}`,
  );
  expect(shareUrl("facebook", details)).toContain("sharer.php?u=");
  // These two drop prefilled text, so the dialog copies it first.
  expect([...PASTE_TARGETS].sort()).toEqual(["facebook", "linkedin"]);
});

test("copy is plain: no emoji or hashtags", () => {
  for (const target of ["linkedin", "whatsapp", "email"]) {
    expect(shareText(target, details)).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]|#[a-z]/iu);
  }
});
