import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

// Captions are on by default. In the headset they sit low in view and
// follow the head lazily, like subtitles; in the flat view they are DOM text.

const WIDTH = 1024;
const HEIGHT = 260;
const STORAGE_KEY = 'nlr.captions';

export class Captions {
  readonly mesh: Mesh;
  enabled = true;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private material: MeshBasicMaterial;
  private dom: HTMLElement | null;
  private shownAt = -100;
  private holdSeconds = 0;
  private now = 0;
  private hasText = false;
  private target = new Vector3();
  private forward = new Vector3();
  private placed = false;

  constructor() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(0.42, 0.42 * (HEIGHT / WIDTH)), this.material);
    this.mesh.name = 'Captions';
    this.mesh.renderOrder = 10;
    this.mesh.raycast = () => {};
    // Hidden through the material: the entity's Visibility component owns mesh.visible.
    this.material.visible = false;
    this.dom = document.getElementById('caption');
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      this.enabled = true;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Private mode: the choice lasts this visit only.
    }
    if (!on) this.clear();
  }

  show(text: string): void {
    if (!this.enabled) return;
    this.draw(text);
    this.hasText = true;
    this.shownAt = this.now;
    // Long enough to read comfortably at a relaxed pace.
    this.holdSeconds = Math.max(3, text.split(/\s+/).length * 0.42 + 1.2);
    if (this.dom) {
      this.dom.textContent = text;
      this.dom.classList.add('on');
    }
  }

  clear(): void {
    this.hasText = false;
    this.dom?.classList.remove('on');
  }

  /** Call every frame with the viewer's head pose. */
  update(delta: number, time: number, head: Vector3, headForward: Vector3, immersive: boolean): void {
    this.now = time;
    if (this.hasText && time - this.shownAt > this.holdSeconds) this.clear();
    const target = this.hasText && immersive ? 1 : 0;
    this.material.opacity += (target - this.material.opacity) * Math.min(1, delta * 6);
    this.material.visible = this.material.opacity > 0.01;
    if (!this.material.visible) {
      this.placed = false;
      return;
    }
    // Low in view, half a metre out, turning with the head but slowly.
    this.forward.set(headForward.x, 0, headForward.z);
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.target.copy(head).addScaledVector(this.forward, 0.5);
    this.target.y = head.y - 0.2;
    if (!this.placed) this.mesh.position.copy(this.target);
    else this.mesh.position.lerp(this.target, Math.min(1, delta * 2.5));
    this.placed = true;
    this.mesh.lookAt(head);
  }

  private draw(text: string): void {
    const { g } = this;
    g.clearRect(0, 0, WIDTH, HEIGHT);
    // A long fresh line gets smaller type, never cut off.
    g.font = `500 46px Georgia, 'Times New Roman', serif`;
    let lines = this.wrap(text, WIDTH - 90);
    let lineHeight = 58;
    if (lines.length > 3) {
      g.font = `500 36px Georgia, 'Times New Roman', serif`;
      lines = this.wrap(text, WIDTH - 90);
      lineHeight = 46;
    }
    const boxHeight = lines.length * lineHeight + 36;
    const top = (HEIGHT - boxHeight) / 2;
    g.fillStyle = 'rgba(12,8,6,0.82)';
    g.beginPath();
    g.roundRect(14, top, WIDTH - 28, boxHeight, 28);
    g.fill();
    g.fillStyle = '#fbe6c6';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((line, i) => g.fillText(line, WIDTH / 2, top + 18 + lineHeight * (i + 0.5)));
    this.texture.needsUpdate = true;
  }

  private wrap(text: string, max: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.g.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
}
