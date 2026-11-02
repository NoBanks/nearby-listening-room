import type { RoomAudio } from '../audio.js';
import { resolveUrl } from '../catalog.js';
import bank from './voice-bank.json';

const clips = bank as Record<string, string>;
const LIVE_VOICE_TIMEOUT_MS = 12000;

/**
 * Speaks host lines from the radio. A recorded line plays instantly. A fresh line
 * from the cloud host is voiced live if that comes back in time, otherwise a
 * recorded backup plays and the fresh line stays as the caption. The browser's own
 * voice is used only when switched on (?voice=1 or VITE_HOST_VOICE=1).
 */
export class HostVoice {
  browserVoice: boolean;
  /** Each new line replaces the last, so a slow live voice never talks over a newer one. */
  private turn = 0;

  constructor(
    private readonly audio: RoomAudio,
    private readonly speakEndpoint?: string,
  ) {
    const param = new URLSearchParams(location.search).get('voice');
    this.browserVoice =
      'speechSynthesis' in window && (param === '1' || (param !== '0' && import.meta.env.VITE_HOST_VOICE === '1'));
  }

  async speak(text: string, audioUrl?: string, backup?: string): Promise<void> {
    const turn = ++this.turn;
    if (audioUrl) return this.audio.playVoice(audioUrl);
    const recorded = clips[text];
    if (recorded) return this.audio.playVoice(resolveUrl(recorded));
    const live = await this.liveVoice(text);
    if (turn !== this.turn) {
      if (live) URL.revokeObjectURL(live);
      return;
    }
    if (live) {
      await this.audio.playVoice(live);
      URL.revokeObjectURL(live);
      return;
    }
    if (backup && clips[backup]) return this.audio.playVoice(resolveUrl(clips[backup]));
    if (this.browserVoice) return this.browserSpeak(text);
  }

  private async liveVoice(text: string): Promise<string | null> {
    if (!this.speakEndpoint) return null;
    try {
      const response = await fetch(this.speakEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(LIVE_VOICE_TIMEOUT_MS),
        body: JSON.stringify({ line: text }),
      });
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  }

  private browserSpeak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      const done = () => {
        this.audio.duck(false);
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      speechSynthesis.cancel();
      this.audio.duck(true);
      speechSynthesis.speak(utterance);
    });
  }
}
