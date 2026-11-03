// Spatial hi-fi centred on the turntable. A mono sum comes from the platter
// itself, and the left and right channels come from the speakers either side of
// it, so the record is where the sound is but the mix keeps its width. The
// sound stage stays put when the head turns. Every start and stop is a fade.
const VOICE_MAX_MS = 30000;

export class RoomAudio {
  readonly element = new Audio();
  level = 0;
  private average = 0.6;

  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  /** Evens out loudness between masters. */
  private trim: GainNode | null = null;
  private trimLevel = 1;
  /** Dips the music while the host talks. */
  private duckGain: GainNode | null = null;
  private center: PannerNode | null = null;
  private voicePanner: PannerNode | null = null;
  private voiceElement: HTMLAudioElement | null = null;
  /** The newest voice clip. An older one that fails or times out changes nothing. */
  private voiceClip = 0;
  private voiceTimer = 0;
  private voiceWaiting: (() => void)[] = [];
  /** Who wants the music low. Either one holds the dip until they let go. */
  private ducks = { host: false, listener: false };
  private turntable = [0, 0, 0];
  private radio = [0, 0, 0];
  private blurTimer = 0;
  private blurred = false;
  private analyser: AnalyserNode | null = null;
  private bins = new Uint8Array(0);
  private stopTimer = 0;
  /** The record waiting to start. Outlives a pause, so a resume plays this one. */
  private pending: { url: string; level: number } | null = null;

  constructor() {
    this.element.preload = 'auto';
  }

  /** Must run inside a user gesture at least once. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) this.build();
    if (!this.blurred) void this.ctx!.resume();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const source = ctx.createMediaElementSource(this.element);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    const trim = ctx.createGain();
    trim.gain.value = this.trimLevel;
    const duck = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const sides = ctx.createGain();
    sides.gain.value = 0.7;
    const middle = ctx.createGain();
    middle.gain.value = 0.55;
    source.connect(trim);
    trim.connect(gain);
    this.trim = trim;
    gain.connect(analyser);
    gain.connect(duck);
    duck.connect(sides);
    duck.connect(middle);
    sides.connect(splitter);
    const makePanner = () => {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.rolloffFactor = 0.4;
      panner.connect(ctx.destination);
      return panner;
    };
    for (const channel of [0, 1]) {
      const panner = makePanner();
      splitter.connect(panner, channel);
      this.panners[channel] = panner;
    }
    const center = makePanner();
    center.channelCount = 1;
    center.channelCountMode = 'explicit';
    middle.connect(center);
    this.center = center;
    this.voicePanner = makePanner();
    this.ctx = ctx;
    this.gain = gain;
    this.duckGain = duck;
    this.analyser = analyser;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
    const s = this.speakers;
    this.placeSpeakers(s[0], s[1], s[2], s[3], s[4], s[5]);
    this.placeTurntable(this.turntable[0], this.turntable[1], this.turntable[2]);
    this.placeRadio(this.radio[0], this.radio[1], this.radio[2]);
  }

  private static setPosition(panner: PannerNode | null, x: number, y: number, z: number): void {
    if (!panner) return;
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  }

  /** Where the record itself sounds from. */
  placeTurntable(x: number, y: number, z: number): void {
    this.turntable = [x, y, z];
    RoomAudio.setPosition(this.center, x, y, z);
  }

  /** Where the host's voice sounds from. */
  placeRadio(x: number, y: number, z: number): void {
    this.radio = [x, y, z];
    RoomAudio.setPosition(this.voicePanner, x, y, z);
  }

  /** Lowers the music under the host's voice, and brings it back up, gently. */
  duck(on: boolean, who: 'host' | 'listener' = 'host'): void {
    this.ducks[who] = on;
    const low = this.ducks.host || this.ducks.listener;
    this.setDuck(low ? 0.35 : 1, low ? 0.15 : 0.5);
  }

  private setDuck(level: number, seconds: number): void {
    const ctx = this.ctx;
    // While the menu is open the room stays faded out; leaving the menu restores this.
    if (!ctx || !this.duckGain || this.blurred) return;
    this.duckGain.gain.cancelScheduledValues(ctx.currentTime);
    this.duckGain.gain.setTargetAtTime(level, ctx.currentTime, seconds);
  }

  /**
   * Plays a spoken clip (cloud TTS) from the radio, ducking the music under it.
   * A newer clip replaces this one. Resolves when the last clip ends or fails.
   */
  playVoice(url: string): Promise<void> {
    this.unlock();
    const ctx = this.ctx!;
    if (!this.voiceElement) {
      this.voiceElement = new Audio();
      this.voiceElement.crossOrigin = 'anonymous';
      ctx.createMediaElementSource(this.voiceElement).connect(this.voicePanner!);
      const over = () => this.voiceOver(this.voiceClip);
      this.voiceElement.addEventListener('ended', over);
      this.voiceElement.addEventListener('error', over);
    }
    const voice = this.voiceElement;
    const clip = ++this.voiceClip;
    voice.src = url;
    this.duck(true);
    // A clip stalled on a dead connection fires nothing, and the music must still come back.
    window.clearTimeout(this.voiceTimer);
    this.voiceTimer = window.setTimeout(() => this.voiceOver(clip), VOICE_MAX_MS);
    return new Promise((resolve) => {
      this.voiceWaiting.push(resolve);
      voice.play().catch(() => this.voiceOver(clip));
    });
  }

  private voiceOver(clip: number): void {
    if (clip !== this.voiceClip) return;
    window.clearTimeout(this.voiceTimer);
    this.duck(false);
    for (const resolve of this.voiceWaiting.splice(0)) resolve();
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

  play(url: string, delaySeconds: number, level = 1): void {
    window.clearTimeout(this.stopTimer);
    // The outgoing record fades under the needle lift; the new one starts after it.
    const ctx = this.ctx;
    if (ctx && this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.18);
    }
    this.pending = { url, level };
    this.stopTimer = window.setTimeout(() => this.resume(), delaySeconds * 1000);
  }

  /** Fades in from wherever the track is, or starts the record waiting its turn. */
  resume(): void {
    window.clearTimeout(this.stopTimer);
    if (this.pending) {
      this.element.src = this.pending.url;
      this.element.currentTime = 0;
      this.trimLevel = this.pending.level;
      if (this.trim) this.trim.gain.value = this.pending.level;
      this.pending = null;
    }
    if (!this.blurred) void this.ctx?.resume();
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

  /** The system menu opened: fade the room down, then suspend. */
  suspendForBlur(): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    window.clearTimeout(this.blurTimer);
    this.setDuck(0, 0.12);
    this.blurred = true;
    this.blurTimer = window.setTimeout(() => void ctx.suspend(), 600);
  }

  resumeFromBlur(): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    window.clearTimeout(this.blurTimer);
    this.blurred = false;
    void ctx.resume().then(() => this.setDuck(this.ducks.host || this.ducks.listener ? 0.35 : 1, 0.4));
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
