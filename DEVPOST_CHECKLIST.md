# Devpost checklist

Meta VR Start Developer Competition 2026. Division: New Experience. Track: Entertainment. Deadline: Wednesday November 18, 2026, 12:00 PM PT. Submit early.

No DEVPOST_DRAFT.md exists in this repo, so every answer below is new. Anything marked [NEED] is a gap only the entrant can fill. Do not guess it.

Style rules for all text: plain direct sentences, no hype, no em dashes, public name NoBanks Nearby, no alcohol or bar references, no identifiable person other than the entrant, no corporate logos, no face, voice or birthday. The author fact is "cinematographer since 2008".

## Form fields

### Project name

Nearby Listening Room

### Tagline (140 characters max)

> A seated, hands-only listening room for Quest. Pinch a record onto the turntable and a radio host talks between songs.

That is 118 characters. Re-count after any edit.

### Track

Entertainment

### Division

New Experience

### Description (about 500 words)

**Inspiration**

I wanted a place to listen to an album that felt like sitting down, not like using an app. Most music apps are a grid of tiles. A record shelf is better. You look along it, pick one up, and put it on. I wanted that to be the whole interface, done with your bare hands, in a space small enough to reach all of it from one chair.

The music is my own. I am NoBanks Nearby, and I have worked as a cinematographer since 2008. I wanted a room where the songs sit in the middle and the room is built to serve them.

**What it does**

You sit down and the room places itself around your head. One record glows on the shelf. You pinch it, carry it to the turntable, and let go. The needle drops and the music comes up from the platter. You can pause by pinching the tonearm or by raising an open palm. You can pinch the radio and the host picks a record for you. The host speaks between songs, with captions, and remembers what you played last time.

Everything is within two feet of you. One hand does every action. There is a hand ray for anything you do not want to reach for, and a flat mode with mouse and keyboard if you have no headset.

**How I built it**

It is a WebXR app built with Meta's Immersive Web SDK, TypeScript and Vite. It runs in Quest Browser and is hosted as a static site. The room is procedural geometry with lighting painted into canvas textures, so there are no model downloads and no realtime lights. The only images are 14 square covers.

Hand input uses pinch select events and a custom open-palm gesture read from the WebXR hand joints. Audio is spatial, with a source at the turntable and a stereo pair either side. Every play, pause and track change is a gain ramp, and the music dips under the host.

The host is a small serverless worker in front of a cloud language model. The worker holds the key, so the site never does. It only knows the facts I wrote for each record and only accepts requests from this site. Common host lines are recorded ahead of time, so they play with no delay. If the model or voice is slow, the room falls back to those recorded lines and never goes quiet. Listening history and short notes about your taste stay in your browser.

**Challenges**

Teaching the pinch without text. The room opens with one glowing record and two fingertips showing the move, and the host adds a single line. Keeping the host honest was the other one. It may only state facts I gave it about a record.

**What I learned**

Constraints helped. A two-foot radius and one hand made me cut everything that was not the music.

**What is next**

[NEED] Ryan to confirm plans. Candidates found in the code and README: more records on the shelf (a data edit in `src/catalog.json`), more of the host's spoken lines, and a Horizon Store package. Do not publish any of these as plans until confirmed.

### Hand-interaction description (optional field)

Every action is a pinch or an open palm, with either hand. Pinch a record within reach to lift it, carry it to the platter and release to play. Pinch from a distance with a hand ray to do the same. Pinch the tonearm, or raise an open palm for about half a second, to pause and resume. Pinch the radio and the host picks a record. Holding the radio and speaking is optional and needs the microphone to be enabled on the landing card. Sleeves, the tonearm and the radio glow when a fingertip is near. No controller is needed, and the whole room sits within about two feet of a seated head.

### Target launch date

[NEED] Ryan to choose. The live site is already public at https://listen.nohumannearby.com.

### Links to provide

- Live site: https://listen.nohumannearby.com
- Code: https://github.com/nobanks/nearby-listening-room (confirm the repo is public before submitting) [NEED]
- Judge guide: JUDGE_QUICKSTART.md in this repo

### Built with (tags)

WebXR, Meta Immersive Web SDK, TypeScript, Three.js, Vite, Web Audio API, serverless worker, cloud language model, GitHub Pages. [NEED] confirm whether product names such as Cloudflare Workers or Gemini should be tagged. The description above avoids brand names on purpose, to follow the no-brand rule.

### Team details

- Team: NoBanks Nearby, solo.
- Legal name (only for fields that require it): Ryan Hammer.
- Public name everywhere else: NoBanks Nearby.
- Team email: [NEED] confirm the contact address to enter on Devpost. Check it is one that is monitored through December.

### Image gallery and cover

[NEED] Choose images. Use real in-headset captures. See the rules below for covers.

### Video (demo)

[NEED] Record and upload. See the checklist.

## Pre-submit checklist

- [ ] Video is under 3 minutes and set to public, with no sign-in needed.
- [ ] Real footage comes first: the first shots are the actual room in a Quest 3 session, not an intro card or a slideshow.
- [ ] Footage shows the hands-only path from cold start: the glowing record, pinch, drop, needle, pause, radio.
- [ ] A satisfying moment lands inside the first minute of the video, and the app is shown to work inside 10 minutes.
- [ ] No faces in any frame, cover, gallery image or thumbnail.
- [ ] No corporate logos or brand names in any image, caption, video or text. Check the Quest UI, browser chrome and system menus in captures.
- [ ] No identifiable person other than the entrant. No voice-over of a real person is required; captions or music alone are fine. [NEED] decide on narration.
- [ ] No alcohol or bar references in the video, text, titles or tags.
- [ ] Every claim in the description is true in the live site today. Spoken requests only work with the microphone enabled.
- [ ] Description is about 500 words and covers inspiration, how it was built, and future plans. Future plans are filled in [NEED].
- [ ] Tagline is 140 characters or fewer.
- [ ] Track is Entertainment and division is New Experience.
- [ ] Target launch date entered [NEED].
- [ ] Team email entered and monitored [NEED].
- [ ] Legal name used only where required; public name elsewhere.
- [ ] Repo is public, the license is clear, and no key or secret is in it. README credits section has its [NEED] license items resolved.
- [ ] Open the live URL on a real Quest 3 or 3S one last time: Enter the room, play a record, pause, radio, then flat mode.
- [ ] Submit before the deadline: Wed Nov 18, 2026, 12:00 PM PT. Ryan plans to submit early.
- [ ] After submitting, freeze the site. Do not push to `main`, because the Pages workflow deploys every push. Do not change the host service, repo variables or worker until winners are announced (about Dec 11).
