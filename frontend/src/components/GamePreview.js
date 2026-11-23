import React from "react";

// Small drawn previews for the home screen game cards: each one shows the
// mode's actual mechanic (a cipher wheel, a combo timer, a byte grid...).
// Pure SVG, no downloads, so the home screen costs nothing extra on startup.
// Motion is CSS-only (App.css, .gp-*) and stops under prefers-reduced-motion.

const W = 104;
const H = 72;

function Frame({ color, children, label }) {
  return (
    <svg
      className="game-preview"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      style={{ "--gp": color }}
    >
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="12" className="gp-bg" />
      {children}
    </svg>
  );
}

const CIPHER_OUTER = "ABCDEFGHIJKL".split("");

function CipherPreview() {
  // Two rings: the outer alphabet turns against the inner one, like the in-game wheel.
  const ring = (r, letters, cls) =>
    letters.map((ch, i) => {
      const a = (i / letters.length) * Math.PI * 2 - Math.PI / 2;
      return (
        <text key={`${cls}${ch}`} x={52 + r * Math.cos(a)} y={36 + r * Math.sin(a) + 3} className={cls}>
          {ch}
        </text>
      );
    });
  return (
    <Frame color="#ff6b6b" label="Cipher wheel">
      <circle cx="52" cy="36" r="30" className="gp-line" />
      <circle cx="52" cy="36" r="19" className="gp-line gp-faint" />
      <g className="gp-spin">{ring(25, CIPHER_OUTER, "gp-letter")}</g>
      {ring(13.5, "DEFGHI".split(""), "gp-letter gp-small")}
      <circle cx="52" cy="36" r="3" className="gp-fill" />
    </Frame>
  );
}

function RushPreview() {
  // A countdown ring draining around a growing combo multiplier.
  const c = 2 * Math.PI * 24;
  return (
    <Frame color="#fde047" label="Countdown and combo">
      <circle cx="36" cy="36" r="24" className="gp-line gp-faint" />
      <circle cx="36" cy="36" r="24" className="gp-line gp-thick gp-drain" strokeDasharray={c} transform="rotate(-90 36 36)" />
      <text x="36" y="41" className="gp-num">90</text>
      <text x="80" y="30" className="gp-combo">x2.5</text>
      <rect x="66" y="40" width="28" height="5" rx="2.5" className="gp-fill gp-faint" />
      <rect x="66" y="40" width="28" height="5" rx="2.5" className="gp-fill gp-grow" />
    </Frame>
  );
}

const BITS = ["0100", "1000", "0x48", "0110", "0x49", "1001"];

function BinHexPreview() {
  return (
    <Frame color="#34d399" label="Bytes decoding to letters">
      {BITS.map((b, i) => (
        <text key={b} x={10 + (i % 3) * 30} y={22 + Math.floor(i / 3) * 18} className={`gp-mono gp-blink gp-d${i}`}>
          {b}
        </text>
      ))}
      <text x="40" y="62" className="gp-arrow">→</text>
      <text x="64" y="63" className="gp-num gp-left">HI</text>
    </Frame>
  );
}

function QuizPreview() {
  // A shield next to four answers: one struck out by a hint, one ticked.
  return (
    <Frame color="#4ecdc4" label="Quiz answers with a hint">
      <path d="M22 12 L36 17 V33 C36 43 29 50 22 54 C15 50 8 43 8 33 V17 Z" className="gp-line gp-thick" />
      <path d="M15 32 L20 38 L30 26" className="gp-line gp-thick gp-tick" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="46" y={12 + i * 13} width="48" height="9" rx="4.5" className={`gp-fill ${i === 2 ? "gp-pick" : "gp-faint"}`} />
          {i === 1 && <line x1="46" y1={16.5 + i * 13} x2="94" y2={16.5 + i * 13} className="gp-strike" />}
        </g>
      ))}
    </Frame>
  );
}

function TrueFalsePreview() {
  return (
    <Frame color="#60a5fa" label="True and false cards">
      <g className="gp-swipe-left">
        <rect x="14" y="14" width="34" height="46" rx="6" className="gp-card" transform="rotate(-8 31 37)" />
        <text x="29" y="43" className="gp-num" transform="rotate(-8 31 37)">F</text>
      </g>
      <g className="gp-swipe-right">
        <rect x="54" y="12" width="34" height="46" rx="6" className="gp-card gp-card-on" transform="rotate(7 71 35)" />
        <text x="72" y="41" className="gp-num" transform="rotate(7 71 35)">T</text>
      </g>
    </Frame>
  );
}

const GEMS = [
  "dsct", "sdtc", "cddd", "tcsd",
];
const GEM_COLORS = { d: "#ffe66d", s: "#f472b6", c: "#60a5fa", t: "#34d399" };

function Gem({ kind, x, y, pop }) {
  const fill = GEM_COLORS[kind];
  const cls = pop ? "gp-gem gp-pop" : "gp-gem";
  if (kind === "d") return <path d={`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`} fill={fill} className={cls} />;
  if (kind === "s") return <rect x={x - 5} y={y - 5} width="10" height="10" rx="2" fill={fill} className={cls} />;
  if (kind === "c") return <circle cx={x} cy={y} r="5.5" fill={fill} className={cls} />;
  return <path d={`M${x} ${y - 6} L${x + 6} ${y + 5} L${x - 6} ${y + 5} Z`} fill={fill} className={cls} />;
}

function Match3Preview() {
  return (
    <Frame color="#ffe66d" label="Match-3 gem grid">
      {GEMS.map((row, r) =>
        [...row].map((kind, c) => (
          // Row 3 holds the three matched diamonds that pop.
          <Gem key={`${r}${c}`} kind={kind} x={31 + c * 14} y={15 + r * 14} pop={r === 2 && c > 0} />
        ))
      )}
    </Frame>
  );
}

function MemoryPreview() {
  return (
    <Frame color="#a78bfa" label="Memory cards">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const x = 14 + (i % 4) * 20;
        const y = 12 + Math.floor(i / 4) * 26;
        const up = i === 1 || i === 6;
        return (
          <g key={i}>
            <rect x={x} y={y} width="16" height="22" rx="3" className={up ? "gp-card gp-card-on gp-flip" : "gp-card"} />
            {up && <text x={x + 8} y={y + 15} className="gp-num gp-small-num">◆</text>}
          </g>
        );
      })}
    </Frame>
  );
}

const PREVIEWS = {
  cipher: CipherPreview,
  rush: RushPreview,
  binhex: BinHexPreview,
  quiz: QuizPreview,
  truefalse: TrueFalsePreview,
  match3: Match3Preview,
  memory: MemoryPreview,
};

function GamePreview({ mode }) {
  const Preview = PREVIEWS[mode];
  return Preview ? <Preview /> : null;
}

export default GamePreview;
