// ============================================================================
// THE CLOUD AGENT (active when VITE_HOST_ENDPOINT is set at build time)
// ============================================================================
// VITE_HOST_ENDPOINT is the base URL of worker/host.js. The browser never holds
// an API key: the worker keeps it and forwards to the model.
//
// POST {endpoint}/host, JSON:
//   { "event": "cold_start" | "track_end" | "request",
//     "text"?: string, "audio"?: base64, "mime"?: string,
//     "track"?: trackId, "context": HostContext (IDs only) }
// Response JSON, every field optional:
//   { "line": string, "play": trackId, "action": "pause" | "resume", "heard": string }
//
// POST {endpoint}/speak, JSON { "line": string }: an audio clip of the line.
//
// The agent decides when the listener asks for something, when a record ends and
// what it says to someone coming back. Teaching lines and needle-drop intros stay
// recorded, so they are instant and always work. Any timeout, network error or bad
// reply falls back to the scripted host for that one call: the room never goes silent.
// ============================================================================
import { TRACKS, type Track } from '../catalog.js';
import type { HostContext, HostOutput, HostReply, RadioHost } from './host.js';
import { LINES } from './lines.js';
import { ScriptedHost } from './scripted-host.js';

const TIMEOUT_MS = 4000;
const SPOKEN_TIMEOUT_MS = 8000;

type HostEvent = 'cold_start' | 'track_end' | 'request';

const titleOf = (id?: string): string | undefined => TRACKS.find((t) => t.id === id)?.title;

export class CloudHost implements RadioHost {
  private readonly fallback: ScriptedHost;

  constructor(
    private readonly endpoint: string,
    private readonly output: HostOutput,
  ) {
    this.fallback = new ScriptedHost(output);
  }

  async say(text: string, audioUrl?: string, backup?: string): Promise<void> {
    this.output.caption(text);
    await this.output.speak?.(text, audioUrl, backup);
  }

  onColdStart(context: HostContext): void {
    if (context.firstVisit) {
      this.fallback.onColdStart(context);
      return;
    }
    void this.ask('cold_start', context).then((reply) => {
      if (reply?.line) void this.say(reply.line, undefined, LINES.backTonight(context.featured.title));
      else this.fallback.onColdStart(context);
    });
  }

  onTrackStart(track: Track): void {
    this.fallback.onTrackStart(track);
  }

  async onTrackEnd(track: Track, context: HostContext): Promise<HostReply> {
    const reply = await this.ask('track_end', context, { track: track.id });
    return this.valid(reply) ?? this.fallback.onTrackEnd(track);
  }

  async onRequest(text: string, context: HostContext): Promise<HostReply> {
    const reply = await this.ask('request', context, { text });
    return this.valid(reply) ?? this.fallback.onRequest(text, context);
  }

  async onSpoken(audio: Blob, context: HostContext): Promise<HostReply | null> {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(audio);
    });
    const reply = await this.ask('request', context, { audio: base64, mime: audio.type }, SPOKEN_TIMEOUT_MS);
    // One wait is enough: a second trip to a slow worker would only add dead air.
    return this.valid(reply) ?? this.fallback.onRequest('surprise me', context);
  }

  /** A recorded line to say if a fresh line about this reply cannot be voiced in time. */
  backupFor(reply: HostReply): string | undefined {
    const title = titleOf(reply.play);
    return title ? LINES.comingUp(title) : undefined;
  }

  private valid(reply: HostReply | null): HostReply | null {
    if (!reply || (!reply.line && !reply.play && !reply.action)) return null;
    if (reply.play && !TRACKS.some((t) => t.id === reply.play)) delete reply.play;
    return reply;
  }

  private async ask(
    event: HostEvent,
    context: HostContext,
    extra: { track?: string; text?: string; audio?: string; mime?: string } = {},
    timeout = TIMEOUT_MS,
  ): Promise<HostReply | null> {
    try {
      const response = await fetch(`${this.endpoint}/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({
          event,
          ...extra,
          context: { ...context, lastPlayed: context.lastPlayed?.id, featured: context.featured.id },
        }),
      });
      if (!response.ok) return null;
      const reply = (await response.json()) as HostReply;
      return reply && typeof reply === 'object' ? reply : null;
    } catch {
      return null;
    }
  }
}
