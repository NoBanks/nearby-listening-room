import {
  AdditiveBlending,
  AssetManager,
  BoxGeometry,
  createSystem,
  Entity,
  Grabbed,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Pressed,
  Quaternion,
  RayInteractable,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { RoomAudio } from './audio.js';
import { coverAssetId, resolveUrl, TRACKS } from './catalog.js';
import {
  buildRoom,
  HEAD_Y,
  PLATTER,
  RADIO,
  RoomParts,
  SHELF_RADIUS,
  SLEEVE_SIZE,
  SPEAKER_L,
  SPEAKER_R,
  STAND,
} from './room.js';
import { PalmGesture } from './hand-gestures.js';
import { Sleeve, SleeveHit, TonearmHit } from './sleeve-component.js';
import { glowTexture, placeholderCoverTexture } from './textures.js';

const ROWS = [1.265, 1.045];
const COLUMNS = Math.max(1, Math.ceil(TRACKS.length / ROWS.length));
const SHELF_DEGREES = 132;
const ARM_REST = 0.42;
const ARM_PLAY = -0.34;
const ARM_END = -0.62;
const RPM_33 = (33.33 / 60) * Math.PI * 2;
const NEEDLE_DELAY = 0.9;
const DIM = 0.13;
/** A fingertip this close to a sleeve or the tonearm lights it up. */
const NEAR = 0.16;
const TONEARM_PINCH = 0.075;

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
  hovered: { required: [SleeveHit, Hovered] },
  armPressed: { required: [TonearmHit, Pressed] },
  armHovered: { required: [TonearmHit, Hovered] },
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

  private handHalos: Mesh[] = [];
  private handHaloMaterials: MeshBasicMaterial[] = [];
  private armHit!: Mesh;
  private armGlow!: Sprite;
  private lastArmToggle = -10;
  private palm = new PalmGesture();
  private tmpTip = new Vector3();
  private tmpArm = new Vector3();

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
    this.buildAffordances();
    this.placeInWorld();

    this.cleanupFuncs.push(
      this.queries.grabbed.subscribe('qualify', (entity) => this.onGrab(entity)),
      this.queries.grabbed.subscribe('disqualify', (entity) => this.onRelease(entity)),
      this.queries.pressed.subscribe('disqualify', (entity) => this.onPress(entity)),
      this.queries.armPressed.subscribe('disqualify', () => this.onTonearm()),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );

    const onEnded = () => this.endTrack();
    this.audio.element.addEventListener('ended', onEnded);
    this.cleanupFuncs.push(() => this.audio.element.removeEventListener('ended', onEnded));

    // Any pinch counts as the gesture browsers require before sound can start.
    const unlock = () => this.audio.unlock();
    // A pinch right at the tonearm pauses or resumes, with either hand.
    const onSelectStart = (event: XRInputSourceEvent) => {
      unlock();
      const side = event.inputSource.handedness;
      if (!event.inputSource.hand || (side !== 'left' && side !== 'right')) return;
      this.player.indexTipSpaces[side].getWorldPosition(this.tmpTip);
      if (this.distanceToArm(this.tmpTip) < TONEARM_PINCH) this.onTonearm();
    };
    const onSession = () => {
      const session = this.world.renderer.xr.getSession();
      session?.addEventListener('selectstart', onSelectStart);
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
    // Never drawn (no draw call) but still answers rays and clicks.
    const hitMaterial = new MeshBasicMaterial({ visible: false });
    TRACKS.forEach((track, index) => {
      const texture = (track.art && AssetManager.getTexture(coverAssetId(track))) || placeholderCoverTexture(track.title, index);
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

  /** Glows that answer a nearby hand, plus the tonearm's pinch target. */
  private buildAffordances(): void {
    const glow = glowTexture('255,206,150');
    const plane = new PlaneGeometry(SLEEVE_SIZE * 1.9, SLEEVE_SIZE * 1.9);
    for (let i = 0; i < 2; i++) {
      const material = new MeshBasicMaterial({
        map: glow,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const halo = new Mesh(plane, material);
      halo.position.z = -0.005;
      halo.raycast = () => {};
      halo.visible = false;
      this.handHalos.push(halo);
      this.handHaloMaterials.push(material);
    }
    this.armGlow = new Sprite(
      new SpriteMaterial({ map: glow, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    );
    this.armGlow.scale.setScalar(0.11);
    this.armGlow.raycast = () => {};
    this.parts.root.add(this.armGlow);
    this.armHit = new Mesh(new BoxGeometry(0.07, 0.06, 0.32), new MeshBasicMaterial({ visible: false }));
    this.armHit.name = 'Tonearm';
    const entity = this.world.createTransformEntity(this.armHit);
    entity.addComponent(TonearmHit);
    entity.addComponent(RayInteractable);
  }

  private distanceToArm(point: Vector3): number {
    // Closest of the headshell and the middle of the arm.
    const { tonearm, headshell } = this.parts;
    headshell.getWorldPosition(this.tmpArm);
    const toHead = this.tmpArm.distanceTo(point);
    tonearm.localToWorld(this.tmpArm.set(0, 0.046, 0.12));
    return Math.min(toHead, this.tmpArm.distanceTo(point));
  }

  /** Pinch or click on the tonearm: pause, or pick the song back up. */
  private onTonearm(): void {
    if (this.now - this.lastArmToggle < 0.5 || this.held >= 0) return;
    this.lastArmToggle = this.now;
    this.audio.unlock();
    if (this.current >= 0) this.togglePause();
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
    this.audio.placeTurntable(this.platterPos.x, this.platterPos.y + 0.05, this.platterPos.z);
    root.localToWorld(this.tmpV.set(RADIO.x, RADIO.y, RADIO.z));
    this.audio.placeRadio(this.tmpV.x, this.tmpV.y, this.tmpV.z);
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
    const over = this.isOverPlatter(record.mesh.position);
    if (import.meta.env.DEV) console.info(`[room] release ${index} over platter: ${over}`);
    if (over) this.load(index);
    else this.flyHome(index);
  }

  /** Anywhere in a column above the platter counts: a forgiving target for a loose hand. */
  private isOverPlatter(point: Vector3): boolean {
    const dx = point.x - this.platterPos.x;
    const dz = point.z - this.platterPos.z;
    const dy = point.y - this.platterPos.y;
    return dx * dx + dz * dz < PLATTER.dropRadius * PLATTER.dropRadius && dy > -0.08 && dy < 0.4;
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
    const track = TRACKS[index];
    if (import.meta.env.DEV) console.info(`[room] load ${track.title}`);
    const { vinyl, vinylLabel, plaque, powerLed } = this.parts;
    vinylLabel.map = record.material.map;
    vinylLabel.needsUpdate = true;
    vinyl.visible = true;
    plaque.draw(track.title);
    powerLed.color.set(0xff5a28);
    this.audio.play(resolveUrl(track.audio), NEEDLE_DELAY);
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
    if (import.meta.env.DEV) console.info(`[room] ${this.paused ? 'pause' : 'resume'}`);
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

  private updateAffordances(delta: number): void {
    const xr = this.world.renderer.xr;
    const presenting = xr.isPresenting;
    const fade = Math.min(1, delta * 12);
    let armNear = 0;
    for (let h = 0; h < 2; h++) {
      let target = -1;
      let strength = 0;
      if (presenting) {
        this.player.indexTipSpaces[h === 0 ? 'left' : 'right'].getWorldPosition(this.tmpTip);
        armNear = Math.max(armNear, 1 - this.distanceToArm(this.tmpTip) / NEAR);
        if (this.held < 0) {
          let best = NEAR;
          for (let i = 0; i < this.records.length; i++) {
            const d = this.records[i].mesh.position.distanceTo(this.tmpTip);
            if (d < best) {
              best = d;
              target = i;
            }
          }
          strength = 1 - best / NEAR;
        }
      } else if (h === 0 && this.held < 0) {
        // Mouse hover in the flat view gets the same glow.
        for (const entity of this.queries.hovered.entities) {
          target = entity.getValue(SleeveHit, 'trackIndex') as number;
          strength = 1;
          break;
        }
      }
      const halo = this.handHalos[h];
      const material = this.handHaloMaterials[h];
      if (target >= 0 && halo.parent !== this.records[target].mesh) {
        this.records[target].mesh.add(halo);
        material.opacity = 0;
      }
      halo.visible = target >= 0 || material.opacity > 0.01;
      material.opacity += ((target >= 0 ? 0.35 + 0.65 * strength : 0) - material.opacity) * fade;
    }
    if (!presenting && this.queries.armHovered.entities.size > 0) armNear = 1;

    // Open palm, either hand: pause or resume.
    if (presenting) {
      this.world.camera.getWorldPosition(this.tmpV);
      this.player.updateMatrixWorld();
      if (this.palm.update(delta, xr.getFrame(), xr.getReferenceSpace(), this.player.matrixWorld, this.tmpV) && this.current >= 0) {
        this.togglePause();
      }
    }

    const armMaterial = this.armGlow.material as SpriteMaterial;
    const armTarget = this.current >= 0 ? Math.max(Math.max(0, armNear), this.palm.progress) * 0.9 : 0;
    armMaterial.opacity += (armTarget - armMaterial.opacity) * fade;
    this.parts.headshell.getWorldPosition(this.armGlow.position);
    this.parts.root.worldToLocal(this.armGlow.position);
    this.parts.tonearm.localToWorld(this.armHit.position.set(0, 0.046, 0.12));
    this.parts.tonearm.getWorldQuaternion(this.armHit.quaternion);
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
    const duration = TRACKS[Math.max(0, this.current)].seconds || this.audio.element.duration || 1;
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
      const near = this.isOverPlatter(this.records[this.held].mesh.position);
      ring = near ? 0.95 : 0.3 + 0.2 * Math.sin(time * 4);
    }
    const ringMaterial = parts.dropRing.material as MeshBasicMaterial;
    ringMaterial.opacity += (ring - ringMaterial.opacity) * Math.min(1, delta * 10);

    this.updateAffordances(delta);

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
