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

  const leave = () => landing.classList.add('gone');
  enter.addEventListener('click', () => {
    room.audio.unlock();
    leave();
    world.launchXR();
  });
  flat.addEventListener('click', () => {
    room.audio.unlock();
    leave();
  });

  void navigator.xr?.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) enter.hidden = true;
  });
  if (!navigator.xr) enter.hidden = true;
  world.renderer.xr.addEventListener('sessionstart', leave);
});
