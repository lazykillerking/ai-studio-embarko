import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ARCHETYPES } from '../src/shared/archetypes';

const WIDTH = 1200;
const HEIGHT = 630;

// Simple crisp 5x7 uppercase bitmap font
const FONT_5X7: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

class PixelCanvas {
  buf: Uint8Array;
  constructor(public w: number, public h: number) {
    this.buf = new Uint8Array(w * h * 4);
  }

  fillRect(x: number, y: number, w: number, h: number, hex: string, alpha = 255) {
    const [r, g, b] = hexToRgb(hex);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = (py * this.w + px) * 4;
        if (alpha === 255) {
          this.buf[idx] = r;
          this.buf[idx + 1] = g;
          this.buf[idx + 2] = b;
          this.buf[idx + 3] = 255;
        } else {
          const a = alpha / 255;
          this.buf[idx] = Math.round(r * a + this.buf[idx] * (1 - a));
          this.buf[idx + 1] = Math.round(g * a + this.buf[idx + 1] * (1 - a));
          this.buf[idx + 2] = Math.round(b * a + this.buf[idx + 2] * (1 - a));
          this.buf[idx + 3] = 255;
        }
      }
    }
  }

  drawText(text: string, x: number, y: number, scale: number, hex: string, shadowHex?: string) {
    const upper = text.toUpperCase();
    let cx = x;
    for (const ch of upper) {
      const glyph = FONT_5X7[ch] ?? FONT_5X7[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] === '1') {
            if (shadowHex) {
              this.fillRect(cx + col * scale + scale, y + row * scale + scale, scale, scale, shadowHex);
            }
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, hex);
          }
        }
      }
      cx += 6 * scale;
    }
  }

  measureText(text: string, scale: number): number {
    return Math.max(0, text.length * 6 * scale - scale);
  }

  drawArchetype(archetypeId: keyof typeof ARCHETYPES, x: number, y: number, pxScale: number) {
    const def = ARCHETYPES[archetypeId];
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const key = def.grid[r][c];
        if (key === '.') continue;
        const color = def.palette[key];
        if (color) {
          this.fillRect(x + c * pxScale, y + r * pxScale, pxScale, pxScale, color);
        }
      }
    }
  }

  encodePng(): Buffer {
    const stride = this.w * 4;
    const raw = Buffer.alloc((stride + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (stride + 1)] = 0; // filter none
      Buffer.from(this.buf.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });

    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
    const crc32 = (buf: Buffer) => {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    };

    const chunk = (type: string, data: Buffer) => {
      const typeBuf = Buffer.from(type, 'ascii');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(data.length, 0);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
      return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', compressed),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

interface OgSpec {
  filename: string;
  bg: string;
  gridColor: string;
  accent: string;
  accent2: string;
  packBadge: string;
  subtitle: string;
  hook: string;
  sprites: (keyof typeof ARCHETYPES)[];
  style: 'starfield' | 'sunset' | 'notebook';
}

const SPECS: OgSpec[] = [
  {
    filename: 'default.png',
    bg: '#0B1020',
    gridColor: '#1E3A5F',
    accent: '#38BDF8',
    accent2: '#FBBF24',
    packBadge: '16-BIT PERSONALITY ARCADE',
    subtitle: 'SAME QUESTIONS. DIFFERENT MINDS.',
    hook: 'SOLO: THINK RARE  -  CREW: THINK ALIKE',
    sprites: ['the_architect', 'the_spark', 'the_lone_oracle', 'the_free_agent'],
    style: 'starfield',
  },
  {
    filename: 'the_mix.png',
    bg: '#0B1020',
    gridColor: '#1D4ED8',
    accent: '#38BDF8',
    accent2: '#F8FAFC',
    packBadge: 'PACK: THE MIX',
    subtitle: 'EVERYDAY DILEMMAS AND INSTINCTS',
    hook: 'SOLO: THINK RARE  -  CREW: THINK ALIKE',
    sprites: ['the_architect', 'the_dispatcher', 'the_free_agent', 'the_plot_twister'],
    style: 'starfield',
  },
  {
    filename: 'neon_coast.png',
    bg: '#190B28',
    gridColor: '#701A75',
    accent: '#FB7185',
    accent2: '#FBBF24',
    packBadge: 'PACK: NEON COAST',
    subtitle: 'SUNSET COASTAL ADVENTURE CHOICES',
    hook: 'SOLO: THINK RARE  -  CREW: THINK ALIKE',
    sprites: ['the_rogue_tactician', 'the_spark', 'the_lone_oracle', 'the_plot_twister'],
    style: 'sunset',
  },
  {
    filename: 'campus_chaos.png',
    bg: '#0F1E1C',
    gridColor: '#1F3A36',
    accent: '#A3E635',
    accent2: '#FDE047',
    packBadge: 'PACK: CAMPUS CHAOS',
    subtitle: 'DORMS. CANTEENS. PROJECTS. EXAMS.',
    hook: 'SOLO: THINK RARE  -  CREW: THINK ALIKE',
    sprites: ['the_dispatcher', 'the_anchor', 'the_spark', 'the_free_agent'],
    style: 'notebook',
  },
];

function renderOg(spec: OgSpec): Buffer {
  const c = new PixelCanvas(WIDTH, HEIGHT);
  c.fillRect(0, 0, WIDTH, HEIGHT, spec.bg);

  if (spec.style === 'starfield') {
    // Pixel grid on lower third
    for (let y = 410; y < HEIGHT; y += 28) {
      c.fillRect(0, y, WIDTH, 2, spec.gridColor, 160);
    }
    for (let x = 0; x < WIDTH; x += 60) {
      c.fillRect(x, 410, 2, HEIGHT - 410, spec.gridColor, 140);
    }
    // Twinkling pixel stars
    for (let i = 0; i < 65; i++) {
      const sx = (i * 173 + 47) % (WIDTH - 20);
      const sy = (i * 97 + 23) % 390;
      const sz = i % 5 === 0 ? 6 : 3;
      c.fillRect(sx, sy, sz, sz, i % 3 === 0 ? spec.accent : '#F8FAFC', 200);
    }
  } else if (spec.style === 'sunset') {
    // Retro striped pixel sun
    const cx = 960;
    const cy = 220;
    const r = 130;
    for (let dy = -r; dy <= r; dy += 4) {
      if (dy > 10 && dy % 16 < 6) continue; // synthwave horizontal cuts
      const span = Math.floor(Math.sqrt(r * r - dy * dy));
      const color = dy < -40 ? '#FDE047' : dy < 20 ? '#FB7185' : '#E879F9';
      c.fillRect(cx - span, cy + dy, span * 2, 4, color);
    }
    // Horizon grid
    for (let y = 400; y < HEIGHT; y += 26) {
      c.fillRect(0, y, WIDTH, 3, '#E879F9', 120);
    }
    for (let x = 0; x < WIDTH; x += 72) {
      c.fillRect(x, 400, 2, HEIGHT - 400, '#FB7185', 110);
    }
  } else {
    // Notebook pixel graph grid
    for (let y = 0; y < HEIGHT; y += 36) {
      c.fillRect(0, y, WIDTH, 2, spec.gridColor, 170);
    }
    for (let x = 0; x < WIDTH; x += 36) {
      c.fillRect(x, 0, 2, HEIGHT, spec.gridColor, 170);
    }
    // Margin rule
    c.fillRect(92, 0, 4, HEIGHT, '#FDE047', 90);
  }

  // Outer chunky arcade frame
  c.fillRect(28, 28, WIDTH - 56, 8, spec.accent);
  c.fillRect(28, HEIGHT - 36, WIDTH - 56, 8, spec.accent);
  c.fillRect(28, 28, 8, HEIGHT - 56, spec.accent);
  c.fillRect(WIDTH - 36, 28, 8, HEIGHT - 56, spec.accent);

  // Dark inner card scrim for crisp readability
  c.fillRect(68, 72, WIDTH - 136, HEIGHT - 144, spec.bg, 225);
  c.fillRect(68, 72, WIDTH - 136, 4, spec.accent2, 180);
  c.fillRect(68, HEIGHT - 76, WIDTH - 136, 4, spec.accent2, 180);

  // Badge label
  c.drawText(spec.packBadge, 112, 118, 4, spec.accent2);

  // Giant BRAINPRINT title
  c.drawText('BRAINPRINT', 112, 178, 13, '#F8FAFC', spec.accent);

  // Subtitle
  c.drawText(spec.subtitle, 112, 298, 4, spec.accent);

  // Hook line
  c.drawText(spec.hook, 112, 354, 3, '#E2E8F0');

  // Row of 4 crisp pixel archetype sprites at bottom
  spec.sprites.forEach((archId, idx) => {
    const sx = 116 + idx * 145;
    const sy = 420;
    c.fillRect(sx - 8, sy - 8, 112, 112, '#020617', 210);
    c.fillRect(sx - 8, sy - 8, 112, 4, spec.accent, 180);
    c.fillRect(sx - 8, sy + 100, 112, 4, spec.accent, 180);
    c.drawArchetype(archId, sx, sy, 6);
  });

  // Right callout badge
  c.fillRect(720, 444, 368, 76, spec.accent);
  const cta = 'PLAY NOW';
  const ctaW = c.measureText(cta, 5);
  c.drawText(cta, 720 + Math.floor((368 - ctaW) / 2), 465, 5, '#0B1020');

  return c.encodePng();
}

function main() {
  const outDir = path.resolve(process.cwd(), 'public', 'og');
  fs.mkdirSync(outDir, { recursive: true });
  for (const spec of SPECS) {
    const png = renderOg(spec);
    const outPath = path.join(outDir, spec.filename);
    fs.writeFileSync(outPath, png);
    console.log(`Generated ${outPath} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
  }
}

main();
