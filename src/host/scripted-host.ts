// The local host: no network, no keys, always available. It is also the
// fallback whenever the cloud host is missing, slow or failing.
import { TRACKS, type Track } from '../catalog.js';
import type { HostContext, HostOutput, HostReply, RadioHost } from './host.js';

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function partOfNight(hour: number): string {
  if (hour >= 22 || hour < 4) return 'late';
  if (hour >= 18) return 'evening';
  if (hour >= 12) return 'afternoon';
  return 'early';
}

export class ScriptedHost implements RadioHost {
  private plays = 0;
  private toldAboutRadio = false;
  private lastStart = '';

  constructor(private readonly output: HostOutput) {}

  async say(text: string, audioUrl?: string): Promise<void> {
    this.output.caption(text);
    await this.output.speak?.(text, audioUrl);
  }

  onColdStart(context: HostContext): void {
    if (context.firstVisit) {
      const greeting = partOfNight(context.hour) === 'late' ? 'Late one, huh.' : 'Evening.';
      void this.say(`${greeting} Pinch the glowing record and set it on the turntable.`);
      return;
    }
    const last = context.lastPlayed;
    if (last && last.id !== context.featured.id) {
      void this.say(`Welcome back. Last time it was ${last.title}. Tonight's pick is glowing.`);
    } else {
      void this.say(`Welcome back. Tonight's pick is ${context.featured.title}. It's glowing.`);
    }
  }

  onTrackStart(track: Track, context: HostContext): void {
    this.plays++;
    const intro = track.intro || `${track.title}.`;
    let line = `${intro} ${track.artist}.`;
    if (this.lastStart && this.lastStart !== track.id && this.plays % 3 === 0) {
      const previous = TRACKS.find((t) => t.id === this.lastStart);
      if (previous) line = `After ${previous.title}, here's ${track.title}. ${track.artist}.`;
    }
    if (track.id === context.featured.id && this.plays === 1) line = `Tonight's pick. ${line}`;
    this.lastStart = track.id;
    void this.say(line);
  }

  onTrackEnd(track: Track): void {
    if (!this.toldAboutRadio) {
      this.toldAboutRadio = true;
      void this.say(`That was ${track.title}. Pick another, or pinch the radio and I'll choose.`);
      return;
    }
    void this.say(`That was ${track.title}.`);
  }

  async onRequest(text: string, context: HostContext): Promise<HostReply> {
    const asked = normalise(text);
    if (/\b(pause|stop|hold|quiet)\b/.test(asked)) return { action: 'pause', line: 'Holding it right there.' };
    if (/\b(resume|continue|unpause|keep going)\b/.test(asked)) return { action: 'resume' };

    // A title, or most of one.
    const byTitle = TRACKS.find((t) => asked && (normalise(t.title).includes(asked) || asked.includes(normalise(t.title))));
    if (byTitle) return { play: byTitle.id, line: `${byTitle.title}, coming up.` };

    // A mood word.
    const words = asked.split(' ');
    const moody = TRACKS.filter((t) => t.moods?.some((m) => words.includes(m)));
    if (moody.length) {
      const pick = this.leastRecent(moody, context);
      return { play: pick.id, line: `Something ${moody[0].moods!.find((m) => words.includes(m))}. ${pick.title}.` };
    }

    // Anything else: the host's choice.
    const pick = this.leastRecent(TRACKS, context);
    if (!context.recent.includes(pick.id)) return { play: pick.id, line: `Here's one you haven't heard yet. ${pick.title}.` };
    const line = context.totalPlays % 2 ? `My pick: ${pick.title}.` : `Been a while for this one. ${pick.title}.`;
    return { play: pick.id, line };
  }

  /** Prefer what this listener has not heard, then what they heard longest ago. */
  private leastRecent(pool: readonly Track[], context: HostContext): Track {
    const playing = context.recent[0];
    const unheard = pool.filter((t) => !context.recent.includes(t.id));
    if (unheard.length) return unheard[(context.totalPlays + context.hour) % unheard.length];
    let best = pool[0];
    let bestRank = -1;
    for (const track of pool) {
      if (track.id === playing && pool.length > 1) continue;
      const rank = context.recent.indexOf(track.id);
      if (rank > bestRank) {
        bestRank = rank;
        best = track;
      }
    }
    return best;
  }
}
