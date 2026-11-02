// Hold-to-talk. The mic is only opened once the listener has said yes on the
// landing card, and only records while the radio is being held.
const MAX_MS = 8000;

export class HostMic {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private cutoff = 0;

  get ready(): boolean {
    return this.stream !== null;
  }

  static get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Must run from a click on the landing card, where the permission prompt can show. */
  async enable(): Promise<boolean> {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      return true;
    } catch {
      return false;
    }
  }

  start(): void {
    if (!this.stream || this.recorder) return;
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (event) => this.chunks.push(event.data);
    this.recorder.start();
    this.cutoff = window.setTimeout(() => this.recorder?.state === 'recording' && this.recorder.stop(), MAX_MS);
  }

  /** Ends the recording and returns the clip. */
  stop(): Promise<Blob | null> {
    window.clearTimeout(this.cutoff);
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder) return Promise.resolve(null);
    // Already cut off at the time limit: what was recorded so far is the clip.
    if (recorder.state === 'inactive') return Promise.resolve(new Blob(this.chunks, { type: recorder.mimeType }));
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      recorder.stop();
    });
  }
}
