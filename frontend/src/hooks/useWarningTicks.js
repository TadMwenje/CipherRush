import { useEffect, useRef } from "react";
import { playTick } from "../utils/soundEngine";

/** One tick a second for the last `from` seconds of a running clock. */
export default function useWarningTicks(secondsLeft, active, from = 10) {
  const last = useRef(null);
  const whole = Math.ceil(secondsLeft);
  useEffect(() => {
    if (!active || whole <= 0 || whole > from) {
      last.current = null;
      return;
    }
    if (last.current !== whole) {
      last.current = whole;
      playTick(whole);
    }
  }, [whole, active, from]);
}
