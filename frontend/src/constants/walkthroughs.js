// Step-by-step walkthroughs for the modes that need more than a rules list.
// Shown above the rules when a game's "?" is tapped. Each step can carry a
// worked example drawn as rows of tiles; walkthroughs.test.js checks every
// example really decodes the way it says.

const CAESAR = {
  title: "Caesar: one shift for every letter",
  body: "Every letter moved the same number of places. Find the shift and undo it. Drag the cipher wheel until a short word turns into a real one.",
  demo: {
    rows: [
      { label: "Cipher", cells: "KHOOR" },
      { label: "Shift", cells: "−3 −3 −3 −3 −3".split(" "), dim: true },
      { label: "Plain", cells: "HELLO", accent: true },
    ],
  },
  tip: "One-letter words are almost always A or I. That gives you the shift straight away.",
};

const ATBASH = {
  title: "Atbash: the mirror alphabet",
  body: "A swaps with Z, B with Y, C with X, and so on. No key to find. Decoding is the same move as encoding.",
  demo: {
    rows: [
      { label: "Cipher", cells: "SVOOL" },
      { label: "Mirror", cells: "S↔H V↔E O↔L O↔L L↔O".split(" "), dim: true },
      { label: "Plain", cells: "HELLO", accent: true },
    ],
  },
  tip: "If the shift on the wheel never makes sense, it's probably Atbash.",
};

const VIGENERE = {
  title: "Vigenère: a keyword sets the shifts",
  body: "Write the keyword under the message, repeating it. Each key letter is a shift: A is 0, B is 1, up to Z at 25. Undo each one.",
  demo: {
    rows: [
      { label: "Cipher", cells: "KXRKGI" },
      { label: "Key", cells: "KEYKEY", dim: true },
      { label: "Plain", cells: "ATTACK", accent: true },
    ],
    key: "KEY",
  },
  tip: "The same letter can decode differently each time. Hints give away the key's first letter, then the whole key.",
};

const CLOCK = {
  title: "Beat the clock",
  body: "Type the plaintext and tap Crack it. Faster solves pay more. Point-cost hints take 20% each; a hint paid for with a short video costs nothing and pauses the clock.",
  tip: "Wrong guesses don't end the round. Keep trying until the clock runs out.",
};

export const WALKTHROUGHS = {
  cipher: [CAESAR, ATBASH, VIGENERE, CLOCK],
  daily: [
    {
      title: "One cipher, everyone, once",
      body: "Every player gets the same puzzle, and a new one arrives at midnight UTC. It can be Caesar, Atbash or Vigenère. The free hint under the puzzle tells you which.",
    },
    CAESAR,
    ATBASH,
    VIGENERE,
    {
      title: "Check before you send",
      body: "You get one attempt. The fastest correct solves top today's board, and solving on consecutive days builds a streak bonus.",
      tip: "Read your answer back once. A typo costs the day.",
    },
  ],
  rush: [
    {
      title: "The key comes with the word",
      body: "Every word shows its key: ROT-something or Atbash. Undo it and type the word.",
      demo: {
        rows: [
          { label: "Cipher", cells: "URYYB" },
          { label: "ROT-13", cells: "−13 −13 −13 −13 −13".split(" "), dim: true },
          { label: "Plain", cells: "HELLO", accent: true },
        ],
      },
      tip: "ROT-13 undoes itself: shifting 13 forward or back gives the same letter.",
    },
    {
      title: "Stack the combo",
      body: "Solve in a row to build a combo. It climbs fast at first, then levels off at 2.5x. A miss or a skip resets it.",
      tip: "Skipping a long word can be cheaper than fighting it, but the combo starts again.",
    },
  ],
  binhex: [
    {
      title: "Bytes are letters",
      body: "Each byte is one ASCII character. Turn it into a number, then the number into a letter: 65 is A, 90 is Z.",
      demo: {
        rows: [
          { label: "Hex", cells: ["0x48", "0x49"] },
          { label: "Decimal", cells: ["72", "73"], dim: true },
          { label: "Plain", cells: "HI", accent: true },
        ],
        bytes: true,
      },
      tip: "In hex, 0x41 to 0x5A are A to Z. The second digit counts along from A (1) once you know the first.",
    },
    {
      title: "Same bytes, other notations",
      body: "Higher levels write bytes the way they appear in the wild: padded binary, 0x, \\x in source code and %-encoding in URLs. Tap any byte to see its maths.",
      demo: {
        rows: [
          { label: "Binary", cells: ["01001000", "01001001"] },
          { label: "URL", cells: ["%48", "%49"], dim: true },
          { label: "Plain", cells: "HI", accent: true },
        ],
        bytes: true,
      },
    },
  ],
};
