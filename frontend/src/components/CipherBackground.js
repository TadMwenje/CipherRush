import React, { useMemo } from "react";

// Full-screen cyberpunk backdrop for the welcome/auth screens. Pure SVG so it
// stays crisp at any resolution; the centre is kept dark for UI overlays.

const W = 1600;
const H = 900;
const CX = W / 2;
const CY = H / 2;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Orthogonal PCB-style trace from an edge point toward the centre void.
function buildTraces(rand) {
  const traces = [];
  const count = 34;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.12;
    const sx = CX + Math.cos(angle) * 1000;
    const sy = CY + Math.sin(angle) * 600;
    const x0 = Math.max(-20, Math.min(W + 20, sx));
    const y0 = Math.max(-20, Math.min(H + 20, sy));
    // Stop short of the centre so the void stays clear.
    const stop = 0.55 + rand() * 0.12;
    const ex = x0 + (CX - x0) * stop;
    const ey = y0 + (CY - y0) * stop;
    const bend = 0.35 + rand() * 0.3;
    const horizontalFirst = Math.abs(x0 - CX) / W > Math.abs(y0 - CY) / H;
    let d;
    if (horizontalFirst) {
      const mx = x0 + (ex - x0) * bend;
      const dy = ey - y0;
      const diag = Math.min(Math.abs(dy), 40) * Math.sign(dy);
      d = `M${x0},${y0} H${mx} L${mx + Math.sign(ex - x0) * Math.abs(diag)},${y0 + diag} V${ey} H${ex}`;
    } else {
      const my = y0 + (ey - y0) * bend;
      const dx = ex - x0;
      const diag = Math.min(Math.abs(dx), 40) * Math.sign(dx);
      d = `M${x0},${y0} V${my} L${x0 + diag},${my + Math.sign(ey - y0) * Math.abs(diag)} H${ex} V${ey}`;
    }
    traces.push({ d, ex, ey, bright: rand() > 0.7 });
  }
  return traces;
}

function buildBinary(rand) {
  const cols = [];
  for (let i = 0; i < 26; i++) {
    const x = 20 + i * 62 + rand() * 20;
    // Skip columns crossing the centre so the modal area stays calm.
    if (Math.abs(x - CX) < 260) continue;
    const len = 8 + Math.floor(rand() * 14);
    const chars = Array.from({ length: len }, () => (rand() > 0.5 ? "1" : "0"));
    cols.push({ x, chars, delay: -rand() * 14, dur: 10 + rand() * 10, opacity: 0.12 + rand() * 0.22 });
  }
  return cols;
}

function buildStreams(rand) {
  return Array.from({ length: 14 }, (_, i) => {
    const offset = -500 + i * 190 + rand() * 60;
    return {
      x1: offset,
      y1: H + 50,
      x2: offset + 900,
      y2: -50,
      width: 0.6 + rand() * 1.8,
      color: i % 3 === 0 ? "#7C4DFF" : i % 2 ? "#00E5FF" : "#00B0FF",
      dash: `${40 + rand() * 140} ${200 + rand() * 400}`,
      dur: 4 + rand() * 6,
      delay: -rand() * 8,
      opacity: 0.25 + rand() * 0.45,
    };
  });
}

function buildGlyphs(rand) {
  const spots = [
    [180, 160], [1380, 140], [120, 700], [1460, 720], [420, 820],
    [1180, 820], [300, 420], [1300, 460], [560, 110], [1040, 90],
  ];
  return spots.map(([x, y], i) => ({
    x, y,
    kind: i % 2 ? "hex" : "rotor",
    scale: 0.7 + rand() * 0.7,
    rot: -20 + rand() * 40,
    dur: 6 + rand() * 6,
    delay: -rand() * 6,
  }));
}

// Cipher rotor: two rings and index ticks - the game's own motif.
const Rotor = () => (
  <g fill="none" strokeWidth="2">
    <circle r="16" />
    <circle r="8" />
    <path d="M0,-16 V-11 M16,0 H11 M0,16 V11 M-16,0 H-11" />
    <rect x="-2" y="-2" width="4" height="4" fill="currentColor" stroke="none" />
  </g>
);

// A byte in a chamfered chip outline.
const HexByte = () => (
  <g fill="none" strokeWidth="2">
    <path d="M-16,-8 L-10,-14 H16 V8 L10,14 H-16 Z" />
    <text x="0" y="5" textAnchor="middle" fontSize="13" fontFamily="'JetBrains Mono', ui-monospace, monospace"
      fill="currentColor" stroke="none">0x4B</text>
  </g>
);

const SMALL_SCREEN = typeof window !== "undefined" && window.matchMedia?.("(max-width: 600px)").matches;

// Behind games (calm) the backdrop is static and filter-free so the GPU is
// free for the game itself; on phones the welcome screen also thins out.
function CipherBackground({ calm = false }) {
  const lite = calm || SMALL_SCREEN;
  const { traces, binary, streams, glyphs, nodes } = useMemo(() => {
    const rand = seeded(1977);
    const t = buildTraces(rand);
    const nodesList = Array.from({ length: SMALL_SCREEN ? 22 : 40 }, () => {
      let x, y;
      do {
        x = rand() * W;
        y = rand() * H;
      } while (Math.hypot((x - CX) / 1.6, y - CY) < 260);
      return { x, y, r: 1 + rand() * 2.2 };
    });
    return {
      traces: t,
      binary: SMALL_SCREEN ? buildBinary(rand).filter((_, i) => i % 2 === 0) : buildBinary(rand),
      streams: SMALL_SCREEN ? buildStreams(rand).slice(0, 7) : buildStreams(rand),
      glyphs: buildGlyphs(rand),
      nodes: nodesList,
    };
  }, []);

  // Connect nearby nodes into a constellation network.
  const links = useMemo(() => {
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < 170) out.push({ a: nodes[i], b: nodes[j], o: 1 - d / 170 });
      }
    }
    return out;
  }, [nodes]);

  return (
    <div className={`cipher-bg${calm ? " cipher-bg--calm" : ""}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="cb-base" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#0D1322" />
            <stop offset="100%" stopColor="#0A0E1A" />
          </radialGradient>
          <radialGradient id="cb-glow-cyan" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cb-glow-violet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7C4DFF" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cb-void" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0A0E1A" stopOpacity="0.92" />
            <stop offset="55%" stopColor="#0A0E1A" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0A0E1A" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cb-halo" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#00B0FF" stopOpacity="0" />
            <stop offset="80%" stopColor="#00B0FF" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#00B0FF" stopOpacity="0" />
          </radialGradient>
          <pattern id="cb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40,0 H0 V40" fill="none" stroke="#1B2A4A" strokeWidth="0.6" />
          </pattern>
          <filter id="cb-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="cb-vignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#05070D" stopOpacity="0.7" />
            <stop offset="25%" stopColor="#05070D" stopOpacity="0" />
            <stop offset="75%" stopColor="#05070D" stopOpacity="0" />
            <stop offset="100%" stopColor="#05070D" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Base + atmospheric glows */}
        <rect width={W} height={H} fill="url(#cb-base)" />
        <ellipse cx="260" cy="180" rx="520" ry="380" fill="url(#cb-glow-violet)" />
        <ellipse cx="1380" cy="760" rx="560" ry="400" fill="url(#cb-glow-cyan)" />
        <ellipse cx="1350" cy="120" rx="360" ry="260" fill="url(#cb-glow-cyan)" opacity="0.6" />
        <ellipse cx="200" cy="800" rx="380" ry="260" fill="url(#cb-glow-violet)" opacity="0.6" />

        {/* Perspective grid (far layer) */}
        <rect width={W} height={H} fill="url(#cb-grid)" opacity="0.55" />

        {/* PCB traces converging toward the centre */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {traces.map((t, i) => (
            <path key={`tb${i}`} d={t.d} stroke="#1E3A8A" strokeWidth="1.6" opacity="0.55" />
          ))}
          {traces.filter((t) => t.bright).map((t, i) => (
            <path
              key={`tp${i}`}
              className="cb-pulse"
              d={t.d}
              stroke="#00E5FF"
              strokeWidth="1.6"
              filter={lite ? undefined : "url(#cb-bloom)"}
              style={{ animationDelay: `${-i * 1.3}s` }}
            />
          ))}
          {traces.map((t, i) => (
            <circle key={`tc${i}`} cx={t.ex} cy={t.ey} r="3" fill="#0A0E1A" stroke={t.bright ? "#00E5FF" : "#2952A3"} strokeWidth="1.4" />
          ))}
        </g>

        {/* Diagonal holographic data streams (skipped when calm) */}
        {!calm && (
        <g strokeLinecap="round">
          {streams.map((s, i) => (
            <line
              key={`s${i}`}
              className="cb-stream"
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              opacity={s.opacity}
              filter={lite ? undefined : "url(#cb-bloom)"}
              style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>
        )}

        {/* Node network */}
        <g>
          {links.map((l, i) => (
            <line key={`l${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="#00B0FF" strokeWidth="0.7" opacity={l.o * 0.45} />
          ))}
          {nodes.map((n, i) => (
            <circle
              key={`n${i}`}
              className="cb-node"
              cx={n.x} cy={n.y} r={n.r}
              fill={i % 5 === 0 ? "#7C4DFF" : "#00E5FF"}
              filter={lite ? undefined : "url(#cb-bloom)"}
              style={{ animationDelay: `${-(i % 7)}s` }}
            />
          ))}
        </g>

        {/* Cascading binary (skipped when calm) */}
        {!calm && (
        <g fontFamily="'JetBrains Mono', ui-monospace, monospace" fontSize="15" fill="#00E5FF">
          {binary.map((c, i) => (
            <g
              key={`b${i}`}
              className="cb-rain"
              opacity={c.opacity}
              style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
            >
              {c.chars.map((ch, j) => (
                <text key={j} x={c.x} y={j * 20} opacity={(j + 1) / c.chars.length}>
                  {ch}
                </text>
              ))}
            </g>
          ))}
        </g>
        )}

        {/* Floating cryptographic glyphs */}
        <g stroke="#00E5FF">
          {glyphs.map((g, i) => (
            <g key={`g${i}`} transform={`translate(${g.x} ${g.y}) rotate(${g.rot}) scale(${g.scale})`}>
              <g
                className="cb-float"
                opacity="0.38"
                stroke={i % 3 === 0 ? "#7C4DFF" : "#00E5FF"}
                filter={lite ? undefined : "url(#cb-bloom)"}
                style={{ animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s` }}
              >
                {g.kind === "rotor" ? <Rotor /> : <HexByte />}
              </g>
            </g>
          ))}
        </g>

        {/* Centre void reserved for UI, with soft halo + hex ring */}
        <ellipse cx={CX} cy={CY} rx="560" ry="420" fill="url(#cb-halo)" />
        <ellipse cx={CX} cy={CY} rx="460" ry="360" fill="url(#cb-void)" />
        <g fill="none" stroke="#00B0FF" opacity="0.18">
          <circle cx={CX} cy={CY} r="300" strokeDasharray="2 10" />
          <circle className="cb-spin" cx={CX} cy={CY} r="340" strokeDasharray="60 30 4 30" strokeWidth="1.2" />
        </g>

        <rect width={W} height={H} fill="url(#cb-vignette)" />
      </svg>
    </div>
  );
}

export default CipherBackground;
