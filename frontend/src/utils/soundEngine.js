/*
 * CipherRush sound engine: background music and sound effects, all
 * synthesised with the Web Audio API. No audio files, so nothing extra to
 * download and nothing added to startup.
 *
 *   oscillators ─┐
 *                ├─ track fade ─ music bus ─ soft low-pass ─┐
 *   noise hits ──┘                                          ├─ master ─ speakers
 *   sound effects ─────────────── sfx bus ──────────────────┘
 *
 * The master gain follows the player's volume and mute (utils/audioSettings),
 * and everything plays on the normal media output, so the phone's volume
 * buttons work as usual on top of that.
 *
 * Music is a tiny step sequencer: every 25 ms it schedules the notes due in
 * the next 120 ms on the audio clock, so timing stays tight even if the UI
 * thread stutters. Each mode has its own loop (TRACKS below).
 *
 * The audio context is paused while anything holds it (the app is in the
 * background, a video ad is playing) and resumes when the last hold lifts.
 */
import { getAudioSettings, subscribeAudioSettings } from "./audioSettings";

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const MUSIC_LEVEL = 0.5; // music sits under the effects
const FADE_IN_S = 1.2;
const FADE_OUT_S = 0.35;

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let noiseBuffer = null;

const holds = new Set();

// ---------------------------------------------------------------------------
// Context and buses
// ---------------------------------------------------------------------------

function audioClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function applyLevels(now = ctx?.currentTime || 0) {
  if (!ctx) return;
  const s = getAudioSettings();
  // Squared, so the slider feels even to the ear.
  const ramp = (param, value) => {
    param.cancelScheduledValues?.(now);
    param.setTargetAtTime(value, now, 0.03);
  };
  ramp(master.gain, s.muted ? 0 : s.volume * s.volume);
  ramp(musicBus.gain, s.music ? MUSIC_LEVEL : 0);
  ramp(sfxBus.gain, s.sfx ? 1 : 0);
}

function build() {
  const AudioCtx = audioClass();
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.connect(ctx.destination);

  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 3200;
  soften.connect(master);

  musicBus = ctx.createGain();
  musicBus.connect(soften);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);

  // One second of white noise, shared by every hi-hat and snare.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  applyLevels(0);
  return ctx;
}

/** The running audio context, created on first use. Null where there's no Web Audio. */
function getContext() {
  if (!ctx || ctx.state === "closed") {
    if (!build()) return null;
  }
  // iOS parks the context as "interrupted" after a call or app switch.
  if (holds.size === 0 && (ctx.state === "suspended" || ctx.state === "interrupted")) {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

subscribeAudioSettings(() => {
  applyLevels();
  syncScheduler();
});

/**
 * Browsers only allow sound after the player touches the screen. The first
 * tap or key press anywhere unlocks audio, and any music that was asked for
 * starts then.
 */
let unlockInstalled = false;
export function installAudioUnlock() {
  if (unlockInstalled || typeof document === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    getContext();
    if (ctx && ctx.state === "running") {
      ["pointerdown", "touchend", "keydown"].forEach((e) => document.removeEventListener(e, unlock, true));
    }
    syncScheduler();
  };
  ["pointerdown", "touchend", "keydown"].forEach((e) => document.addEventListener(e, unlock, true));
}

/** Pause all audio for a reason ("background", "ad"). Resumes when every reason is lifted. */
export function pauseAudio(reason = "manual") {
  holds.add(reason);
  if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
}

export function resumeAudio(reason = "manual") {
  holds.delete(reason);
  if (holds.size > 0 || !ctx || ctx.state === "closed") return;
  if (ctx.state !== "running") {
    ctx
      .resume()
      .then(() => {
        nextNoteTime = 0; // don't replay what was missed while paused
      })
      .catch(() => {});
  }
}

export function isAudioHeld() {
  return holds.size > 0;
}

/** Older name, kept for callers that only know about backgrounding. */
export function suspendAudio() {
  pauseAudio("background");
}

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function envelope(dest, t, { gain, attack = 0.01, dur }) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  g.connect(dest);
  return g;
}

function osc(dest, t, freq, dur, { type = "sine", gain = 0.1, attack = 0.01, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.connect(envelope(dest, t, { gain, attack, dur }));
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noise(dest, t, dur, { gain = 0.05, type = "highpass", freq = 7000 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  src.connect(filter);
  filter.connect(envelope(dest, t, { gain, attack: 0.002, dur }));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function voices(dest) {
  return {
    pluck: (t, n, dur, gain = 0.05, type = "triangle") => osc(dest, t, midi(n), dur, { type, gain }),
    marimba: (t, n, gain = 0.05) => {
      osc(dest, t, midi(n), 0.35, { gain, attack: 0.004 });
      osc(dest, t, midi(n) * 4, 0.08, { gain: gain * 0.18, attack: 0.002 });
    },
    bell: (t, n, gain = 0.03) => {
      osc(dest, t, midi(n), 1.2, { gain, attack: 0.005 });
      osc(dest, t, midi(n) * 2.76, 0.5, { gain: gain * 0.3, attack: 0.005 });
    },
    pad: (t, notes, dur, gain = 0.025) =>
      notes.forEach((n) => {
        osc(dest, t, midi(n), dur, { type: "triangle", gain, attack: dur * 0.35, detune: -5 });
        osc(dest, t, midi(n), dur, { type: "sine", gain, attack: dur * 0.35, detune: 5 });
      }),
    kick: (t, gain = 0.16) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(envelope(dest, t, { gain, attack: 0.003, dur: 0.18 }));
      o.start(t);
      o.stop(t + 0.25);
    },
    hat: (t, gain = 0.025) => noise(dest, t, 0.04, { gain }),
    snare: (t, gain = 0.06) => {
      noise(dest, t, 0.13, { gain, type: "bandpass", freq: 1800 });
      osc(dest, t, 190, 0.08, { type: "triangle", gain: gain * 0.6, attack: 0.002 });
    },
    tick: (t, freq, gain = 0.014) => osc(dest, t, freq, 0.025, { gain, attack: 0.001 }),
  };
}

// ---------------------------------------------------------------------------
// Music: one loop per mode
// ---------------------------------------------------------------------------

/*
 * Each track: bpm, steps per beat (spb), and play(step, time, stepSeconds, v)
 * which schedules the notes for one step. Four beats to a bar.
 */
export const TRACKS = {
  // Calm arpeggio over Am-F-C-G with a quiet tick-tock clock.
  cipher: {
    bpm: 84,
    spb: 2,
    play(step, t, sd, v) {
      const chords = [
        [69, 72, 76],
        [65, 69, 72],
        [60, 64, 67],
        [67, 71, 74],
      ];
      const bar = Math.floor(step / 8) % 4;
      const order = [0, 1, 2, 1, 0, 2, 1, 2];
      v.pluck(t, chords[bar][order[step % 8]], sd * 1.8, 0.045);
      v.tick(t, step % 2 ? 1700 : 2100);
      if (step % 8 === 0) v.pluck(t, chords[bar][0] - 24, sd * 8, 0.05, "sine");
    },
  },

  // Driving 126 BPM pulse in E minor; speeds up for the last 15 seconds.
  rush: {
    bpm: 126,
    spb: 4,
    play(step, t, sd, v) {
      const roots = [40, 36, 43, 38];
      const root = roots[Math.floor(step / 16) % 4];
      if (step % 4 === 0) v.kick(t, 0.14);
      if (step % 4 === 2) v.hat(t, 0.025);
      if (step % 2 === 0) v.pluck(t, root + (step % 4 === 2 ? 12 : 0), sd * 1.6, 0.045, "square");
      if (step % 16 === 14) v.pluck(t, root + 31, sd * 2, 0.025, "square");
    },
  },

  // Sparse digital bleeps from a rotating bit pattern.
  binhex: {
    bpm: 112,
    spb: 4,
    play(step, t, sd, v) {
      const bits = 0b1011001110001101;
      const bar = Math.floor(step / 16);
      const pos = (step + bar * 3) % 16;
      const scale = [72, 74, 76, 79, 81, 84];
      if ((bits >> pos) & 1) v.pluck(t, scale[(step * 5 + bar * 3) % scale.length], 0.05, 0.022, "square");
      if (step % 16 === 0) v.pluck(t, 45, 0.15, 0.07, "sine");
      if (step % 4 === 2) v.hat(t, 0.012);
    },
  },

  // Warm pad, one chord every two bars, with the odd soft bell.
  quiz: {
    bpm: 66,
    spb: 1,
    play(step, t, sd, v) {
      const chords = [
        [48, 55, 64, 71],
        [45, 52, 60, 67],
        [41, 48, 57, 64],
        [43, 50, 59, 64],
      ];
      const chord = chords[Math.floor(step / 8) % 4];
      if (step % 8 === 0) v.pad(t, chord, sd * 8, 0.02);
      if (step % 8 === 6) v.bell(t, chord[3] + 12, 0.018);
    },
  },

  // Game-show tension: staccato D minor ostinato and a ticking hat.
  truefalse: {
    bpm: 116,
    spb: 2,
    play(step, t, sd, v) {
      const shift = [0, 0, -2, -4][Math.floor(step / 8) % 4];
      const riff = [50, 50, 62, 50, 50, 62, 50, 53];
      v.pluck(t, riff[step % 8] + shift, sd * 0.7, 0.04, "square");
      v.hat(t, step % 2 ? 0.01 : 0.018);
      if (step % 32 === 30) [62, 65, 69].forEach((n) => v.pluck(t, n + shift, sd * 1.5, 0.025));
    },
  },

  // Playful marimba melody in C major pentatonic (Match-3, Memory Lock).
  playful: {
    bpm: 100,
    spb: 2,
    play(step, t, sd, v) {
      const melody = [72, 76, 79, 76, 74, 72, 69, 72, 74, 76, 79, 81, 79, 76, 74, null];
      const bass = [48, 45, 41, 43];
      const n = melody[step % 16];
      if (n) v.marimba(t, n, 0.045);
      if (step % 4 === 0) v.marimba(t, bass[Math.floor(step / 8) % 4], 0.06);
    },
  },

  // Energetic duel beat for Versus.
  versus: {
    bpm: 132,
    spb: 4,
    play(step, t, sd, v) {
      const root = [45, 41, 43, 40][Math.floor(step / 16) % 4];
      if (step % 4 === 0) v.kick(t, 0.15);
      if (step % 8 === 4) v.snare(t, 0.05);
      if (step % 2 === 1) v.hat(t, 0.015);
      v.pluck(t, root + (step % 4 === 3 ? 12 : 0), sd * 0.9, 0.035, "sawtooth");
      if (step % 16 === 0 || step % 16 === 6 || step % 16 === 12) v.pluck(t, root + 24, sd * 1.2, 0.025, "square");
    },
  },
};

const MODE_TRACK = {
  cipher: "cipher",
  daily: "cipher",
  rush: "rush",
  binhex: "binhex",
  quiz: "quiz",
  truefalse: "truefalse",
  match3: "playful",
  memory: "playful",
  versus: "versus",
  battle: "versus",
};

/** Which loop a game mode plays, or null for screens without music. */
export function trackForMode(mode) {
  return MODE_TRACK[mode] || null;
}

let trackId = null;
let trackGain = null;
let step = 0;
let nextNoteTime = 0;
let intensity = 1;
let timer = null;

export function currentTrack() {
  return trackId;
}

export function musicIntensity() {
  return intensity;
}

/** Tempo multiplier, 1 to 1.3 (Rush's last 15 seconds). */
export function setMusicIntensity(value) {
  intensity = Math.min(1.3, Math.max(1, Number(value) || 1));
}

// The fade node a loop plays through, so it can fade in and out on its own.
function fadeIn() {
  trackGain = ctx.createGain();
  trackGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_IN_S);
  trackGain.connect(musicBus);
}

function schedule() {
  if (!ctx || ctx.state !== "running" || !trackId) return;
  // A loop asked for before the first tap had no context yet.
  if (!trackGain) fadeIn();
  const track = TRACKS[trackId];
  const stepSeconds = 60 / (track.bpm * intensity) / track.spb;
  const now = ctx.currentTime;
  // Just started, or back from a pause: begin a moment from now.
  if (nextNoteTime < now - 0.05) nextNoteTime = now + 0.05;
  const v = voices(trackGain);
  while (nextNoteTime < now + LOOKAHEAD_S) {
    try {
      track.play(step, nextNoteTime, stepSeconds, v);
    } catch (e) {
      // a bad note mustn't stop the loop
    }
    nextNoteTime += stepSeconds;
    step += 1;
  }
}

// Run the scheduler only while it can make sound: a track is chosen, music is
// on and not muted. Otherwise no timer at all, so silence costs nothing.
function syncScheduler() {
  const s = getAudioSettings();
  const wanted = Boolean(trackId) && s.music && !s.muted && Boolean(audioClass());
  if (wanted && !timer) {
    timer = setInterval(schedule, TICK_MS);
  } else if (!wanted && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Start the loop for a mode (no-op if it's already playing). */
export function startMusic(mode) {
  const id = trackForMode(mode);
  if (id === trackId) return;
  stopMusic();
  if (!id) return;
  trackId = id;
  step = 0;
  nextNoteTime = 0;
  intensity = 1;
  if (ctx) fadeIn();
  syncScheduler();
}

/** Fade the current loop out and stop scheduling. */
export function stopMusic() {
  if (trackGain && ctx) {
    const g = trackGain;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues?.(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_S);
    setTimeout(() => g.disconnect(), FADE_OUT_S * 1000 + 100);
  }
  trackGain = null;
  trackId = null;
  intensity = 1;
  syncScheduler();
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

function sfx(play) {
  const s = getAudioSettings();
  if (!s.sfx || s.muted || holds.size > 0) return;
  const audio = getContext();
  if (!audio || audio.state === "closed") return;
  try {
    play(voices(sfxBus), audio.currentTime);
  } catch (e) {
    // no sound is better than a crash
  }
}

function tone(v, t, freq, dur, opts) {
  osc(sfxBus, t, freq, dur, opts);
}

/** Tile tap or key press: a short, quiet click. */
export function playTap() {
  sfx((v, t) => tone(v, t, 880, 0.03, { gain: 0.045, attack: 0.002 }));
}

export function playFlip() {
  sfx((v, t) => tone(v, t, 320, 0.08, { type: "triangle", gain: 0.1 }));
}

export function playPop() {
  sfx((v, t) => tone(v, t, 660, 0.09, { type: "square", gain: 0.09 }));
}

/** Match chime; climbs with the cascade level. */
export function playMatch(cascadeLevel = 1) {
  const base = 440 * Math.pow(2, (Math.min(Math.max(cascadeLevel, 1) - 1, 7) * 2) / 12);
  sfx((v, t) => {
    tone(v, t, base, 0.12, { type: "triangle", gain: 0.13 });
    tone(v, t + 0.05, base * 1.5, 0.12, { type: "triangle", gain: 0.09 });
  });
}

export function playInvalid() {
  sfx((v, t) => tone(v, t, 180, 0.13, { type: "triangle", gain: 0.1 }));
}

/** Correct answer; each step of a combo or streak lifts the pitch a tone (up to 8). */
export function playCorrect(combo = 1) {
  const lift = Math.pow(2, (Math.min(Math.max(combo, 1) - 1, 7) * 2) / 12);
  sfx((v, t) => {
    tone(v, t, 523 * lift, 0.1, { gain: 0.13 });
    tone(v, t + 0.08, 784 * lift, 0.14, { gain: 0.13 });
  });
}

/** Wrong answer: a soft, low buzz rather than a harsh one. */
export function playWrong() {
  sfx((v, t) => {
    tone(v, t, 165, 0.2, { type: "triangle", gain: 0.11 });
    tone(v, t, 170, 0.2, { type: "square", gain: 0.025 });
  });
}

/** A hint unlocked. */
export function playHint() {
  sfx((v, t) => {
    v.bell(t, 81, 0.06);
    v.bell(t + 0.09, 86, 0.05);
  });
}

/** Timer warning, once a second for the last 10; sharper in the last 3. */
export function playTick(secondsLeft = 10) {
  const urgent = secondsLeft <= 3;
  sfx((v, t) => tone(v, t, urgent ? 1900 : 1500, 0.035, { gain: urgent ? 0.07 : 0.045, attack: 0.001 }));
}

export function playVictory() {
  sfx((v, t) => [523, 659, 784, 1046].forEach((f, i) => tone(v, t + i * 0.09, f, 0.2, { gain: 0.13 })));
}

/** Level up: a short fanfare ending on a held chord. */
export function playLevelUp() {
  sfx((v, t) => {
    [523, 659, 784].forEach((f, i) => tone(v, t + i * 0.1, f, 0.16, { type: "triangle", gain: 0.12 }));
    [1046, 1318, 1568].forEach((f) => tone(v, t + 0.32, f, 0.6, { gain: 0.07 }));
  });
}

export function playDefeat() {
  sfx((v, t) => [392, 349, 293].forEach((f, i) => tone(v, t + i * 0.12, f, 0.25, { type: "triangle", gain: 0.1 })));
}

// Development builds only: a handle for checking the engine from the console.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__cipherAudio = {
    state: () => ({ context: ctx?.state || "none", track: trackId, intensity, scheduling: Boolean(timer), step }),
  };
}

// Tests only.
export function _resetSoundEngineForTests() {
  if (timer) clearInterval(timer);
  timer = null;
  ctx = null;
  master = musicBus = sfxBus = noiseBuffer = null;
  trackId = null;
  trackGain = null;
  step = 0;
  nextNoteTime = 0;
  intensity = 1;
  holds.clear();
}
