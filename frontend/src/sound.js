// Sound effects and music live in utils/soundEngine.js (Web Audio synthesis,
// no audio files). This module keeps the older import path working.
export {
  playTap,
  playFlip,
  playPop,
  playMatch,
  playInvalid,
  playCorrect,
  playWrong,
  playHint,
  playTick,
  playVictory,
  playLevelUp,
  playDefeat,
  suspendAudio,
} from "./utils/soundEngine";
