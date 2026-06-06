/**
 * Raster master → favicon + PWA + iOS home screen icons.
 * Usage: node scripts/generate-icons-from-master.mjs <path-to-master.png|jpg>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const masterPath = process.argv[2];
if (!masterPath) {
  console.error("Usage: node scripts/generate-icons-from-master.mjs <master-image>");
  process.exit(1);
}

const iconsDir = resolve(root, "public/icons");
const appDir = resolve(root, "src/app");
const master = readFileSync(resolve(masterPath));

const outputs = [
  { out: resolve(iconsDir, "icon-1024.png"), size: 1024 },
  { out: resolve(iconsDir, "icon-512.png"), size: 512 },
  { out: resolve(iconsDir, "icon-192.png"), size: 192 },
  { out: resolve(iconsDir, "apple-touch-icon.png"), size: 180 },
  { out: resolve(iconsDir, "maskable-512.png"), size: 512, maskable: true },
  { out: resolve(iconsDir, "favicon-32.png"), size: 32 },
  { out: resolve(iconsDir, "favicon-16.png"), size: 16 },
];

for (const { out, size, maskable } of outputs) {
  let pipeline = sharp(master).resize(size, size, {
    fit: "cover",
    position: "centre",
  });
  if (maskable) {
    // Slight inset so Android maskable safe zone keeps the mark visible.
    pipeline = sharp(master)
      .resize(Math.round(size * 0.82), Math.round(size * 0.82), {
        fit: "cover",
        position: "centre",
      })
      .extend({
        top: Math.round(size * 0.09),
        bottom: Math.round(size * 0.09),
        left: Math.round(size * 0.09),
        right: Math.round(size * 0.09),
        background: { r: 17, g: 17, b: 19, alpha: 1 },
      });
  }
  const png = await pipeline.png().toBuffer();
  writeFileSync(out, png);
  console.log(`wrote ${out.replace(root + "/", "")} (${size}×${size})`);
}

// Minimal multi-size ICO (16 + 32 + 48) for browsers and Next app dir.
// Next.js 16 requires embedded PNGs to be RGBA — ensureAlpha() before encode.
const icoSizes = [16, 32, 48];
const pngBuffers = [];
for (const size of icoSizes) {
  const buf = await sharp(master)
    .resize(size, size, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.channels !== 4) {
    throw new Error(`ICO PNG ${size}px must be RGBA (got ${meta.channels} channels)`);
  }
  pngBuffers.push({ size, buf });
}

function writeIco(buffers) {
  const count = buffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  const data = [];

  for (const { size, buf } of buffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    data.push(buf);
    offset += buf.length;
  }

  return Buffer.concat([header, ...entries, ...data]);
}

const ico = writeIco(pngBuffers);
writeFileSync(resolve(appDir, "favicon.ico"), ico);
writeFileSync(resolve(root, "public/favicon.ico"), ico);
console.log("wrote src/app/favicon.ico + public/favicon.ico");