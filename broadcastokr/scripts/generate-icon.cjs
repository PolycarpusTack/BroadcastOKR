/**
 * Generates a 256x256 ICO icon for BroadcastOKR.
 * ICO format wraps a PNG image with a directory header.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

// ── PNG creation ──

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBytes = Buffer.from(type);
    const crcData = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crc]);
  }

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc ^ 0xffffffff;
}

// ── ICO wrapper ──

function createICO(pngBuf, width, height) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: 1 = ICO
  header.writeUInt16LE(1, 4);     // 1 image

  // Directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = width >= 256 ? 0 : width;   // 0 means 256
  entry[1] = height >= 256 ? 0 : height;
  entry[2] = 0;   // color palette
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);              // color planes
  entry.writeUInt16LE(32, 6);             // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);  // image size
  entry.writeUInt32LE(22, 12);            // offset (6 header + 16 entry = 22)

  return Buffer.concat([header, entry, pngBuf]);
}

// ── Draw the icon ──

const pixels = Buffer.alloc(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  const srcA = a / 255;
  const dstA = pixels[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    pixels[idx]     = Math.round((r * srcA + pixels[idx]     * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
  }
}

function fillCircle(cx, cy, r, red, green, blue, alpha) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(SIZE - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(SIZE - 1, Math.ceil(cx + r)); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        const edge = Math.min(1, r - dist);
        setPixel(x, y, red, green, blue, Math.round(alpha * edge));
      }
    }
  }
}

function drawRing(cx, cy, r, thickness, red, green, blue, alpha) {
  for (let y = Math.max(0, Math.floor(cy - r - thickness)); y <= Math.min(SIZE - 1, Math.ceil(cy + r + thickness)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - thickness)); x <= Math.min(SIZE - 1, Math.ceil(cx + r + thickness)); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ringDist = Math.abs(dist - r);
      if (ringDist <= thickness / 2) {
        const edge = Math.min(1, (thickness / 2 - ringDist));
        setPixel(x, y, red, green, blue, Math.round(alpha * edge));
      }
    }
  }
}

// Background: rounded rect with gradient #3805E3 → #5B33F0
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const t = (x + y) / (SIZE * 2);
    const r = Math.round(56 * (1 - t) + 91 * t);
    const g = Math.round(5 * (1 - t) + 51 * t);
    const b = Math.round(227 * (1 - t) + 240 * t);

    const rad = 48;
    let inside = true;
    if (x < rad && y < rad)                         inside = Math.sqrt((x - rad) ** 2 + (y - rad) ** 2) <= rad;
    else if (x > SIZE - 1 - rad && y < rad)         inside = Math.sqrt((x - (SIZE - 1 - rad)) ** 2 + (y - rad) ** 2) <= rad;
    else if (x < rad && y > SIZE - 1 - rad)         inside = Math.sqrt((x - rad) ** 2 + (y - (SIZE - 1 - rad)) ** 2) <= rad;
    else if (x > SIZE - 1 - rad && y > SIZE - 1 - rad) inside = Math.sqrt((x - (SIZE - 1 - rad)) ** 2 + (y - (SIZE - 1 - rad)) ** 2) <= rad;

    if (inside) setPixel(x, y, r, g, b, 255);
  }
}

// Target rings
const cx = 128, cy = 115;
drawRing(cx, cy, 70, 10, 255, 255, 255, 76);
drawRing(cx, cy, 48, 9, 255, 255, 255, 128);
drawRing(cx, cy, 26, 8, 255, 255, 255, 204);
fillCircle(cx, cy, 7, 45, 212, 191, 255);

// Broadcast waves
for (let wave = 0; wave < 3; wave++) {
  const waveY = 185 + wave * 18;
  const alpha = [153, 102, 64][wave];
  const thickness = 5;
  const xStart = 60 + wave * 12;
  const xEnd = 196 - wave * 12;

  for (let x = xStart; x <= xEnd; x++) {
    const t = (x - xStart) / (xEnd - xStart);
    const yOff = Math.sin(t * Math.PI) * (18 + wave * 5);
    for (let dy = -thickness; dy <= thickness; dy++) {
      const py = Math.round(waveY - yOff + dy);
      const edge = Math.max(0, 1 - Math.abs(dy) / thickness);
      setPixel(x, py, 45, 212, 191, Math.round(alpha * edge));
    }
  }
}

// Generate PNG then wrap as ICO
const pngBuf = createPNG(SIZE, SIZE, pixels);
const icoBuf = createICO(pngBuf, SIZE, SIZE);

const pngPath = path.join(__dirname, '..', 'public', 'icon.png');
const icoPath = path.join(__dirname, '..', 'public', 'icon.ico');

fs.writeFileSync(pngPath, pngBuf);
fs.writeFileSync(icoPath, icoBuf);

console.log(`PNG: ${pngPath} (${pngBuf.length} bytes)`);
console.log(`ICO: ${icoPath} (${icoBuf.length} bytes)`);
