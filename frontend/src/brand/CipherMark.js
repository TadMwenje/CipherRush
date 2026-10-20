import React from "react";

/*
 * The CipherRush mark: a cipher rotor with a terminal prompt at its hub.
 *
 *  - Outer ring: 26 notches, one per letter, with an index marker at 12 o'clock
 *    (where a real rotor shows the current setting).
 *  - Inner ring: offset dashes - the second alphabet, turned against the first.
 *  - Hub: ">_" - you, at the prompt.
 *
 * Flat strokes, no gradients or gloss. Cyan #00E5FF + violet #7C4DFF on navy.
 * `animated` turns the rings against each other and blinks the cursor
 * (disabled under prefers-reduced-motion in CSS).
 */
const NOTCHES = Array.from({ length: 26 }, (_, i) => i);

function CipherMark({ size = 96, animated = false, className = "", title = "CipherRush" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={`cipher-mark${animated ? " is-animated" : ""}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={title}
    >
      <g className="cipher-mark-outer" style={{ transformOrigin: "100px 100px" }}>
        <circle cx="100" cy="100" r="86" fill="none" stroke="#00E5FF" strokeWidth="6" />
        {NOTCHES.map((i) => {
          const a = (i / 26) * Math.PI * 2;
          const long = i % 2 === 0;
          const r1 = 72;
          const r2 = long ? 80 : 77;
          return (
            <line
              key={i}
              x1={100 + Math.sin(a) * r1}
              y1={100 - Math.cos(a) * r1}
              x2={100 + Math.sin(a) * r2}
              y2={100 - Math.cos(a) * r2}
              stroke="#00E5FF"
              strokeWidth={long ? 3 : 2}
              strokeLinecap="square"
              opacity={long ? 0.9 : 0.55}
            />
          );
        })}
      </g>

      {/* Index marker - fixed while the rotor turns under it. */}
      <path d="M92 4 H108 L100 16 Z" fill="#00E5FF" />

      <g className="cipher-mark-inner" style={{ transformOrigin: "100px 100px" }}>
        <circle
          cx="100"
          cy="100"
          r="58"
          fill="none"
          stroke="#7C4DFF"
          strokeWidth="5"
          strokeDasharray="22 9"
          strokeLinecap="square"
        />
      </g>

      {/* Hub: the prompt. */}
      <path d="M72 82 L92 100 L72 118" fill="none" stroke="#00E5FF" strokeWidth="9" strokeLinecap="square" strokeLinejoin="miter" />
      <rect className="cipher-mark-cursor" x="100" y="110" width="30" height="9" fill="#00E5FF" />
    </svg>
  );
}

export default CipherMark;
