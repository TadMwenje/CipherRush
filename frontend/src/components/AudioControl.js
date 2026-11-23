import React, { useEffect, useId, useRef, useState } from "react";
import { Speaker, SpeakerOff } from "../glyphs";
import { useT } from "../i18n";
import { setAudioSettings, toggleMuted, useAudioSettings } from "../utils/audioSettings";
import { playTap, previewMusic } from "../utils/soundEngine";

// Volume taps while dragging, at most a few per second.
let lastVolumeTap = 0;
function volumeTap() {
  const now = Date.now();
  if (now - lastVolumeTap < 150) return;
  lastVolumeTap = now;
  playTap();
}

/**
 * Music, sound effects and volume. Used in the in-game speaker popover and in
 * Profile → Preferences; both read and write the same saved settings
 * (utils/audioSettings), so they always agree.
 */
export function AudioSettingsFields({ showMute = false }) {
  const t = useT();
  const s = useAudioSettings();
  const volumeId = useId();
  return (
    <div className="audio-fields">
      {(showMute || s.muted) && (
        <button
          type="button"
          className={`audio-mute-btn${s.muted ? " muted" : ""}`}
          aria-pressed={s.muted}
          onClick={() => {
            const { muted } = toggleMuted();
            if (!muted) playTap(); // hear it come back
          }}
        >
          {s.muted ? <SpeakerOff size={18} /> : <Speaker size={18} />}
          {s.muted ? t("audio.unmute") : t("audio.mute")}
        </button>
      )}
      <label className="switch-row">
        <span>{t("audio.music")}</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={s.music}
          aria-checked={s.music}
          onChange={(e) => {
            setAudioSettings({ music: e.target.checked });
            if (e.target.checked) previewMusic();
          }}
        />
      </label>
      <label className="switch-row">
        <span>{t("pref.sound")}</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={s.sfx}
          aria-checked={s.sfx}
          onChange={(e) => {
            setAudioSettings({ sfx: e.target.checked });
            if (e.target.checked) playTap();
          }}
        />
      </label>
      <div className="audio-volume">
        <label htmlFor={volumeId}>{t("audio.volume")}</label>
        <input
          id={volumeId}
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(s.volume * 100)}
          disabled={s.muted}
          onChange={(e) => {
            setAudioSettings({ volume: Number(e.target.value) / 100 });
            volumeTap();
          }}
          aria-valuetext={`${Math.round(s.volume * 100)}%`}
        />
        <span className="audio-volume-value" aria-hidden="true">
          {Math.round(s.volume * 100)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Speaker button for game headers. Opens a small panel with mute, music,
 * sound effects and volume, so nobody has to leave a round to change them.
 */
function AudioControl() {
  const t = useT();
  const { muted, music, sfx } = useAudioSettings();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const panelId = useId();
  const silent = muted || (!music && !sfx);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    const escape = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="audio-control" ref={wrap}>
      <button
        type="button"
        className={`rules-btn audio-btn${silent ? " muted" : ""}`}
        aria-label={silent ? `${t("audio.settings")} (${t("audio.muted")})` : t("audio.settings")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {silent ? <SpeakerOff size={20} /> : <Speaker size={20} />}
      </button>
      {open && (
        <div className="audio-panel" id={panelId} role="dialog" aria-label={t("audio.settings")}>
          <AudioSettingsFields showMute />
        </div>
      )}
    </div>
  );
}

export default AudioControl;
