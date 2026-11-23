import {
  DEFAULT_AUDIO,
  _reloadAudioSettingsForTests,
  clampVolume,
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
  toggleMuted,
} from "./audioSettings";
import {
  TRACKS,
  _resetSoundEngineForTests,
  currentTrack,
  isAudioHeld,
  musicIntensity,
  pauseAudio,
  playCorrect,
  playTap,
  resumeAudio,
  setMusicIntensity,
  startMusic,
  stopMusic,
  trackForMode,
} from "./soundEngine";

// A stand-in for the Web Audio API that counts what gets made.
const param = () => ({
  value: 1,
  setValueAtTime: jest.fn(),
  linearRampToValueAtTime: jest.fn(),
  exponentialRampToValueAtTime: jest.fn(),
  setTargetAtTime: jest.fn(),
  cancelScheduledValues: jest.fn(),
});
const node = () => ({ connect: jest.fn(), disconnect: jest.fn(), gain: param() });
let made;
let lastCtx;
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = {};
    this.suspend = jest.fn(() => {
      this.state = "suspended";
      return Promise.resolve();
    });
    this.resume = jest.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });
    lastCtx = this;
  }
  createGain() {
    return node();
  }
  createDynamicsCompressor() {
    return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
  }
  createBiquadFilter() {
    return { ...node(), type: "", frequency: param() };
  }
  createOscillator() {
    made.oscillators += 1;
    return { ...node(), type: "", frequency: param(), detune: param(), start: jest.fn(), stop: jest.fn() };
  }
  createBufferSource() {
    made.noise += 1;
    return { ...node(), buffer: null, start: jest.fn(), stop: jest.fn() };
  }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

beforeEach(() => {
  localStorage.clear();
  _reloadAudioSettingsForTests();
  _resetSoundEngineForTests();
  made = { oscillators: 0, noise: 0 };
  window.AudioContext = FakeAudioContext;
});

afterEach(() => {
  jest.useRealTimers();
  delete window.AudioContext;
});

describe("audio settings", () => {
  test("start from the defaults", () => {
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO);
  });

  test("mute and unmute are saved and survive a restart", () => {
    toggleMuted();
    expect(getAudioSettings().muted).toBe(true);
    expect(JSON.parse(localStorage.getItem("cr_audio")).muted).toBe(true);
    _reloadAudioSettingsForTests();
    expect(getAudioSettings().muted).toBe(true);
    toggleMuted();
    _reloadAudioSettingsForTests();
    expect(getAudioSettings().muted).toBe(false);
  });

  test("music, effects and volume are saved together", () => {
    setAudioSettings({ music: false, sfx: false, volume: 0.35 });
    _reloadAudioSettingsForTests();
    expect(getAudioSettings()).toEqual({ music: false, sfx: false, volume: 0.35, muted: false });
  });

  test("volume is clamped to 0..1 and junk falls back to the default", () => {
    expect(clampVolume(1.7)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume("0.456")).toBe(0.46);
    expect(clampVolume("loud")).toBe(DEFAULT_AUDIO.volume);
    setAudioSettings({ volume: 4 });
    expect(getAudioSettings().volume).toBe(1);
  });

  test("a corrupt saved value falls back to the defaults", () => {
    localStorage.setItem("cr_audio", "{not json");
    _reloadAudioSettingsForTests();
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO);
  });

  test("the earlier sound-effects switch carries over", () => {
    localStorage.setItem("cr_sound", "off");
    _reloadAudioSettingsForTests();
    expect(getAudioSettings().sfx).toBe(false);
    expect(getAudioSettings().music).toBe(true);
  });

  test("listeners hear real changes only, so Profile and the game stay in sync", () => {
    const heard = jest.fn();
    const stop = subscribeAudioSettings(heard);
    setAudioSettings({ volume: 0.5 });
    setAudioSettings({ volume: 0.5 });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    setAudioSettings({ volume: 0.6 });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("tracks", () => {
  test("each mode has its own loop; Match-3 and Memory share the playful one", () => {
    const modes = ["cipher", "rush", "binhex", "quiz", "truefalse", "match3", "versus"];
    const tracks = modes.map(trackForMode);
    expect(new Set(tracks).size).toBe(modes.length);
    expect(trackForMode("memory")).toBe(trackForMode("match3"));
    expect(trackForMode("daily")).toBe("cipher");
    expect(trackForMode("battle")).toBe("versus");
    expect(trackForMode("practice")).toBeNull();
    expect(trackForMode(undefined)).toBeNull();
    tracks.forEach((id) => expect(TRACKS[id]).toBeDefined());
  });

  test("every loop plays two bars without errors", () => {
    const voice = jest.fn();
    const v = new Proxy({}, { get: () => voice });
    Object.values(TRACKS).forEach((track) => {
      for (let step = 0; step < 32 * track.spb; step++) track.play(step, step * 0.1, 0.1, v);
    });
    expect(voice).toHaveBeenCalled();
  });

  test("start, switch and stop", () => {
    startMusic("rush");
    expect(currentTrack()).toBe("rush");
    startMusic("memory");
    expect(currentTrack()).toBe("playful");
    stopMusic();
    expect(currentTrack()).toBeNull();
    startMusic("practice");
    expect(currentTrack()).toBeNull();
  });

  test("Rush's speed-up is limited to 1-1.3x and resets with the track", () => {
    startMusic("rush");
    setMusicIntensity(5);
    expect(musicIntensity()).toBe(1.3);
    setMusicIntensity(0.2);
    expect(musicIntensity()).toBe(1);
    setMusicIntensity(1.15);
    stopMusic();
    expect(musicIntensity()).toBe(1);
  });

  test("the scheduler plays notes only while music is on", () => {
    jest.useFakeTimers();
    playTap(); // first sound creates the audio context
    made.oscillators = 0;
    startMusic("rush");
    jest.advanceTimersByTime(100);
    expect(made.oscillators).toBeGreaterThan(0);

    // The audio clock moves on, so a running scheduler would have more to play.
    const later = (s) => {
      for (let i = 0; i < s / 0.025; i++) {
        lastCtx.currentTime += 0.025;
        jest.advanceTimersByTime(25);
      }
    };
    made.oscillators = 0;
    later(0.5);
    expect(made.oscillators).toBeGreaterThan(0);

    setAudioSettings({ music: false });
    made.oscillators = 0;
    later(0.5);
    expect(made.oscillators).toBe(0);

    setAudioSettings({ music: true, muted: true });
    later(0.5);
    expect(made.oscillators).toBe(0);

    setAudioSettings({ muted: false });
    later(0.5);
    expect(made.oscillators).toBeGreaterThan(0);
  });
});

describe("sound effects", () => {
  test("play when on, stay silent when muted or switched off", () => {
    playCorrect(3);
    expect(made.oscillators).toBe(2);
    setAudioSettings({ muted: true });
    playTap();
    expect(made.oscillators).toBe(2);
    setAudioSettings({ muted: false, sfx: false });
    playTap();
    expect(made.oscillators).toBe(2);
  });
});

describe("idle", () => {
  test("with nothing playing, the audio output sleeps after a few seconds and wakes for the next sound", () => {
    jest.useFakeTimers();
    playTap();
    const ctx = lastCtx;
    jest.advanceTimersByTime(3100);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    playTap();
    expect(ctx.resume).toHaveBeenCalled();
  });

  test("muting the music lets it sleep too; music keeps it awake", () => {
    jest.useFakeTimers();
    playTap();
    const ctx = lastCtx;
    startMusic("quiz");
    jest.advanceTimersByTime(5000);
    expect(ctx.suspend).not.toHaveBeenCalled();
    setAudioSettings({ muted: true });
    jest.advanceTimersByTime(3100);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
  });
});

describe("iOS wake-up", () => {
  test("after a pause, a tap wakes the audio only while music should play", async () => {
    const { installAudioUnlock } = require("./soundEngine");
    installAudioUnlock();
    document.dispatchEvent(new Event("pointerdown")); // first tap: unlock
    const ctx = lastCtx;
    startMusic("cipher");
    ctx.state = "interrupted"; // iOS after a call or the app switcher
    document.dispatchEvent(new Event("pointerdown"));
    expect(ctx.resume).toHaveBeenCalled();

    stopMusic();
    ctx.resume.mockClear();
    ctx.state = "suspended";
    document.dispatchEvent(new Event("pointerdown"));
    expect(ctx.resume).not.toHaveBeenCalled(); // menus stay asleep
  });
});

describe("background and ads", () => {
  test("audio pauses for each reason and resumes only when all are lifted", async () => {
    playTap();
    const ctx = lastCtx;
    pauseAudio("background");
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(isAudioHeld()).toBe(true);

    pauseAudio("ad");
    resumeAudio("background");
    expect(ctx.resume).not.toHaveBeenCalled();

    resumeAudio("ad");
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(isAudioHeld()).toBe(false);
  });

  test("no effects play while paused", () => {
    playTap();
    made.oscillators = 0;
    pauseAudio("ad");
    playCorrect();
    expect(made.oscillators).toBe(0);
    resumeAudio("ad");
    playCorrect();
    expect(made.oscillators).toBe(2);
  });
});
