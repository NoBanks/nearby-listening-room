# Nearby Listening Room

A seated, hands-only listening room for Meta Quest. Reach out, pinch a record off the shelf, set it on the turntable, and the room comes up around the music of NoBanks Nearby. A late-night radio host keeps you company.

Built for the Meta VR Start Developer Competition 2026 (Entertainment, New Experience) with Meta's Immersive Web SDK (IWSDK).

## How it works

- **Hands first.** Pinch a record within reach and carry it to the platter, or pinch from a distance with a hand ray. No controller needed. One hand does everything.
- **Pause like a person.** Pinch the tonearm, or raise an open palm toward the room. Do it again to resume.
- **Ask the radio.** Pinch the radio on the left of the desk and the host picks a record for you and puts it on.
- **Teaches without text.** The room opens dark with one glowing record, two fingertips showing the pinch, and a single captioned line from the host.
- **Spatial sound.** The record sounds from the turntable, with the stereo pair either side of it keeping the mix wide. The host speaks from the radio and the music dips under the voice.
- **Something to come back for.** The room remembers what you played. The shelf puts your recent records in your eyeline, and each night a different featured record glows.
- **Fits any seat.** The room places itself around your head when the session starts.

## Run it

```
npm install
npm run dev
```

Node 20.19 or newer. `npm run dev` starts the IWSDK managed dev server at `https://localhost:8081` (accept the local certificate warning) and opens a managed browser window. `npm run build` writes a static site to `dist/`, which is what GitHub Pages serves.

To try it on a Quest on the same Wi-Fi, run `npx @iwsdk/cli dev status`, open one of the `runtimeUrls.network` addresses in the Quest browser, accept the certificate warning, and press **Enter the room**.

## Test on a desktop

### In the WebXR emulator (IWER)

IWER is IWSDK's in-browser XR emulator. The dev server injects it automatically on localhost and emulates a Quest 3 (set in `iwsdk.config.json` under `dev.emulator`), so a normal desktop browser can run the immersive session.

1. `npm run dev`, then open `https://localhost:8081`.
2. Press **Enter the room**. The emulator's overlay appears.
3. Switch the emulated input to hands to test the hands-only path. In the managed window you can also drive it from the CLI, for example:

   ```
   npx @iwsdk/cli xr enter --input-json '{}'
   npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
   npx @iwsdk/cli xr run-sequence --input-json '{"device":"hand-right","steps":[{"target":"Wildflowers","approach":{"distance":0.06},"pinch":{"value":1,"at":"arrival"}},{"target":"Tonearm","depart":{"distance":0.08}},{"pinch":0,"duration":0.2}]}'
   npx @iwsdk/cli xr run-sequence --input-json '{"device":"hand-left","steps":[{"target":"Radio","pinch":{"value":1,"at":"arrival"}},{"pinch":0,"duration":0.2}]}'
   ```

   `npx @iwsdk/cli xr list-targets` lists every record by title, plus `Tonearm` and `Radio`.

For the deployed build (GitHub Pages), IWER is not bundled. Install Meta's **Immersive Web Emulator** browser extension, open the site, pick a Quest device in the extension panel and press **Enter the room**. See [Testing Your Experience](https://iwsdk.dev/guides/02-testing-experience.html).

### In the flat view (no XR)

Press **Listen on this screen**, or add `?flat` to the URL to skip the landing card. Everything works with a mouse and keyboard:

| Action | Flat view |
| --- | --- |
| Play a record | Click it on the shelf |
| Pause or resume | Click the playing record or the tonearm, or press Space |
| Let the host pick | Click the radio, or press H |
| Ask the host for something | Type a title, a mood ("something mellow") or "surprise me" in the box |
| Captions on or off | The Captions button, or press C |

Add `?voice=1` to hear host lines in the browser's own speech voice (captions stay on either way).

## Swap in real tracks and art

Everything about a record lives in `src/catalog.json`. Changing records is a data edit, never a code change:

```json
{
  "id": "wildflowers",
  "title": "Wildflowers",
  "artist": "NoBanks Nearby",
  "audio": "catalog/audio/wildflowers.mp3",
  "art": "catalog/covers/wildflowers.jpg",
  "seconds": 187,
  "moods": ["bright", "easy"],
  "intro": "Wildflowers. Growing where nobody planted them."
}
```

- `audio` and `art` are paths under `public/` (or full https URLs). Drop the files in `public/catalog/audio` and `public/catalog/covers` and point the entry at them.
- Covers are square; 512 by 512 JPEG keeps texture memory low on Quest.
- Leave `art` empty (`""`) and the room draws a placeholder sleeve with the title.
- `seconds` drives the tonearm's sweep across the record. `0` means "read it from the file".
- `moods` are the words the host matches when someone asks for "something jazz" or "something slow".
- `intro` is the host's line when the needle drops. Optional.
- The shelf holds two rows; column count follows the number of records (16 today, 8 per row).

`tools/prepare-catalog.mjs` is the artist's local script that encodes masters and art into `public/catalog` and rewrites `src/catalog.json`, keeping the hand-written `moods` and `intro` fields.

## The radio host

The host lives in `src/host/` behind one interface (`src/host/host.ts`):

- `say(text)` captions a line, and speaks it if a voice is available
- `onColdStart(context)` greets the listener with one line
- `onTrackStart(track, context)` and `onTrackEnd(track, context)`
- `onRequest(text, context)` answers a request with a line, a record to play, or pause/resume

`ScriptedHost` (`src/host/scripted-host.ts`) runs entirely offline and is the default. `CloudHost` (`src/host/cloud-host.ts`) is the marked adapter for a cloud LLM and TTS. It is switched on by setting `VITE_HOST_ENDPOINT` at build time (see `.env.example`) to a small proxy you run. The proxy holds the LLM and TTS keys in its own environment; no key is ever in this repo or in the browser bundle. Any timeout or error falls back to the scripted host for that call, so the room never goes silent. The request and response shapes are documented at the top of `cloud-host.ts`.

## Performance notes

Quest-class budget: unlit `MeshBasicMaterial` throughout with lighting painted into canvas textures, no realtime lights or shadows, static pieces that share a material batched into one draw call, invisible hit targets that are never drawn, and no per-frame allocation in the systems.

## Contest rules checklist

| Rule | Where it is satisfied |
| --- | --- |
| Hands first, completable without a controller | `OneHandGrabbable` records with pinch-to-grab (`src/listening-system.ts`, `buildRecords`); tonearm pinch and radio pinch (`onSelectStart`, `onTonearm`, `onRadio`); open-palm pause read from WebXR hand joints (`src/hand-gestures.ts`). `handTracking: true` in `iwsdk.config.json`. Controllers also work but are never required. |
| One hand is enough | Every action (pick up, carry, drop, pause, resume, ask the host) is a single-hand pinch or palm, either hand. |
| Grab affordances glow when a hand is near | `updateAffordances` in `src/listening-system.ts`: the sleeve nearest each fingertip glows within 16 cm, the tonearm and radio glow on approach, the platter ring lights while a record is held over it. Mouse hover gets the same glow in the flat view. |
| Seated, everything within a two-foot radius | Room authored in seated coordinates around the head (`src/room.ts`): shelf radius 0.58 m, turntable 0.4 m ahead, radio 0.6 m to the left; every interactive piece is within 0.61 m of the head. `placeInWorld` and `recenter` fit it to the real head position. `locomotion: false`. |
| Fast cold start | No 3D model downloads: all geometry is procedural and textures are canvas-drawn, except 16 small cover JPEGs. Audio streams on demand. |
| A complete, satisfying moment under 10 minutes | Pinch the glowing record, set it down, the needle drops and the room warms up within the first minute; a full track is 2 to 3 minutes. |
| First five minutes: one glowing record, one-line hint, no text walls | Teaching cue in `buildCue` and the update loop; welcome line in `ScriptedHost.onColdStart`; one quiet nudge after 25 s if nothing has been picked up. |
| Captions on by default | `src/captions.ts`: on unless the listener turns them off; lazy-follow subtitles in the headset, DOM text in the flat view. |
| Spatial audio at the turntable, smooth fades | `src/audio.ts`: HRTF panners with a source at the platter and the stereo pair either side; every play, pause, track change and system blur is a gain ramp, never a hard stop. |
| Reason to come back | `src/history.ts`: listening history in localStorage, shelf ordered by recent plays, a featured record that rotates nightly, and a host that welcomes you back by your last record. |
| Agentic interaction | Pinch the radio and the host chooses a record from your history and the time of night and plays it; requests by title or mood in the flat view; a cloud LLM can drop in behind the same interface. |
| Original, not a wrapper; no third-party media | All music and art is NoBanks Nearby's own catalog in `public/catalog`. No embeds, no streaming services. |
| All code new after Sep 24, 2026 | Repository history starts with the scaffold commit; everything since is new work for this entry. |
| No API keys in the repo | Cloud host reads only `VITE_HOST_ENDPOINT` (a proxy URL) from the environment; `.env*` files are git-ignored. |

## License

Code is MIT. The music and cover art in `public/catalog` are all rights reserved by NoBanks Nearby. See `LICENSE`.
