import { handleProblem, isBlockedHandle } from "./handle";

// Same cases as tests/test_moderation.py, so the app and the server agree.
const BLOCKED = [
  "white_pig", "blackpig", "Wh1te_P1g", "pig_white", "black__monkey", "asian_ape", "jew_rat", "gay_scum",
  "fuuuuck_you", "n1gg3r", "niiigger", "sp1c", "coon", "paki_99", "h1tl3r", "whitepower", "the_1488",
  "kill_all_jews", "a55ho1e", "admin", "CipherRush_dev",
];
const ALLOWED = [
  "tadiwa_mwenje", "grapefruit", "therapist_tom", "spicy_cipher", "raccoon", "crisis_ops", "torpedo",
  "black_cat", "white_hat", "red_team", "snow_white", "coonhound_fan", "pakistan_fan", "jewel",
  "homeland", "scunthorpe", "blackhat_42", "shiitake", "assassin",
];

test.each(BLOCKED)("refuses %s", (handle) => {
  expect(isBlockedHandle(handle)).toBe(true);
  expect(handleProblem(handle)).toMatch(/isn't allowed/);
});

test.each(ALLOWED)("allows %s", (handle) => {
  expect(isBlockedHandle(handle)).toBe(false);
  expect(handleProblem(handle)).toBe("");
});

test("shape is checked before content", () => {
  expect(handleProblem("ab")).toMatch(/3-20/);
  expect(handleProblem("has space")).toMatch(/3-20/);
});
