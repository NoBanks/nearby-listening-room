// Every fixed line the host can say. tools/build-voicebank.mjs records each of
// them once, so the room can speak these instantly with no network. No imports
// here: the tool loads this file directly.
export const LINES = {
  firstVisit: (greeting: string) => `${greeting} Pinch the glowing record and set it on the turntable.`,
  nudge: 'Reach out and pinch the glowing one.',
  hold: 'Holding it right there.',
  hint: "Pick another, or pinch the radio and I'll choose.",
  backLast: (title: string) => `Welcome back. Last time it was ${title}. Tonight's pick is glowing.`,
  backTonight: (title: string) => `Welcome back. Tonight's pick is ${title}. It's glowing.`,
  thatWas: (title: string) => `That was ${title}.`,
  comingUp: (title: string) => `${title}, coming up.`,
  unheard: (title: string) => `Here's one you haven't heard yet. ${title}.`,
  myPick: (title: string) => `My pick: ${title}.`,
};

export const GREETINGS = ['Late one, huh.', 'Evening.', 'Hey there.'];

/** Every line to record, given the titles and intros on the shelf. */
export function allLines(tracks: readonly { title: string; intro?: string }[]): string[] {
  // Most-heard first: recording is rationed, so the first minutes get a voice first.
  const each = (line: (track: { title: string; intro?: string }) => string) => tracks.map(line);
  return [
    ...GREETINGS.map(LINES.firstVisit),
    LINES.nudge,
    ...each(({ title, intro }) => intro || `${title}.`),
    LINES.hint,
    LINES.hold,
    ...each(({ title }) => LINES.thatWas(title)),
    ...each(({ title }) => LINES.comingUp(title)),
    ...each(({ title }) => LINES.backTonight(title)),
    ...each(({ title }) => LINES.backLast(title)),
    ...each(({ title }) => LINES.unheard(title)),
    ...each(({ title }) => LINES.myPick(title)),
  ];
}
