#!/usr/bin/env node
// App Store image helper. Needs sharp: `npm i --no-save sharp` (not a project dependency).
//
//   node scripts/ios-store-assets.mjs header
//       Draws store/assets/ios-header-5244x2950.png from frontend/src/brand/icon-source.svg.
//   node scripts/ios-store-assets.mjs framed <raw-capture.png> <name> "<caption>" [--status-bar]
//       Puts a 1290x2796 capture on an iPhone body with a Dynamic Island under a short
//       caption, at 1290x2796 (the 6.9" slot). --status-bar draws 9:41, signal and battery
//       above captures that don't have them (browser captures); simulator captures do.
//   node scripts/ios-store-assets.mjs iphone-set
//       All iPhone screenshots for both App Store Connect slots, from store/assets/raw/:
//       ios-iphone-6.9-NN.png (1290x2796) and ios-iphone-6.3-NN.png (1179x2556, the same
//       proportions, so it's a pure downscale).
//   node scripts/ios-store-assets.mjs fit <raw-capture.png> <name> <width> <height>
//       Scales a simulator capture to cover width x height, crops the overflow, drops
//       the alpha channel and writes store/assets/<name>.png.
//
// Screenshots must be real captures of the app (App Store guideline 2.3.3), so `fit`
// and `framed` only resize and frame a capture; they never edit what's on screen.
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
  // The mark (1720 wide) and the wordmark (~2400 wide) sit as one group, centred.
  const left = 390;
  const textX = left + 1720 + 300;
  const mark = `<g transform="translate(${left + 860} ${H / 2}) scale(${scale}) translate(-100 -100)">${g}</g>`;
  const font = "font-family=\"Helvetica Neue, Helvetica, Arial, sans-serif\"";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><radialGradient id="glow" cx="24%" cy="50%" r="55%">
      <stop offset="0" stop-color="#16224a"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${mark}
    <text x="${textX}" y="1450" ${font} font-size="430" font-weight="800" letter-spacing="-4" fill="#00E5FF">CipherRush</text>
    <text x="${textX + 14}" y="1700" ${font} font-size="170" font-weight="400" fill="#C9D3EE">Crack ciphers. Spot scams.</text>
    <rect x="${textX + 18}" y="1800" width="720" height="14" rx="7" fill="#7C4DFF"/>
  </svg>`;
  await sharp(Buffer.from(svg)).flatten({ background: BG }).removeAlpha()
    .png({ palette: false }).toFile(join(out, "ios-header-5244x2950.png"));
}

async function fit(input, name, w, h) {
  await sharp(input).resize(w, h, { fit: "cover", position: "top" })
    .flatten({ background: BG }).removeAlpha().png({ palette: false })
    .toFile(join(out, `${name}.png`));
}

// iPhone body at 1290x2796: caption on top, then the phone. Screen proportions follow a
// 6.9" iPhone (430x932 pt); the island is 126x37 pt, 11 pt from the top.
async function framed(input, name, caption, statusBar, smaller = null) {
  const [W, H] = [1290, 2796];
  const screenW = 930;
  const pt = screenW / 430;
  const band = statusBar ? Math.round(59 * pt) : 0;
  const shotH = Math.round(screenW * 2796 / 1290);
  const screenH = shotH + band;
  const bezel = 26;
  const [phoneW, phoneH] = [screenW + 2 * bezel, screenH + 2 * bezel];
  const phoneX = (W - phoneW) / 2;
  const phoneY = H - phoneH - 70;
  const [sx, sy] = [phoneX + bezel, phoneY + bezel];
  const r = 55 * pt;
  const shot = await sharp(input).resize(screenW, shotH, { fit: "cover", position: "top" }).png().toBuffer();
  const font = "font-family=\"Helvetica Neue, Helvetica, Arial, sans-serif\"";
  const lines = caption.split("|");
  const captionSvg = lines.map((line, i) =>
    i ? `<text x="${W / 2}" y="${370}" text-anchor="middle" ${font} font-size="80" font-weight="500" fill="#C9D3EE">${line}</text>`
      : `<text x="${W / 2}" y="${250}" text-anchor="middle" ${font} font-size="118" font-weight="800" fill="#00E5FF">${line}</text>`).join("");
  const isl = { w: 126 * pt, h: 37 * pt, y: sy + 11 * pt };
  const status = statusBar ? `
    <text x="${sx + 52 * pt}" y="${sy + 37 * pt}" text-anchor="middle" ${font} font-size="${17 * pt}" font-weight="600" fill="#FFFFFF">9:41</text>
    ${[0, 1, 2, 3].map((i) => `<rect x="${sx + screenW - 104 * pt + i * 5.5 * pt}" y="${sy + (32 - 3 * i) * pt}" width="${3.6 * pt}" height="${(5 + 3 * i) * pt}" rx="${pt}" fill="#FFFFFF"/>`).join("")}
    <rect x="${sx + screenW - 60 * pt}" y="${sy + 24 * pt}" width="${25 * pt}" height="${12 * pt}" rx="${3.5 * pt}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="${1.2 * pt}"/>
    <rect x="${sx + screenW - 58 * pt}" y="${sy + 26 * pt}" width="${19 * pt}" height="${8 * pt}" rx="${2 * pt}" fill="#FFFFFF"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#16224a"/><stop offset="1" stop-color="${BG}"/></radialGradient>
      <clipPath id="screen"><rect x="${sx}" y="${sy}" width="${screenW}" height="${screenH}" rx="${r}"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${captionSvg}
    <rect x="${phoneX - 4}" y="${phoneY - 4}" width="${phoneW + 8}" height="${phoneH + 8}" rx="${r + bezel + 4}" fill="#3a4152"/>
    <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="${r + bezel}" fill="#05070D"/>
    <rect x="${sx}" y="${sy}" width="${screenW}" height="${screenH}" rx="${r}" fill="#0B1020"/>
    <image x="${sx}" y="${sy + band}" width="${screenW}" height="${shotH}" clip-path="url(#screen)"
      href="data:image/png;base64,${shot.toString("base64")}"/>
    ${status}
    <rect x="${sx + (screenW - isl.w) / 2}" y="${isl.y}" width="${isl.w}" height="${isl.h}" rx="${isl.h / 2}" fill="#000000"/>
  </svg>`;
  const full = await sharp(Buffer.from(svg)).flatten({ background: BG }).removeAlpha().png({ palette: false }).toBuffer();
  await sharp(full).toFile(join(out, `${name}.png`));
  if (smaller) {
    await sharp(full).resize(smaller.w, smaller.h, { fit: "fill", kernel: "lanczos3" }).removeAlpha()
      .png({ palette: false }).toFile(join(out, `${smaller.name}.png`));
  }
}

// Upload order: the first three are what App Store search results show.
const IPHONE_SET = [
  ["iphone-cipher-simulator.png", "Beat the clock|Caesar, Atbash and Vigenère", false],
  ["iphone-match3.png", "Match-3, security style|Keys, locks, shields and alarms", true],
  ["iphone-truefalse.png", "Spot the myths|True or false? Swipe or tap", true],
  ["iphone-caesar.png", "Practise offline|No account, no signal needed", true],
  ["iphone-welcome.png", "Real skills, fast|Ciphers, scams and bytes", true],
];

async function iphoneSet() {
  for (const [i, [raw, caption, statusBar]] of IPHONE_SET.entries()) {
    const n = String(i + 1).padStart(2, "0");
    await framed(join(out, "raw", raw), `ios-iphone-6.9-${n}`, caption, statusBar,
      { name: `ios-iphone-6.3-${n}`, w: 1179, h: 2556 });
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "header") await header();
else if (cmd === "iphone-set") await iphoneSet();
else if (cmd === "framed" && args.length >= 3) await framed(args[0], args[1], args[2], args.includes("--status-bar"));
else if (cmd === "fit" && args.length === 4) await fit(args[0], args[1], +args[2], +args[3]);
else {
  console.error('usage: header | iphone-set | framed <raw.png> <name> "<caption>" [--status-bar] | fit <raw.png> <name> <width> <height>');
  process.exit(1);
}
