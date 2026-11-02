import {
  AdditiveBlending,
  AssetManager,
  BoxGeometry,
  createSystem,
  Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Pressed,
  Quaternion,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { RoomAudio } from './audio.js';
import catalog from './catalog.json';
import {
  buildRoom,
  HEAD_Y,
  PLATTER,
  RoomParts,
  SHELF_RADIUS,
  SLEEVE_SIZE,
  SPEAKER_L,
  SPEAKER_R,
  STAND,
} from './room.js';
import { Sleeve, SleeveHit } from './sleeve-component.js';
import { glowTexture } from './textures.js';

const ROWS = [1.265, 1.045];
const COLUMNS = 8;
const SHELF_DEGREES = 132;
const ARM_REST = 0.42;
const ARM_PLAY = -0.34;
const ARM_END = -0.62;
const RPM_33 = (33.33 / 60) * Math.PI * 2;
const NEEDLE_DELAY = 0.9;
const DIM = 0.13;

interface RecordState {
  entity: Entity;
  mesh: Mesh;
  hit: Mesh;
  material: MeshBasicMaterial;
  homePos: Vector3;
  homeQuat: Quaternion;
  flying: boolean;
  targetPos: Vector3;
  targetQuat: Quaternion;
}

export class ListeningSystem extends createSystem({
  sleeves: { required: [Sleeve] },
  grabbed: { required: [Sleeve, Grabbed] },
  pressed: { required: [SleeveHit, Pressed] },
}) {
  readonly audio = new RoomAudio();

  private parts!: RoomParts;
  private records: RecordState[] = [];
  private current = -1;
  private paused = false;
  private held = -1;
  private lastGrabEnd = -10;
  private now = 0;
  private warmth = 0;
  private warmthTarget = 0;
  private hasDropped = false;
  private spin = 0;
  private armAngle = ARM_REST;
  private recentered = false;
  private settleFrames = 0;
  private wasImmersive = false;

  private halo!: Mesh;
  private haloMaterial!: MeshBasicMaterial;
  private fingerA!: Mesh;
  private fingerB!: Mesh;
  private cueTime = 0;

  private standPos = new Vector3();
  private standQuat = new Quaternion();
  private platterPos = new Vector3();
  private lastDebug = 0;
  private tmpHeadWorld = new Vector3();
  private tmpV = new Vector3();
  private tmpF = new Vector3();
  private tmpU = new Vector3();
  private tmpQ = new Quaternion();

  init(): void {
    this.parts = buildRoom();
    this.world.createTransformEntity(this.parts.root);
    this.buildRecords();
    this.buildCue();
    this.placeInWorld();

    this.cleanupFuncs.push(
      this.queries.grabbed.subscribe('qualify', (entity) => this.onGrab(entity)),
      this.queries.grabbed.subscribe('disqualify', (entity) => this.onRelease(entity)),
      this.queries.pressed.subscribe('disqualify', (entity) => this.onPress(entity)),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );

    const onEnded = () => this.endTrack();
    this.audio.element.addEventListener('ended', onEnded);
    this.cleanupFuncs.push(() => this.audio.element.removeEventListener('ended', onEnded));

    // Any pinch counts as the gesture browsers require before sound can start.
    const unlock = () => this.audio.unlock();
    const onSession = () => {
      const session = this.world.renderer.xr.getSession();
      session?.addEventListener('selectstart', unlock);
      session?.addEventListener('squeezestart', unlock);
    };
    this.world.renderer.xr.addEventListener('sessionstart', onSession);
    this.cleanupFuncs.push(() => this.world.renderer.xr.removeEventListener('sessionstart', onSession));
    window.addEventListener('pointerdown', unlock);
    this.cleanupFuncs.push(() => window.removeEventListener('pointerdown', unlock));
  }

  private buildRecords(): void {
    const geometry = new BoxGeometry(SLEEVE_SIZE, SLEEVE_SIZE, 0.006);
    const side = new MeshBasicMaterial({ color: 0x120c08 });
    const hitGeometry = new PlaneGeometry(SLEEVE_SIZE, SLEEVE_SIZE);
    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    catalog.forEach((track, index) => {
      const texture = AssetManager.getTexture(`cover-${track.id}`)!;
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new MeshBasicMaterial({ map: texture, color: 0x222222 });
      const mesh = new Mesh(geometry, [side, side, side, side, material, side]);
      mesh.name = track.title;
      const entity = this.world.createTransformEntity(mesh);
      entity.addComponent(Sleeve, { trackIndex: index });
      entity.addComponent(RayInteractable);
      entity.addComponent(OneHandGrabbable, { translate: true, rotate: true });
      const hit = new Mesh(hitGeometry, hitMaterial);
      hit.name = `${track.title} (distance)`;
      const hitEntity = this.world.createTransformEntity(hit);
      hitEntity.addComponent(SleeveHit, { trackIndex: index });
      hitEntity.addComponent(RayInteractable);
      (hit as unknown as { pointerEventsType: unknown }).pointerEventsType = { deny: 'grab' };
      this.records.push({
        entity,
        mesh,
        hit,
        material,
        homePos: new Vector3(),
        homeQuat: new Quaternion(),
        flying: false,
        targetPos: new Vector3(),
        targetQuat: new Quaternion(),
      });
    });
  }

  /** Before the first play: one record glows, two fingertips show the pinch. No words. */
  private buildCue(): void {
    const first = this.records[0].mesh;
    this.haloMaterial = new MeshBasicMaterial({
      map: glowTexture('255,196,128'),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new Mesh(new PlaneGeometry(SLEEVE_SIZE * 2.3, SLEEVE_SIZE * 2.3), this.haloMaterial);
    this.halo.position.z = -0.006;
    this.halo.raycast = () => {};
    first.add(this.halo);
    const fingerMaterial = new MeshBasicMaterial({ color: 0xffe2bd, transparent: true, opacity: 0.9, depthWrite: false });
    const tip = new SphereGeometry(0.0085, 16, 12);
    this.fingerA = new Mesh(tip, fingerMaterial);
    this.fingerB = new Mesh(tip, fingerMaterial);
    this.fingerA.raycast = () => {};
    this.fingerB.raycast = () => {};
    first.add(this.fingerA, this.fingerB);
  }

  /** Sits the room around the viewer's real head, so it fits any seat height. */
  private placeInWorld(): void {
    const { root } = this.parts;
    root.updateMatrixWorld(true);
    const step = (SHELF_DEGREES * Math.PI) / 180 / (COLUMNS - 1);
    this.records.forEach((record, index) => {
      const row = Math.floor(index / COLUMNS);
      // The first record sits just right of centre on the top row, in the natural eyeline.
      const col = (index + 4) % COLUMNS;
      const angle = (col - (COLUMNS - 1) / 2) * step;
      this.tmpV.set(Math.sin(angle) * SHELF_RADIUS, ROWS[row], -Math.cos(angle) * SHELF_RADIUS);
      root.localToWorld(record.homePos.copy(this.tmpV));
      this.tmpU.set(0, HEAD_Y, 0);
      root.localToWorld(this.tmpU);
      record.mesh.position.copy(record.homePos);
      record.mesh.quaternion.identity();
      record.mesh.lookAt(this.tmpU);
      record.homeQuat.copy(record.mesh.quaternion);
    });
    root.localToWorld(this.standPos.set(STAND.x, STAND.y, STAND.z));
    this.tmpV.set(0, HEAD_Y, 0.1);
    root.localToWorld(this.tmpV);
    this.tmpF.copy(this.standPos);
    this.tmpQ.copy(this.records[0].mesh.quaternion);
    this.records[0].mesh.position.copy(this.standPos);
    this.records[0].mesh.lookAt(this.tmpV);
    this.standQuat.copy(this.records[0].mesh.quaternion);
    this.records[0].mesh.position.copy(this.records[0].homePos);
    this.records[0].mesh.quaternion.copy(this.tmpQ);
    root.localToWorld(this.platterPos.set(PLATTER.x, PLATTER.y, PLATTER.z));
    this.audio.placeSpeakers(
      root.localToWorld(this.tmpV.set(SPEAKER_L.x, SPEAKER_L.y, SPEAKER_L.z)).x,
      this.tmpV.y,
      this.tmpV.z,
      root.localToWorld(this.tmpF.set(SPEAKER_R.x, SPEAKER_R.y, SPEAKER_R.z)).x,
      this.tmpF.y,
      this.tmpF.z,
    );
  }

  private indexOf(entity: Entity): number {
    return entity.getValue(Sleeve, 'trackIndex') as number;
  }

  private onGrab(entity: Entity): void {
    const index = this.indexOf(entity);
    this.held = index;
    this.records[index].flying = false;
    this.audio.unlock();
    if (index === this.current) this.liftNeedle();
  }

  private onRelease(entity: Entity): void {
    const index = this.indexOf(entity);
    this.held = -1;
    this.lastGrabEnd = this.now;
    const record = this.records[index];
    if (record.mesh.position.distanceTo(this.platterPos) < PLATTER.dropRadius) this.load(index);
    else this.flyHome(index);
  }

  /** A pinch aimed from a distance: same result as carrying the record over. */
  private onPress(entity: Entity): void {
    const index = entity.getValue(SleeveHit, 'trackIndex') as number;
    // The same pinch that just carried a record must not also count as a press.
    if (this.held >= 0 || this.now - this.lastGrabEnd < 0.4) return;
    this.audio.unlock();
    if (index === this.current) this.togglePause();
    else this.load(index);
  }

  private flyHome(index: number): void {
    const record = this.records[index];
    record.targetPos.copy(record.homePos);
    record.targetQuat.copy(record.homeQuat);
    record.flying = true;
  }

  private load(index: number): void {
    if (this.current >= 0 && this.current !== index) this.flyHome(this.current);
    this.current = index;
    this.paused = false;
    const record = this.records[index];
    record.targetPos.copy(this.standPos);
    record.targetQuat.copy(this.standQuat);
    record.flying = true;
    const track = catalog[index];
    if (import.meta.env.DEV) console.info(`[room] load ${track.title}`);
    const { vinyl, vinylLabel, plaque, powerLed } = this.parts;
    vinylLabel.map = record.material.map;
    vinylLabel.needsUpdate = true;
    vinyl.visible = true;
    plaque.draw(track.title);
    powerLed.color.set(0xff5a28);
    this.audio.play(`${import.meta.env.BASE_URL}catalog/audio/${track.id}.mp3`, NEEDLE_DELAY);
    if (!this.hasDropped) {
      this.hasDropped = true;
      this.warmthTarget = 1;
      this.halo.visible = false;
      this.fingerA.visible = false;
      this.fingerB.visible = false;
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) this.audio.fadeOutThenPause();
    else this.audio.resume();
  }

  private liftNeedle(): void {
    this.current = -1;
    this.paused = false;
    this.audio.fadeOutThenPause();
    this.parts.vinyl.visible = false;
    this.parts.plaque.draw('');
    this.parts.powerLed.color.set(0x3a1006);
  }

  private endTrack(): void {
    const finished = this.current;
    this.liftNeedle();
    if (finished >= 0) this.flyHome(finished);
  }

  private onVisibility(state: VisibilityState): void {
    if (state === VisibilityState.NonImmersive) {
      if (this.wasImmersive) {
        this.wasImmersive = false;
        this.recentered = false;
      }
      return;
    }
    this.wasImmersive = true;
    if (state === VisibilityState.Visible) this.audio.resumeFromBlur();
    else this.audio.suspendForBlur();
  }

  private recenter(): void {
    if (this.recentered || !this.world.renderer.xr.isPresenting) return;
    if (++this.settleFrames < 4) return;
    this.settleFrames = 0;
    this.recentered = true;
    this.world.camera.getWorldPosition(this.tmpV);
    this.world.camera.getWorldDirection(this.tmpF);
    const { root } = this.parts;
    root.position.set(this.tmpV.x, this.tmpV.y - HEAD_Y, this.tmpV.z);
    root.rotation.set(0, Math.atan2(-this.tmpF.x, -this.tmpF.z), 0);
    this.placeInWorld();
    if (this.current >= 0) {
      const record = this.records[this.current];
      record.mesh.position.copy(this.standPos);
      record.mesh.quaternion.copy(this.standQuat);
    }
  }

  update(delta: number, time: number): void {
    this.now = time;
    this.recenter();
    this.world.camera.getWorldPosition(this.tmpHeadWorld);
    const level = this.audio.sample();
    if (import.meta.env.DEV && time - this.lastDebug > 2 && !this.audio.element.paused) {
      this.lastDebug = time;
      console.info(`[room] t=${this.audio.element.currentTime.toFixed(1)} level=${level.toFixed(2)} current=${this.current}`);
    }
    const parts = this.parts;

    // House lights
    this.warmth += (this.warmthTarget - this.warmth) * Math.min(1, delta * 0.8);
    const house = DIM + (1 - DIM) * this.warmth;
    for (const { material, lit, base } of parts.dimmable) material.color.copy(base).multiplyScalar(lit * house);
    for (let i = 0; i < this.records.length; i++) {
      const brightness = !this.hasDropped && i === 0 ? 1 : 0.07 + 0.93 * this.warmth;
      this.records[i].material.color.setScalar(brightness);
    }
    parts.windowBase.color.setScalar(0.3 + 0.7 * this.warmth);
    (parts.lampGlow.material as { opacity: number }).opacity = this.warmth * (0.5 + level * 0.14);
    (parts.radioGlow.material as { opacity: number }).opacity = 0.08 + this.warmth * 0.16;
    parts.windowPulse.opacity = this.warmth * level * 0.5;
    parts.dustMaterial.opacity = this.warmth * (0.26 + level * 0.3);
    parts.dust.rotation.y = time * 0.012;
    const push = 1 + level * 0.05;
    parts.woofers[0].scale.setScalar(push);
    parts.woofers[1].scale.setScalar(push);

    // Turntable
    const playing = this.current >= 0 && !this.paused;
    if (playing) {
      this.spin += delta * RPM_33;
      parts.vinyl.rotation.y = -this.spin;
    }
    const duration = catalog[Math.max(0, this.current)].seconds || 1;
    const progress = Math.min(1, this.audio.element.currentTime / duration);
    const armTarget = this.current < 0 || this.paused ? ARM_REST : ARM_PLAY + (ARM_END - ARM_PLAY) * progress;
    this.armAngle += (armTarget - this.armAngle) * Math.min(1, delta * 2.4);
    parts.tonearm.rotation.y = this.armAngle;

    // Teaching cue
    if (!this.hasDropped) {
      this.cueTime += delta;
      const breathe = 0.5 + 0.5 * Math.sin(this.cueTime * 2.1);
      this.haloMaterial.opacity = 0.45 + breathe * 0.55;
      const cycle = (this.cueTime % 2.4) / 2.4;
      const closing = cycle < 0.5 ? 0 : Math.min(1, (cycle - 0.5) / 0.2);
      const gap = 0.034 * (1 - closing) + 0.0085;
      this.fingerA.position.set(SLEEVE_SIZE * 0.5 + 0.018, gap, 0.03);
      this.fingerB.position.set(SLEEVE_SIZE * 0.5 + 0.018, -gap, 0.03);
      // The record leans out of the shelf toward the viewer, clear of its neighbours.
      const first = this.records[0];
      if (!first.flying && this.held !== 0) {
        this.tmpV.copy(this.tmpHeadWorld).sub(first.homePos).normalize();
        first.mesh.position.copy(first.homePos).addScaledVector(this.tmpV, 0.055 + breathe * 0.012);
      }
    }

    // The ring around the platter answers a record in the hand.
    let ring = 0;
    if (this.held >= 0) {
      const near = this.records[this.held].mesh.position.distanceTo(this.platterPos) < PLATTER.dropRadius;
      ring = near ? 0.95 : 0.3 + 0.2 * Math.sin(time * 4);
    }
    const ringMaterial = parts.dropRing.material as MeshBasicMaterial;
    ringMaterial.opacity += (ring - ringMaterial.opacity) * Math.min(1, delta * 10);

    // Records in flight
    const ease = 1 - Math.exp(-delta * 7);
    for (const record of this.records) {
      if (!record.flying) continue;
      record.mesh.position.lerp(record.targetPos, ease);
      record.mesh.quaternion.slerp(record.targetQuat, ease);
      if (record.mesh.position.distanceToSquared(record.targetPos) < 1e-6) {
        record.mesh.position.copy(record.targetPos);
        record.mesh.quaternion.copy(record.targetQuat);
        record.flying = false;
      }
    }
    for (const record of this.records) {
      record.hit.position.copy(record.mesh.position);
      record.hit.quaternion.copy(record.mesh.quaternion);
      record.hit.translateZ(0.0045);
    }

    // Keep the ear on the head.
    const camera = this.world.camera;
    camera.getWorldPosition(this.tmpV);
    camera.getWorldDirection(this.tmpF);
    this.tmpU.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(this.tmpQ));
    this.audio.setListener(this.tmpV.x, this.tmpV.y, this.tmpV.z, this.tmpF.x, this.tmpF.y, this.tmpF.z, this.tmpU.x, this.tmpU.y, this.tmpU.z);
  }
}
