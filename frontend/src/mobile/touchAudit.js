import { MIN_TAP } from "./layout";

/*
 * Dev-only runtime audit. In a dev build, open any screen at a phone size
 * (portrait or landscape) and run `window.__touchAudit()` in the console:
 * it lists every visible tap target smaller than 48dp and flags sideways
 * overflow, which is what breaks first on small phones.
 */
const INTERACTIVE = "button, a[href], input, select, textarea, [role=button], [role=tab], [role=slider]";

export function touchAudit({ min = MIN_TAP, slack = 1 } = {}) {
  const small = [];
  document.querySelectorAll(INTERACTIVE).forEach((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return;
    if (el.closest(".cipher-bg")) return;
    if (rect.width + slack < min || rect.height + slack < min) {
      small.push({
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  });
  // Covered targets: something else (e.g. the fixed bottom nav) sits on top of
  // the control's centre, so a tap there would hit the wrong thing. Checks the
  // whole page by scrolling each control into view first.
  const covered = [];
  const startY = window.scrollY;
  document.querySelectorAll(INTERACTIVE).forEach((el) => {
    if (el.closest(".cipher-bg, .bottom-nav") || el.disabled) return;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || el.getClientRects().length === 0) return;
    // Centre it if the page can scroll that far; otherwise it lands at max scroll - the real worst case.
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      covered.push({
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
        coveredBy: (hit.closest("nav, [class]")?.className || hit.tagName).toString().slice(0, 40),
      });
    }
  });
  window.scrollTo(0, startY);

  const root = document.scrollingElement || document.documentElement;
  return {
    coveredTargets: covered,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    orientation: window.innerWidth > window.innerHeight ? "landscape" : "portrait",
    horizontalOverflow: root.scrollWidth > window.innerWidth + 1,
    smallTargets: small,
  };
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__touchAudit = touchAudit;
}
