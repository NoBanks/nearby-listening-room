import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';
import {
  bokehTexture,
  brushedTexture,
  deskTexture,
  floorTexture,
  glowTexture,
  lampShadeTexture,
  radioFaceTexture,
  sheenTexture,
  speakerTexture,
  TextPlaque,
  vinylTexture,
  wallTexture,
} from './textures.js';

// The whole room is authored in seated coordinates: head at (0, HEAD_Y, 0), facing -Z.
export const HEAD_Y = 1.2;
export const DESK_Y = 0.72;
export const SHELF_RADIUS = 0.58;
export const SLEEVE_SIZE = 0.17;
const PLINTH_H = 0.055;
const PLATTER_Y = DESK_Y + PLINTH_H + 0.018;

export const PLATTER = { x: -0.03, y: PLATTER_Y, z: -0.4, dropRadius: 0.24 };
export const STAND = { x: -0.37, y: DESK_Y + 0.105, z: -0.36 };
export const SPEAKER_L = { x: -0.78, y: DESK_Y + 0.2, z: -0.56 };
export const SPEAKER_R = { x: 0.78, y: DESK_Y + 0.2, z: -0.56 };

export interface RoomParts {
  root: Group;
  /** Everything that follows the house lights, with its fully lit brightness. */
  dimmable: { material: MeshBasicMaterial; lit: number; base: Color }[];
  vinyl: Group;
  vinylLabel: MeshBasicMaterial;
  platter: Mesh;
  tonearm: Group;
  /** The cartridge end of the arm: where a fingertip pinches to pause. */
  headshell: Mesh;
  dropRing: Mesh;
  windowBase: MeshBasicMaterial;
  windowPulse: MeshBasicMaterial;
  woofers: Mesh[];
  lampGlow: Sprite;
  radioGlow: Sprite;
  dust: Points;
  dustMaterial: PointsMaterial;
  powerLed: MeshBasicMaterial;
  plaque: TextPlaque;
}

function arcBand(inner: number, outer: number, span: number, depth: number): ExtrudeGeometry {
  // Centred on -Z after the -90deg X rotation applied by the caller.
  const start = Math.PI / 2 - span / 2;
  const end = Math.PI / 2 + span / 2;
  const shape = new Shape();
  shape.absarc(0, 0, outer, start, end, false);
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
}

/**
 * Bakes several small static pieces that share one material into a single
 * geometry, so they cost one draw call instead of one each (Quest budget).
 */
function batch(pieces: { geometry: BufferGeometry; x: number; y: number; z: number }[]): BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const matrix = new Matrix4();
  for (const piece of pieces) {
    const geometry = piece.geometry.toNonIndexed();
    geometry.applyMatrix4(matrix.makeTranslation(piece.x, piece.y, piece.z));
    position.push(...(geometry.getAttribute('position').array as Float32Array));
    normal.push(...(geometry.getAttribute('normal').array as Float32Array));
    uv.push(...(geometry.getAttribute('uv').array as Float32Array));
    geometry.dispose();
    piece.geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(position, 3));
  merged.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  merged.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return merged;
}

export function buildRoom(): RoomParts {
  const root = new Group();
  root.name = 'Listening Room';
  const dimmable: RoomParts['dimmable'] = [];

  const basic = (params: ConstructorParameters<typeof MeshBasicMaterial>[0], lit = 1) => {
    const material = new MeshBasicMaterial(params);
    dimmable.push({ material, lit, base: material.color.clone() });
    return material;
  };
  const add = (geometry: BufferGeometry, material: MeshBasicMaterial | MeshBasicMaterial[], x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.raycast = () => {};
    root.add(mesh);
    return mesh;
  };

  // Shell
  const wall = basic({ map: wallTexture(), side: BackSide });
  add(new BoxGeometry(6, 3.1, 6), wall, 0, 1.55, 0);
  const floor = add(new PlaneGeometry(6, 6), basic({ map: floorTexture() }, 0.5), 0, 0.005, 0);
  floor.rotation.x = -Math.PI / 2;

  // Window: the only thing lit before the first record drops.
  const bokeh = bokehTexture();
  const windowBase = new MeshBasicMaterial({ map: bokeh });
  add(new PlaneGeometry(4.6, 2.0), windowBase, 0, 1.72, -2.97);
  const windowPulse = new MeshBasicMaterial({
    map: bokeh,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  add(new PlaneGeometry(4.6, 2.0), windowPulse, 0, 1.72, -2.96);
  const frame = basic({ color: 0x0c0806 });
  add(
    batch([
      ...[-2.3, -0.77, 0.77, 2.3].map((x) => ({ geometry: new BoxGeometry(0.05, 2.04, 0.06), x, y: 1.72, z: -2.93 })),
      ...[0.72, 2.72].map((y) => ({ geometry: new BoxGeometry(4.66, 0.05, 0.06), x: 0, y, z: -2.93 })),
    ]),
    frame,
  );

  // Desk
  const deskSpan = Math.PI * 0.9;
  const edge = basic({ color: 0x1b0e07 });
  const desk = add(arcBand(0.15, 0.98, deskSpan, 0.035), [basic({ map: deskTexture() }), edge], 0, DESK_Y, 0);
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = DESK_Y - 0.035;
  const legs = basic({ color: 0x0e0704 });
  add(
    batch([-0.72, 0.72].map((x) => ({ geometry: new BoxGeometry(0.05, DESK_Y - 0.04, 0.46), x, y: (DESK_Y - 0.04) / 2, z: -0.5 }))),
    legs,
  );

  // Shelves: open rails so the city shows between the records.
  const walnut = basic({ color: 0x3c2212 });
  const walnutEdge = basic({ color: 0x4f3019 });
  const shelfSpan = (152 * Math.PI) / 180;
  for (const y of [0.945, 1.165]) {
    const rail = add(arcBand(SHELF_RADIUS - 0.045, SHELF_RADIUS + 0.045, shelfSpan, 0.016), [walnut, walnutEdge], 0, y, 0);
    rail.rotation.x = -Math.PI / 2;
  }
  const brass = basic({ color: 0x9c7a44 });
  const posts = [-76, -38, 38, 76].map((degrees) => {
    const a = (degrees * Math.PI) / 180;
    return {
      geometry: new CylinderGeometry(0.005, 0.005, 1.26 - DESK_Y + 0.17, 8),
      x: Math.sin(a) * (SHELF_RADIUS + 0.03),
      y: (1.26 + DESK_Y) / 2 + 0.085,
      z: -Math.cos(a) * (SHELF_RADIUS + 0.03),
    };
  });
  add(batch(posts), brass);

  // Turntable
  const brushed = basic({ map: brushedTexture() });
  const plinthBody = basic({ color: 0x24140b });
  const top = basic({ color: 0x17100c });
  add(
    new BoxGeometry(0.46, PLINTH_H, 0.36),
    [plinthBody, plinthBody, top, plinthBody, plinthBody, plinthBody],
    0,
    DESK_Y + PLINTH_H / 2,
    PLATTER.z,
  );
  const platter = add(new CylinderGeometry(0.152, 0.152, 0.016, 64), brushed, PLATTER.x, DESK_Y + PLINTH_H + 0.008, PLATTER.z);
  platter.name = 'Platter';

  const vinyl = new Group();
  vinyl.position.set(PLATTER.x, PLATTER_Y, PLATTER.z);
  vinyl.visible = false;
  const groove = new Mesh(new CircleGeometry(0.149, 64), basic({ map: vinylTexture() }));
  groove.rotation.x = -Math.PI / 2;
  groove.raycast = () => {};
  const vinylLabel = basic({ color: 0xffffff });
  const label = new Mesh(new CircleGeometry(0.052, 48), vinylLabel);
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.0007;
  label.raycast = () => {};
  vinyl.add(groove, label);
  root.add(vinyl);

  const sheen = add(
    new CircleGeometry(0.149, 48),
    new MeshBasicMaterial({ map: sheenTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    PLATTER.x,
    PLATTER_Y + 0.0012,
    PLATTER.z,
  );
  sheen.rotation.x = -Math.PI / 2;
  add(new CylinderGeometry(0.003, 0.003, 0.016, 12), brushed, PLATTER.x, PLATTER_Y + 0.008, PLATTER.z);

  const tonearm = new Group();
  tonearm.position.set(0.17, DESK_Y + PLINTH_H, -0.53);
  add(new CylinderGeometry(0.022, 0.026, 0.03, 24), brushed, 0.17, DESK_Y + PLINTH_H + 0.015, -0.53);
  const arm = new Mesh(new CylinderGeometry(0.0032, 0.0032, 0.255, 10), brushed);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0.046, 0.1175);
  arm.raycast = () => {};
  const counterweight = new Mesh(new CylinderGeometry(0.012, 0.012, 0.03, 16), basic({ color: 0x2a2a2c }));
  counterweight.rotation.x = Math.PI / 2;
  counterweight.position.set(0, 0.046, -0.035);
  counterweight.raycast = () => {};
  const headshell = new Mesh(new BoxGeometry(0.018, 0.008, 0.038), basic({ color: 0x18181a }));
  headshell.position.set(0, 0.04, 0.26);
  headshell.raycast = () => {};
  tonearm.add(arm, counterweight, headshell);
  root.add(tonearm);

  const powerLed = new MeshBasicMaterial({ color: 0x3a1006 });
  add(new SphereGeometry(0.004, 10, 8), powerLed, -0.205, DESK_Y + PLINTH_H + 0.002, -0.245);

  const dropRing = add(
    new RingGeometry(0.158, 0.172, 64),
    new MeshBasicMaterial({ color: 0xffc27e, transparent: true, opacity: 0, side: DoubleSide, blending: AdditiveBlending, depthWrite: false }),
    PLATTER.x,
    PLATTER_Y + 0.002,
    PLATTER.z,
  );
  dropRing.rotation.x = -Math.PI / 2;

  // Now-playing stand
  add(new BoxGeometry(0.2, 0.012, 0.07), brass, STAND.x, DESK_Y + 0.006, STAND.z);

  // Title plaque on the desk, in front of the turntable.
  const plaque = new TextPlaque(1024, 128);
  const plaqueMesh = add(
    new PlaneGeometry(0.42, 0.0525),
    new MeshBasicMaterial({ map: plaque.texture, transparent: true, depthWrite: false }),
    0,
    DESK_Y + 0.002,
    -0.19,
  );
  plaqueMesh.rotation.x = -Math.PI / 2;

  // Speakers
  const cabinet = basic({ color: 0x2c1a0e });
  const coneTexture = speakerTexture();
  const woofers: Mesh[] = [];
  for (const spot of [SPEAKER_L, SPEAKER_R]) {
    const speaker = new Group();
    speaker.position.set(spot.x, spot.y, spot.z);
    speaker.lookAt(0, HEAD_Y, 0);
    const box = new Mesh(new BoxGeometry(0.22, 0.4, 0.2), cabinet);
    box.raycast = () => {};
    const woofer = new Mesh(new CircleGeometry(0.082, 40), basic({ map: coneTexture }));
    woofer.position.set(0, -0.07, 0.102);
    woofer.raycast = () => {};
    const tweeter = new Mesh(new CircleGeometry(0.028, 24), basic({ map: coneTexture }));
    tweeter.position.set(0, 0.105, 0.102);
    tweeter.raycast = () => {};
    speaker.add(box, woofer, tweeter);
    root.add(speaker);
    woofers.push(woofer);
  }

  // Practical lamp, right of the desk.
  const lampX = 0.52;
  const lampZ = -0.2;
  add(new CylinderGeometry(0.05, 0.058, 0.014, 24), brass, lampX, DESK_Y + 0.007, lampZ);
  add(new CylinderGeometry(0.006, 0.006, 0.26, 10), brass, lampX, DESK_Y + 0.14, lampZ);
  const shadeMaterial = new MeshBasicMaterial({ map: lampShadeTexture(), side: DoubleSide });
  dimmable.push({ material: shadeMaterial, lit: 1, base: shadeMaterial.color.clone() });
  add(new CylinderGeometry(0.055, 0.095, 0.115, 28, 1, true), shadeMaterial, lampX, DESK_Y + 0.29, lampZ);
  const glow = glowTexture();
  const lampGlow = new Sprite(
    new SpriteMaterial({ map: glow, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }),
  );
  lampGlow.position.set(lampX, DESK_Y + 0.29, lampZ);
  lampGlow.scale.setScalar(0.62);
  lampGlow.raycast = () => {};
  root.add(lampGlow);

  // The radio the host will speak through.
  const radio = new Group();
  radio.position.set(-0.52, DESK_Y + 0.075, -0.2);
  radio.lookAt(0, HEAD_Y, 0);
  const radioBody = basic({ color: 0x24140b });
  const radioFace = basic({ map: radioFaceTexture() });
  const radioMesh = new Mesh(new BoxGeometry(0.24, 0.15, 0.1), [
    radioBody,
    radioBody,
    radioBody,
    radioBody,
    radioFace,
    radioBody,
  ]);
  radioMesh.raycast = () => {};
  radio.add(radioMesh);
  root.add(radio);
  const radioGlow = new Sprite(
    new SpriteMaterial({ map: glow, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.1 }),
  );
  radioGlow.position.set(-0.5, DESK_Y + 0.1, -0.17);
  radioGlow.scale.setScalar(0.32);
  radioGlow.raycast = () => {};
  root.add(radioGlow);

  // Dust caught in the lamplight. Moved by rotating the group: no per-frame CPU work.
  const count = 170;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.1 + Math.random() * 0.9;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.random() * 1.0;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  const dustMaterial = new PointsMaterial({
    map: glow,
    size: 0.009,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    color: 0xffd9a8,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  dust.position.set(0.15, DESK_Y + 0.05, -0.55);
  dust.raycast = () => {};
  root.add(dust);

  return {
    root,
    dimmable,
    vinyl,
    vinylLabel,
    platter,
    tonearm,
    headshell,
    dropRing,
    windowBase,
    windowPulse,
    woofers,
    lampGlow,
    radioGlow,
    dust,
    dustMaterial,
    powerLed,
    plaque,
  };
}
