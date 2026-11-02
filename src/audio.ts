// Stereo hi-fi: left and right channels each come from a speaker in the room,
// so the mix keeps its width and the sound stage stays put when the head turns.
export class RoomAudio {
  readonly element = new Audio();
  level = 0;
  private average = 0.6;

  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private bins = new Uint8Array(0);
  private stopTimer = 0;

  constructor() {
    this.element.preload = 'auto';
  }

  /** Must run inside a user gesture at least once. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const source = ctx.createMediaElementSource(this.element);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    const splitter = ctx.createChannelSplitter(2);
    source.connect(gain);
    gain.connect(analyser);
    gain.connect(splitter);
    for (const channel of [0, 1]) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.rolloffFactor = 0.4;
      splitter.connect(panner, channel);
      panner.connect(ctx.destination);
      this.panners[channel] = panner;
    }
    this.ctx = ctx;
    this.gain = gain;
    this.analyser = analyser;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
    const s = this.speakers;
    this.placeSpeakers(s[0], s[1], s[2], s[3], s[4], s[5]);
  }

  private panners: PannerNode[] = [];

  private speakers = [0, 0, 0, 0, 0, 0];

  placeSpeakers(lx: number, ly: number, lz: number, rx: number, ry: number, rz: number): void {
    this.speakers = [lx, ly, lz, rx, ry, rz];
    const [l, r] = this.panners;
    if (!l || !r) return;
    l.positionX.value = lx;
    l.positionY.value = ly;
    l.positionZ.value = lz;
    r.positionX.value = rx;
    r.positionY.value = ry;
    r.positionZ.value = rz;
  }

  setListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    const listener = this.ctx?.listener;
    if (!listener || !listener.positionX) return;
    listener.positionX.value = px;
    listener.positionY.value = py;
    listener.positionZ.value = pz;
    listener.forwardX.value = fx;
    listener.forwardY.value = fy;
    listener.forwardZ.value = fz;
    listener.upX.value = ux;
    listener.upY.value = uy;
    listener.upZ.value = uz;
  }

  play(url: string, delaySeconds: number): void {
    window.clearTimeout(this.stopTimer);
    // The outgoing record fades under the needle lift; the new one starts after it.
    const ctx = this.ctx;
    if (ctx && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.18);
    }
    this.stopTimer = window.setTimeout(() => {
      this.element.src = url;
      this.element.currentTime = 0;
      this.resume();
    }, delaySeconds * 1000);
  }

  /** Fades in from wherever the track is. */
  resume(): void {
    window.clearTimeout(this.stopTimer);
    void this.ctx?.resume();
    void this.element.play();
    const ctx = this.ctx;
    if (ctx && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.35);
    }
  }

  /** Music never stops hard: it fades, then the element pauses. */
  fadeOutThenPause(): void {
    window.clearTimeout(this.stopTimer);
    const ctx = this.ctx;
    if (ctx && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    }
    this.stopTimer = window.setTimeout(() => this.element.pause(), 1300);
  }

  suspendForBlur(): void {
    void this.ctx?.suspend();
  }

  resumeFromBlur(): void {
    void this.ctx?.resume();
  }

  /** Low-end energy from 0 to 1, for the room to breathe with. */
  sample(): number {
    if (!this.analyser || this.element.paused) {
      this.level *= 0.94;
      return this.level;
    }
    this.analyser.getByteFrequencyData(this.bins);
    let sum = 0;
    for (let i = 1; i < 7; i++) sum += this.bins[i];
    // Masters sit loud, so react to kicks above the track's own running average.
    const energy = sum / (6 * 255);
    this.average += (energy - this.average) * 0.012;
    const target = Math.min(1, Math.max(0, (energy - this.average) * 7));
    this.level += (target - this.level) * (target > this.level ? 0.55 : 0.1);
    return this.level;
  }
}
