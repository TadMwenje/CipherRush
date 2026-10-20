/*
 * Static guards for the mobile layout contract. These read the shipped CSS and
 * HTML, so a refactor that quietly shrinks a touch target or drops safe-area
 * handling fails CI instead of failing on someone's phone.
 */
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "App.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "public", "manifest.json"), "utf8"));
const mobileLayer = css.slice(css.indexOf("MOBILE-FIRST LAYER"));

function blockFor(selectorList) {
  const start = mobileLayer.indexOf(selectorList);
  expect(start).toBeGreaterThan(-1);
  return mobileLayer.slice(start, mobileLayer.indexOf("}", start));
}

test("touch target size is at least 48dp", () => {
  const tap = /--tap:\s*(\d+)px/.exec(mobileLayer);
  expect(Number(tap[1])).toBeGreaterThanOrEqual(48);
});

test.each([
  "back-btn", "rules-btn", "segmented-btn", "category-btn", "hint-btn", "submit-btn", "next-btn",
  "restart-btn", "btn-primary", "option-btn", "binary-choice", "byte-chip", "nav-btn", "game-mode-btn", "daily-card",
])("%s is covered by a 48dp minimum", (cls) => {
  const rule = new RegExp(`\\.${cls}[^{]*\\{[^}]*min-(height|width):\\s*var\\(--tap\\)`, "s");
  const groupRule = new RegExp(`\\.${cls},[\\s\\S]*?\\{[^}]*min-height:\\s*var\\(--tap\\)`);
  expect(rule.test(mobileLayer) || groupRule.test(mobileLayer)).toBe(true);
});

test("Match-3 board can't shrink below 48dp tiles (6 tiles + 5 gaps + padding)", () => {
  const block = blockFor(".match3-board {\n  width:");
  const minWidth = Number(/min-width:\s*(\d+)px/.exec(block)[1]);
  expect(minWidth).toBeGreaterThanOrEqual(6 * 48 + 5 * 4 + 2 * 6);
});

test("hover effects are scoped to real pointers", () => {
  const outsideMedia = css.split("@media (hover: hover) and (pointer: fine)")[0];
  expect(outsideMedia).not.toMatch(/:hover\s*\{/);
});

test("there is a landscape layout for phones", () => {
  expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 540px\)/);
});

test("safe areas are respected", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    expect(mobileLayer).toContain(`env(safe-area-inset-${side}`);
  }
  expect(html).toMatch(/viewport-fit=cover/);
  expect(html).toMatch(/interactive-widget=resizes-content/);
});

test("inputs are at least 16px so iOS doesn't zoom on focus", () => {
  expect(blockFor("input,\nselect,\ntextarea {")).toMatch(/font-size:\s*16px/);
});

test("manifest allows both orientations", () => {
  expect(manifest.orientation).toBe("any");
  expect(manifest.display).toBe("standalone");
});

function withoutLandscapeBlocks(text) {
  // Strip "@media (orientation: landscape) ..." blocks (the nav is a side rail there).
  let out = "";
  let i = 0;
  const marker = "@media (orientation: landscape)";
  while (i < text.length) {
    const start = text.indexOf(marker, i);
    if (start === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    let depth = 0;
    let j = text.indexOf("{", start);
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      if (text[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

test("pages always reserve room for the fixed bottom nav", () => {
  const portrait = withoutLandscapeBlocks(css);
  const rules = [...portrait.matchAll(/([^{}]*\.page-screen[^{}]*)\{([^}]*)\}/g)];
  const paddings = rules.map((m) => /padding-bottom:\s*([^;]+);/.exec(m[2])).filter(Boolean);
  expect(paddings.length).toBeGreaterThan(0);
  // The last declaration wins - it must account for the nav.
  expect(paddings[paddings.length - 1][1]).toContain("--nav-height");
});
