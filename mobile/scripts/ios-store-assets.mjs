#!/usr/bin/env node
// App Store image helper. Needs sharp: `npm i --no-save sharp` (not a project dependency).
//
//   node scripts/ios-store-assets.mjs header
//       Draws store/assets/ios-header-5244x2950.png from frontend/src/brand/icon-source.svg.
//   node scripts/ios-store-assets.mjs fit <raw-capture.png> <name> <width> <height>
//       Scales a simulator capture to cover width x height, crops the overflow, drops
//       the alpha channel and writes store/assets/<name>.png.
//
// Screenshots must be real captures of the app (App Store guideline 2.3.3), so `fit`
// only resizes; it never composes or edits what's on screen.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "mobile", "store", "assets");
const BG = "#0A0E1A";

async function header() {
  const [W, H] = [5244, 2950];
  const src = readFileSync(join(root, "frontend", "src", "brand", "icon-source.svg"), "utf8");
  // The rotor is the <g> inside the 1024 icon; reuse it at its own 200-unit scale.
  const g = src.match(/<g transform="[^"]*">([\s\S]*)<\/g>/)[1];
  const scale = 8.6; // 200 units -> 1720 px
  const mark = `<g transform="translate(1200 ${H / 2}) scale(${scale}) translate(-100 -100)">${g}</g>`;
  const font = "font-family=\"Helvetica Neue, Helvetica, Arial, sans-serif\"";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><radialGradient id="glow" cx="24%" cy="50%" r="55%">
      <stop offset="0" stop-color="#16224a"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${mark}
    <text x="2250" y="1440" ${font} font-size="430" font-weight="800" fill="#00E5FF">CipherRush</text>
    <text x="2262" y="1690" ${font} font-size="170" font-weight="400" fill="#C9D3EE">Crack ciphers. Spot scams.</text>
    <rect x="2262" y="1790" width="720" height="14" fill="#7C4DFF"/>
  </svg>`;
  await sharp(Buffer.from(svg)).flatten({ background: BG }).removeAlpha()
    .png({ palette: false }).toFile(join(out, "ios-header-5244x2950.png"));
}

async function fit(input, name, w, h) {
  await sharp(input).resize(w, h, { fit: "cover", position: "top" })
    .flatten({ background: BG }).removeAlpha().png({ palette: false })
    .toFile(join(out, `${name}.png`));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "header") await header();
else if (cmd === "fit" && args.length === 4) await fit(args[0], args[1], +args[2], +args[3]);
else {
  console.error("usage: header | fit <raw.png> <name> <width> <height>");
  process.exit(1);
}
