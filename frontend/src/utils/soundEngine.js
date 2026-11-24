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
// Bus levels. The notes themselves are written quietly so chords and loops can
// stack; these lift the sum to a normal phone level (about -20 dBFS RMS for
// music, peaks near -6 for effects), measured with renderOffline. The limiter
// on the master output catches anything that would clip.
const MUSIC_LEVEL = 3.5;
const SFX_LEVEL = 3;
const FADE_IN_S = 1.2;
const FADE_OUT_S = 0.35;
const IDLE_SUSPEND_MS = 3000; // let the audio hardware sleep when nothing's playing

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
  ramp(sfxBus.gain, s.sfx ? SFX_LEVEL : 0);
}

/** The bus chain on any context (the live one, or an offline one for measuring). */
function buildGraph(ac) {
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(ac.destination);

  const out = ac.createGain();
  out.connect(limiter);

  const soften = ac.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 3200;
  soften.connect(out);

  const music = ac.createGain();
  music.connect(soften);
  const effects = ac.createGain();
  effects.connect(out);

  // One second of white noise, shared by every hi-hat and snare.
  const noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { master: out, musicBus: music, sfxBus: effects, noiseBuffer: noiseBuf };
}

function build() {
  const AudioCtx = audioClass();
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  ({ master, musicBus, sfxBus, noiseBuffer } = buildGraph(ctx));
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
 * Browsers only allow sound after the player touches the screen, and iOS can
 * refuse a resume() that doesn't come from a touch (after the app was in the
 * background, a call, or an ad). So:
 *  - the first tap or key press anywhere creates and unlocks the context;
 *  - after that, every tap resumes a paused context right inside the gesture
 *    (the one place iOS always allows it), so the tap that opens a game or
 *    unmutes is the one that wakes the audio. With nothing to play it goes
 *    back to sleep a few seconds later (idleSoon).
 */
const GESTURES = ["pointerdown", "touchend", "keydown"];
let unlockInstalled = false;
let unlocked = false;
export function installAudioUnlock() {
  if (unlockInstalled || typeof document === "undefined") return;
  unlockInstalled = true;
  const onGesture = () => {
    if (!unlocked) {
      if (!getContext()) return;
      unlocked = true;
      syncScheduler();
      if (!timer) idleSoon();
      return;
    }
    if (holds.size === 0 && ctx && ctx.state !== "running" && ctx.state !== "closed") {
      ctx.resume().catch(() => {});
      if (!timer) idleSoon();
    }
  };
  GESTURES.forEach((e) => document.addEventListener(e, onGesture, true));
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

/*
 * With no music scheduled (muted, music off, or a screen without a loop) and
 * no effect for a few seconds, suspend the context so the phone's audio
 * output can power down. The next sound wakes it (getContext).
 */
let idleTimer = null;
function idleSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!timer && ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  }, IDLE_SUSPEND_MS);
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

function envelope(ac, dest, t, { gain, attack = 0.01, dur }) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  g.connect(dest);
  return g;
}

function osc(ac, dest, t, freq, dur, { type = "sine", gain = 0.1, attack = 0.01, detune = 0 } = {}) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.connect(envelope(ac, dest, t, { gain, attack, dur }));
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noise(ac, buf, dest, t, dur, { gain = 0.05, type = "highpass", freq = 7000 } = {}) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  src.connect(filter);
  filter.connect(envelope(ac, dest, t, { gain, attack: 0.002, dur }));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/** The instruments, playing into `dest` on context `ac`. */
function voices(ac, buf, dest) {
  const tone = (t, freq, dur, opts) => osc(ac, dest, t, freq, dur, opts);
  return {
    tone,
    pluck: (t, n, dur, gain = 0.05, type = "triangle") => {
      tone(t, midi(n), dur, { type, gain });
      // Phone speakers can't play much below ~200 Hz: give low notes an
      // octave-up overtone so the bass line is still heard.
      if (n < 55) tone(t, midi(n + 12), dur, { type: "triangle", gain });
    },
    marimba: (t, n, gain = 0.05) => {
      tone(t, midi(n), 0.35, { gain, attack: 0.004 });
      tone(t, midi(n) * 4, 0.08, { gain: gain * 0.18, attack: 0.002 });
    },
    bell: (t, n, gain = 0.03) => {
      tone(t, midi(n), 1.2, { gain, attack: 0.005 });
      tone(t, midi(n) * 2.76, 0.5, { gain: gain * 0.3, attack: 0.005 });
    },
    pad: (t, notes, dur, gain = 0.025) =>
      notes.forEach((n) => {
        tone(t, midi(n), dur, { type: "triangle", gain, attack: dur * 0.35, detune: -5 });
        tone(t, midi(n), dur, { type: "sine", gain, attack: dur * 0.35, detune: 5 });
      }),
    kick: (t, gain = 0.16) => {
      noise(ac, buf, dest, t, 0.018, { gain: gain * 0.6, type: "bandpass", freq: 2200 }); // the click a phone can play
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(envelope(ac, dest, t, { gain, attack: 0.003, dur: 0.18 }));
      o.start(t);
      o.stop(t + 0.25);
    },
    hat: (t, gain = 0.025) => noise(ac, buf, dest, t, 0.04, { gain }),
    snare: (t, gain = 0.06) => {
      noise(ac, buf, dest, t, 0.13, { gain, type: "bandpass", freq: 1800 });
      tone(t, 190, 0.08, { type: "triangle", gain: gain * 0.6, attack: 0.002 });
    },
    tick: (t, freq, gain = 0.014) => tone(t, freq, 0.025, { gain, attack: 0.001 }),
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
      if ((bits >> pos) & 1) v.pluck(t, scale[(step * 5 + bar * 3) % scale.length], 0.06, 0.05, "square");
      if (step % 16 === 0) v.pluck(t, 45, 0.15, 0.07, "sine");
      if (step % 4 === 2) v.hat(t, 0.02);
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
      v.pluck(t, riff[step % 8] + shift, sd * 0.7, 0.05, "square");
      v.hat(t, step % 2 ? 0.015 : 0.025);
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
  const v = voices(ctx, noiseBuffer, trackGain);
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
    clearTimeout(idleTimer);
    getContext(); // wake it if it was idling
    timer = setInterval(schedule, TICK_MS);
  } else if (!wanted && timer) {
    clearInterval(timer);
    timer = null;
    idleSoon();
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
    play(voices(ctx, noiseBuffer, sfxBus), audio.currentTime);
  } catch (e) {
    // no sound is better than a crash
  }
  if (!timer) idleSoon();
}

const step2 = (n) => Math.pow(2, (Math.min(Math.max(n, 1) - 1, 7) * 2) / 12); // a whole tone per step, up to 8

/** Every sound effect, as (instruments, time, argument) => notes. */
export const EFFECTS = {
  // Tile tap or key press: a short, quiet click.
  tap: (v, t) => v.tone(t, 880, 0.035, { gain: 0.12, attack: 0.002 }),
  flip: (v, t) => v.tone(t, 320, 0.08, { type: "triangle", gain: 0.1 }),
  pop: (v, t) => v.tone(t, 660, 0.09, { type: "square", gain: 0.09 }),
  // Match chime; climbs with the cascade level.
  match: (v, t, cascade = 1) => {
    const base = 440 * step2(cascade);
    v.tone(t, base, 0.12, { type: "triangle", gain: 0.13 });
    v.tone(t + 0.05, base * 1.5, 0.12, { type: "triangle", gain: 0.09 });
  },
  invalid: (v, t) => v.tone(t, 180, 0.13, { type: "triangle", gain: 0.1 }),
  // Correct answer; each step of a combo or streak lifts the pitch a tone.
  correct: (v, t, combo = 1) => {
    v.tone(t, 523 * step2(combo), 0.1, { gain: 0.13 });
    v.tone(t + 0.08, 784 * step2(combo), 0.14, { gain: 0.13 });
  },
  // Wrong answer: a soft, low buzz rather than a harsh one.
  wrong: (v, t) => {
    v.tone(t, 233, 0.2, { type: "triangle", gain: 0.16 });
    v.tone(t, 240, 0.2, { type: "square", gain: 0.05 });
  },
  hint: (v, t) => {
    v.bell(t, 81, 0.06);
    v.bell(t + 0.09, 86, 0.05);
  },
  // Timer warning, once a second for the last 10; sharper in the last 3.
  tick: (v, t, secondsLeft = 10) =>
    secondsLeft <= 3
      ? v.tone(t, 1900, 0.045, { gain: 0.16, attack: 0.001 })
      : v.tone(t, 1500, 0.04, { gain: 0.11, attack: 0.001 }),
  victory: (v, t) => [523, 659, 784, 1046].forEach((f, i) => v.tone(t + i * 0.09, f, 0.2, { gain: 0.13 })),
  // Level up: a short fanfare ending on a held chord.
  levelUp: (v, t) => {
    [523, 659, 784].forEach((f, i) => v.tone(t + i * 0.1, f, 0.16, { type: "triangle", gain: 0.12 }));
    [1046, 1318, 1568].forEach((f) => v.tone(t + 0.32, f, 0.6, { gain: 0.07 }));
  },
  defeat: (v, t) => [392, 349, 293].forEach((f, i) => v.tone(t + i * 0.12, f, 0.25, { type: "triangle", gain: 0.1 })),
};

const effect = (name, arg) => sfx((v, t) => EFFECTS[name](v, t, arg));

export const playTap = () => effect("tap");
export const playFlip = () => effect("flip");
export const playPop = () => effect("pop");
export const playMatch = (cascadeLevel = 1) => effect("match", cascadeLevel);
export const playInvalid = () => effect("invalid");
export const playCorrect = (combo = 1) => effect("correct", combo);
export const playWrong = () => effect("wrong");
export const playHint = () => effect("hint");
export const playTick = (secondsLeft = 10) => effect("tick", secondsLeft);
export const playVictory = () => effect("victory");
export const playLevelUp = () => effect("levelUp");
export const playDefeat = () => effect("defeat");

/**
 * Render a loop or an effect offline, through the same buses and levels as the
 * app, and return the samples. Used to measure loudness (dev handle below).
 */
export async function renderOffline({ track, effect: name, seconds = 4, settings = getAudioSettings() }) {
  const Offline = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!Offline) return null;
  const rate = 44100;
  const ac = new Offline(1, Math.ceil(rate * seconds), rate);
  const g = buildGraph(ac);
  g.master.gain.value = settings.muted ? 0 : settings.volume * settings.volume;
  g.musicBus.gain.value = settings.music ? MUSIC_LEVEL : 0;
  g.sfxBus.gain.value = settings.sfx ? SFX_LEVEL : 0;
  if (track) {
    const def = TRACKS[track];
    const v = voices(ac, g.noiseBuffer, g.musicBus);
    const sd = 60 / def.bpm / def.spb;
    for (let i = 0, t = 0.05; t < seconds - 0.1; i++, t += sd) def.play(i, t, sd, v);
  }
  if (name) EFFECTS[name](voices(ac, g.noiseBuffer, g.sfxBus), 0.05);
  const buffer = await ac.startRendering();
  return buffer.getChannelData(0);
}

/**
 * A short phrase of music, so switching Music on (in Profile, where no loop
 * plays) is heard straight away. Ignored while a game's loop is playing.
 */
export function previewMusic() {
  const s = getAudioSettings();
  if (trackId || !s.music || s.muted || holds.size > 0) return;
  const audio = getContext();
  if (!audio) return;
  const fade = audio.createGain();
  fade.connect(musicBus);
  const def = TRACKS.cipher;
  const sd = 60 / def.bpm / def.spb;
  const v = voices(audio, noiseBuffer, fade);
  for (let i = 0; i < 8; i++) def.play(i, audio.currentTime + 0.05 + i * sd, sd, v);
  setTimeout(() => fade.disconnect(), 8 * sd * 1000 + 1500);
  idleSoon();
}

// Development builds only: a handle for checking the engine from the console.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__cipherAudio = {
    state: () => ({ context: ctx?.state || "none", track: trackId, intensity, scheduling: Boolean(timer), step }),
    // Loudness in dBFS: peak, RMS, and RMS above ~300 Hz (what a phone speaker can play).
    measure: async (opts) => {
      const x = await renderOffline(opts);
      if (!x) return null;
      const db = (v) => Math.round(20 * Math.log10(Math.max(v, 1e-9)) * 10) / 10;
      const a = Math.exp((-2 * Math.PI * 300) / 44100);
      let peak = 0;
      let sum = 0;
      let hpSum = 0;
      let y1 = 0;
      let x1 = 0;
      let y2 = 0;
      let x2 = 0;
      for (let i = 0; i < x.length; i++) {
        const s = x[i];
        peak = Math.max(peak, Math.abs(s));
        sum += s * s;
        // two one-pole high-passes in series (12 dB/octave below 300 Hz)
        const h1 = a * (y1 + s - x1);
        x1 = s;
        y1 = h1;
        const h2 = a * (y2 + h1 - x2);
        x2 = h1;
        y2 = h2;
        hpSum += h2 * h2;
      }
      return { peak: db(peak), rms: db(Math.sqrt(sum / x.length)), speakerRms: db(Math.sqrt(hpSum / x.length)) };
    },
  };
}

// Tests only.
export function _resetSoundEngineForTests() {
  if (timer) clearInterval(timer);
  timer = null;
  clearTimeout(idleTimer);
  idleTimer = null;
  unlocked = false;
  ctx = null;
  master = musicBus = sfxBus = noiseBuffer = null;
  trackId = null;
  trackGain = null;
  step = 0;
  nextNoteTime = 0;
  intensity = 1;
  holds.clear();
}
