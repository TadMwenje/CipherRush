// Lightweight synthesized sound effects via the Web Audio API.
// No external audio assets required, and gracefully no-ops if audio is unavailable.

let ctx = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioCtx();
  }
  // iOS parks the context as "interrupted" after a call or app switch.
  if (ctx.state === "suspended" || ctx.state === "interrupted") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Release the audio hardware while the app is in the background. */
export function suspendAudio() {
  if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
}

function tone(freq, startOffset, duration, { type = "sine", gain = 0.15 } = {}) {
  const audioCtx = getContext();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const startTime = audioCtx.currentTime + startOffset;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playFlip() {
  tone(320, 0, 0.08, { type: "triangle", gain: 0.1 });
}

export function playPop() {
  tone(660, 0, 0.09, { type: "square", gain: 0.12 });
}

export function playMatch(cascadeLevel = 1) {
  const base = 440 + Math.min(cascadeLevel - 1, 6) * 60;
  tone(base, 0, 0.12, { type: "triangle", gain: 0.14 });
  tone(base * 1.5, 0.05, 0.12, { type: "triangle", gain: 0.1 });
}

export function playInvalid() {
  tone(180, 0, 0.15, { type: "sawtooth", gain: 0.12 });
}

export function playCorrect() {
  tone(523, 0, 0.1, { gain: 0.14 });
  tone(784, 0.08, 0.14, { gain: 0.14 });
}

export function playWrong() {
  tone(220, 0, 0.2, { type: "sawtooth", gain: 0.12 });
}

export function playVictory() {
  [523, 659, 784, 1046].forEach((freq, i) => tone(freq, i * 0.09, 0.2, { gain: 0.15 }));
}

export function playDefeat() {
  [392, 349, 293].forEach((freq, i) => tone(freq, i * 0.12, 0.25, { type: "sawtooth", gain: 0.1 }));
}
