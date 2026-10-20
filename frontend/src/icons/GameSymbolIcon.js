import React from "react";
import {
  SymLock,
  SymShield,
  SymKey,
  SymSiren,
  SymTerminal,
  SymFingerprint,
  SymAlert,
  SymScan,
  SymBug,
  SymWifi,
  SymDatabase,
  SymChip,
} from "../glyphs";

// Semantic tile keys from the server -> glyph + colour. Colours are spaced
// around the wheel so every pair stays distinguishable for colour-blind
// players too (each glyph also has a distinct silhouette).
export const GAME_SYMBOL_ICONS = {
  lock: { Icon: SymLock, color: "#7dd3fc" },
  shield: { Icon: SymShield, color: "#34d399" },
  key: { Icon: SymKey, color: "#fbbf24" },
  siren: { Icon: SymSiren, color: "#f87171" },
  monitor: { Icon: SymTerminal, color: "#a78bfa" },
  fingerprint: { Icon: SymFingerprint, color: "#38bdf8" },
  alert: { Icon: SymAlert, color: "#fb923c" },
  search: { Icon: SymScan, color: "#5eead4" },
  bug: { Icon: SymBug, color: "#f472b6" },
  wifi: { Icon: SymWifi, color: "#60a5fa" },
  database: { Icon: SymDatabase, color: "#facc15" },
  cpu: { Icon: SymChip, color: "#c084fc" },
};

function GameSymbolIcon({ symbolKey, size = 24, strokeWidth = 2, className = "" }) {
  const entry = GAME_SYMBOL_ICONS[symbolKey];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} className={className} />;
}

export default GameSymbolIcon;
