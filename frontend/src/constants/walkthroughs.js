// Step-by-step walkthroughs for the modes that need more than a rules list.
// Shown above the rules when a game's "?" is tapped. Each step can carry a
// worked example drawn as rows of tiles; walkthroughs.test.js checks every
// example really decodes the way it says.

const CAESAR = {
  id: "caesar",
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
  id: "atbash",
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
  id: "vigenere",
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
  id: "clock",
  title: "Beat the clock",
  body: "Type the plaintext and tap Crack it. Faster solves pay more. Point-cost hints take 20% each; a hint paid for with a short video costs nothing and pauses the clock.",
  tip: "Wrong guesses don't end the round. Keep trying until the clock runs out.",
};

export const WALKTHROUGHS = {
  cipher: [CAESAR, ATBASH, VIGENERE, CLOCK],
  daily: [
    {
      id: "daily_intro",
      title: "One cipher, everyone, once",
      body: "Every player gets the same puzzle, and a new one arrives at midnight UTC. It can be Caesar, Atbash or Vigenère. The free hint under the puzzle tells you which.",
    },
    CAESAR,
    ATBASH,
    VIGENERE,
    {
      id: "daily_check",
      title: "Check before you send",
      body: "You get one attempt. The fastest correct solves top today's board, and solving on consecutive days builds a streak bonus.",
      tip: "Read your answer back once. A typo costs the day.",
    },
  ],
  rush: [
    {
      id: "rush_key",
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
      id: "rush_combo",
      title: "Stack the combo",
      body: "Solve in a row to build a combo. It climbs fast at first, then levels off at 2.5x. A miss or a skip resets it.",
      tip: "Skipping a long word can be cheaper than fighting it, but the combo starts again.",
    },
    {
      id: "rush_grow",
      title: "Words grow as you go",
      body: "The first words are three or four letters. Keep solving and they get longer, so the clock matters more and more.",
      demo: {
        rows: [
          { label: "Early", cells: "KEY" },
          { label: "Later", cells: "SIGNAL", accent: true },
        ],
      },
      tip: "Ninety seconds goes quickly. Type first, check second.",
    },
  ],
  binhex: [
    {
      id: "binhex_bytes",
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
      id: "binhex_notations",
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
    {
      id: "binhex_tap",
      title: "Tap a byte for its maths",
      body: "Stuck on one byte? Tap it to see the working, and open the ASCII table any time. Decode every byte, then type the word.",
      demo: {
        rows: [
          { label: "Binary", cells: ["01000011", "01010010"] },
          { label: "Decimal", cells: ["67", "82"], dim: true },
          { label: "Plain", cells: "CR", accent: true },
        ],
        bytes: true,
      },
      tip: "Binary place values from the right: 1, 2, 4, 8, 16, 32, 64, 128. Add the ones that are switched on.",
    },
  ],
  quiz: [
    {
      id: "quiz_topic",
      title: "Pick a topic",
      body: "Spotting fakes, people skills, crypto, malware or incident response. Each round is five questions from that topic.",
      demo: { rows: [{ label: "Round", cells: ["1", "2", "3", "4", "5"] }] },
    },
    {
      id: "quiz_hint",
      title: "Rule one out",
      body: "Tap Hint to strike out a wrong answer. Three hints a round are free; after that a short video buys another.",
      demo: {
        rows: [
          { label: "Before", cells: ["A", "B", "C", "D"] },
          { label: "Hint", cells: ["A", "✕", "C", "D"], dim: true },
        ],
      },
      tip: "A hint never removes the right answer, so it always helps.",
    },
    {
      id: "quiz_why",
      title: "Learn the why",
      body: "Get 3 of 5 right to clear the round. Every answer comes with a short explanation, right or wrong.",
      demo: { rows: [{ label: "Score", cells: ["✓", "✓", "✕", "✓", "✓"], accent: true }] },
    },
  ],
  truefalse: [
    {
      id: "tf_read",
      title: "Read the claim",
      body: "Ten short statements about staying safe online. About half are true and half are false.",
    },
    {
      id: "tf_swipe",
      title: "Swipe or tap",
      body: "Swipe right or tap True if it's right. Swipe left or tap False if it isn't.",
      demo: { rows: [{ label: "Swipe", cells: ["← F", "T →"], accent: true }], bytes: true },
    },
    {
      id: "tf_streak",
      title: "Keep the streak",
      body: "Get 7 of 10 right to clear the round. Correct answers in a row pay a little extra.",
      demo: { rows: [{ label: "Streak", cells: ["✓", "✓", "✓", "✓"], accent: true }] },
      tip: "Read every word. One \"always\" or \"never\" can flip a claim.",
    },
  ],
  match3: [
    {
      id: "m3_swap",
      title: "Swap two neighbours",
      body: "Swipe a tile into the one next to it, or tap one and then the other. Line up three or more of the same to clear them.",
      demo: {
        rows: [
          { label: "Before", cells: ["◆", "◆", "●", "◆"] },
          { label: "After", cells: ["◆", "◆", "◆", "●"], accent: true },
        ],
      },
    },
    {
      id: "m3_chain",
      title: "Set up chains",
      body: "Cleared tiles drop and new ones fall in. When the fall makes another match, it's a chain, and chains multiply your points.",
      tip: "Matches near the bottom shake up more of the board.",
    },
    {
      id: "m3_moves",
      title: "Mind the moves",
      body: "Reach the target score before your moves run out. Leftover moves turn into bonus points. Pause and a hint lights up.",
      demo: { rows: [{ label: "Moves", cells: ["3", "2", "1"], dim: true }] },
    },
  ],
  memory: [
    {
      id: "mem_flip",
      title: "Flip two cards",
      body: "Tap a card to flip it, then tap another. If they match, both stay face up.",
      demo: { rows: [{ label: "Flip", cells: ["?", "◆", "?", "◆"], accent: true }] },
    },
    {
      id: "mem_remember",
      title: "Remember where things are",
      body: "Cards that don't match flip back. Remember what you saw: every miss costs points.",
      tip: "Work through the board in a pattern, row by row, so it's easier to remember.",
    },
    {
      id: "mem_grow",
      title: "Boards grow",
      body: "There's no clock. Boards start at 8 cards and grow to 24 as your level goes up.",
      demo: { rows: [{ label: "Cards", cells: ["8", "12", "16", "24"], dim: true }] },
    },
  ],
};
