import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from '@iwsdk/core';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Walnut boards with the lamp's warm pool painted in, so no realtime lights are needed. */
export function deskTexture(): CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rand = seeded(7);
  g.fillStyle = '#2a170d';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 900; i++) {
    const y = rand() * 1024;
    g.strokeStyle = `rgba(${rand() < 0.5 ? '12,6,3' : '86,48,24'},${0.05 + rand() * 0.16})`;
    g.lineWidth = 0.5 + rand() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(340, y + rand() * 16 - 8, 680, y + rand() * 16 - 8, 1024, y + rand() * 10 - 5);
    g.stroke();
  }
  const pool = g.createRadialGradient(770, 610, 10, 770, 610, 560);
  pool.addColorStop(0, 'rgba(255,186,110,0.62)');
  pool.addColorStop(0.35, 'rgba(226,132,62,0.26)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = pool;
  g.fillRect(0, 0, 1024, 1024);
  g.globalCompositeOperation = 'multiply';
  const edge = g.createRadialGradient(512, 512, 180, 512, 512, 560);
  edge.addColorStop(0, '#ffffff');
  edge.addColorStop(1, '#6a6068');
  g.fillStyle = edge;
  g.fillRect(0, 0, 1024, 1024);
  const t = texture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  t.offset.set(0.5, 0.5);
  return t;
}

export function floorTexture(): CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rand = seeded(11);
  g.fillStyle = '#120c09';
  g.fillRect(0, 0, 1024, 1024);
  for (let x = 0; x < 1024; x += 64) {
    g.fillStyle = `rgba(${40 + rand() * 18},${24 + rand() * 12},${14 + rand() * 8},0.5)`;
    g.fillRect(x, 0, 62, 1024);
  }
  const pool = g.createRadialGradient(560, 500, 40, 512, 512, 520);
  pool.addColorStop(0, 'rgba(255,170,96,0.3)');
  pool.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = pool;
  g.fillRect(0, 0, 1024, 1024);
  return texture(c);
}

/** Plaster wall: lamp falloff from the right, cool spill from the window at the top. */
export function wallTexture(): CanvasTexture {
  const [c, g] = canvas(512, 512);
  const v = g.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, '#0d0d14');
  v.addColorStop(0.55, '#1b1419');
  v.addColorStop(1, '#0b0808');
  g.fillStyle = v;
  g.fillRect(0, 0, 512, 512);
  const rand = seeded(5);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,240,225,${rand() * 0.018})`;
    g.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  return texture(c);
}

/** A city out of focus: what a long lens sees through a window at night. */
export function bokehTexture(): CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const rand = seeded(23);
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#060a1c');
  sky.addColorStop(0.55, '#101a38');
  sky.addColorStop(0.8, '#2b2244');
  sky.addColorStop(1, '#0c0814');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  const palette = ['255,176,92', '255,206,140', '255,120,72', '110,190,235', '255,92,110', '150,230,210'];
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 170; i++) {
    const x = rand() * 1024;
    const y = 200 + rand() * rand() * 300;
    const r = 6 + rand() * rand() * 42;
    const color = palette[Math.floor(rand() * rand() * palette.length)];
    const a = 0.1 + rand() * 0.34;
    const disc = g.createRadialGradient(x, y, r * 0.72, x, y, r);
    disc.addColorStop(0, `rgba(${color},${a})`);
    disc.addColorStop(0.86, `rgba(${color},${a * 1.25})`);
    disc.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

export function glowTexture(inner = '255,190,120'): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, `rgba(${inner},1)`);
  r.addColorStop(0.3, `rgba(${inner},0.42)`);
  r.addColorStop(1, `rgba(${inner},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return texture(c);
}

export function vinylTexture(): CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#08080a';
  g.fillRect(0, 0, 1024, 1024);
  const rand = seeded(3);
  for (let r = 180; r < 508; r += 2) {
    g.strokeStyle = `rgba(255,255,255,${0.012 + rand() * 0.035})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  return texture(c);
}

/** Stays still while the record spins under it, which is what makes vinyl read as vinyl. */
export function sheenTexture(): CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  for (const base of [0.7, 0.7 + Math.PI]) {
    for (let i = 0; i < 40; i++) {
      const spread = i / 40;
      g.fillStyle = `rgba(255,214,170,${0.012 * (1 - spread)})`;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 252, base - 0.42 * spread, base + 0.42 * spread);
      g.closePath();
      g.fill();
    }
  }
  return texture(c);
}

export function brushedTexture(): CanvasTexture {
  const [c, g] = canvas(512, 256);
  const rand = seeded(13);
  const v = g.createLinearGradient(0, 0, 512, 256);
  v.addColorStop(0, '#6f6a66');
  v.addColorStop(0.7, '#a59a8d');
  v.addColorStop(1, '#c9b49a');
  g.fillStyle = v;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.04})`;
    g.fillRect(0, rand() * 256, 512, 1);
  }
  return texture(c);
}

export function speakerTexture(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const cone = g.createRadialGradient(128, 128, 8, 128, 128, 118);
  cone.addColorStop(0, '#26221f');
  cone.addColorStop(0.2, '#0c0b0b');
  cone.addColorStop(0.86, '#191614');
  cone.addColorStop(0.9, '#57473a');
  cone.addColorStop(1, '#1c1512');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = cone;
  g.beginPath();
  g.arc(128, 128, 122, 0, Math.PI * 2);
  g.fill();
  return texture(c);
}

export function lampShadeTexture(): CanvasTexture {
  const [c, g] = canvas(64, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, '#d98a45');
  v.addColorStop(0.5, '#ffdca8');
  v.addColorStop(1, '#ffc27e');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 256);
  return texture(c);
}

export function radioFaceTexture(): CanvasTexture {
  const [c, g] = canvas(512, 256);
  const v = g.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, '#3a2415');
  v.addColorStop(1, '#1e120a');
  g.fillStyle = v;
  g.fillRect(0, 0, 512, 256);
  const dial = g.createLinearGradient(0, 30, 0, 120);
  dial.addColorStop(0, '#ffcf8e');
  dial.addColorStop(1, '#e8924a');
  g.fillStyle = dial;
  g.fillRect(36, 30, 440, 86);
  g.strokeStyle = 'rgba(40,18,6,0.7)';
  for (let x = 56; x < 460; x += 20) {
    g.lineWidth = x % 100 === 56 % 100 ? 3 : 1;
    g.beginPath();
    g.moveTo(x, 44);
    g.lineTo(x, x % 100 === 56 % 100 ? 84 : 66);
    g.stroke();
  }
  g.fillStyle = '#100a07';
  for (let y = 142; y < 236; y += 12) g.fillRect(36, y, 440, 5);
  return texture(c);
}

export class TextPlaque {
  readonly texture: CanvasTexture;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    [this.canvas, this.g] = canvas(width, height);
    this.texture = texture(this.canvas);
    this.draw('');
  }

  draw(text: string): void {
    const { g, canvas: c } = this;
    g.clearRect(0, 0, c.width, c.height);
    if (text) {
      g.fillStyle = '#f4d6a8';
      g.font = `500 ${Math.round(c.height * 0.52)}px Georgia, 'Times New Roman', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,170,90,0.75)';
      g.shadowBlur = 14;
      g.fillText(text, c.width / 2, c.height / 2, c.width - 24);
    }
    this.texture.needsUpdate = true;
  }
}
