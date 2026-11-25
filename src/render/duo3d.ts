import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Action } from '@shared/character';
import type { DuoSet } from '@shared/duo';
import { perfNow } from '../lib/perf';
import { applyPose, buildRig, makeRenderer, poseAt, type Rig } from './char3d';

// The room duo reels play in: a person (the asker, left) and the AI character (right) behind a desk, low-poly and
// lit like a small set. Three rooms share the desk and the characters and differ in the back wall, the colours and
// the light. Every frame is a pure function of its input, so the preview, stills and export draw the same thing.

const D = Math.PI / 180;
const RW = 810;
const RH = 1440;
const AX = -0.84;
const BX = 0.84;

export interface Shot {
  /** The point the camera looks at. */
  x: number;
  y: number;
  z: number;
  /** Radians round that point (0 = straight on). */
  orbit: number;
  /** Height of the room the frame shows at that point. */
  vis: number;
  /** Where that point sits down the frame, 0..1. */
  fy: number;
  rise: number;
}

export const SHOTS: Record<'wide' | 'a' | 'b' | 'board', Shot> = {
  wide: { x: 0, y: 1.9, z: 0, orbit: 0.1, vis: 8.8, fy: 0.62, rise: 0.5 },
  a: { x: AX + 0.05, y: 2.02, z: 0, orbit: 0.36, vis: 3.1, fy: 0.56, rise: 0.08 },
  b: { x: BX - 0.05, y: 2.08, z: 0, orbit: -0.36, vis: 3.5, fy: 0.53, rise: 0.08 },
  board: { x: 0, y: 1.85, z: 0, orbit: 0, vis: 6.6, fy: 0.722, rise: 0.3 },
};

export const mixShot = (p: Shot, q: Shot, k: number): Shot => ({
  x: p.x + (q.x - p.x) * k,
  y: p.y + (q.y - p.y) * k,
  z: p.z + (q.z - p.z) * k,
  orbit: p.orbit + (q.orbit - p.orbit) * k,
  vis: p.vis + (q.vis - p.vis) * k,
  fy: p.fy + (q.fy - p.fy) * k,
  rise: p.rise + (q.rise - p.rise) * k,
});

export interface DuoActor {
  action: Action;
  /** Seconds since the move began. */
  local: number;
  /** Mouth open 0..1. */
  talk: number;
  /** 0..1: turned towards the other one, listening. */
  listen: number;
  color: string;
}

export interface DuoFrame {
  set: DuoSet;
  t: number;
  shot: Shot;
  sign: string;
  accent: string;
  skin: string;
  a: DuoActor;
  b: DuoActor;
}

export interface DuoOut {
  canvas: HTMLCanvasElement;
  /** Head positions in the frame, 0..1. */
  a: { x: number; y: number };
  b: { x: number; y: number };
}

interface Palette {
  wall: string;
  floor: string;
  desk: string;
  strip: string;
  sign: string;
  rim: string;
  sky: string;
  ground: string;
  key: number;
  hemi: number;
}

const PALETTES: Record<DuoSet, Palette> = {
  studio: { wall: '#16262b', floor: '#2a1f19', desk: '#2a1c17', strip: '#ff8a3d', sign: '#ffe2bd', rim: '#ff7a3d', sky: '#ffd2a6', ground: '#182428', key: 1.9, hemi: 0.4 },
  diner: { wall: '#14183f', floor: '#b9b4c6', desk: '#8f2029', strip: '#ffd166', sign: '#ff6fb1', rim: '#ff5fa8', sky: '#b9c2ff', ground: '#1a1440', key: 1.6, hemi: 0.45 },
  terminal: { wall: '#0c1210', floor: '#231b14', desk: '#141a17', strip: '#39ff9c', sign: '#7dffc0', rim: '#39ff9c', sky: '#a8ffd6', ground: '#07100c', key: 1.5, hemi: 0.32 },
};

const SKINS: Record<string, string> = { light: '#F1C9A5', tan: '#D9A066', brown: '#9A6240', dark: '#5E3A24' };

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  a: Rig;
  b: Rig;
  key: string;
  rooms: Record<DuoSet, THREE.Group>;
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  floorTex: THREE.Texture;
  desk: THREE.MeshStandardMaterial;
  strip: THREE.MeshBasicMaterial;
  signMat: THREE.MeshBasicMaterial;
  signKey: string;
  rim: THREE.PointLight;
  glow: THREE.PointLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

let stage: Stage | null = null;

function build(skin: string, fast: boolean): Stage {
  const renderer = makeRenderer(RW, RH, !fast);
  renderer.setClearColor(0x050507, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = fast ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.1, 80);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;

  const flat = (color: string, rough = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  };

  // Shell: floor, back wall, side walls.
  const floorTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#e9e4d8';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#22264f';
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 7);
  floorTex.magFilter = THREE.NearestFilter;
  const floor = flat('#33261f', 0.9);
  const wall = flat('#1f3238', 0.95);
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), wall);
  back.position.set(0, 4.5, -2.7);
  back.receiveShadow = true;
  scene.add(floorMesh, back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), wall);
    w.position.set(4.6 * side, 4.5, 1);
    w.rotation.y = -side * Math.PI / 2;
    scene.add(w);
  }

  // Desk across the front: it hides the legs, the way a talk-show desk does.
  const desk = flat('#2a1c17', 0.6);
  const strip = new THREE.MeshBasicMaterial({ color: '#ff8a3d' });
  scene.add(box(6.4, 0.14, 1.5, desk, 0, 1.0, 1.0), box(6.4, 1.0, 0.12, desk, 0, 0.47, 1.7), box(6.4, 0.05, 0.03, strip, 0, 0.9, 1.77, false));
  // On the desk: a mug, a closed laptop, a small plant.
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 8), flat('#e8e2d6', 0.5));
  mug.position.set(-2.1, 1.17, 1.15);
  mug.castShadow = true;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 6), flat('#b5673c'));
  pot.position.set(2.25, 1.16, 1.0);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), flat('#3f9d6b'));
  leaves.position.set(2.25, 1.42, 1.0);
  leaves.castShadow = true;
  scene.add(mug, pot, leaves, box(0.62, 0.035, 0.42, flat('#3a3f47', 0.4), 0, 1.09, 1.2), box(0.3, 0.02, 0.2, flat('#f3d34a', 0.7), -1.25, 1.08, 1.35, false));

  // ── Rooms ──
  const signMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.9), signMat);
  sign.position.set(0, 4.35, -2.48);
  scene.add(sign);

  const studio = new THREE.Group();
  const wood = flat('#8a4b24', 0.8);
  for (let i = 0; i < 17; i++) studio.add(box(0.13, 5.2, 0.12, wood, -1.76 + i * 0.22, 2.9, -2.58, false));
  studio.add(box(3.9, 5.3, 0.06, flat('#2b160b', 0.95), 0, 2.9, -2.66, false));
  studio.add(box(1.7, 0.07, 0.36, flat('#17262b'), 3.0, 3.25, -2.5), box(0.26, 0.34, 0.24, flat('#e7e0d2'), 2.5, 3.46, -2.5), box(0.22, 0.26, 0.2, flat('#e45d4c'), 3.45, 3.42, -2.5));
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flat('#f1ebe0'));
  ball.position.set(2.98, 3.45, -2.5);
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.5),
    new THREE.MeshBasicMaterial({
      map: canvasTex(230, 300, (g) => {
        g.fillStyle = '#10181c';
        g.fillRect(0, 0, 230, 300);
        const sky = g.createLinearGradient(0, 30, 0, 190);
        sky.addColorStop(0, '#f08a4b');
        sky.addColorStop(1, '#3b2a4d');
        g.fillStyle = sky;
        g.fillRect(18, 22, 194, 180);
        g.fillStyle = '#141a22';
        for (let i = 0; i < 9; i++) g.fillRect(18 + i * 22, 202 - 40 - hash(i) * 90, 18, 40 + hash(i) * 90);
        g.fillStyle = '#f08a4b';
        g.fillRect(18, 232, 120, 8);
        g.fillStyle = '#6b7a80';
        g.fillRect(18, 252, 80, 6);
      }),
    }),
  );
  poster.position.set(-3.0, 3.55, -2.66);
  studio.add(ball, poster);

  const diner = new THREE.Group();
  const windowTex = canvasTex(512, 300, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#0d1140');
    sky.addColorStop(1, '#3a2f8a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 300);
    for (let i = 0; i < 14; i++) {
      const bw = 26 + hash(i) * 34;
      const bh = 70 + hash(i + 20) * 150;
      const bx = i * 38 - 6;
      g.fillStyle = '#12143a';
      g.fillRect(bx, 300 - bh, bw, bh);
      for (let k = 0; k < 16; k++) {
        if (hash(i * 31 + k) < 0.55) continue;
        g.fillStyle = hash(i + k) > 0.5 ? '#ffd27a' : '#ff8ac0';
        g.fillRect(bx + 4 + (k % 3) * 8, 300 - bh + 8 + Math.floor(k / 3) * 14, 4, 6);
      }
    }
    g.strokeStyle = 'rgba(190,200,255,0.22)';
    g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = hash(i + 100) * 512;
      const y = hash(i + 200) * 300;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 4, y + 16);
      g.stroke();
    }
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.7), new THREE.MeshBasicMaterial({ map: windowTex }));
  glass.position.set(0, 3.25, -2.66);
  const frame = flat('#0e1030');
  diner.add(glass, box(6.7, 0.14, 0.14, frame, 0, 5.15, -2.6, false), box(6.7, 0.14, 0.14, frame, 0, 1.36, -2.6, false), box(0.12, 3.8, 0.12, frame, 0, 3.25, -2.6, false));
  diner.add(box(0.12, 3.8, 0.12, frame, -3.3, 3.25, -2.6, false), box(0.12, 3.8, 0.12, frame, 3.3, 3.25, -2.6, false));
  // Booth backs behind the two, and a lamp over the table.
  const seat = flat('#b3262e', 0.55);
  diner.add(box(1.7, 1.9, 0.3, seat, AX - 0.1, 0.95, -0.85), box(1.7, 1.9, 0.3, seat, BX + 0.1, 0.95, -0.85));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 7, 1, true), new THREE.MeshStandardMaterial({ color: '#14162e', roughness: 0.6, flatShading: true, side: THREE.DoubleSide }));
  shade.position.set(0, 3.5, 0.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3d0' }));
  bulb.position.set(0, 3.38, 0.5);
  diner.add(shade, bulb, box(0.02, 3.6, 0.02, frame, 0, 5.45, 0.5, false));

  const terminal = new THREE.Group();
  const codeTex = (seed: number): THREE.CanvasTexture =>
    canvasTex(256, 320, (g) => {
      g.fillStyle = '#06110c';
      g.fillRect(0, 0, 256, 320);
      for (let r = 0; r < 26; r++) {
        let x = 12 + (hash(seed + r) < 0.3 ? 16 : 0);
        for (let k = 0; k < 5; k++) {
          const w = 14 + hash(seed + r * 7 + k) * 44;
          if (x + w > 244) break;
          g.fillStyle = hash(seed + r + k * 3) > 0.92 ? '#e6fff2' : hash(seed + r * 5 + k) > 0.5 ? '#39ff9c' : '#1f9c63';
          g.fillRect(x, 12 + r * 12, w, 5);
          x += w + 8;
        }
      }
    });
  [-3.05, -0.0, 3.05].forEach((x, i) => {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(i === 1 ? 3.2 : 2.3, i === 1 ? 3.6 : 2.9), new THREE.MeshBasicMaterial({ map: codeTex(i * 97 + 5), color: '#6f7f77' }));
    sc.position.set(x, i === 1 ? 3.3 : 3.1, -2.64);
    terminal.add(sc, box(i === 1 ? 3.36 : 2.46, i === 1 ? 3.76 : 3.06, 0.05, flat('#141c18'), x, i === 1 ? 3.3 : 3.1, -2.69, false));
  });
  terminal.add(box(0.5, 0.5, 0.5, flat('#1a2520'), -3.7, 0.25, -1.6), box(0.5, 0.5, 0.5, flat('#1a2520'), -3.7, 0.75, -1.6), box(0.06, 0.06, 0.03, new THREE.MeshBasicMaterial({ color: '#39ff9c' }), -3.55, 0.8, -1.34, false));

  const rooms = { studio, diner, terminal };
  scene.add(studio, diner, terminal);

  // ── The two ──
  const seg = fast ? 8 : 10;
  const mat = (color: string, o?: { glossy?: boolean }): THREE.Material => new THREE.MeshStandardMaterial({ color, roughness: o?.glossy ? 0.22 : 0.62, flatShading: true });
  const a = buildRig({ seg, shadows: true, mat, person: { skin: SKINS[skin] ?? SKINS.brown, hair: skin === 'light' ? '#4a3323' : '#17131a' } });
  const b = buildRig({ seg, shadows: true, mat });
  a.root.position.set(AX, 0, 0);
  a.root.rotation.y = 0.42;
  b.root.position.set(BX, 0, 0);
  b.root.rotation.y = -0.42;
  b.glow[0].color.multiplyScalar(1.5);
  scene.add(a.root, b.root);

  // ── Light ──
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.3);
  sun.position.set(-3, 6, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fast ? 512 : 1024, fast ? 512 : 1024);
  sun.shadow.radius = 5;
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -1;
  sun.shadow.bias = -0.0006;
  const hemi = new THREE.HemisphereLight(0xffd2a6, 0x182428, 0.55);
  const rim = new THREE.PointLight(0xff7a3d, 16, 14, 1.6);
  rim.position.set(0, 3.2, -1.5);
  const glow = new THREE.PointLight(0xffd9a8, 7, 9, 1.8);
  glow.position.set(0, 4.3, -1.7);
  scene.add(sun, hemi, rim, glow);

  return { renderer, scene, camera, a, b, key: `${skin}|${fast}`, rooms, wall, floor, floorTex, desk, strip, signMat, signKey: '', rim, glow, hemi, sun };
}

function signTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTex(580, 180, (g) => {
    g.clearRect(0, 0, 580, 180);
    let size = 96;
    g.font = `700 ${size}px "Chakra Petch", Inter, sans-serif`;
    const w = g.measureText(text).width;
    if (w > 520) size = Math.floor((size * 520) / w);
    g.font = `700 ${size}px "Chakra Petch", Inter, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.strokeText(text, 290, 92);
    g.shadowBlur = 10;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeText(text, 290, 92);
  });
}

const tmp = new THREE.Vector3();
const tint = new THREE.Color();

function dress(rig: Rig, color: string): void {
  tint.set(color);
  (rig.body[0] as THREE.MeshStandardMaterial).color.copy(tint);
  (rig.limbs[0] as THREE.MeshStandardMaterial).color.copy(tint).multiplyScalar(0.8);
}

export function renderDuo(f: DuoFrame): DuoOut {
  const fast = perfNow().fast3d;
  const key = `${f.skin}|${fast}`;
  if (stage && stage.key !== key) {
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }
  const st = (stage ??= build(f.skin, fast));
  const P = PALETTES[f.set] ?? PALETTES.studio;

  // The room.
  (Object.keys(st.rooms) as DuoSet[]).forEach((k) => (st.rooms[k].visible = k === f.set));
  st.wall.color.set(P.wall);
  st.floor.color.set(P.floor);
  const checker = f.set === 'diner';
  if ((st.floor.map !== null) !== checker) {
    st.floor.map = checker ? st.floorTex : null;
    st.floor.needsUpdate = true;
  }
  st.desk.color.set(P.desk);
  st.strip.color.set(P.strip);
  st.rim.color.set(P.rim);
  st.glow.color.set(P.sign);
  st.hemi.color.set(P.sky);
  st.hemi.groundColor.set(P.ground);
  st.hemi.intensity = P.hemi;
  st.sun.intensity = P.key;
  const signKey = `${f.sign}|${P.sign}`;
  if (st.signKey !== signKey) {
    st.signMat.map?.dispose();
    st.signMat.map = f.sign ? signTexture(f.sign.toUpperCase().slice(0, 18), P.sign) : null;
    st.signMat.visible = !!f.sign;
    st.signMat.needsUpdate = true;
    st.signKey = signKey;
  }
  // A neon flicker now and then.
  st.signMat.opacity = hash(Math.floor(f.t * 14)) > 0.97 ? 0.55 : 1;

  // The two.
  dress(st.a, f.a.color);
  dress(st.b, f.b.color);
  (st.b.body[1] as THREE.MeshStandardMaterial).color.set(f.b.color).lerp(tint.set('#ffffff'), 0.22);
  st.b.glow[1].color.set(f.accent);
  st.b.antenna.position.y = 1.23 + 0.03 * Math.sin(f.t * 3);
  const pa = poseAt({ action: f.a.action, local: f.a.local, t: f.t + 1.7, talk: f.a.talk });
  pa.headYaw += 24 * f.a.listen;
  applyPose(st.a, pa, f.a.talk);
  const pb = poseAt({ action: f.b.action, local: f.b.local, t: f.t, talk: f.b.talk });
  pb.headYaw -= 24 * f.b.listen;
  applyPose(st.b, pb, f.b.talk);
  // The robot hovers a little; the person breathes (poseAt).
  st.b.root.position.y = 0.05 + 0.03 * Math.sin(f.t * 1.7);

  // Camera.
  const s = f.shot;
  const dist = s.vis / 2 / Math.tan((st.camera.fov * D) / 2);
  const orbit = s.orbit + 0.03 * Math.sin(f.t * 0.31);
  st.camera.position.set(s.x + Math.sin(orbit) * dist, s.y + s.rise + 0.03 * Math.sin(f.t * 0.23), s.z + Math.cos(orbit) * dist);
  st.camera.lookAt(s.x, s.y, s.z);
  st.camera.setViewOffset(RW, RH, 0, (0.5 - s.fy) * RH, RW, RH);
  st.camera.updateProjectionMatrix();
  st.renderer.render(st.scene, st.camera);

  const head = (rig: Rig): { x: number; y: number } => {
    rig.headAnchor.getWorldPosition(tmp);
    tmp.project(st.camera);
    return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 };
  };
  return { canvas: st.renderer.domElement, a: head(st.a), b: head(st.b) };
}
