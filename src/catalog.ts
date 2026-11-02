// The record crate. Everything about a record lives in src/catalog.json, so
// swapping in real tracks or art is a data edit, never a code change.
import raw from './catalog.json';

export interface Track {
  /** Stable slug. Used for history, the featured pick and asset IDs. */
  id: string;
  title: string;
  artist: string;
  /** Relative to the site root (public/), or an absolute https URL. */
  audio: string;
  /** Relative to the site root (public/), or an absolute https URL. Empty: a placeholder sleeve is drawn. */
  art: string;
  /** Length in seconds; drives the tonearm sweep. 0 means unknown. */
  seconds: number;
  /** Words the host matches against requests like "something mellow". */
  moods?: string[];
  /** One short line the scripted host says when the needle drops. */
  intro?: string;
  /** What is on the sleeve, from looking at it. */
  cover?: string;
  /** What the record sounds like, from the artist's own notes. Empty: unknown, so the host must not describe it. */
  sound?: string;
  /** Playback level that brings this master to the shelf's common loudness. */
  gain?: number;
}

export const TRACKS: readonly Track[] = raw as Track[];

export function resolveUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export const coverAssetId = (track: Track): string => `cover-${track.id}`;
