import { useEffect } from "react";
import { startMusic, stopMusic } from "../utils/soundEngine";

/** Plays a mode's loop while the screen is open, and fades it out on the way out. */
export default function useGameMusic(mode) {
  useEffect(() => {
    if (!mode) return undefined;
    startMusic(mode);
    return () => stopMusic();
  }, [mode]);
}
