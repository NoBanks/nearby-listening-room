import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { hostEndpoint } from './host/create-host.js';
import { HostMic } from './host/mic.js';
import { ListeningSystem } from './listening-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(ListeningSystem);
  const room = world.getSystem(ListeningSystem)!;

  const landing = document.getElementById('landing')!;
  const enter = document.getElementById('enter') as HTMLButtonElement;
  const flat = document.getElementById('flat') as HTMLButtonElement;
  enter.disabled = false;
  flat.disabled = false;

  // Optional and off until asked for: the permission prompt only works out here.
  const micRow = document.getElementById('microw')!;
  const mic = document.getElementById('mic') as HTMLButtonElement;
  micRow.hidden = !(hostEndpoint && HostMic.supported && navigator.xr);
  mic.addEventListener('click', async () => {
    const on = await room.mic.enable();
    mic.textContent = on ? 'The host can hear you when you hold the radio' : 'No microphone. You can still pinch the radio.';
    mic.disabled = true;
  });

  const flatbar = document.getElementById('flatbar') as HTMLFormElement;
  const ask = document.getElementById('ask') as HTMLInputElement;
  const cc = document.getElementById('cc') as HTMLButtonElement;

  const leave = () => {
    landing.classList.add('gone');
    room.start();
  };
  enter.addEventListener('click', () => {
    room.audio.unlock();
    leave();
    world.launchXR();
  });
  flat.addEventListener('click', () => {
    room.audio.unlock();
    leave();
    flatbar.classList.add('on');
  });

  // Flat view only: type a request to the host, toggle captions.
  const showCaptionState = () => {
    cc.textContent = room.captions.enabled ? 'Captions on' : 'Captions off';
    cc.setAttribute('aria-pressed', String(room.captions.enabled));
  };
  showCaptionState();
  cc.addEventListener('click', () => {
    room.captions.setEnabled(!room.captions.enabled);
    showCaptionState();
  });
  flatbar.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ask.value.trim();
    ask.value = '';
    room.audio.unlock();
    void room.ask(text || 'surprise me');
  });
  world.renderer.xr.addEventListener('sessionstart', () => flatbar.classList.remove('on'));

  // Flat view keys: Space pauses or resumes, H asks the host to pick, C toggles captions.
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || !landing.classList.contains('gone')) return;
    if (world.renderer.xr.isPresenting) return;
    room.audio.unlock();
    if (event.code === 'Space') {
      event.preventDefault();
      room.togglePlayback();
    } else if (event.key === 'h' || event.key === 'H') {
      void room.ask('surprise me');
    } else if (event.key === 'c' || event.key === 'C') {
      cc.click();
    }
  });

  // ?flat skips the landing card and opens the flat view, for quick checks.
  if (new URLSearchParams(location.search).has('flat')) {
    leave();
    flatbar.classList.add('on');
  }

  void navigator.xr?.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) enter.hidden = true;
  });
  if (!navigator.xr) enter.hidden = true;
  world.renderer.xr.addEventListener('sessionstart', leave);
});
