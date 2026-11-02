// The local host: no network, no keys, always available. It is also the
// fallback whenever the cloud host is missing, slow or failing. Everything it
// says is in lines.ts, so all of it has a recorded voice.
import { TRACKS, type Track } from '../catalog.js';
import type { HostContext, HostOutput, HostReply, RadioHost } from './host.js';
import { GREETINGS, LINES } from './lines.js';

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function greeting(hour: number): string {
  if (hour >= 22 || hour < 4) return GREETINGS[0];
  if (hour >= 18) return GREETINGS[1];
  return GREETINGS[2];
}

export class ScriptedHost implements RadioHost {
  private toldAboutRadio = false;

  constructor(private readonly output: HostOutput) {}

  async say(text: string, audioUrl?: string, backup?: string): Promise<void> {
    this.output.caption(text);
    await this.output.speak?.(text, audioUrl, backup);
  }

  onColdStart(context: HostContext): void {
    if (context.firstVisit) {
      void this.say(LINES.firstVisit(greeting(context.hour)));
      return;
    }
    const last = context.lastPlayed;
    if (last && last.id !== context.featured.id) void this.say(LINES.backLast(last.title));
    else void this.say(LINES.backTonight(context.featured.title));
  }

  onTrackStart(track: Track): void {
    void this.say(track.intro || `${track.title}.`);
  }

  async onTrackEnd(track: Track): Promise<HostReply> {
    await this.say(LINES.thatWas(track.title));
    if (!this.toldAboutRadio) {
      this.toldAboutRadio = true;
      await this.say(LINES.hint);
    }
    return {};
  }

  async onRequest(text: string, context: HostContext): Promise<HostReply> {
    const asked = normalise(text);
    if (/\b(pause|stop|hold|quiet)\b/.test(asked)) return { action: 'pause', line: LINES.hold };
    if (/\b(resume|continue|unpause|keep going)\b/.test(asked)) return { action: 'resume' };

    // A title, or most of one.
    const byTitle = TRACKS.find((t) => asked && (normalise(t.title).includes(asked) || asked.includes(normalise(t.title))));
    if (byTitle) return { play: byTitle.id, line: LINES.comingUp(byTitle.title) };

    // A mood word.
    const words = asked.split(' ');
    const moody = TRACKS.filter((t) => t.moods?.some((m) => words.includes(m)));
    if (moody.length) {
      const pick = this.leastRecent(moody, context);
      return { play: pick.id, line: pick.intro || LINES.comingUp(pick.title) };
    }

    // Anything else: the host's choice.
    const pick = this.leastRecent(TRACKS, context);
    if (!context.recent.includes(pick.id)) return { play: pick.id, line: LINES.unheard(pick.title) };
    return { play: pick.id, line: LINES.myPick(pick.title) };
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
