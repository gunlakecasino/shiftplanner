/**
 * One-shot PWA icon generator — SVG → PNG for iOS home screen.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = resolve(root, "public/icons");

const sources = [
  { in: "shiftforge-icon.svg", out: "icon-192.png", size: 192 },
  { in: "shiftforge-icon.svg", out: "icon-512.png", size: 512 },
  { in: "shiftforge-maskable.svg", out: "maskable-512.png", size: 512 },
  { in: "shiftforge-maskable.svg", out: "apple-touch-icon.png", size: 180 },
];

for (const { in: src, out, size } of sources) {
  const input = resolve(iconsDir, src);
  const output = resolve(iconsDir, out);
  const svg = readFileSync(input);
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(output, png);
  console.log(`wrote ${out} (${size}×${size})`);
}