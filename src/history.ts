// Listening history, kept in this browser only (localStorage). The cloud host gets
// it with each request and keeps nothing. Every read and write tolerates storage
// being unavailable.
import type { Track } from './catalog.js';

const KEY = 'nlr.history.v1';
const MAX_PLAYS = 300;
const MAX_NOTES = 6;
/** Nights roll over at 6 am local, so a session past midnight is still "tonight". */
const NIGHT_STARTS_HOUR = 6;

interface Play {
  id: string;
  at: number;
}

interface Stored {
  plays: Play[];
  visits: number;
  lastVisit: number;
  notes: string[];
}

export class ListeningHistory {
  private data: Stored = { plays: [], visits: 0, lastVisit: 0, notes: [] };
  /** Snapshot taken when the room opened, before this visit's plays. */
  readonly previousLast: string | undefined;
  readonly firstVisit: boolean;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        if (Array.isArray(parsed.plays)) {
          this.data.plays = parsed.plays.filter((p) => p && typeof p.id === 'string' && typeof p.at === 'number');
        }
        this.data.visits = Number(parsed.visits) || 0;
        this.data.lastVisit = Number(parsed.lastVisit) || 0;
        if (Array.isArray(parsed.notes)) this.data.notes = parsed.notes.filter((n) => typeof n === 'string');
      }
    } catch {
      // Corrupt or blocked: start fresh.
    }
    this.firstVisit = this.data.plays.length === 0;
    this.previousLast = this.data.plays[this.data.plays.length - 1]?.id;
    this.data.visits++;
    this.data.lastVisit = Date.now();
    this.save();
  }

  get totalPlays(): number {
    return this.data.plays.length;
  }

  get visits(): number {
    return this.data.visits;
  }

  recordPlay(id: string): void {
    this.data.plays.push({ id, at: Date.now() });
    if (this.data.plays.length > MAX_PLAYS) this.data.plays.splice(0, this.data.plays.length - MAX_PLAYS);
    this.save();
  }

  /** What the host has kept about this listener, newest first. */
  get notes(): readonly string[] {
    return this.data.notes;
  }

  remember(note: string): void {
    this.data.notes = [note, ...this.data.notes.filter((n) => n !== note)].slice(0, MAX_NOTES);
    this.save();
  }

  /** Distinct track IDs, most recently played first. */
  recentIds(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = this.data.plays.length - 1; i >= 0; i--) {
      const id = this.data.plays[i].id;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Quota or private mode: history lasts this visit only.
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Which night it is, as a whole number that ticks over at 6 am local time. */
export function nightNumber(date: Date): number {
  const shifted = new Date(date.getTime() - NIGHT_STARTS_HOUR * 3600 * 1000);
  return Math.floor(Date.UTC(shifted.getFullYear(), shifted.getMonth(), shifted.getDate()) / 86400000);
}

/**
 * Tonight's featured record: the same all night for everyone, different the
 * next night. Never the record this listener played last, so a returning
 * listener always finds something new glowing.
 */
export function featuredTrack(tracks: readonly Track[], date: Date, lastPlayed?: string): Track {
  // A first visit always opens on the record chosen to teach the room.
  if (!lastPlayed) return tracks[0];
  let h = nightNumber(date) * 2654435761;
  h = (h ^ (h >>> 16)) >>> 0;
  let index = h % tracks.length;
  if (tracks.length > 1 && tracks[index].id === lastPlayed) index = (index + 1) % tracks.length;
  return tracks[index];
}

/**
 * Shelf order, best slot first: tonight's featured record, then this
 * listener's most recent plays, then everything else in catalog order.
 * Returns catalog indices.
 */
export function shelfOrder(tracks: readonly Track[], featured: Track, recent: readonly string[]): number[] {
  const order: number[] = [];
  const add = (index: number) => {
    if (index >= 0 && !order.includes(index)) order.push(index);
  };
  add(tracks.indexOf(featured));
  for (const id of recent) add(tracks.findIndex((t) => t.id === id));
  tracks.forEach((_, index) => add(index));
  return order;
}
