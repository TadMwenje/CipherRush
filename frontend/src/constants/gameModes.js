import { Rotor, Bolt, BinaryGlyph, Speech, TrueFalse, Grid, Cards, Calendar } from "../glyphs";

// Single source of truth for the playable modes - consumed by the Dashboard,
// Profile history and the How to Play sheet. Written player-to-player: say
// what you do and how you score, nothing else.
export const GAME_MODES = [
  {
    key: "cipher",
    path: "/game/cipher",
    label: "Cipher Puzzles",
    Icon: Rotor,
    css: "cipher",
    tagline: "Caesar, Atbash, Vigenère. Crack all three.",
    rules: [
      "Caesar shifts every letter the same amount. Atbash flips the alphabet. Vigenère uses a keyword, so each letter can shift differently.",
      "One answer per puzzle. Faster solves pay more, and Vigenère pays 1.5x.",
      "Drag the cipher wheel to test shifts. Extra hints exist, but each one costs 20% of the base score.",
    ],
  },
  {
    key: "rush",
    path: "/game/rush",
    label: "Speed Cipher Rush",
    Icon: Bolt,
    css: "rush",
    tagline: "90 seconds. Short words. Stack the combo.",
    rules: [
      "Every word comes with its key - ROT-something or Atbash. Decode as many as you can in 90 seconds.",
      "Solve in a row to build a combo. It climbs fast at first, then levels off at 2.5x.",
      "A miss or a skip resets the combo. Words get longer the further you go.",
    ],
  },
  {
    key: "binhex",
    path: "/game/binhex",
    label: "Binary / Hex",
    Icon: BinaryGlyph,
    css: "binhex",
    tagline: "Bytes in, words out.",
    rules: [
      "Each word is written as ASCII bytes - binary, hex, decimal, or the way they show up in URLs and source code.",
      "Byte to number, number to letter. 65 is A, 90 is Z.",
      "Tap any byte to see its maths. The ASCII table is one tap away. Higher levels drop the padding and add prefixes.",
    ],
  },
  {
    key: "quiz",
    path: "/game/quiz",
    label: "Security Quiz",
    Icon: Speech,
    css: "quiz",
    tagline: "Five questions from the real world.",
    rules: [
      "Pick a topic: phishing, social engineering, crypto, malware or incident response.",
      "Five questions a round. Get 3 right to clear it. Every answer comes with the why.",
      "Stuck? A hint rules out one wrong answer. Three a round are free; after that, a short video buys another.",
    ],
  },
  {
    key: "truefalse",
    path: "/game/truefalse",
    label: "True or False",
    Icon: TrueFalse,
    css: "truefalse",
    tagline: "Ten claims. Call the bluff.",
    rules: [
      "Ten statements, half true and half false. Swipe right or tap True; swipe left or tap False.",
      "Streaks pay a little extra. Get 7 right to clear the round.",
    ],
  },
  {
    key: "match3",
    path: "/game/match3",
    label: "Match-3",
    Icon: Grid,
    css: "match3",
    tagline: "Swipe tiles. Hit the target. Mind the moves.",
    rules: [
      "Swipe a tile into its neighbour (or tap one, then the other) to line up three or more.",
      "Chain reactions multiply your points. Hit the target before your moves run out. Leftover moves are bonus points.",
      "Go quiet for a few seconds and a hint lights up. A dead board reshuffles itself.",
    ],
  },
  {
    key: "memory",
    path: "/game/memory",
    label: "Memory Lock",
    Icon: Cards,
    css: "memory",
    tagline: "Flip, remember, match.",
    rules: [
      "Flip two cards. Match them and they stay up.",
      "No clock - but every miss costs points. Boards grow from 8 cards to 24.",
    ],
  },
];

export const DAILY_MODE = {
  key: "daily",
  path: "/game/daily",
  label: "Daily Cipher",
  Icon: Calendar,
  css: "daily",
  tagline: "One cipher. Everyone. Once a day.",
  rules: [
    "Same puzzle for every player, new one at midnight UTC. One attempt.",
    "Fastest solves top today's board. Solve on consecutive days to build a streak bonus.",
  ],
};

export function getGameMode(key) {
  if (key === DAILY_MODE.key) return DAILY_MODE;
  return GAME_MODES.find((mode) => mode.key === key);
}
