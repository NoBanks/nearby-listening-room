import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
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

  void navigator.xr?.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) enter.hidden = true;
  });
  if (!navigator.xr) enter.hidden = true;
  world.renderer.xr.addEventListener('sessionstart', leave);
});
