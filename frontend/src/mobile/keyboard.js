/*
 * Software keyboard handling for phones.
 *
 * iOS Safari doesn't shrink the layout when the keyboard opens - only the
 * visual viewport shrinks - so inputs near the bottom end up behind it.
 * Android Chrome (with interactive-widget=resizes-content) does resize, but
 * may still leave the focused field under the fold.
 *
 * This module:
 *  - publishes the keyboard height as --kb and the visible height as --vvh
 *    (CSS uses them for padding and landscape stage heights), and toggles
 *    html.kb-open;
 *  - when any text field gains focus, waits for the keyboard to settle and
 *    scrolls the field's form (input + its submit button) into the visible area;
 *  - primeKeyboard(): iOS only opens the keyboard for focus() called inside a
 *    user gesture. Buttons that lead to an input appearing after a network
 *    call ("Start", "Next") call this synchronously in their tap handler; it
 *    focuses a hidden proxy input so the keyboard is already up, and focus is
 *    handed to the real input when it mounts.
 */

const KEYBOARD_THRESHOLD = 80; // px - smaller changes are toolbars, not keyboards

export function keyboardInset(innerHeight, viewportHeight, viewportOffsetTop) {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

/** Does an element with this bounding rect need scrolling to be fully visible? */
export function needsReveal(rect, visibleHeight, margin = 12) {
  return rect.top < margin || rect.bottom > visibleHeight - margin;
}

function isTextField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color", "hidden"].includes(el.type);
}

let proxy = null;

function getProxy() {
  if (proxy) return proxy;
  proxy = document.createElement("input");
  proxy.type = "text";
  proxy.setAttribute("aria-hidden", "true");
  proxy.tabIndex = -1;
  proxy.autocomplete = "off";
  proxy.setAttribute("autocapitalize", "characters");
  // Must be focusable and editable (readonly fields don't raise the keyboard),
  // 16px so iOS doesn't zoom, and parked where it can't be seen or scrolled to.
  Object.assign(proxy.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    fontSize: "16px",
    border: "0",
    padding: "0",
    pointerEvents: "none",
  });
  proxy.className = "keyboard-proxy";
  document.body.appendChild(proxy);
  return proxy;
}

/** Call synchronously inside a tap handler that will reveal a text input. */
export function primeKeyboard() {
  if (typeof document === "undefined") return;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (!coarse) return; // desktop: real inputs autofocus fine
  try {
    getProxy().focus({ preventScroll: true });
  } catch (e) {
    // ignore
  }
}

/** Hand focus from the proxy (or wherever) to a freshly mounted input. */
export function claimFocus(input) {
  if (!input) return;
  input.focus({ preventScroll: true });
  revealSoon(input);
}

function revealTarget(el) {
  return el.closest("form, .answer-section") || el;
}

let revealTimer = null;

function reveal(el) {
  if (!el || !document.contains(el) || el === proxy) return;
  const vv = window.visualViewport;
  const visible = vv ? vv.height : window.innerHeight;
  const target = revealTarget(el);
  if (needsReveal(target.getBoundingClientRect(), visible) || needsReveal(el.getBoundingClientRect(), visible)) {
    target.scrollIntoView({ block: "end", inline: "nearest", behavior: "smooth" });
    // If the form is taller than the visible area, at least keep the field itself in view.
    setTimeout(() => {
      if (needsReveal(el.getBoundingClientRect(), vv ? vv.height : window.innerHeight)) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 320);
  }
}

function revealSoon(el) {
  clearTimeout(revealTimer);
  // Keyboards animate in over ~250-350ms; reveal after they've settled.
  revealTimer = setTimeout(() => reveal(el), 350);
}

let installed = false;

export function installKeyboardManager() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const root = document.documentElement;
  const vv = window.visualViewport;

  const update = () => {
    const height = vv ? vv.height : window.innerHeight;
    const inset = vv ? keyboardInset(window.innerHeight, vv.height, vv.offsetTop) : 0;
    root.style.setProperty("--kb", `${inset}px`);
    root.style.setProperty("--vvh", `${Math.round(height)}px`);
    const focusedField = isTextField(document.activeElement) && document.activeElement !== proxy;
    root.classList.toggle("kb-open", inset > KEYBOARD_THRESHOLD || (focusedField && window.innerHeight < window.screen.height * 0.6));
    if (focusedField) revealSoon(document.activeElement);
  };

  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", (e) => {
    if (isTextField(e.target) && e.target !== proxy) revealSoon(e.target);
    update();
  });
  document.addEventListener("focusout", () => setTimeout(update, 50));
  update();
}
