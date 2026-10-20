import React from "react";

/*
 * CipherRush glyph set - drawn for this game, not pulled from an icon pack.
 *
 * Spec: 24-unit grid, square caps, mitred joins, 2u stroke, and a solid
 * 2x2 "pixel" as the house accent. Hard corners read as terminal / arcade;
 * the pixel ties every glyph back to the bit-and-byte theme.
 */
function makeGlyph(name, children) {
  function Glyph({ size = 24, color = "currentColor", strokeWidth = 2, className = "", title, ...rest }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={`glyph glyph-${name}${className ? ` ${className}` : ""}`}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title && <title>{title}</title>}
        {children}
      </svg>
    );
  }
  Glyph.displayName = `Glyph(${name})`;
  return Glyph;
}

const Px = ({ x, y, s = 2 }) => <rect x={x} y={y} width={s} height={s} fill="currentColor" stroke="none" />;
const OCT = "M8 2h8l6 6v8l-6 6H8l-6-6V8z";

// --- interface ---------------------------------------------------------------------
export const Back = makeGlyph("back", <path d="M10 5l-7 7 7 7M3 12h18" />);
export const Close = makeGlyph("close", <path d="M5 5l14 14M19 5L5 19" />);
export const Check = makeGlyph("check", <path d="M4 12.5l5.5 5.5L20 6" />);
export const Cross = Close;
export const Plus = makeGlyph("plus", <path d="M12 4v16M4 12h16" />);
export const Minus = makeGlyph("minus", <path d="M4 12h16" />);
export const Help = makeGlyph("help", (
  <>
    <path d={OCT} />
    <path d="M9 9.5a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8" />
    <Px x={11} y={16} />
  </>
));
export const CheckOct = makeGlyph("check-oct", (
  <>
    <path d={OCT} />
    <path d="M7.5 12.5l3 3 6-7" />
  </>
));
export const CrossOct = makeGlyph("cross-oct", (
  <>
    <path d={OCT} />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
  </>
));
export const Bolt = makeGlyph("bolt", <path d="M13 2L4 14h7l-1 8 9-12h-7z" />);
export const Trophy = makeGlyph("trophy", (
  <path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M12 14v4M8 21h8M9 18h6" />
));
export const Medal = makeGlyph("medal", (
  <>
    <path d="M8 2l4 7 4-7M12 9l5 3v6l-5 3-5-3v-6z" />
    <Px x={11} y={14} />
  </>
));
export const Badge = makeGlyph("badge", (
  <>
    <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" />
    <path d="M8.5 11l2.5 2.5 4.5-5" />
  </>
));
export const Flame = makeGlyph("flame", (
  <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-6 1-9z" />
));
export const Sparkle = makeGlyph("sparkle", (
  <>
    <path d="M11 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
    <Px x={18} y={2} />
  </>
));
export const Confetti = makeGlyph("confetti", (
  <>
    <path d="M3 21l5-13 8 8zM14 2v2M20 8h2M17 5l2-2M19 13l2 1" />
    <Px x={11} y={6} />
  </>
));
export const User = makeGlyph("user", <path d="M8 3h8v8H8zM4 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3" />);
export const Users = makeGlyph("users", (
  <path d="M5 4h7v7H5zM2 21v-3a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v3M15 4h3v7h-2M18 15a3 3 0 0 1 4 3v3" />
));
export const Versus = makeGlyph("versus", (
  <path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M7 17l-3 3M17 17l3 3M6 15l3 3M18 15l-3 3" />
));
export const Home = makeGlyph("home", <path d="M3 11l9-8 9 8M5 9v12h14V9M10 21v-6h4v6" />);
export const Hourglass = makeGlyph("hourglass", <path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4" />);
export const Table = makeGlyph("table", <path d="M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16" />);
export const Skip = makeGlyph("skip", <path d="M5 5l9 7-9 7zM19 5v14" />);
export const Shuffle = makeGlyph("shuffle", (
  <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" />
));
export const Terminal = makeGlyph("terminal", <path d="M3 4h18v16H3zM7 9l3 3-3 3M12 15h5" />);
export const Mail = makeGlyph("mail", <path d="M3 5h18v14H3zM3 5l9 8 9-8" />);
export const Bulb = makeGlyph("bulb", (
  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
));
export const Key = makeGlyph("key", (
  <path d="M3.5 15.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0M10.3 12.7L21 2M17 6l3 3M14 9l2 2" />
));
export const Eye = makeGlyph("eye", (
  <>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" />
  </>
));
export const EyeOff = makeGlyph("eye-off", (
  <>
    <path d="M2 12s4-7 10-7c2 0 3.8.8 5.3 1.8M22 12s-4 7-10 7c-2 0-3.8-.8-5.3-1.8M3 3l18 18" />
    <Px x={10} y={10} s={3} />
  </>
));
export const Logout = makeGlyph("logout", <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />);
export const Calendar = makeGlyph("calendar", (
  <>
    <path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" />
    <Px x={13} y={14} s={3} />
  </>
));
export const Signal = makeGlyph("signal", <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />);
export const SignalOff = makeGlyph("signal-off", <path d="M4 20v-3M9 20v-7M14 20v-4M19 20v-1M3 3l18 18" />);
export const Trend = makeGlyph("trend", <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />);
export const Rotate = makeGlyph("rotate", <path d="M4 4v6h6M20 20v-6h-6M5 15a8 8 0 0 0 14 1M19 9A8 8 0 0 0 5 8" />);

// --- game modes -------------------------------------------------------------------
export const Rotor = makeGlyph("rotor", (
  <>
    <path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 3v3M21 12h-3M12 21v-3M3 12h3" />
    <Px x={11} y={11} />
  </>
));
export const BinaryGlyph = makeGlyph("binary", (
  <path d="M5 3v8M3 5l2-2M9 3h4v8H9zM4 14h4v7H4zM16 14v7M14 16l2-2M19 3v8M17 5l2-2" />
));
export const Speech = makeGlyph("speech", (
  <>
    <path d="M3 4h18v13H9l-5 4v-4H3z" />
    <path d="M9.5 8.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4" />
    <Px x={11} y={13.5} />
  </>
));
export const TrueFalse = makeGlyph("truefalse", <path d="M3 4h18v16H3zM12 4v16M5.5 12l2 2 3-4M14.5 10l4 4M18.5 10l-4 4" />);
export const Grid = makeGlyph("grid", (
  <>
    <path d="M3 3h5v5H3zM10 3h4v5h-4zM16 3h5v5h-5zM3 10h5v4H3zM16 10h5v4h-5zM3 16h5v5H3zM10 16h4v5h-4zM16 16h5v5h-5z" />
    <rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" />
  </>
));
export const Cards = makeGlyph("cards", <path d="M4 7h11v14H4zM9 3h11v14h-2" />);
export const Circuit = makeGlyph("circuit", (
  <>
    <path d="M4 4h16v16H4zM8 4v5h4M16 20v-5h-4M4 14h3v3" />
    <Px x={11} y={8} />
    <Px x={11} y={14} />
  </>
));

// --- game tile symbols (Match-3, Memory Lock) --------------------------------------
export const SymLock = makeGlyph("sym-lock", (
  <>
    <path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" />
    <rect x="11" y="14" width="2" height="3" fill="currentColor" stroke="none" />
  </>
));
export const SymShield = makeGlyph("sym-shield", <path d="M12 2l8 3v7c0 4.5-3.5 8-8 10-4.5-2-8-5.5-8-10V5zM12 6v12" />);
export const SymKey = Key;
export const SymSiren = makeGlyph("sym-siren", (
  <>
    <path d="M6 18v-6a6 6 0 0 1 12 0v6M4 18h16v3H4zM12 2v2M3 7l1.5 1M21 7l-1.5 1" />
    <Px x={11} y={12} />
  </>
));
export const SymTerminal = makeGlyph("sym-terminal", <path d="M3 4h18v12H3zM8 20h8M12 16v4M7 8l2 2-2 2M11 12h4" />);
export const SymFingerprint = makeGlyph("sym-fingerprint", (
  <path d="M6 12a6 6 0 0 1 12 0v2M9 12a3 3 0 0 1 6 0v4M12 12v7M6 15v1M18 17v1M3 10a9 9 0 0 1 18 0" />
));
export const SymAlert = makeGlyph("sym-alert", (
  <>
    <path d="M12 3l10 18H2zM12 9v5" />
    <Px x={11} y={16} />
  </>
));
export const SymScan = makeGlyph("sym-scan", <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 12h8M12 8v8" />);
export const SymBug = makeGlyph("sym-bug", (
  <path d="M8 8h8v9a4 4 0 0 1-8 0zM12 8v13M4 12h4M16 12h4M4 18l4-2M20 18l-4-2M5 6l3 2M19 6l-3 2M10 5a2 2 0 0 1 4 0" />
));
export const SymWifi = makeGlyph("sym-wifi", (
  <>
    <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <Px x={11} y={19} />
  </>
));
export const SymDatabase = makeGlyph("sym-database", (
  <path d="M4 5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
));
export const SymChip = makeGlyph("sym-chip", (
  <path d="M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
));
