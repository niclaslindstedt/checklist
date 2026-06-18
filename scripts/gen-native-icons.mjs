// Renders the checklist mark (public/favicon.svg) to 1024x1024 PNGs with no
// third-party deps — only node:zlib. The artwork is a flat background plus a
// round-capped/round-joined polyline stroked with a vertical green gradient,
// so we rasterize it analytically (signed distance to the two segments) with
// 1px anti-aliasing and encode an opaque truecolor PNG by hand.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const VIEW = 64;
// Polyline from the SVG `d`: M16 33.5 L27 44 L48 19, stroke-width 7.
const PTS = [
  [16, 33.5],
  [27, 44],
  [48, 19],
];
const STROKE = 7;
// Gradient stops (top -> bottom of the path's bounding box).
const TOP = [0x6e, 0xe7, 0xb7]; // #6ee7b7
const BOT = [0x34, 0xd3, 0x99]; // #34d399
const THEME = [0x1f, 0x29, 0x33]; // #1f2933 — icon / adaptive background
const SPLASH_BG = [0x0f, 0x11, 0x15]; // #0f1115 — splash background

function hexlerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Distance from point (px,py) to segment (ax,ay)-(bx,by).
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// size: output dimension; frac: fraction of the canvas the 64-unit art box
// fills (1 = full bleed, <1 = padded/centred); bg: background RGB.
function render(size, frac, bg) {
  const scale = (size * frac) / VIEW;
  const off = (size - VIEW * scale) / 2;
  const segs = [];
  for (let i = 0; i < PTS.length - 1; i++) {
    segs.push([
      off + PTS[i][0] * scale,
      off + PTS[i][1] * scale,
      off + PTS[i + 1][0] * scale,
      off + PTS[i + 1][1] * scale,
    ]);
  }
  const halfW = (STROKE * scale) / 2;
  // Gradient spans the path bbox in y: viewBox 19..44 -> device coords.
  const gy0 = off + 19 * scale;
  const gy1 = off + 44 * scale;

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // filter: none
    const gt = Math.max(0, Math.min(1, (y + 0.5 - gy0) / (gy1 - gy0)));
    const stroke = hexlerp(TOP, BOT, gt);
    for (let x = 0; x < size; x++) {
      let d = Infinity;
      for (const s of segs) {
        const dd = distToSeg(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]);
        if (dd < d) d = dd;
      }
      // Coverage: 1 inside, ramps to 0 across a 1px edge band.
      const cov = Math.max(0, Math.min(1, halfW + 0.5 - d));
      const o = rowStart + 1 + x * 3;
      raw[o] = Math.round(bg[0] + (stroke[0] - bg[0]) * cov);
      raw[o + 1] = Math.round(bg[1] + (stroke[1] - bg[1]) * cov);
      raw[o + 2] = Math.round(bg[2] + (stroke[2] - bg[2]) * cov);
    }
  }
  return raw;
}

// --- minimal PNG encoder (truecolor, 8-bit, no alpha) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, raw) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB (no alpha)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function emit(path, size, frac, bg) {
  writeFileSync(path, encodePng(size, render(size, frac, bg)));
  console.log(`wrote ${path} (${size}x${size})`);
}

// icon.png: full-bleed, matches the favicon proportions (opaque, no alpha
// per Apple's marketing-icon requirement).
emit("native/assets/icon.png", 1024, 1.0, THEME);
// adaptive-icon.png: Android masks the outer ring, so pad the mark into the
// central safe zone over the theme background (matches app.json backgroundColor).
emit("native/assets/adaptive-icon.png", 1024, 0.66, THEME);
// splash.png: smaller centred mark on the splash background.
emit("native/assets/splash.png", 1024, 0.42, SPLASH_BG);
