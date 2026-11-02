// Spatial hi-fi centred on the turntable. A mono sum comes from the platter
// itself, and the left and right channels come from the speakers either side of
// it, so the record is where the sound is but the mix keeps its width. The
// sound stage stays put when the head turns. Every start and stop is a fade.
export class RoomAudio {
  readonly element = new Audio();
  level = 0;
  private average = 0.6;

  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  /** Dips the music while the host talks. */
  private duckGain: GainNode | null = null;
  private center: PannerNode | null = null;
  private voicePanner: PannerNode | null = null;
  private voiceElement: HTMLAudioElement | null = null;
  private turntable = [0, 0, 0];
  private radio = [0, 0, 0];
  private blurTimer = 0;
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
    const duck = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const sides = ctx.createGain();
    sides.gain.value = 0.7;
    const middle = ctx.createGain();
    middle.gain.value = 0.55;
    source.connect(gain);
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
  duck(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    this.duckGain.gain.cancelScheduledValues(ctx.currentTime);
    this.duckGain.gain.setTargetAtTime(on ? 0.35 : 1, ctx.currentTime, on ? 0.15 : 0.5);
  }

  /**
   * Plays a spoken clip (cloud TTS) from the radio, ducking the music under it.
   * Resolves when the clip ends or fails.
   */
  playVoice(url: string): Promise<void> {
    this.unlock();
    const ctx = this.ctx!;
    if (!this.voiceElement) {
      this.voiceElement = new Audio();
      this.voiceElement.crossOrigin = 'anonymous';
      ctx.createMediaElementSource(this.voiceElement).connect(this.voicePanner!);
    }
    const voice = this.voiceElement;
    voice.src = url;
    this.duck(true);
    return new Promise((resolve) => {
      const done = () => {
        voice.removeEventListener('ended', done);
        voice.removeEventListener('error', done);
        this.duck(false);
        resolve();
      };
      voice.addEventListener('ended', done);
      voice.addEventListener('error', done);
      voice.play().catch(done);
    });
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

  /** The system menu opened: fade the room down, then suspend. */
  suspendForBlur(): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    window.clearTimeout(this.blurTimer);
    this.duckGain.gain.cancelScheduledValues(ctx.currentTime);
    this.duckGain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    this.blurTimer = window.setTimeout(() => void ctx.suspend(), 600);
  }

  resumeFromBlur(): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    window.clearTimeout(this.blurTimer);
    void ctx.resume().then(() => {
      this.duckGain!.gain.cancelScheduledValues(ctx.currentTime);
      this.duckGain!.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    });
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
