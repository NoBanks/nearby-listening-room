import type { RoomAudio } from '../audio.js';

/**
 * Speaks host lines. A cloud TTS clip plays spatially from the radio. Without
 * one, the browser's own voice is used only when switched on (?voice=1 or
 * VITE_HOST_VOICE=1); otherwise the line is captions only.
 */
export class HostVoice {
  browserVoice: boolean;

  constructor(private readonly audio: RoomAudio) {
    const param = new URLSearchParams(location.search).get('voice');
    this.browserVoice =
      'speechSynthesis' in window && (param === '1' || (param !== '0' && import.meta.env.VITE_HOST_VOICE === '1'));
  }

  speak(text: string, audioUrl?: string): Promise<void> {
    if (audioUrl) return this.audio.playVoice(audioUrl);
    if (!this.browserVoice) return Promise.resolve();
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
