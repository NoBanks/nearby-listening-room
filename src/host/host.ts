// The radio host: the voice of the room. Any host (the local scripted one, or
// a cloud LLM later) implements this one interface, and the room only ever
// talks to it through these calls.
import type { Track } from '../catalog.js';

/** What the host knows about this listener when it decides what to say. */
export interface HostContext {
  /** Never been in the room before (no listening history). */
  firstVisit: boolean;
  /** The record played most recently in an earlier visit, if any. */
  lastPlayed?: Track;
  /** Tonight's featured record. */
  featured: Track;
  /** Total records played across all visits. */
  totalPlays: number;
  /** Track IDs, most recent first. */
  recent: readonly string[];
  /** Local hour 0 to 23. */
  hour: number;
}

/** A host's answer to a request. Every field is optional. */
export interface HostReply {
  /** A line to say. */
  line?: string;
  /** A track ID to put on the turntable. */
  play?: string;
  /** Pause or resume what is playing. */
  action?: 'pause' | 'resume';
}

/** Where the host's words go: captions always, a voice when one is available. */
export interface HostOutput {
  /** Caption the line. Captions are on by default. */
  caption(text: string): void;
  /** Speak the line from the radio. Resolves when finished. Optional. */
  speak?(text: string, audioUrl?: string): Promise<void>;
}

export interface RadioHost {
  /** Say a line: always captioned, spoken if a voice is available. */
  say(text: string, audioUrl?: string): Promise<void>;
  /** The listener has just arrived. Says one short welcome and hint line. */
  onColdStart(context: HostContext): void;
  /** The needle has dropped on `track`. */
  onTrackStart(track: Track, context: HostContext): void;
  /** `track` played to its end. */
  onTrackEnd(track: Track, context: HostContext): void;
  /** A free-text request ("surprise me", "something mellow", a title). */
  onRequest(text: string, context: HostContext): Promise<HostReply>;
}
