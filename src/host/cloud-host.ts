// ============================================================================
// CLOUD LLM + TTS ADAPTER (not active until configured)
// ============================================================================
// Swap the scripted host for a cloud one by setting, at build time:
//
//   VITE_HOST_ENDPOINT=https://your-host-proxy.example.com/host
//
// The browser never holds an API key. VITE_ variables are baked into the
// public bundle, so the endpoint must be a small server you own (a serverless
// function is enough) that keeps the LLM and TTS keys in ITS environment and
// forwards to the providers. Put local values in .env.local (git-ignored);
// never commit keys.
//
// Request (POST, JSON):
//   { "event": "cold_start" | "track_start" | "track_end" | "request",
//     "text"?: string, "track"?: Track, "context": HostContext,
//     "catalog": [{ id, title, moods }] }
// Response (JSON), every field optional:
//   { "line": string, "audioUrl": string, "play": trackId,
//     "action": "pause" | "resume" }
//
// `audioUrl` is a TTS clip for `line` (an https or data: URL). It plays from
// the radio with the music ducked under it. Without it the line is captioned
// (and spoken by the browser voice if that is switched on).
//
// Any timeout, network error or bad reply falls back to the scripted host for
// that one call, so the room never goes silent.
// ============================================================================
import { TRACKS, type Track } from '../catalog.js';
import type { HostContext, HostOutput, HostReply, RadioHost } from './host.js';
import { ScriptedHost } from './scripted-host.js';

const TIMEOUT_MS = 4000;

type HostEvent = 'cold_start' | 'track_start' | 'track_end' | 'request';

interface CloudReply extends HostReply {
  audioUrl?: string;
}

export class CloudHost implements RadioHost {
  private readonly fallback: ScriptedHost;

  constructor(
    private readonly endpoint: string,
    private readonly output: HostOutput,
  ) {
    this.fallback = new ScriptedHost(output);
  }

  async say(text: string, audioUrl?: string): Promise<void> {
    this.output.caption(text);
    await this.output.speak?.(text, audioUrl);
  }

  onColdStart(context: HostContext): void {
    void this.ask('cold_start', context).then((reply) => (reply?.line ? this.speakReply(reply) : this.fallback.onColdStart(context)));
  }

  onTrackStart(track: Track, context: HostContext): void {
    void this.ask('track_start', context, { track }).then((reply) =>
      reply?.line ? this.speakReply(reply) : this.fallback.onTrackStart(track, context),
    );
  }

  onTrackEnd(track: Track, context: HostContext): void {
    void this.ask('track_end', context, { track }).then((reply) =>
      reply?.line ? this.speakReply(reply) : this.fallback.onTrackEnd(track),
    );
  }

  async onRequest(text: string, context: HostContext): Promise<HostReply> {
    const reply = await this.ask('request', context, { text });
    if (!reply) return this.fallback.onRequest(text, context);
    if (reply.play && !TRACKS.some((t) => t.id === reply.play)) delete reply.play;
    // The room says `line`; an attached clip is spoken here so it matches.
    if (reply.audioUrl && reply.line) {
      void this.say(reply.line, reply.audioUrl);
      return { play: reply.play, action: reply.action };
    }
    return reply;
  }

  private speakReply(reply: CloudReply): void {
    void this.say(reply.line!, reply.audioUrl);
  }

  private async ask(event: HostEvent, context: HostContext, extra: { track?: Track; text?: string } = {}): Promise<CloudReply | null> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          event,
          ...extra,
          context: {
            ...context,
            lastPlayed: context.lastPlayed?.id,
            featured: context.featured.id,
          },
          catalog: TRACKS.map(({ id, title, moods }) => ({ id, title, moods })),
        }),
      });
      if (!response.ok) return null;
      const reply = (await response.json()) as CloudReply;
      return reply && typeof reply === 'object' ? reply : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }
}
