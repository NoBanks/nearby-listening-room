# Judge quickstart

Nearby Listening Room is a seated, hands-only listening room for Meta Quest 3 and 3S. The music is by NoBanks Nearby. This page tells you what to do in the first minute. Everything here is read from the code. Anything the code does not do is marked [NEED].

Live site: https://listen.nohumannearby.com

## Before you start

- Sit down. The room places itself around your head when the session starts, so any seat height works.
- Put the headset on and turn on hand tracking in the Quest settings. No controller is needed.
- Turn the volume up a little. The record plays from the turntable in front of you, and the host speaks from the radio on your left.

## Open it on a Quest 3 or 3S

1. Open Quest Browser and go to `https://listen.nohumannearby.com`.
2. Wait for the landing card. The buttons are disabled for a moment while the room loads, then enable.
3. Press **Enter the room**. The browser asks for permission to start an immersive session. Accept.
4. If **Enter the room** does not show, the browser reports no immersive support. Use **Listen on this screen** instead (see Fallbacks).

The optional microphone button, **Talk to the host**, is on the landing card. Skip it if you prefer. Everything works without it.

## Your first 60 seconds

The room opens dark with one glowing record, two fingertips showing the pinch, and a short captioned line from the host.

1. **Pinch the glowing record.** Reach out, bring your thumb and index finger together on the sleeve, and lift it off the shelf. A sleeve glows when your fingertip is within about 16 cm.
2. **Carry it to the turntable.** It sits straight ahead, about 0.4 m away. The platter ring lights while the record is held over it.
3. **Let go over the platter.** The needle drops, the record spins, the music comes up from the turntable, and the host says a short line.
4. **Pause.** Do either of these, with either hand:
   - Pinch the tonearm. Pinch again to resume.
   - Raise an open palm, fingers up and palm facing away from you, and hold it for about half a second. Do it again to resume.
5. **Let the host pick.** Pinch the radio on the left of the desk. The host chooses a record and puts it on.
6. **Talk to the host (optional).** Only if you pressed **Talk to the host** on the landing card and accepted the microphone prompt: press and hold the pinch on the radio, speak for up to 8 seconds, then let go. A quick pinch under half a second is a normal radio pinch, not a spoken request. The button only appears when the live site can reach its host service and the browser supports recording.

If you do nothing for 25 seconds, the host says one quiet nudge: "Reach out and pinch the glowing one."

## What you should see and hear

- A dim room, one glowing record on the shelf, and captions low in your view.
- The shelf holds 14 records, two rows of seven.
- Music from the turntable with a smooth fade in and out. The music dips under the host's voice.
- A host line when the needle drops, and another between songs.
- The tonearm sweeps across the record as the track plays.

If the host's live voice is slow or unavailable, the room falls back to recorded lines, so it does not go silent.

## Accessibility and fallbacks that exist in the code

- **Captions** are on by default. In the headset they sit low in view and follow your head slowly. In the flat view they are text on the page. The setting is saved in your browser.
- **Ray selection.** If you do not want to reach, point a hand ray at a record, the tonearm or the radio and pinch. It does the same thing as carrying the record over. Controllers also work but are never required.
- **One hand is enough.** Every action works with a single hand, either hand.
- **Flat mode.** Press **Listen on this screen**, or add `?flat` to the URL. No headset is needed.

| Action | Flat mode |
| --- | --- |
| Play a record | Click it on the shelf |
| Pause or resume | Click the playing record or the tonearm, or press Space |
| Let the host pick | Click the radio, or press H |
| Ask the host | Type a title, a mood, or "surprise me" in the box |
| Captions on or off | The Captions button, or press C |

Not in the code: a left-handed mode switch, adjustable caption size, or a seated-height setting. The room recenters on its own at session start. [NEED] if any of these are claimed anywhere.

## Privacy, in short

- Your listening history and short notes about your taste stay in your browser (localStorage). Clear site data to reset the room.
- What you type or say to the host is sent to a cloud language model through a small service so it can answer. The landing card says this. A spoken clip is only sent while you hold the radio, and the room does not keep it.

## Run it locally from a fresh clone

Needs Node 20.19 or newer (the repo pins its version in `.nvmrc`).

```
git clone https://github.com/nobanks/nearby-listening-room.git
cd nearby-listening-room
npm ci
npm run typecheck
npm run dev
```

`npm run dev` starts the dev server at `https://localhost:8081`. Accept the local certificate warning. `npm run build` writes a static site to `dist/`.

A local build has no host service set, so it uses the offline scripted host: the same captions and recorded voice lines, no live model, and no spoken requests.

### With the Immersive Web Emulator

The dev server injects an emulator on localhost and emulates a Quest 3 for you. If you serve the built site yourself (`npm run build`, then `npm run preview`), the emulator is not bundled. Instead:

1. Install Meta's **Immersive Web Emulator** browser extension in Chrome or Edge.
2. Open the local URL, open the extension panel, and pick a Quest 3 device.
3. Switch the emulated input to hands.
4. Press **Enter the room**.

The README has command-line steps for driving the emulated hands (`npx @iwsdk/cli xr ...`). The emulator checks the layout and the interaction logic. It cannot show how the room feels on a real Quest 3, so judge pose and comfort on the headset.

## Quick issues

- No **Enter the room** button: the browser has no immersive support. Use Quest Browser, or flat mode.
- No sound: the first pinch or click unlocks audio. Pinch once, then try again.
- Hands do not register: confirm hand tracking is on in Quest settings, and that the controllers are set down.
- Reset the room: clear site data for the live URL, or use a private window.
