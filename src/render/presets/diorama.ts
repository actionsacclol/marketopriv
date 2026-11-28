import * as THREE from 'three';
import { storyBeats, str, type StoryBeat } from '@shared/presets';
import { DIO_FLAG, DIO_RISE, dioRiseTime, dioThings, type DioGround } from '@shared/diorama';
import type { CutItem } from '@shared/cutaway';
import { perfNow } from '../../lib/perf';
import { makeRenderer } from '../char3d';
import { captions } from './duo';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { ANCHOR, BX, BY, BZ, FH, FW, LAYERS, TH, TW, layersCanvas, paintFront, paintTopItems, tx, tz, type Built, type SoilLayer } from './cutaway';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, lerp, markLightFrame, prog, registerPreset, rrect, withAlpha, type Ctx, type Env } from '../engine';

// Dioramas: the backyard cutaway's look for any story. A block of ground floats in the sky and turns slowly; each
// line adds pieces that stay (placed automatically so they never overlap), takes some away, or makes something happen
// (mow, rain, snow, a storm, a fire, a flood, years passing). Underground builds cut the front face open, drawn by the
// cutaway's own painter. A tag on what the line added, a counter in the corner.

const D = Math.PI / 180;
const RW = 810;
const RH = 1440;

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ── Scene bases ───────────────────────────────────────────────────────────
interface Ground {
  top: string;
  flecks: [string, string];
  layers: SoilLayer[];
  edge: string | null;
  grass: boolean;
  wild: string;
  sky?: 'space' | 'studio';
}
const SOIL = LAYERS;
const GROUNDS: Record<DioGround, Ground> = {
  yard: { top: '#66C452', flecks: ['rgba(40,110,30,0.35)', 'rgba(170,230,120,0.35)'], layers: SOIL, edge: '#4FA83F', grass: true, wild: '#3F7F34' },
  park: { top: '#5FBF55', flecks: ['rgba(40,110,30,0.35)', 'rgba(170,230,120,0.35)'], layers: SOIL, edge: '#4FA83F', grass: true, wild: '#3F7F34' },
  farm: { top: '#7DBE4F', flecks: ['rgba(90,120,30,0.35)', 'rgba(200,230,120,0.35)'], layers: SOIL, edge: '#5FA43A', grass: true, wild: '#4A7F2E' },
  forest: { top: '#4C9A42', flecks: ['rgba(30,80,25,0.4)', 'rgba(120,190,90,0.3)'], layers: SOIL, edge: '#3F8A36', grass: true, wild: '#2F6A2A' },
  city: {
    top: '#B9B6B0',
    flecks: ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)'],
    layers: [
      { to: -0.22, color: '#5A5E66', dot: '#4C5057' },
      { to: -1.2, color: '#A39B8E', dot: '#8C8478' },
      { to: -2.8, color: '#8B5A35', dot: '#6F4527' },
      { to: -4.4, color: '#857A70', dot: '#6C625A' },
      { to: -6, color: '#5E544D', dot: '#4A423C' },
    ],
    edge: null,
    grass: false,
    wild: '#5E8F45',
  },
  desert: {
    top: '#E6C27C',
    flecks: ['rgba(160,110,50,0.25)', 'rgba(255,240,200,0.35)'],
    layers: [
      { to: -0.6, color: '#E0B771', dot: '#CFA25C' },
      { to: -2.0, color: '#D19A58', dot: '#BB8546' },
      { to: -3.6, color: '#B7743F', dot: '#9D6233' },
      { to: -6, color: '#8A5B3B', dot: '#704730' },
    ],
    edge: null,
    grass: false,
    wild: '#D7B36C',
  },
  beach: {
    top: '#EFD9A2',
    flecks: ['rgba(170,140,80,0.25)', 'rgba(255,255,255,0.35)'],
    layers: [
      { to: -0.7, color: '#EAD29A', dot: '#D8BD82' },
      { to: -1.8, color: '#CDAE78', dot: '#B89965' },
      { to: -3.6, color: '#857A70', dot: '#6C625A' },
      { to: -6, color: '#5E544D', dot: '#4A423C' },
    ],
    edge: null,
    grass: false,
    wild: '#9CBF6A',
  },
  snow: {
    top: '#F2F6FA',
    flecks: ['rgba(150,180,220,0.25)', 'rgba(255,255,255,0.6)'],
    layers: [
      { to: -0.4, color: '#EEF3F8', dot: '#DCE5EF' },
      { to: -1.6, color: '#7B6A5E', dot: '#66574C' },
      { to: -3.6, color: '#8C8782', dot: '#77726D' },
      { to: -6, color: '#5C5856', dot: '#4A4644' },
    ],
    edge: null,
    grass: false,
    wild: '#DCE6F0',
  },
  moon: {
    top: '#BDBDBD',
    flecks: ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.2)'],
    layers: [
      { to: -0.5, color: '#B3B3B3', dot: '#9C9C9C' },
      { to: -2.4, color: '#9A9A9A', dot: '#848484' },
      { to: -4.2, color: '#7E7E7E', dot: '#6A6A6A' },
      { to: -6, color: '#5E5E5E', dot: '#4E4E4E' },
    ],
    edge: null,
    grass: false,
    wild: '#AFAFAF',
    sky: 'space',
  },
  studio: {
    top: '#ECEDEF',
    flecks: ['rgba(0,0,0,0.02)', 'rgba(255,255,255,0.05)'],
    layers: [
      { to: -0.18, color: '#D9DBE0', dot: '#D9DBE0' },
      { to: -6, color: '#2C2F37', dot: '#2C2F37' },
    ],
    edge: null,
    grass: false,
    wild: '#9BB98A',
    sky: 'studio',
  },
};
const groundOf = (f: Env['fields']): DioGround => {
  const g = str(f, 'set') as DioGround;
  return GROUNDS[g] ? g : 'yard';
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const topBase = new Map<DioGround, HTMLCanvasElement>();
function topCanvas(id: DioGround): HTMLCanvasElement {
  const hit = topBase.get(id);
  if (hit) return hit;
  const G = GROUNDS[id];
  const [c, g] = canvas(TW, TH);
  g.fillStyle = G.top;
  g.fillRect(0, 0, TW, TH);
  if (id === 'city') {
    // Paving slabs, then a road across the front with a dashed middle line.
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.lineWidth = 2;
    for (let x = 0; x < TW; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, TH);
      g.stroke();
    }
    for (let y = 0; y < TH; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(TW, y);
      g.stroke();
    }
    g.fillStyle = '#4A4E55';
    g.fillRect(0, tz(2.2), TW, tz(3.7) - tz(2.2));
    g.fillStyle = '#F2D34A';
    for (let x = 20; x < TW; x += 90) g.fillRect(x, (tz(2.2) + tz(3.7)) / 2 - 4, 50, 8);
    g.fillStyle = '#9C9892';
    g.fillRect(0, tz(2.2) - 10, TW, 10);
  } else if (id === 'desert' || id === 'beach') {
    g.strokeStyle = id === 'desert' ? 'rgba(170,120,60,0.25)' : 'rgba(180,150,90,0.2)';
    g.lineWidth = 3;
    for (let k = 0; k < 24; k++) {
      const y = (k / 24) * TH;
      g.beginPath();
      for (let x = 0; x <= TW; x += 16) g.lineTo(x, y + 8 * Math.sin(x * 0.012 + k * 1.7));
      g.stroke();
    }
  } else if (id === 'moon') {
    for (let i = 0; i < 26; i++) {
      const x = hash(i + 5) * TW;
      const y = hash(i + 9) * TH;
      const r = 12 + hash(i + 2) * 46;
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.ellipse(x + r * 0.15, y + r * 0.2, r * 0.8, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === 'studio') {
    const r = g.createRadialGradient(TW / 2, TH / 2, 40, TW / 2, TH / 2, TW * 0.7);
    r.addColorStop(0, 'rgba(255,255,255,0.5)');
    r.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = r;
    g.fillRect(0, 0, TW, TH);
  } else if (id === 'park') {
    g.fillStyle = 'rgba(225,210,180,0.9)';
    g.beginPath();
    for (let x = 0; x <= TW; x += 12) g.lineTo(x, TH * 0.62 + 60 * Math.sin(x * 0.006));
    for (let x = TW; x >= 0; x -= 12) g.lineTo(x, TH * 0.62 + 60 * Math.sin(x * 0.006) + 46);
    g.fill();
  } else if (id === 'farm') {
    g.fillStyle = 'rgba(120,80,40,0.18)';
    for (let k = 0; k < 8; k++) g.fillRect(0, (k * TH) / 8, TW, 14);
  }
  if (id !== 'studio' && id !== 'city')
    for (let i = 0; i < 900; i++) {
      g.fillStyle = hash(i) > 0.5 ? G.flecks[0] : G.flecks[1];
      g.fillRect(hash(i + 3) * TW, hash(i + 7) * TH, 2, 5);
    }
  topBase.set(id, c);
  return c;
}

const sideBase = new Map<string, HTMLCanvasElement>();
function soilCanvas(id: DioGround, w: number, span: number): HTMLCanvasElement {
  const key = `${id}:${w}`;
  const hit = sideBase.get(key);
  if (hit) return hit;
  const c = layersCanvas(w, span, GROUNDS[id].layers, GROUNDS[id].edge);
  sideBase.set(key, c);
  return c;
}

// ── Pieces ────────────────────────────────────────────────────────────────
type Kind = 'building' | 'plant' | 'thing' | 'vehicle' | 'living' | 'land';
type Zone = 'back' | 'mid' | 'front' | 'edge' | 'any';
interface Spec {
  r: number;
  zone: Zone;
  kind: Kind;
}
const SPEC: Record<string, Spec> = {
  house: { r: 1.55, zone: 'back', kind: 'building' },
  cabin: { r: 1.1, zone: 'back', kind: 'building' },
  mansion: { r: 2.1, zone: 'back', kind: 'building' },
  shop: { r: 1.2, zone: 'back', kind: 'building' },
  office: { r: 1.3, zone: 'back', kind: 'building' },
  tower: { r: 1.15, zone: 'back', kind: 'building' },
  factory: { r: 1.8, zone: 'back', kind: 'building' },
  warehouse: { r: 1.75, zone: 'back', kind: 'building' },
  barn: { r: 1.5, zone: 'back', kind: 'building' },
  castle: { r: 2.1, zone: 'back', kind: 'building' },
  tent: { r: 0.75, zone: 'mid', kind: 'building' },
  shed: { r: 0.65, zone: 'edge', kind: 'building' },
  garage: { r: 1.0, zone: 'back', kind: 'building' },
  stand: { r: 0.7, zone: 'front', kind: 'building' },
  tree: { r: 0.75, zone: 'edge', kind: 'plant' },
  pine: { r: 0.6, zone: 'edge', kind: 'plant' },
  palm: { r: 0.6, zone: 'edge', kind: 'plant' },
  bush: { r: 0.45, zone: 'edge', kind: 'plant' },
  rock: { r: 0.45, zone: 'any', kind: 'plant' },
  flowers: { r: 0.45, zone: 'front', kind: 'plant' },
  cactus: { r: 0.4, zone: 'any', kind: 'plant' },
  crops: { r: 1.25, zone: 'mid', kind: 'plant' },
  hay: { r: 0.4, zone: 'any', kind: 'plant' },
  volcano: { r: 1.7, zone: 'back', kind: 'land' },
  car: { r: 0.72, zone: 'front', kind: 'vehicle' },
  truck: { r: 1.05, zone: 'front', kind: 'vehicle' },
  van: { r: 0.85, zone: 'front', kind: 'vehicle' },
  tractor: { r: 0.75, zone: 'mid', kind: 'vehicle' },
  boat: { r: 0.9, zone: 'front', kind: 'vehicle' },
  rocket: { r: 0.85, zone: 'mid', kind: 'vehicle' },
  fence: { r: 1.25, zone: 'edge', kind: 'thing' },
  mailbox: { r: 0.25, zone: 'front', kind: 'thing' },
  lamp: { r: 0.25, zone: 'front', kind: 'thing' },
  bench: { r: 0.45, zone: 'front', kind: 'thing' },
  sign: { r: 0.4, zone: 'front', kind: 'thing' },
  statue: { r: 0.5, zone: 'mid', kind: 'thing' },
  fountain: { r: 0.85, zone: 'mid', kind: 'thing' },
  flag: { r: 0.35, zone: 'any', kind: 'thing' },
  campfire: { r: 0.45, zone: 'mid', kind: 'thing' },
  solar: { r: 0.9, zone: 'any', kind: 'thing' },
  windmill: { r: 0.6, zone: 'edge', kind: 'thing' },
  dish: { r: 0.5, zone: 'any', kind: 'thing' },
  server: { r: 0.45, zone: 'any', kind: 'thing' },
  desk: { r: 0.6, zone: 'mid', kind: 'thing' },
  coins: { r: 0.45, zone: 'front', kind: 'thing' },
  gold: { r: 0.5, zone: 'front', kind: 'thing' },
  chest: { r: 0.45, zone: 'front', kind: 'thing' },
  grill: { r: 0.35, zone: 'mid', kind: 'thing' },
  swing: { r: 0.8, zone: 'edge', kind: 'thing' },
  trampoline: { r: 0.8, zone: 'mid', kind: 'thing' },
  hottub: { r: 0.65, zone: 'mid', kind: 'thing' },
  crane: { r: 0.6, zone: 'back', kind: 'thing' },
  billboard: { r: 0.9, zone: 'edge', kind: 'thing' },
  atm: { r: 0.3, zone: 'front', kind: 'thing' },
  money: { r: 0.65, zone: 'front', kind: 'thing' },
  person: { r: 0.25, zone: 'front', kind: 'living' },
  crowd: { r: 0.85, zone: 'front', kind: 'living' },
  dog: { r: 0.3, zone: 'front', kind: 'living' },
  cow: { r: 0.55, zone: 'mid', kind: 'living' },
  robot: { r: 0.3, zone: 'front', kind: 'living' },
};
const specOf = (name: string): Spec => SPEC[name] ?? { r: 0.5, zone: 'any', kind: 'thing' };

type Role = 'wall' | 'roof' | 'wood' | 'metal' | 'paint' | 'glass' | 'light' | 'leaf' | 'trunk' | 'stone' | 'skin' | 'cloth' | 'fire' | 'water' | 'ground';

interface Obj {
  root: THREE.Group;
  body: THREE.Group;
  mats: Array<{ m: THREE.MeshStandardMaterial; base: THREE.Color; role: Role }>;
  roofs: THREE.Object3D[];
  leaves: THREE.Object3D[];
  mound: THREE.Mesh | null;
  h: number;
  anim: Array<(t: number) => void>;
  kind: Kind;
  name: string;
  /** Parts a piece moves by itself (a rocket's ship and flame, money stacks, a volcano's lava). */
  extra: THREE.Object3D[];
  /** Rising buildings: everything above this plane is cut away, with the floor being built on top. */
  clip: THREE.Plane | null;
  cap: THREE.Mesh | null;
  top: number;
  roofBase: Array<{ p: THREE.Vector3; r: THREE.Euler }>;
}

const CAR = ['#E0483E', '#3D7BD9', '#F2C230', '#F5F5F5', '#2FA36B', '#2A2E37', '#F07A2C'];
const SHIRT = ['#3D7BD9', '#E0483E', '#2FA36B', '#F2C230', '#8E5BD6', '#F07A2C', '#26A6A6'];
const SKIN = ['#F1C8A4', '#C98E5E', '#8D5A3B', '#E7B48A', '#5E3A26'];

class Kit {
  g = new THREE.Group();
  mats: Obj['mats'] = [];
  roofs: THREE.Object3D[] = [];
  leaves: THREE.Object3D[] = [];
  anim: Obj['anim'] = [];
  extra: THREE.Object3D[] = [];
  text = '';
  h = 1;
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  mat(color: string, role: Role, rough = 0.8): THREE.MeshStandardMaterial {
    const key = `${color}:${role}:${rough}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: role === 'leaf' || role === 'stone' });
    if (role === 'light') {
      m.emissive = new THREE.Color('#FFD27A');
      m.emissiveIntensity = 0;
    }
    if (role === 'fire') {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 1;
    }
    if (role === 'water') {
      m.transparent = true;
      m.opacity = 0.85;
      m.roughness = 0.2;
    }
    this.cache.set(key, m);
    this.mats.push({ m, base: new THREE.Color(color), role });
    return m;
  }
  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.g): THREE.Mesh {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p?: THREE.Object3D): THREE.Mesh {
    return this.add(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);
  }
  cyl(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 14, p?: THREE.Object3D): THREE.Mesh {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, p);
  }
  cone(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 8, p?: THREE.Object3D): THREE.Mesh {
    return this.add(new THREE.ConeGeometry(r, h, seg), m, x, y, z, p);
  }
  ball(r: number, m: THREE.Material, x: number, y: number, z: number, detail = 0, p?: THREE.Object3D): THREE.Mesh {
    return this.add(new THREE.IcosahedronGeometry(r, detail), m, x, y, z, p);
  }
  /** A gable roof: ridge along x, w long, d deep, h tall, its base at y. */
  gable(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    const o = this.add(geo, m, x, y, z);
    this.roofs.push(o);
    return o;
  }
  /** A four-sided hip roof. */
  hip(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const o = this.cone(0.7071, h, m, x, y + h / 2, z, 4);
    o.rotation.y = Math.PI / 4;
    o.scale.set(w, 1, d);
    this.roofs.push(o);
    return o;
  }
  windows(n: number, w: number, y: number, z: number, ww = 0.42, wh = 0.42, rows = 1, dy = 0.7): void {
    const m = this.mat('#9FD3F5', 'light', 0.3);
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? 0 : -w / 2 + (k * w) / (n - 1);
        this.box(ww, wh, 0.05, m, x, y + r * dy, z);
      }
  }
  /** A flat panel with words on it (signs, billboards, shop fronts); glow = lit at night. */
  panel(text: string, w: number, h: number, bg: string, fg: string, x: number, y: number, z: number, glow: boolean): THREE.Mesh {
    const cw = 512;
    const ch = Math.max(48, Math.round((cw * h) / w));
    const [c, g] = canvas(cw, ch);
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, ch);
    const words = text.toUpperCase();
    let size = Math.round(ch * 0.66);
    g.font = `900 ${size}px ${FONT.meme}`;
    while (size > 10 && g.measureText(words).width > cw * 0.9) {
      size -= 2;
      g.font = `900 ${size}px ${FONT.meme}`;
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(words, cw / 2, ch / 2 + size * 0.04);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    if (glow) {
      m.emissive = new THREE.Color('#FFFFFF');
      m.emissiveMap = tex;
      m.emissiveIntensity = 0;
    }
    this.mats.push({ m, base: new THREE.Color('#FFFFFF'), role: glow ? 'light' : 'paint' });
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    o.position.set(x, y, z);
    this.g.add(o);
    return o;
  }
  person(x: number, z: number, n: number, ry = 0, scale = 1): THREE.Group {
    const p = new THREE.Group();
    const shirt = this.mat(SHIRT[n % SHIRT.length], 'cloth');
    const pants = this.mat(n % 2 ? '#2B3242' : '#4A3B2E', 'cloth');
    const skin = this.mat(SKIN[n % SKIN.length], 'skin', 0.6);
    for (const s of [-0.07, 0.07]) this.box(0.1, 0.34, 0.12, pants, s, 0.17, 0, p);
    this.box(0.28, 0.34, 0.18, shirt, 0, 0.51, 0, p);
    for (const s of [-0.18, 0.18]) this.box(0.08, 0.3, 0.1, shirt, s, 0.52, 0, p);
    this.ball(0.13, skin, 0, 0.82, 0, 1, p);
    const hair = this.mat(['#2A1E16', '#6B4A2B', '#D9B35A', '#121212'][n % 4], 'cloth');
    this.box(0.25, 0.08, 0.24, hair, 0, 0.93, -0.01, p);
    p.position.set(x, 0, z);
    p.rotation.y = ry;
    p.scale.setScalar(scale);
    this.g.add(p);
    const ph = hash(n * 13 + x * 7);
    this.anim.push((t) => {
      p.position.y = Math.abs(Math.sin(t * 2.2 + ph * 6)) * 0.03;
      p.rotation.y = ry + 0.25 * Math.sin(t * 0.7 + ph * 9);
    });
    return p;
  }
}

const BUILD: Record<string, (k: Kit, n: number) => void> = {
  house: (k) => {
    k.box(2.6, 1.6, 2.0, k.mat('#F2EBDD', 'wall'), 0, 0.8, 0);
    k.gable(2.9, 1.0, 2.35, k.mat('#C4513B', 'roof', 0.7), 0, 1.6, 0);
    k.box(0.5, 0.95, 0.06, k.mat('#7A4A2A', 'wood'), 0, 0.48, 1.01);
    k.windows(2, 1.6, 1.0, 1.01);
    const ch = k.box(0.32, 0.8, 0.32, k.mat('#8E8A84', 'stone'), 0.8, 2.2, -0.4);
    k.roofs.push(ch);
    k.h = 2.7;
  },
  cabin: (k) => {
    const log = k.mat('#9B6A3E', 'wood');
    k.box(1.8, 1.15, 1.5, log, 0, 0.58, 0);
    for (let y = 0.15; y < 1.15; y += 0.22) k.box(1.86, 0.05, 1.56, k.mat('#7E5330', 'wood'), 0, y, 0);
    k.gable(2.1, 0.8, 1.8, k.mat('#3F5E3A', 'roof'), 0, 1.15, 0);
    k.box(0.4, 0.75, 0.05, k.mat('#5A3A22', 'wood'), -0.35, 0.38, 0.76);
    k.windows(1, 0, 0.7, 0.76, 0.36, 0.32);
    (k.g.children[k.g.children.length - 1] as THREE.Mesh).position.x = 0.45;
    k.h = 2.0;
  },
  mansion: (k) => {
    const wall = k.mat('#EDE7DA', 'wall');
    const roof = k.mat('#4E5D73', 'roof', 0.6);
    k.box(2.2, 2.0, 2.0, wall, 0, 1.0, 0);
    k.hip(2.4, 0.9, 2.2, roof, 0, 2.0, 0);
    for (const s of [-1, 1]) {
      k.box(1.1, 1.4, 1.7, wall, s * 1.6, 0.7, 0.1);
      k.hip(1.25, 0.6, 1.85, roof, s * 1.6, 1.4, 0.1);
      k.windows(1, 0, 0.75, 0.96, 0.4, 0.5);
      (k.g.children[k.g.children.length - 1] as THREE.Mesh).position.x = s * 1.6;
    }
    k.windows(3, 1.4, 0.75, 1.01, 0.34, 0.45, 2, 0.75);
    for (const x of [-0.5, 0.5]) k.cyl(0.08, 0.08, 1.8, k.mat('#FFFFFF', 'stone'), x, 0.9, 1.15, 10);
    k.box(1.3, 0.1, 0.4, k.mat('#FFFFFF', 'stone'), 0, 1.82, 1.15);
    k.box(0.45, 0.8, 0.05, k.mat('#4A2E1C', 'wood'), 0, 0.4, 1.02);
    k.h = 2.9;
  },
  shop: (k, n) => {
    k.box(2.0, 1.5, 1.5, k.mat(['#F6D9A8', '#CFE3F2', '#F2C9C9'][n % 3], 'wall'), 0, 0.75, 0);
    const slab = k.box(2.15, 0.14, 1.65, k.mat('#5A5E66', 'roof'), 0, 1.55, 0);
    k.roofs.push(slab);
    k.box(1.3, 0.75, 0.05, k.mat('#9FD3F5', 'light', 0.2), -0.25, 0.55, 0.76);
    k.box(0.4, 0.9, 0.05, k.mat('#5A3A22', 'wood'), 0.7, 0.45, 0.76);
    for (let i = 0; i < 6; i++) {
      const a = k.box(0.34, 0.06, 0.6, k.mat(i % 2 ? '#FFFFFF' : '#E0483E', 'cloth'), -0.85 + i * 0.34, 1.12, 0.98);
      a.rotation.x = 0.45;
    }
    k.box(1.2, 0.4, 0.08, k.mat('#2A2E37', 'paint'), 0, 1.85, 0.4);
    if (k.text) k.panel(k.text, 1.12, 0.32, '#2A2E37', '#FFD43B', 0, 1.85, 0.445, true);
    else k.box(1.0, 0.24, 0.02, k.mat('#FFD43B', 'light', 0.4), 0, 1.85, 0.45);
    k.h = 2.1;
  },
  office: (k) => {
    k.box(2.2, 2.9, 1.8, k.mat('#7FA7C9', 'glass', 0.25), 0, 1.45, 0);
    const band = k.mat('#EEF2F6', 'wall');
    for (let y = 0.02; y <= 2.9; y += 0.58) k.box(2.24, 0.1, 1.84, band, 0, y, 0);
    for (const x of [-1.1, 1.1]) k.box(0.1, 2.9, 1.84, band, x, 1.45, 0);
    k.windows(3, 1.4, 0.32, 0.91, 0.5, 0.36, 5, 0.58);
    const top = k.box(1.0, 0.3, 0.8, k.mat('#8E949C', 'roof'), 0.4, 3.05, -0.2);
    k.roofs.push(top);
    if (k.text) k.panel(k.text, 1.9, 0.4, '#EEF2F6', '#2A2E37', 0, 2.65, 0.93, true);
    k.h = 3.3;
  },
  tower: (k) => {
    k.box(1.7, 5.4, 1.7, k.mat('#4C6E91', 'glass', 0.2), 0, 2.7, 0);
    const band = k.mat('#DCE3EA', 'wall');
    for (let y = 0.02; y <= 5.4; y += 0.6) k.box(1.74, 0.07, 1.74, band, 0, y, 0);
    k.windows(3, 1.0, 0.32, 0.86, 0.34, 0.3, 9, 0.6);
    if (k.text) k.panel(k.text, 1.5, 0.5, '#111318', '#FFFFFF', 0, 5.05, 0.885, true);
    const top = k.box(1.2, 0.4, 1.2, k.mat('#8E949C', 'roof'), 0, 5.6, 0);
    k.roofs.push(top);
    const ant = k.cyl(0.03, 0.04, 1.0, k.mat('#C9CED6', 'metal', 0.4), 0.3, 6.3, 0.2, 6);
    k.roofs.push(ant);
    const tip = k.ball(0.07, k.mat('#FF4A3A', 'fire'), 0.3, 6.8, 0.2);
    k.roofs.push(tip);
    k.anim.push((t) => ((tip.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + 0.6 * (Math.sin(t * 4) > 0 ? 1 : 0)));
    k.h = 6.8;
  },
  factory: (k) => {
    k.box(3.0, 1.5, 2.0, k.mat('#B8B2A8', 'wall'), 0, 0.75, 0);
    const roof = k.mat('#6E747C', 'roof');
    for (let i = 0; i < 3; i++) k.gable(2.0, 0.5, 1.0, roof, -1.0 + i * 1.0, 1.5, 0).rotation.y = Math.PI / 2;
    k.windows(4, 2.2, 0.85, 1.01, 0.36, 0.5);
    const brick = k.mat('#A2513F', 'stone');
    const smoke = k.mat('#D9D9D9', 'stone');
    for (const [x, h] of [[1.05, 2.6], [0.55, 2.1]] as const) {
      const c = k.cyl(0.18, 0.22, h, brick, x, h / 2, -0.6, 10);
      k.roofs.push(c);
      for (let j = 0; j < 3; j++) {
        const s = k.ball(0.22, smoke, x, h + 0.2, -0.6, 1);
        s.castShadow = false;
        k.anim.push((t) => {
          const q = (t * 0.35 + j / 3 + x) % 1;
          s.position.set(x + q * 0.5, h + 0.1 + q * 1.4, -0.6);
          s.scale.setScalar(0.5 + q * 1.4);
          (s.material as THREE.MeshStandardMaterial).opacity = 1;
          s.visible = k.g.scale.y > 0.6;
        });
      }
    }
    k.h = 3.2;
  },
  warehouse: (k) => {
    k.box(3.0, 1.3, 2.2, k.mat('#9AA7B4', 'wall'), 0, 0.65, 0);
    const r = k.add(new THREE.CylinderGeometry(1.1, 1.1, 3.04, 16, 1, false, 0, Math.PI), k.mat('#7D8996', 'roof', 0.5), 0, 1.3, 0);
    r.rotation.set(0, 0, Math.PI / 2);
    r.scale.set(0.42, 1, 1);
    k.roofs.push(r);
    k.box(1.2, 1.0, 0.05, k.mat('#5F6B77', 'metal'), -0.5, 0.5, 1.11);
    for (let y = 0.1; y < 1.0; y += 0.12) k.box(1.2, 0.02, 0.06, k.mat('#4A5561', 'metal'), -0.5, y, 1.12);
    k.box(0.4, 0.8, 0.05, k.mat('#2C3440', 'wood'), 0.9, 0.4, 1.11);
    k.h = 1.8;
  },
  barn: (k) => {
    const red = k.mat('#B33A2E', 'wall');
    k.box(2.2, 1.5, 1.8, red, 0, 0.75, 0);
    k.gable(1.8, 1.0, 2.4, k.mat('#5A4A44', 'roof'), 0, 1.5, 0).rotation.y = Math.PI / 2;
    const trim = k.mat('#FFFFFF', 'wood');
    k.box(0.9, 1.0, 0.05, k.mat('#8E2A21', 'wood'), 0, 0.5, 0.91);
    for (const r of [0.8, -0.8]) {
      const b = k.box(1.25, 0.06, 0.06, trim, 0, 0.5, 0.94);
      b.rotation.z = r;
    }
    k.box(0.96, 0.06, 0.06, trim, 0, 1.0, 0.94);
    k.box(0.36, 0.36, 0.05, k.mat('#FFFFFF', 'wood'), 0, 1.8, 1.21);
    k.h = 2.5;
  },
  castle: (k) => {
    const st = k.mat('#A9A49B', 'stone');
    const roof = k.mat('#3E5C9A', 'roof', 0.6);
    k.box(2.6, 1.4, 2.4, st, 0, 0.7, 0);
    for (const [x, z] of [[-1.3, -1.2], [1.3, -1.2], [-1.3, 1.2], [1.3, 1.2]] as const) {
      k.cyl(0.45, 0.48, 2.2, st, x, 1.1, z, 10);
      const c = k.cone(0.58, 0.9, roof, x, 2.65, z, 10);
      k.roofs.push(c);
    }
    for (let i = 0; i < 6; i++) k.box(0.22, 0.25, 0.22, st, -1.0 + i * 0.4, 1.52, 1.2);
    k.box(1.2, 2.2, 1.2, st, 0, 1.1, -0.3);
    k.roofs.push(k.cone(0.9, 1.0, roof, 0, 2.7, -0.3, 4));
    k.box(0.55, 0.8, 0.06, k.mat('#5A3A22', 'wood'), 0, 0.4, 1.22);
    const fl = k.box(0.4, 0.24, 0.02, k.mat('#E0483E', 'cloth'), 0.2, 3.6, -0.3);
    k.cyl(0.02, 0.02, 0.8, k.mat('#333', 'metal'), 0, 3.4, -0.3, 6);
    k.roofs.push(fl);
    k.anim.push((t) => (fl.rotation.y = 0.3 * Math.sin(t * 3)));
    k.h = 3.8;
  },
  tent: (k, n) => {
    const t = k.cone(0.75, 1.1, k.mat(['#E8833A', '#3D7BD9', '#2FA36B'][n % 3], 'cloth'), 0, 0.55, 0, 4);
    t.rotation.y = Math.PI / 4;
    k.box(0.3, 0.5, 0.02, k.mat('#2A2E37', 'cloth'), 0, 0.25, 0.53);
    k.h = 1.1;
  },
  shed: (k) => {
    k.box(1.0, 0.9, 0.8, k.mat('#A7774A', 'wood'), 0, 0.45, 0);
    const r = k.box(1.15, 0.08, 1.0, k.mat('#5B6D4A', 'roof'), 0, 0.98, 0);
    r.rotation.x = -0.15;
    k.roofs.push(r);
    k.box(0.35, 0.65, 0.04, k.mat('#6E4A2A', 'wood'), 0, 0.33, 0.41);
    k.h = 1.1;
  },
  garage: (k) => {
    k.box(1.8, 1.1, 1.6, k.mat('#D8D2C6', 'wall'), 0, 0.55, 0);
    const r = k.box(1.95, 0.12, 1.75, k.mat('#6B6F77', 'roof'), 0, 1.16, 0);
    k.roofs.push(r);
    k.box(1.3, 0.85, 0.05, k.mat('#F0F0F0', 'metal'), 0, 0.43, 0.81);
    for (let y = 0.12; y < 0.85; y += 0.17) k.box(1.3, 0.02, 0.06, k.mat('#C8C8C8', 'metal'), 0, y, 0.82);
    k.h = 1.3;
  },
  stand: (k) => {
    k.box(1.1, 0.6, 0.5, k.mat('#F2C230', 'wood'), 0, 0.3, 0);
    for (const [x, z] of [[-0.5, -0.2], [0.5, -0.2], [-0.5, 0.2], [0.5, 0.2]] as const) k.box(0.05, 1.2, 0.05, k.mat('#8A5B34', 'wood'), x, 0.6, z);
    for (let i = 0; i < 4; i++) {
      const c = k.box(0.31, 0.05, 0.7, k.mat(i % 2 ? '#FFFFFF' : '#E0483E', 'cloth'), -0.47 + i * 0.31, 1.24, 0.05);
      c.rotation.x = 0.2;
      k.roofs.push(c);
    }
    k.box(0.9, 0.2, 0.04, k.mat('#FFFFFF', 'paint'), 0, 0.42, 0.26);
    k.h = 1.3;
  },
  tree: (k) => {
    k.cyl(0.14, 0.2, 1.4, k.mat('#7A4E2C', 'trunk'), 0, 0.7, 0, 8);
    const leaves = k.mat('#3E9F45', 'leaf', 0.9);
    for (const [x, y, z, r] of [[0, 1.7, 0, 0.75], [0.4, 1.45, 0.15, 0.55], [-0.38, 1.5, -0.1, 0.55], [0.08, 2.15, -0.05, 0.5]] as const) k.leaves.push(k.ball(r, leaves, x, y, z));
    k.anim.push((t) => (k.g.rotation.z = Math.sin(t * 1.3) * 0.015));
    k.h = 2.6;
  },
  pine: (k) => {
    k.cyl(0.1, 0.14, 0.6, k.mat('#6B4527', 'trunk'), 0, 0.3, 0, 8);
    const l = k.mat('#2E7A48', 'roof', 0.9);
    l.flatShading = true;
    for (const [y, r, h] of [[0.9, 0.62, 0.9], [1.45, 0.48, 0.8], [1.95, 0.32, 0.7]] as const) k.cone(r, h, l, 0, y, 0, 7);
    k.h = 2.3;
  },
  palm: (k) => {
    const tr = k.mat('#A7814F', 'trunk');
    for (let i = 0; i < 6; i++) k.cyl(0.1 - i * 0.008, 0.12 - i * 0.008, 0.36, tr, i * 0.05, 0.18 + i * 0.34, 0, 7).rotation.z = -0.1;
    const lf = k.mat('#3FA34D', 'leaf', 0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = k.box(1.0, 0.04, 0.24, lf, 0.3 + Math.cos(a) * 0.45, 2.1, Math.sin(a) * 0.45);
      b.rotation.y = -a;
      b.rotation.z = -0.35;
      k.leaves.push(b);
    }
    k.ball(0.1, k.mat('#6B4A2B', 'wood'), 0.3, 2.0, 0.08);
    k.h = 2.3;
  },
  bush: (k) => {
    const l = k.mat('#459E48', 'leaf', 0.9);
    for (const [x, y, z, r] of [[0, 0.3, 0, 0.38], [0.25, 0.25, 0.1, 0.28], [-0.24, 0.24, -0.05, 0.28]] as const) k.leaves.push(k.ball(r, l, x, y, z));
    k.h = 0.7;
  },
  rock: (k) => {
    const r = k.add(new THREE.DodecahedronGeometry(0.42, 0), k.mat('#8E8C88', 'stone'), 0, 0.22, 0);
    r.scale.set(1.1, 0.7, 0.9);
    k.h = 0.5;
  },
  flowers: (k) => {
    const stem = k.mat('#3F8F3A', 'leaf');
    const cols = ['#F05A7E', '#FFD43B', '#FFFFFF', '#B784F0', '#FF8A3D'];
    for (let i = 0; i < 9; i++) {
      const x = (hash(i + 1) - 0.5) * 0.7;
      const z = (hash(i + 7) - 0.5) * 0.7;
      k.box(0.03, 0.28, 0.03, stem, x, 0.14, z);
      k.leaves.push(k.ball(0.07, k.mat(cols[i % cols.length], 'leaf', 0.7), x, 0.3, z));
    }
    k.h = 0.4;
  },
  cactus: (k) => {
    const c = k.mat('#4E9A52', 'leaf', 0.8);
    k.cyl(0.14, 0.16, 1.2, c, 0, 0.6, 0, 8);
    k.cyl(0.08, 0.08, 0.4, c, 0.24, 0.7, 0, 8);
    k.cyl(0.08, 0.08, 0.3, c, 0.3, 0.95, 0, 8);
    k.cyl(0.08, 0.08, 0.4, c, -0.22, 0.55, 0, 8);
    k.cyl(0.08, 0.08, 0.3, c, -0.28, 0.78, 0, 8);
    k.h = 1.2;
  },
  crops: (k, n) => {
    k.box(2.4, 0.08, 1.6, k.mat('#6B4528', 'ground'), 0, 0.04, 0);
    const c = k.mat(n % 2 ? '#E2B93B' : '#5DAA3E', 'leaf', 0.9);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) k.leaves.push(k.cone(0.12, 0.42, c, -1.05 + i * 0.35, 0.29, -0.6 + r * 0.4, 5));
    k.h = 0.5;
  },
  hay: (k) => {
    const h = k.cyl(0.32, 0.32, 0.5, k.mat('#E2C268', 'wood'), 0, 0.32, 0, 14);
    h.rotation.x = Math.PI / 2;
    k.h = 0.64;
  },
  car: (k, n) => {
    const body = k.mat(CAR[n % CAR.length], 'paint', 0.35);
    k.box(1.3, 0.34, 0.62, body, 0, 0.32, 0);
    k.box(0.72, 0.3, 0.58, body, -0.08, 0.62, 0);
    k.box(0.74, 0.22, 0.6, k.mat('#9FD3F5', 'glass', 0.15), -0.08, 0.64, 0);
    const wheel = k.mat('#1B1D22', 'metal', 0.7);
    for (const [x, z] of [[-0.42, 0.3], [0.42, 0.3], [-0.42, -0.3], [0.42, -0.3]] as const) {
      const w = k.cyl(0.15, 0.15, 0.1, wheel, x, 0.15, z, 12);
      w.rotation.x = Math.PI / 2;
    }
    k.box(0.04, 0.08, 0.5, k.mat('#FFF3C0', 'light', 0.3), 0.66, 0.36, 0);
    k.h = 0.8;
  },
  truck: (k, n) => {
    const cab = k.mat(CAR[(n + 1) % CAR.length], 'paint', 0.4);
    k.box(0.6, 0.75, 0.8, cab, 0.85, 0.55, 0);
    k.box(0.1, 0.32, 0.72, k.mat('#9FD3F5', 'glass', 0.15), 1.15, 0.72, 0);
    k.box(1.5, 0.95, 0.85, k.mat('#E9ECEF', 'metal', 0.5), -0.25, 0.65, 0);
    const wheel = k.mat('#1B1D22', 'metal', 0.7);
    for (const [x, z] of [[-0.7, 0.4], [0.85, 0.4], [-0.7, -0.4], [0.85, -0.4], [-0.3, 0.4], [-0.3, -0.4]] as const) {
      const w = k.cyl(0.18, 0.18, 0.1, wheel, x, 0.18, z, 12);
      w.rotation.x = Math.PI / 2;
    }
    k.h = 1.15;
  },
  van: (k, n) => {
    const body = k.mat(['#F5F5F5', '#F2C230', '#3D7BD9'][n % 3], 'paint', 0.4);
    k.box(1.5, 0.8, 0.75, body, 0, 0.55, 0);
    k.box(0.1, 0.32, 0.66, k.mat('#9FD3F5', 'glass', 0.15), 0.75, 0.72, 0);
    const wheel = k.mat('#1B1D22', 'metal', 0.7);
    for (const [x, z] of [[-0.5, 0.36], [0.5, 0.36], [-0.5, -0.36], [0.5, -0.36]] as const) {
      const w = k.cyl(0.16, 0.16, 0.1, wheel, x, 0.16, z, 12);
      w.rotation.x = Math.PI / 2;
    }
    k.h = 1.0;
  },
  tractor: (k) => {
    const g = k.mat('#3E9A3E', 'paint', 0.5);
    k.box(0.9, 0.4, 0.5, g, 0.2, 0.45, 0);
    k.box(0.45, 0.5, 0.55, g, -0.25, 0.85, 0);
    k.box(0.4, 0.35, 0.5, k.mat('#9FD3F5', 'glass', 0.2), -0.25, 0.9, 0);
    const tyre = k.mat('#1B1D22', 'metal', 0.8);
    for (const z of [0.36, -0.36]) {
      k.cyl(0.38, 0.38, 0.18, tyre, -0.3, 0.38, z, 14).rotation.x = Math.PI / 2;
      k.cyl(0.2, 0.2, 0.14, tyre, 0.5, 0.2, z, 12).rotation.x = Math.PI / 2;
    }
    k.cyl(0.04, 0.05, 0.4, k.mat('#333', 'metal'), 0.45, 0.85, 0.1, 6);
    k.h = 1.15;
  },
  boat: (k) => {
    const hull = k.add(new THREE.CylinderGeometry(0.5, 0.3, 1.8, 12, 1, false, 0, Math.PI), k.mat('#F5F5F5', 'paint', 0.4), 0, 0.5, 0);
    hull.rotation.set(0, 0, -Math.PI / 2);
    k.box(1.7, 0.06, 0.95, k.mat('#A7774A', 'wood'), 0, 0.5, 0);
    k.cyl(0.03, 0.03, 1.8, k.mat('#8A5B34', 'wood'), 0.1, 1.3, 0, 6);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.8, 0);
    s.lineTo(0, 1.4);
    s.closePath();
    const sail = k.add(new THREE.ShapeGeometry(s), k.mat('#FFFFFF', 'cloth'), 0.14, 0.55, 0);
    (sail.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    k.roofs.push(sail);
    k.h = 2.2;
  },
  rocket: (k) => {
    k.cyl(1.0, 1.0, 0.12, k.mat('#8E949C', 'metal'), 0, 0.06, 0, 16);
    // The ship sits on its pad; a launch lifts the ship and leaves the pad.
    const ship = new THREE.Group();
    k.g.add(ship);
    const w = k.mat('#F2F2F2', 'paint', 0.35);
    k.cyl(0.32, 0.36, 2.6, w, 0, 1.45, 0, 16, ship);
    k.roofs.push(k.cone(0.32, 0.8, k.mat('#E0483E', 'paint', 0.4), 0, 3.15, 0, 16, ship));
    k.ball(0.12, k.mat('#2A2E37', 'glass', 0.2), 0, 2.3, 0.32, 1, ship);
    const fin = k.mat('#E0483E', 'paint', 0.4);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const f = k.box(0.05, 0.6, 0.4, fin, Math.cos(a) * 0.38, 0.5, Math.sin(a) * 0.38, ship);
      f.rotation.y = -a;
    }
    const flame = k.cone(0.26, 1.0, k.mat('#FF8A2A', 'fire'), 0, -0.3, 0, 10, ship);
    flame.rotation.x = Math.PI;
    flame.castShadow = false;
    flame.scale.setScalar(0.001);
    k.extra.push(ship, flame);
    k.h = 3.6;
  },
  fence: (k) => {
    const wd = k.mat('#E9E2D2', 'wood');
    for (let i = 0; i < 7; i++) k.box(0.08, 0.6, 0.06, wd, -1.2 + i * 0.4, 0.3, 0);
    for (const y of [0.2, 0.45]) k.box(2.5, 0.06, 0.04, wd, 0, y, 0);
    k.h = 0.6;
  },
  mailbox: (k) => {
    k.box(0.06, 0.7, 0.06, k.mat('#8A5B34', 'wood'), 0, 0.35, 0);
    k.box(0.22, 0.2, 0.36, k.mat('#3D6FD9', 'metal', 0.4), 0, 0.78, 0);
    k.box(0.02, 0.12, 0.06, k.mat('#E0483E', 'metal'), 0.12, 0.88, 0.1);
    k.h = 0.9;
  },
  lamp: (k) => {
    k.cyl(0.04, 0.06, 1.8, k.mat('#2E3138', 'metal', 0.4), 0, 0.9, 0, 8);
    k.box(0.4, 0.05, 0.08, k.mat('#2E3138', 'metal', 0.4), 0.15, 1.8, 0);
    k.box(0.16, 0.08, 0.12, k.mat('#FFF3C0', 'light', 0.3), 0.3, 1.74, 0);
    k.h = 1.85;
  },
  bench: (k) => {
    const wd = k.mat('#A7774A', 'wood');
    const mt = k.mat('#2E3138', 'metal');
    k.box(0.9, 0.06, 0.3, wd, 0, 0.32, 0);
    const b = k.box(0.9, 0.24, 0.05, wd, 0, 0.5, -0.15);
    b.rotation.x = -0.15;
    for (const x of [-0.38, 0.38]) k.box(0.05, 0.32, 0.3, mt, x, 0.16, 0);
    k.h = 0.62;
  },
  sign: (k) => {
    k.box(0.06, 1.0, 0.06, k.mat('#8A5B34', 'wood'), 0, 0.5, 0);
    k.box(0.75, 0.42, 0.05, k.mat('#FFD43B', 'paint', 0.5), 0, 0.95, 0.04);
    if (k.text) k.panel(k.text, 0.7, 0.36, '#FFD43B', '#2A2E37', 0, 0.95, 0.07, false);
    else {
      k.box(0.5, 0.06, 0.02, k.mat('#2A2E37', 'paint'), 0, 1.0, 0.07);
      k.box(0.4, 0.06, 0.02, k.mat('#2A2E37', 'paint'), 0, 0.88, 0.07);
    }
    k.h = 1.16;
  },
  statue: (k) => {
    k.box(0.6, 0.5, 0.6, k.mat('#C8C2B6', 'stone'), 0, 0.25, 0);
    const br = k.mat('#4E8C7A', 'metal', 0.5);
    k.box(0.24, 0.55, 0.18, br, 0, 0.78, 0);
    k.ball(0.13, br, 0, 1.15, 0, 1);
    const arm = k.box(0.07, 0.45, 0.07, br, 0.18, 1.2, 0);
    arm.rotation.z = -0.4;
    k.h = 1.4;
  },
  fountain: (k) => {
    const st = k.mat('#C8C2B6', 'stone');
    k.cyl(0.85, 0.9, 0.3, st, 0, 0.15, 0, 18);
    k.cyl(0.75, 0.75, 0.06, k.mat('#59C8F2', 'water'), 0, 0.29, 0, 18);
    k.cyl(0.1, 0.14, 0.7, st, 0, 0.6, 0, 10);
    k.cyl(0.35, 0.25, 0.1, st, 0, 0.95, 0, 14);
    const jet = k.cyl(0.04, 0.08, 0.5, k.mat('#BFE9FF', 'water'), 0, 1.2, 0, 8);
    jet.castShadow = false;
    k.anim.push((t) => (jet.scale.y = 0.85 + 0.15 * Math.sin(t * 6)));
    k.h = 1.45;
  },
  flag: (k, n) => {
    k.cyl(0.03, 0.04, 2.2, k.mat('#C9CED6', 'metal', 0.4), 0, 1.1, 0, 8);
    const f = new THREE.Group();
    f.position.set(0, 1.95, 0);
    k.g.add(f);
    const cl = k.mat(['#E0483E', '#3D7BD9', '#2FA36B', '#F2C230'][n % 4], 'cloth');
    const parts: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) parts.push(k.box(0.14, 0.42, 0.02, cl, 0.08 + i * 0.14, 0, 0, f));
    k.anim.push((t) => parts.forEach((p, i) => (p.position.z = 0.05 * Math.sin(t * 5 - i * 0.9) * i * 0.4)));
    k.h = 2.2;
  },
  campfire: (k) => {
    const lg = k.mat('#6B4527', 'wood');
    for (let i = 0; i < 4; i++) {
      const l = k.cyl(0.05, 0.05, 0.6, lg, 0, 0.08, 0, 6);
      l.rotation.z = Math.PI / 2;
      l.rotation.y = (i / 4) * Math.PI;
    }
    const st = k.mat('#8E8C88', 'stone');
    for (let i = 0; i < 8; i++) k.ball(0.09, st, Math.cos((i / 8) * Math.PI * 2) * 0.4, 0.06, Math.sin((i / 8) * Math.PI * 2) * 0.4);
    const f1 = k.cone(0.2, 0.55, k.mat('#FF8A2A', 'fire'), 0, 0.35, 0, 6);
    const f2 = k.cone(0.12, 0.4, k.mat('#FFD43B', 'fire'), 0.03, 0.3, 0.02, 6);
    f1.castShadow = f2.castShadow = false;
    k.anim.push((t) => {
      f1.scale.set(1, 0.8 + 0.3 * Math.abs(Math.sin(t * 9)), 1);
      f2.scale.set(1, 0.8 + 0.35 * Math.abs(Math.sin(t * 13 + 1)), 1);
    });
    k.h = 0.7;
  },
  solar: (k) => {
    const fr = k.mat('#C9CED6', 'metal', 0.4);
    const pv = k.mat('#1F3A6B', 'glass', 0.2);
    for (let i = 0; i < 3; i++) {
      k.box(0.05, 0.4, 0.05, fr, -0.6 + i * 0.6, 0.2, 0.2);
      const p = k.box(0.55, 0.04, 0.9, pv, -0.6 + i * 0.6, 0.42, 0);
      p.rotation.x = -0.5;
    }
    k.h = 0.7;
  },
  windmill: (k) => {
    k.cyl(0.07, 0.12, 3.2, k.mat('#F2F2F2', 'metal', 0.5), 0, 1.6, 0, 10);
    k.box(0.22, 0.2, 0.36, k.mat('#E9ECEF', 'metal', 0.5), 0, 3.2, 0);
    const hub = new THREE.Group();
    hub.position.set(0, 3.2, 0.2);
    k.g.add(hub);
    const bl = k.mat('#FFFFFF', 'metal', 0.4);
    for (let i = 0; i < 3; i++) {
      const b = k.box(0.1, 1.3, 0.03, bl, 0, 0.65, 0, hub);
      const p = new THREE.Group();
      p.rotation.z = (i / 3) * Math.PI * 2;
      hub.remove(b);
      p.add(b);
      hub.add(p);
    }
    k.anim.push((t) => (hub.rotation.z = t * 1.6));
    k.h = 4.4;
  },
  dish: (k) => {
    k.cyl(0.05, 0.08, 0.6, k.mat('#8E949C', 'metal'), 0, 0.3, 0, 8);
    const d = k.add(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), k.mat('#F2F2F2', 'metal', 0.4), 0, 0.8, 0);
    d.rotation.x = -2.2;
    (d.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    k.h = 1.2;
  },
  server: (k) => {
    k.box(0.6, 1.6, 0.6, k.mat('#22252C', 'metal', 0.4), 0, 0.8, 0);
    const leds: THREE.Mesh[] = [];
    for (let r = 0; r < 8; r++) {
      k.box(0.5, 0.02, 0.02, k.mat('#3A3F48', 'metal'), 0, 0.2 + r * 0.17, 0.31);
      const l = k.box(0.05, 0.04, 0.02, k.mat(r % 3 ? '#3BE07A' : '#3BA4FF', 'fire'), 0.18, 0.27 + r * 0.17, 0.31);
      leds.push(l);
    }
    k.anim.push((t) => leds.forEach((l, i) => ((l.material as THREE.MeshStandardMaterial).emissiveIntensity = hash(i + Math.floor(t * 6) * 7) > 0.4 ? 1.4 : 0.15)));
    k.h = 1.6;
  },
  desk: (k) => {
    const wd = k.mat('#C9A27A', 'wood');
    k.box(1.1, 0.06, 0.55, wd, 0, 0.72, 0);
    for (const [x, z] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]] as const) k.box(0.05, 0.72, 0.05, k.mat('#2E3138', 'metal'), x, 0.36, z);
    k.box(0.6, 0.38, 0.04, k.mat('#1B1D22', 'metal'), 0, 1.0, -0.15);
    const scr = k.box(0.54, 0.32, 0.02, k.mat('#3BA4FF', 'fire'), 0, 1.0, -0.12);
    (scr.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
    k.box(0.05, 0.16, 0.05, k.mat('#1B1D22', 'metal'), 0, 0.82, -0.17);
    k.box(0.36, 0.02, 0.14, k.mat('#2E3138', 'metal'), 0, 0.76, 0.08);
    k.box(0.45, 0.06, 0.45, k.mat('#2A2E37', 'cloth'), 0, 0.45, 0.55);
    k.box(0.45, 0.5, 0.06, k.mat('#2A2E37', 'cloth'), 0, 0.72, 0.78);
    k.h = 1.2;
  },
  coins: (k) => {
    const g = k.mat('#F2C230', 'metal', 0.25);
    for (let s = 0; s < 4; s++) {
      const x = (s % 2) * 0.3 - 0.15;
      const z = Math.floor(s / 2) * 0.3 - 0.15;
      const n = 3 + Math.floor(hash(s + 3) * 6);
      for (let i = 0; i < n; i++) k.cyl(0.13, 0.13, 0.05, g, x + (hash(i + s * 9) - 0.5) * 0.03, 0.03 + i * 0.055, z, 14);
    }
    k.h = 0.5;
  },
  gold: (k) => {
    const g = k.mat('#E8B923', 'metal', 0.25);
    const bar = (x: number, y: number, z: number): void => void k.box(0.36, 0.12, 0.18, g, x, y, z);
    for (let i = 0; i < 3; i++) bar(-0.38 + i * 0.38, 0.06, 0);
    for (let i = 0; i < 2; i++) bar(-0.19 + i * 0.38, 0.18, 0);
    bar(0, 0.3, 0);
    k.h = 0.36;
  },
  chest: (k) => {
    k.box(0.7, 0.4, 0.45, k.mat('#8A5B34', 'wood'), 0, 0.2, 0);
    const lid = k.add(new THREE.CylinderGeometry(0.225, 0.225, 0.7, 12, 1, false, 0, Math.PI), k.mat('#7A4E2C', 'wood'), 0, 0.4, 0);
    lid.rotation.set(0, 0, Math.PI / 2);
    k.box(0.72, 0.06, 0.47, k.mat('#E8B923', 'metal', 0.3), 0, 0.3, 0);
    k.box(0.1, 0.12, 0.02, k.mat('#E8B923', 'metal', 0.3), 0, 0.36, 0.24);
    k.h = 0.62;
  },
  grill: (k) => {
    const b = k.mat('#1B1D22', 'metal', 0.4);
    k.add(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), b, 0, 0.8, 0);
    k.add(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), b, 0, 0.82, 0);
    for (let i = 0; i < 3; i++) {
      const l = k.box(0.03, 0.7, 0.03, b, Math.cos(i * 2.1) * 0.18, 0.35, Math.sin(i * 2.1) * 0.18);
      l.rotation.z = Math.cos(i * 2.1) * 0.15;
    }
    k.h = 1.1;
  },
  swing: (k) => {
    const m = k.mat('#D9483B', 'metal', 0.5);
    for (const x of [-0.75, 0.75])
      for (const z of [-0.3, 0.3]) {
        const l = k.cyl(0.04, 0.04, 1.6, m, x, 0.75, z * 0.5, 6);
        l.rotation.x = z;
      }
    k.cyl(0.04, 0.04, 1.6, m, 0, 1.52, 0, 6).rotation.z = Math.PI / 2;
    for (const x of [-0.35, 0.35]) {
      const s = new THREE.Group();
      s.position.set(x, 1.5, 0);
      k.g.add(s);
      k.box(0.01, 1.1, 0.01, k.mat('#8E949C', 'metal'), -0.12, -0.55, 0, s);
      k.box(0.01, 1.1, 0.01, k.mat('#8E949C', 'metal'), 0.12, -0.55, 0, s);
      k.box(0.3, 0.04, 0.16, k.mat('#2E3138', 'wood'), 0, -1.1, 0, s);
      k.anim.push((t) => (s.rotation.x = 0.35 * Math.sin(t * 2 + x * 4)));
    }
    k.h = 1.6;
  },
  trampoline: (k) => {
    k.cyl(0.8, 0.8, 0.06, k.mat('#1B1D22', 'cloth'), 0, 0.5, 0, 20);
    k.add(new THREE.TorusGeometry(0.8, 0.05, 6, 24), k.mat('#3D7BD9', 'paint'), 0, 0.52, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) k.box(0.04, 0.5, 0.04, k.mat('#8E949C', 'metal'), Math.cos(i * 1.57) * 0.75, 0.25, Math.sin(i * 1.57) * 0.75);
    k.h = 0.6;
  },
  hottub: (k) => {
    k.cyl(0.65, 0.65, 0.55, k.mat('#8A5B34', 'wood'), 0, 0.27, 0, 16);
    const w = k.cyl(0.56, 0.56, 0.04, k.mat('#59C8F2', 'water'), 0, 0.53, 0, 16);
    w.castShadow = false;
    k.h = 0.6;
  },
  crane: (k) => {
    const y = k.mat('#F2C230', 'metal', 0.5);
    k.box(0.32, 4.6, 0.32, y, 0, 2.3, 0);
    for (let h = 0.3; h < 4.6; h += 0.4) {
      const d = k.box(0.02, 0.45, 0.02, k.mat('#C99A1A', 'metal'), 0, h, 0.17);
      d.rotation.z = 0.6;
    }
    const top = new THREE.Group();
    top.position.set(0, 4.6, 0);
    k.g.add(top);
    k.box(3.2, 0.2, 0.2, y, 0.9, 0.1, 0, top);
    k.box(0.5, 0.4, 0.4, k.mat('#2E3138', 'metal'), -0.6, 0.3, 0, top);
    k.box(0.4, 0.3, 0.3, k.mat('#8E949C', 'stone'), -0.6, -0.1, 0, top);
    k.box(0.01, 1.4, 0.01, k.mat('#333', 'metal'), 2.2, -0.7, 0, top);
    k.box(0.3, 0.2, 0.3, k.mat('#E0483E', 'metal'), 2.2, -1.4, 0, top);
    k.roofs.push(top);
    k.anim.push((t) => (top.rotation.y = 0.6 * Math.sin(t * 0.4)));
    k.h = 4.9;
  },
  billboard: (k, n) => {
    for (const x of [-0.6, 0.6]) k.box(0.08, 1.4, 0.08, k.mat('#5A5E66', 'metal'), x, 0.7, 0);
    k.box(1.8, 0.9, 0.08, k.mat('#2A2E37', 'metal'), 0, 1.75, 0);
    const face = ['#FFD43B', '#3BA4FF', '#4ADE80'][n % 3];
    if (k.text) k.panel(k.text, 1.7, 0.8, face, '#111318', 0, 1.75, 0.045, true);
    else k.box(1.7, 0.8, 0.02, k.mat(face, 'light', 0.4), 0, 1.75, 0.05);
    k.h = 2.2;
  },
  atm: (k) => {
    k.box(0.5, 1.2, 0.4, k.mat('#2F6FD9', 'metal', 0.4), 0, 0.6, 0);
    const s = k.box(0.32, 0.24, 0.02, k.mat('#9FE7FF', 'fire'), 0, 0.85, 0.21);
    (s.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7;
    k.box(0.3, 0.06, 0.08, k.mat('#1B1D22', 'metal'), 0, 0.6, 0.22);
    k.h = 1.2;
  },
  money: (k) => {
    // Stacks of notes, the bottom layer first; how many show follows the counter.
    const bill = k.mat('#6FAF5B', 'paint', 0.7);
    const band = k.mat('#EDE6C8', 'paint', 0.7);
    const spots: Array<[number, number, number]> = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) spots.push([-0.36 + c * 0.36, 0, -0.22 + r * 0.22]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) spots.push([-0.18 + c * 0.36, 0.2, -0.11 + r * 0.22]);
    spots.push([0, 0.4, 0]);
    for (const [x, y, z] of spots) {
      const st = new THREE.Group();
      st.position.set(x, y, z);
      k.g.add(st);
      k.box(0.34, 0.2, 0.2, bill, 0, 0.1, 0, st);
      k.box(0.08, 0.205, 0.205, band, 0, 0.1, 0, st);
      k.extra.push(st);
    }
    k.h = 0.6;
  },
  volcano: (k) => {
    const rock = k.mat('#6E5E52', 'stone', 0.95);
    k.cyl(0.5, 1.65, 2.2, rock, 0, 1.1, 0, 11);
    k.cyl(0.42, 0.5, 0.1, k.mat('#4A3E36', 'stone', 0.95), 0, 2.22, 0, 11);
    const lava = k.cyl(0.36, 0.36, 0.06, k.mat('#FF6A1A', 'fire'), 0, 2.25, 0, 12);
    lava.castShadow = false;
    k.extra.push(lava);
    // Lava runs down the sides when it erupts.
    const hot = k.mat('#FF7A1A', 'fire');
    for (let j = 0; j < 4; j++) {
      const a = j * 1.7 + 0.4;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 0.48, 2.2, Math.sin(a) * 0.48);
      pivot.rotation.y = -a;
      k.g.add(pivot);
      const tilt = new THREE.Group();
      tilt.rotation.z = Math.atan2(1.15, 2.2);
      pivot.add(tilt);
      const run = k.box(0.05, 2.45, 0.22, hot, 0.03, -1.22, 0, tilt);
      run.castShadow = false;
      tilt.scale.y = 0.001;
      k.extra.push(tilt);
    }
    k.h = 2.3;
  },
  person: (k, n) => {
    k.person(0, 0, n, 0, 1.15);
    k.h = 1.1;
  },
  crowd: (k, n) => {
    for (let i = 0; i < 6; i++) k.person((hash(i + n) - 0.5) * 1.3, (hash(i * 3 + n) - 0.5) * 1.1, n + i, (hash(i + 5) - 0.5) * 1.2, 1.1);
    k.h = 1.05;
  },
  dog: (k, n) => {
    const fur = k.mat(['#C9873E', '#2A2522', '#EDE3D0'][n % 3], 'cloth');
    k.box(0.5, 0.2, 0.2, fur, 0, 0.3, 0);
    k.box(0.2, 0.2, 0.18, fur, 0.3, 0.45, 0);
    k.box(0.1, 0.08, 0.1, k.mat('#2A2522', 'skin'), 0.43, 0.42, 0);
    for (const [x, z] of [[-0.18, 0.07], [0.18, 0.07], [-0.18, -0.07], [0.18, -0.07]] as const) k.box(0.06, 0.22, 0.06, fur, x, 0.11, z);
    const tail = k.box(0.04, 0.2, 0.04, fur, -0.27, 0.45, 0);
    k.anim.push((t) => (tail.rotation.x = 0.6 * Math.sin(t * 12)));
    k.h = 0.55;
  },
  cow: (k) => {
    const w = k.mat('#F4F1EA', 'cloth');
    const b = k.mat('#1F1C1A', 'cloth');
    k.box(1.0, 0.5, 0.45, w, 0, 0.7, 0);
    k.box(0.36, 0.3, 0.3, w, 0.62, 0.85, 0);
    k.box(0.14, 0.14, 0.26, k.mat('#E9A3A3', 'skin'), 0.8, 0.78, 0);
    k.box(0.3, 0.3, 0.02, b, -0.15, 0.75, 0.235);
    k.box(0.25, 0.2, 0.02, b, 0.2, 0.8, -0.235);
    for (const [x, z] of [[-0.38, 0.15], [0.38, 0.15], [-0.38, -0.15], [0.38, -0.15]] as const) k.box(0.1, 0.45, 0.1, w, x, 0.23, z);
    k.h = 1.1;
  },
  robot: (k) => {
    const m = k.mat('#AEB6C2', 'metal', 0.35);
    k.box(0.4, 0.45, 0.3, m, 0, 0.6, 0);
    k.box(0.3, 0.26, 0.26, m, 0, 0.98, 0);
    for (const x of [-0.07, 0.07]) {
      const e = k.box(0.06, 0.05, 0.02, k.mat('#3BE0FF', 'fire'), x, 1.0, 0.14);
      e.castShadow = false;
    }
    for (const x of [-0.1, 0.1]) k.box(0.1, 0.38, 0.12, k.mat('#6E7682', 'metal'), x, 0.19, 0);
    for (const x of [-0.26, 0.26]) k.box(0.08, 0.36, 0.1, m, x, 0.6, 0);
    k.cyl(0.01, 0.01, 0.2, m, 0, 1.2, 0, 4);
    k.anim.push((t) => (k.g.rotation.y = 0.3 * Math.sin(t * 1.4)));
    k.h = 1.25;
  },
};

function makeObj(name: string, n: number, text = ''): Obj {
  const k = new Kit();
  k.text = text;
  (BUILD[name] ?? BUILD.rock)(k, n);
  const root = new THREE.Group();
  root.add(k.g);
  const spec = specOf(name);
  let mound: THREE.Mesh | null = null;
  if (spec.kind === 'building' || spec.kind === 'vehicle' || name === 'crane' || name === 'windmill' || name === 'rocket') {
    const m = new THREE.MeshStandardMaterial({ color: '#8D8778', roughness: 1, flatShading: true });
    mound = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), m);
    mound.scale.set(spec.r * 0.85, 0.001, spec.r * 0.7);
    mound.castShadow = true;
    mound.receiveShadow = true;
    mound.visible = false;
    root.add(mound);
  }
  const bb = new THREE.Box3().setFromObject(k.g);
  const top = Number.isFinite(bb.max.y) ? bb.max.y : k.h;
  let clip: THREE.Plane | null = null;
  let cap: THREE.Mesh | null = null;
  if (DIO_RISE[name]) {
    clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    for (const { m } of k.mats) {
      m.clippingPlanes = [clip];
      m.clipShadows = true;
    }
    cap = new THREE.Mesh(new THREE.BoxGeometry(bb.max.x - bb.min.x + 0.14, 0.08, bb.max.z - bb.min.z + 0.14), new THREE.MeshStandardMaterial({ color: '#BDB6AA', roughness: 0.9 }));
    cap.position.set((bb.max.x + bb.min.x) / 2, 0, (bb.max.z + bb.min.z) / 2);
    cap.castShadow = true;
    cap.visible = false;
    root.add(cap);
  }
  const roofBase = k.roofs.map((r) => ({ p: r.position.clone(), r: r.rotation.clone() }));
  return { root, body: k.g, mats: k.mats, roofs: k.roofs, leaves: k.leaves, mound, h: k.h, anim: k.anim, kind: spec.kind, name, extra: k.extra, clip, cap, top, roofBase };
}

// ── The plan: where every piece goes and when ─────────────────────────────
interface Placed {
  id: number;
  name: string;
  x: number;
  z: number;
  ry: number;
  r: number;
  add: number;
  del: number;
  beat: number;
  n: number;
  /** Words on it (signs, billboards, shop fronts...). */
  text: string;
  /** How far a person or animal wanders from its spot. */
  wr: number;
  /** When a rocket lifts off. */
  launch: number;
  /** Carried off by a disaster (instead of shrinking away). */
  fly: Fly | null;
  /** When a tornado takes its roof. */
  roofOff: number;
  /** Left leaning after a quake. */
  tilt: number;
  tiltAt: number;
}
interface Fly {
  t: number;
  how: 'up' | 'out' | 'wash';
  dx: number;
  dz: number;
  src: number;
}
interface Wild {
  name: 'tree' | 'pine' | 'bush';
  x: number;
  z: number;
  ry: number;
  th: number;
  s: number;
}
interface Plan {
  key: string;
  placed: Placed[];
  wild: Wild[];
  under: Array<{ item: CutItem; start: number; beat: number }>;
  anyUnder: boolean;
  firstOf: Map<number, Placed>;
  tallAt: number[];
  quakes: Array<{ start: number; dur: number }>;
  twisters: Array<{ start: number; a: number; b: number; z: number }>;
  meteors: Array<{ start: number; hit: number; x: number; z: number; r: number }>;
  erupts: Array<{ start: number; dur: number; id: number }>;
  waves: Array<{ a: number; b: number }>;
}

const TOP_FOOT: Partial<Record<CutItem, [number, number, number]>> = {
  pool: [2.2, 2.35, 1.7],
  pond: [-3.1, 3.0, 1.35],
  well: [0, 3.4, 0.6],
  bunker: [-1, 3.2, 0.5],
};
const AT: Record<string, [number, number]> = { left: [-3, 0.2], right: [3, 0.2], back: [0, -2.6], front: [0, 2.6], center: [0, 0] };
const ZONE: Record<Zone, [number, number]> = { back: [0, -2.4], mid: [0, 0.2], front: [0.2, 2.5], edge: [0, 0], any: [0, 0.3] };
const HEIGHT: Record<string, number> = {};

const plans = new Map<number, Plan>();
const TEXT_PIECES = new Set(['sign', 'billboard', 'shop', 'tower', 'office']);
const LOOSE = new Set(['mailbox', 'bench', 'sign', 'flag', 'campfire', 'dish', 'desk', 'coins', 'gold', 'chest', 'grill', 'swing', 'trampoline', 'money', 'hay', 'bush', 'flowers', 'cactus', 'tent']);
const WINDY = new Set(['tree', 'pine', 'palm', 'lamp', 'fence', 'solar', 'shed']);
/** What a wave or a tornado can carry off (a tornado takes trees, lamps and fences too). */
function portable(name: string, wind: boolean): boolean {
  const k = specOf(name).kind;
  if (k === 'living') return true;
  if (k === 'vehicle') return name !== 'rocket' && name !== 'boat';
  return LOOSE.has(name) || (wind && WINDY.has(name));
}

function makePlan(beats: StoryBeat[], key: string, signText: string, slot: number): Plan {
  const hit = plans.get(slot);
  if (hit && hit.key === key) return hit;
  const quakes: Plan['quakes'] = [];
  const twisters: Plan['twisters'] = [];
  const meteors: Plan['meteors'] = [];
  const erupts: Plan['erupts'] = [];
  const waves: Plan['waves'] = [];
  const placed: Placed[] = [];
  const under: Plan['under'] = [];
  const firstOf = new Map<number, Placed>();
  const reserved: Array<[number, number, number]> = [];
  const counts: Record<string, number> = {};
  let id = 0;
  let pool = false;
  for (const b of beats)
    for (const th of dioThings(b.visual)) {
      if (th.kind !== 'under' || th.remove) continue;
      if (th.name === 'pool') pool = true;
      const f = TOP_FOOT[th.name as CutItem];
      if (f && th.name !== 'pool' && !reserved.includes(f)) reserved.push(f);
    }
  beats.forEach((b, bi) => {
    const at = b.tags.find((x) => x.startsWith('at='))?.slice(3) ?? '';
    const lineText = (b.tags.find((x) => x.startsWith('text='))?.slice(5) ?? '').replace(/_/g, ' ').trim();
    let k = 0;
    for (const th of dioThings(b.visual)) {
      if (th.kind === 'under' && !th.remove) {
        if (!under.some((u) => u.item === th.name)) under.push({ item: th.name as CutItem, start: b.start, beat: bi });
        continue;
      }
      if (th.kind !== 'piece') continue;
      if (th.remove) {
        for (let c = 0; c < th.count; c++) {
          const live = placed.filter((p) => p.del === Infinity && (th.name === 'all' || p.name === th.name));
          if (th.name === 'all') {
            live.forEach((p, j) => (p.del = b.start + 0.1 + j * 0.05));
            break;
          }
          const last = live[live.length - 1];
          if (last) last.del = b.start + 0.1 + c * 0.12;
        }
        continue;
      }
      const spec = specOf(th.name);
      for (let c = 0; c < th.count; c++) {
        const live = placed.filter((p) => p.del === Infinity);
        const target = at && AT[at] ? AT[at] : ZONE[spec.zone];
        const same = live.filter((p) => p.name === th.name);
        let best: [number, number] | null = null;
        let bestScore = Infinity;
        for (let pass = 0; pass < 2 && !best; pass++) {
          const gap = pass === 0 ? 0.12 : -0.25;
          for (let gx = -BX + spec.r + 0.1; gx <= BX - spec.r - 0.1; gx += 0.25)
            for (let gz = -BZ + spec.r + 0.1; gz <= BZ - spec.r - 0.1; gz += 0.25) {
              let ok = true;
              for (const p of live) if (Math.hypot(p.x - gx, p.z - gz) < p.r + spec.r + gap) ok = false;
              for (const [rx, rz, rr] of reserved) if (Math.hypot(rx - gx, rz - gz) < rr + spec.r) ok = false;
              if (pool && gx > 0.65 - spec.r && gx < 3.75 + spec.r && gz > 0.6 - spec.r) ok = false;
              if (!ok) continue;
              let s: number;
              if (spec.zone === 'edge' && !at) s = Math.min(BX - Math.abs(gx), BZ - Math.abs(gz)) * 1.4 + Math.abs(gz + 1) * 0.15;
              else s = Math.hypot(gx - target[0], (gz - target[1]) * 1.2);
              // Repeats of one piece sit near each other (a row of shops, a stand of trees).
              if (same.length && !at) s += 0.35 * Math.min(...same.map((p) => Math.hypot(p.x - gx, p.z - gz)));
              s += 0.5 * hash(gx * 13.7 + gz * 7.1 + id);
              if (s < bestScore) {
                bestScore = s;
                best = [gx, gz];
              }
            }
        }
        const fx0 = target[0] + (hash(id) - 0.5) * 2;
        const fz0 = target[1] + (hash(id + 1) - 0.5) * 2;
        const [x, z] = best ?? [Math.max(-BX + spec.r, Math.min(BX - spec.r, fx0)), Math.max(-BZ + spec.r, Math.min(BZ - spec.r, fz0))];
        const n = (counts[th.name] = (counts[th.name] ?? -1) + 1);
        const kind = spec.kind;
        const ry = kind === 'plant' || kind === 'living' ? hash(id * 3) * Math.PI * 2 : kind === 'vehicle' ? (hash(id) - 0.5) * 0.6 : faceOf(th.name, x, z);
        const text = TEXT_PIECES.has(th.name) ? lineText || (th.name === 'sign' || th.name === 'billboard' ? signText : '') : '';
        const p: Placed = { id: id++, name: th.name, x, z, ry, r: spec.r, add: b.start + 0.15 + k * 0.14, del: Infinity, beat: bi, n, text, wr: 0, launch: Infinity, fly: null, roofOff: Infinity, tilt: 0, tiltAt: 0 };
        k++;
        placed.push(p);
        if (!firstOf.has(bi)) firstOf.set(bi, p);
      }
    }
    // What this line makes happen to what is there.
    const acts = dioThings(b.visual)
      .filter((x) => x.kind === 'action')
      .map((x) => x.name);
    if (!acts.length) return;
    const on = b.tags.find((x) => x.startsWith('on='))?.slice(3);
    const d = b.dur;
    const liveAt = (T: number): Placed[] => placed.filter((q) => q.add <= T && q.del > T);
    const pick = (T: number, test: (q: Placed) => boolean): Placed | undefined => {
      const l = [...liveAt(T)].reverse();
      return (on ? l.find((q) => q.name === on && test(q)) : undefined) ?? l.find(test);
    };
    if (acts.includes('launch')) {
      const r = pick(b.start + 1.2, (q) => q.name === 'rocket' && q.launch === Infinity);
      if (r) r.launch = Math.max(b.start + 0.3, r.add + 0.9);
    }
    if (acts.includes('quake')) {
      const q0 = { start: b.start + 0.1, dur: Math.max(0.8, Math.min(d - 0.1, 2.6)) };
      quakes.push(q0);
      for (const q of liveAt(q0.start))
        if (specOf(q.name).kind === 'building' && !q.tilt) {
          q.tilt = (hash(q.id + 40) > 0.5 ? 1 : -1) * (0.03 + 0.03 * hash(q.id + 41));
          q.tiltAt = q0.start;
        }
    }
    if (acts.includes('tornado')) {
      const a = b.start + Math.min(0.5, d * 0.15);
      const e = b.start + d * 0.9;
      const z = (hash(bi * 7 + 3) - 0.5) * 2.4;
      twisters.push({ start: b.start, a, b: e, z });
      const x0 = -BX + 0.6;
      const x1 = BX - 0.6;
      for (const q of liveAt(a)) {
        if (q.fly || Math.abs(q.z - z) > 1.0 + q.r * 0.6) continue;
        const tp = a + ((Math.max(x0, Math.min(x1, q.x)) - x0) / (x1 - x0)) * (e - a);
        if (portable(q.name, true)) {
          q.fly = { t: tp, how: 'up', dx: 0, dz: 0, src: twisters.length - 1 };
          q.del = Math.min(q.del, tp);
        } else if (specOf(q.name).kind === 'building' && q.roofOff === Infinity) q.roofOff = tp;
      }
    }
    if (acts.includes('meteor')) {
      const hitT = b.start + Math.min(1.1, d * 0.4);
      const live = liveAt(hitT);
      const tgt = (on ? [...live].reverse().find((q) => q.name === on) : undefined) ?? [...live].reverse().find((q) => specOf(q.name).kind === 'building');
      const x = tgt ? tgt.x : (hash(bi + 5) - 0.5) * 3;
      const z = tgt ? tgt.z : (hash(bi + 9) - 0.5) * 2;
      const r = 1.6;
      meteors.push({ start: b.start, hit: hitT, x, z, r });
      for (const q of live) {
        const dist = Math.hypot(q.x - x, q.z - z);
        if (q.fly || dist > r + q.r * 0.4 || specOf(q.name).kind === 'land') continue;
        const a2 = dist > 0.05 ? Math.atan2(q.z - z, q.x - x) : hash(q.id) * 6.28;
        q.fly = { t: hitT, how: 'out', dx: Math.cos(a2), dz: Math.sin(a2), src: meteors.length - 1 };
        q.del = Math.min(q.del, hitT);
      }
    }
    if (acts.includes('erupt')) {
      const v = pick(b.start + 1.2, (q) => q.name === 'volcano');
      if (v) erupts.push({ start: Math.max(b.start, v.add + 0.6), dur: d, id: v.id });
    }
    if (acts.includes('tsunami')) {
      const a = b.start + 0.2;
      const e = a + Math.min(2.4, Math.max(1.2, d * 0.6));
      waves.push({ a, b: e });
      for (const q of liveAt(a)) {
        if (q.fly || !portable(q.name, false)) continue;
        const tp = a + ((q.z + BZ) / (2 * BZ)) * (e - a);
        q.fly = { t: tp, how: 'wash', dx: 0, dz: 1, src: waves.length - 1 };
        q.del = Math.min(q.del, tp);
      }
    }
  });
  // How far each person or animal can wander without walking into something.
  for (const p of placed) {
    if (specOf(p.name).kind !== 'living' || p.name === 'crowd') continue;
    let free = p.name === 'dog' ? 0.5 : p.name === 'cow' ? 0.3 : 0.35;
    for (const q of placed) if (q !== p && q.add < p.del && q.del > p.add) free = Math.min(free, Math.hypot(q.x - p.x, q.z - p.z) - q.r - p.r);
    p.wr = Math.max(0, Math.min(free, BX - Math.abs(p.x) - p.r, BZ - Math.abs(p.z) - p.r));
  }
  // Where nature takes over when years pass: free spots, filled from the edges in.
  const wild: Wild[] = [];
  for (let i = 0; i < 60 && wild.length < 18; i++) {
    const x = (hash(i * 7 + 1) - 0.5) * (BX * 2 - 1.2);
    const z = (hash(i * 7 + 2) - 0.5) * (BZ * 2 - 1.2);
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.45)) continue;
    if (wild.some((w) => Math.hypot(w.x - x, w.z - z) < 1.0)) continue;
    if (Object.values(TOP_FOOT).some((f) => f && Math.hypot(f[0] - x, f[1] - z) < f[2] + 0.3)) continue;
    const r = hash(i + 50);
    wild.push({ name: r < 0.5 ? 'tree' : r < 0.75 ? 'pine' : 'bush', x, z, ry: hash(i) * 6, th: 1.5 + 2.0 * hash(i + 77), s: 0.8 + 0.5 * hash(i + 3) });
  }
  const tallAt = beats.map((b) => {
    const end = b.start + b.dur;
    let h = 0;
    for (const p of placed) if (p.add <= end && p.del > end) h = Math.max(h, HEIGHT[p.name] ?? 1.5);
    return h;
  });
  const plan: Plan = { key, placed, wild, under, anyUnder: under.length > 0, firstOf, tallAt, quakes, twisters, meteors, erupts, waves };
  plans.set(slot, plan);
  return plan;
}

/** Buildings face the front; ones on the far left or right turn a little toward the middle. */
function faceOf(name: string, x: number, z: number): number {
  if (name === 'fence') return Math.abs(x) > BX - 1.4 && Math.abs(z) < BZ - 1.4 ? Math.PI / 2 : 0;
  return -Math.max(-0.5, Math.min(0.5, x * 0.08));
}

// ── World state at time t ─────────────────────────────────────────────────
interface Key {
  t: number;
  dur: number;
  v: number;
}
/** A value that eases from key to key (each key ramps over its dur). */
function track(keys: Key[], t: number, v0: number): number {
  let v = v0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.t > t) break;
    const end = i + 1 < keys.length ? Math.min(t, keys[i + 1].t) : t;
    v = lerp(v, k.v, easeInOut(prog(end, k.t, k.dur)));
  }
  return v;
}

interface State {
  age: number;
  ageMoving: number;
  night: number;
  dusk: number;
  snow: number;
  autumn: number;
  winter: number;
  spring: number;
  wet: number;
  rain: number;
  storm: boolean;
  flood: number;
  grow: number;
  grassKeys: Key[];
  mows: Array<{ start: number; dur: number; z0: number }>;
  clearAt: number[];
  fires: Array<{ start: number; dur: number; target: number }>;
}

function worldAt(beats: StoryBeat[], plan: Plan, f: Env['fields'], t: number, ground: DioGround): State {
  const ageK: Key[] = [];
  const nightK: Key[] = [];
  const duskK: Key[] = [];
  const snowK: Key[] = [];
  const autK: Key[] = [];
  const winK: Key[] = [];
  const sprK: Key[] = [];
  const floodK: Key[] = [];
  const growK: Key[] = [];
  const grassKeys: Key[] = [];
  const mows: State['mows'] = [];
  const clearAt: number[] = [];
  const fires: State['fires'] = [];
  let rain = 0;
  let storm = false;
  let wet = 0;
  const sky0 = str(f, 'sky');
  const season0 = str(f, 'season');
  let ageMoving = 0;
  beats.forEach((b, bi) => {
    const s = b.start;
    const things = dioThings(b.visual);
    const has = (n: string): boolean => things.some((x) => x.kind === 'action' && x.name === n);
    for (const tag of b.tags) {
      if (tag.startsWith('age=')) {
        const v = Number(tag.slice(4)) || 0;
        const d = Math.min(b.dur * 0.75, 2.4);
        ageK.push({ t: s, dur: d, v: Math.log10(1 + v) });
        if (t >= s && t < s + d) ageMoving = Math.sin(Math.PI * prog(t, s, d));
      }
      if (tag.startsWith('sky=')) {
        const v = tag.slice(4);
        nightK.push({ t: s, dur: 1.2, v: v === 'night' ? 1 : 0 });
        duskK.push({ t: s, dur: 1.2, v: v === 'dusk' ? 1 : 0 });
      }
      if (tag.startsWith('season=')) {
        const v = tag.slice(7);
        winK.push({ t: s, dur: 1.2, v: v === 'winter' ? 1 : 0 });
        autK.push({ t: s, dur: 1.2, v: v === 'autumn' || v === 'fall' ? 1 : 0 });
        sprK.push({ t: s, dur: 1.2, v: v === 'spring' ? 1 : 0 });
        snowK.push({ t: s, dur: 1.5, v: v === 'winter' ? 1 : 0 });
      }
      if (tag === 'grass=long') grassKeys.push({ t: s, dur: 1.4, v: 0.42 });
      if (tag === 'grass=short') grassKeys.push({ t: s, dur: 0.8, v: 0 });
    }
    if (has('night')) {
      nightK.push({ t: s, dur: 1.4, v: 1 });
      duskK.push({ t: s, dur: 1.4, v: 0 });
    }
    if (has('day')) {
      nightK.push({ t: s, dur: 1.4, v: 0 });
      duskK.push({ t: s, dur: 1.4, v: 0 });
    }
    if (has('snow')) snowK.push({ t: s, dur: b.dur * 0.85, v: 1 });
    if (has('clear')) {
      snowK.push({ t: s, dur: 1.2, v: 0 });
      floodK.push({ t: s, dur: 1.2, v: -0.3 });
    }
    if (has('flood')) floodK.push({ t: s + 0.2, dur: b.dur * 0.8, v: 0.9 });
    if (has('drain')) floodK.push({ t: s, dur: b.dur * 0.8, v: -0.3 });
    if (has('grow')) {
      growK.push({ t: s, dur: b.dur * 0.8, v: 1 });
      grassKeys.push({ t: s, dur: b.dur * 0.8, v: 0.5 });
    }
    if (has('mow')) {
      const blds = plan.placed.filter((p) => specOf(p.name).kind === 'building' && p.z < 1 && p.add <= s + b.dur && p.del > s);
      mows.push({ start: s, dur: b.dur, z0: blds.length ? Math.min(1.2, Math.max(...blds.map((p) => p.z + p.r)) + 0.2) : -BZ + 0.3 });
    }
    if (has('clear')) clearAt.push(s);
    if (has('rain') || has('storm')) {
      if (t >= s && t < s + b.dur) {
        rain = Math.min(1, prog(t, s, 0.6)) * (1 - prog(t, s + b.dur - 0.4, 0.4));
        storm = has('storm');
      }
      if (t >= s) wet = Math.max(wet, t < s + b.dur ? prog(t, s, 1.5) : 1 - prog(t, s + b.dur, 3));
    }
    if (has('fire')) {
      const on = b.tags.find((x) => x.startsWith('on='))?.slice(3);
      const live = plan.placed.filter((p) => p.add <= s + 1.2 && p.del > s);
      const tgt = (on && [...live].reverse().find((p) => p.name === on)) || [...live].reverse().find((p) => specOf(p.name).kind === 'building') || live[live.length - 1];
      if (tgt) fires.push({ start: s, dur: b.dur, target: tgt.id });
    }
    // Years passing make the grass long too.
    for (const tag of b.tags) if (tag.startsWith('age=') && Number(tag.slice(4)) >= 5) grassKeys.push({ t: s, dur: Math.min(b.dur * 0.75, 2.4), v: 0.45 });
    void bi;
  });
  for (const wv of plan.waves) {
    floodK.push({ t: wv.b - 0.1, dur: 0.6, v: 0.7 });
    if (t >= wv.a) wet = Math.max(wet, t < wv.b + 4 ? prog(t, wv.a, 0.8) : 1 - prog(t, wv.b + 4, 3));
  }
  floodK.sort((x, y) => x.t - y.t);
  const age = Math.pow(10, track(ageK, t, 0)) - 1;
  return {
    age,
    ageMoving,
    night: track(nightK, t, sky0 === 'night' ? 1 : 0),
    dusk: track(duskK, t, sky0 === 'dusk' ? 1 : 0),
    snow: Math.max(ground === 'snow' ? 1 : 0, track(snowK, t, season0 === 'winter' ? 1 : 0)),
    autumn: track(autK, t, season0 === 'autumn' || season0 === 'fall' ? 1 : 0),
    winter: track(winK, t, season0 === 'winter' ? 1 : 0),
    spring: track(sprK, t, season0 === 'spring' ? 1 : 0),
    wet,
    rain,
    storm,
    flood: track(floodK, t, -0.3),
    grow: track(growK, t, 0),
    grassKeys,
    mows,
    clearAt,
    fires,
  };
}

// ── The 3D stage ──────────────────────────────────────────────────────────
interface Stage {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  front: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D };
  top: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D };
  grass: THREE.InstancedMesh | null;
  grassAt: Array<[number, number, number, number]>;
  flood: THREE.Mesh;
  mower: THREE.Group;
  flames: THREE.Group;
  twister: THREE.Group;
  rings: THREE.Mesh[];
  debris: THREE.Mesh[];
  meteor: THREE.Mesh;
  wave: THREE.Group;
  waveBody: THREE.Mesh;
  foam: THREE.Mesh;
  bombs: THREE.Mesh[];
  underProps: Partial<Record<CutItem, THREE.Object3D>>;
  objs: Map<number, Obj>;
  wild: Obj[];
  planKey: string;
}
const GRASS_N = 1500;
const ringR = (j: number): number => 0.18 + 0.06 * j + 0.02 * j * j;

function buildStage(key: string, fast: boolean, ground: DioGround, rw: number, rh: number): Stage {
  const renderer = makeRenderer(rw, rh, !fast);
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = fast ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, rw / rh, 0.5, 300);
  const hemi = new THREE.HemisphereLight('#ffffff', '#7a5a3a', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
  sun.position.set(9, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fast ? 1024 : 2048, fast ? 1024 : 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -10;
  sc.right = 10;
  sc.top = 10;
  sc.bottom = -10;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const [fc, fg] = canvas(FW, FH);
  const [tc, tg] = canvas(TW, TH);
  const front = { tex: tex(fc), g: fg };
  const top = { tex: tex(tc), g: tg };
  const side = new THREE.MeshStandardMaterial({ map: tex(soilCanvas(ground, Math.round((FW * BZ) / BX), 2)), roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: ground === 'studio' ? '#1E2027' : '#4A3A2E', roughness: 1 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, BY, BZ * 2), [
    side,
    side,
    new THREE.MeshStandardMaterial({ map: top.tex, roughness: 0.9 }),
    dark,
    new THREE.MeshStandardMaterial({ map: front.tex, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: tex(soilCanvas(ground, FW, 3)), roughness: 0.95 }),
  ]);
  block.position.y = -BY / 2;
  block.receiveShadow = true;
  scene.add(block);

  // Grass blades, tall or cut short.
  let grass: THREE.InstancedMesh | null = null;
  const grassAt: Stage['grassAt'] = [];
  if (GROUNDS[ground].grass) {
    const geo = new THREE.ConeGeometry(0.06, 1, 3);
    geo.translate(0, 0.5, 0);
    const m = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9, flatShading: true });
    grass = new THREE.InstancedMesh(geo, m, GRASS_N);
    grass.castShadow = false;
    grass.receiveShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < GRASS_N; i++) {
      const x = (hash(i * 1.7 + 0.3) - 0.5) * (BX * 2 - 0.12);
      const z = (hash(i * 2.3 + 0.9) - 0.5) * (BZ * 2 - 0.12);
      grassAt.push([x, z, hash(i * 5.1) * 6, 0.75 + 0.5 * hash(i * 3.3)]);
      c.set(GROUNDS[ground].top).offsetHSL((hash(i) - 0.5) * 0.04, 0.05, (hash(i + 4) - 0.6) * 0.18);
      grass.setColorAt(i, c);
    }
    scene.add(grass);
  }

  const flood = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 0.08, 1, BZ * 2 + 0.08), new THREE.MeshStandardMaterial({ color: '#3A8FD0', roughness: 0.15, transparent: true, opacity: 0.62 }));
  flood.visible = false;
  scene.add(flood);

  // The mower: a push mower and the person behind it.
  const mk = new Kit();
  mk.box(0.5, 0.2, 0.42, mk.mat('#E0483E', 'paint', 0.4), 0, 0.2, 0);
  mk.box(0.3, 0.1, 0.3, mk.mat('#2E3138', 'metal'), 0, 0.34, 0);
  for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]] as const) mk.cyl(0.08, 0.08, 0.05, mk.mat('#1B1D22', 'metal'), x, 0.08, z, 10).rotation.x = Math.PI / 2;
  const handle = mk.box(0.04, 0.04, 0.4, mk.mat('#2E3138', 'metal'), -0.45, 0.6, 0);
  handle.rotation.z = 0;
  mk.box(0.6, 0.04, 0.04, mk.mat('#2E3138', 'metal'), -0.3, 0.45, 0.18).rotation.z = -0.7;
  mk.box(0.6, 0.04, 0.04, mk.mat('#2E3138', 'metal'), -0.3, 0.45, -0.18).rotation.z = -0.7;
  mk.person(-0.75, 0, 2, Math.PI / 2, 1.1);
  mk.anim.length = 0;
  const mower = mk.g;
  mower.visible = false;
  scene.add(mower);

  // Flames for a fire (moved onto whatever burns).
  const flames = new THREE.Group();
  const fm = [new THREE.MeshBasicMaterial({ color: '#FF7A1A', transparent: true, opacity: 0.92 }), new THREE.MeshBasicMaterial({ color: '#FFD43B', transparent: true, opacity: 0.9 })];
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 6), fm[i % 2]);
    f.geometry.translate(0, 0.4, 0);
    flames.add(f);
  }
  flames.visible = false;
  scene.add(flames);

  // A tornado: open rings that widen upward and spin at different speeds, with debris going round.
  const twister = new THREE.Group();
  const tm = new THREE.MeshStandardMaterial({ color: '#8C9299', roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const rings: THREE.Mesh[] = [];
  for (let j = 0; j < 9; j++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(ringR(j + 1), ringR(j), 0.74, 16, 1, true), tm);
    ring.position.y = j * 0.7 + 0.37;
    twister.add(ring);
    rings.push(ring);
  }
  const debris: THREE.Mesh[] = [];
  const dm = new THREE.MeshStandardMaterial({ color: '#6B5A48', roughness: 1 });
  for (let j = 0; j < 16; j++) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), dm);
    twister.add(o);
    debris.push(o);
  }
  twister.visible = false;
  scene.add(twister);
  // A meteor.
  const meteor = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: '#5A3A2A', emissive: new THREE.Color('#FF6A1A'), emissiveIntensity: 1.4, roughness: 0.8, flatShading: true }));
  meteor.visible = false;
  scene.add(meteor);
  // A tsunami: a wall of water with foam on top, the block filling behind it.
  const wave = new THREE.Group();
  const waveBody = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 0.1, 1, 1), new THREE.MeshStandardMaterial({ color: '#2F7FC4', roughness: 0.15, transparent: true, opacity: 0.82 }));
  const foam = new THREE.Mesh(new THREE.BoxGeometry(BX * 2 + 0.14, 0.18, 0.45), new THREE.MeshStandardMaterial({ color: '#F2FAFF', roughness: 0.6 }));
  wave.add(waveBody, foam);
  wave.visible = false;
  scene.add(wave);
  // Lava bombs from an eruption.
  const bombs: THREE.Mesh[] = [];
  const bm = new THREE.MeshBasicMaterial({ color: '#FF8A2A' });
  for (let j = 0; j < 12; j++) {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), bm);
    o.visible = false;
    scene.add(o);
    bombs.push(o);
  }

  // Bits of the underground builds that show above ground (as in the backyard cutaway).
  const uk = new Kit();
  const underProps: Stage['underProps'] = {};
  const well = new THREE.Group();
  uk.add(new THREE.CylinderGeometry(0.48, 0.5, 0.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#9C948A', roughness: 0.9, side: THREE.DoubleSide }), 0, 0.25, 0, well);
  for (const x of [-0.45, 0.45]) uk.box(0.08, 1.1, 0.08, uk.mat('#6E4A2A', 'wood'), x, 0.55, 0, well);
  const wr = uk.cone(0.8, 0.45, uk.mat('#9A3F2E', 'roof'), 0, 1.3, 0, 4, well);
  wr.rotation.y = Math.PI / 4;
  wr.scale.set(1, 1, 0.7);
  well.position.set(0, 0, 3.4);
  underProps.well = well;
  const hatch = new THREE.Group();
  uk.box(0.7, 0.12, 0.7, uk.mat('#6F726F', 'metal', 0.5), 0, 0.06, 0, hatch);
  const ring = uk.add(new THREE.TorusGeometry(0.16, 0.04, 6, 16), uk.mat('#C9C2A0', 'metal', 0.4), 0, 0.15, 0, hatch);
  ring.rotation.x = Math.PI / 2;
  hatch.position.set(-1, 0, 3.2);
  underProps.bunker = hatch;
  const ladder = new THREE.Group();
  for (const x of [-0.18, 0.18]) {
    const rail = uk.add(new THREE.TorusGeometry(0.25, 0.03, 6, 12, Math.PI), uk.mat('#D9DDE2', 'metal', 0.3), x, 0.05, 0.25, ladder);
    rail.rotation.y = Math.PI / 2;
  }
  ladder.position.set(3.2, 0, 1.0);
  underProps.pool = ladder;
  for (const o of Object.values(underProps)) {
    o!.visible = false;
    scene.add(o!);
  }

  return { key, renderer, scene, camera, sun, hemi, front, top, grass, grassAt, flood, mower, flames, twister, rings, debris, meteor, wave, waveBody, foam, bombs, underProps, objs: new Map(), wild: [], planKey: '' };
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
      const sm = x as THREE.MeshStandardMaterial;
      sm.map?.dispose();
      sm.emissiveMap?.dispose();
      x.dispose();
    }
  });
}

function syncObjs(st: Stage, plan: Plan): void {
  if (st.planKey === plan.key) return;
  for (const o of st.objs.values()) {
    st.scene.remove(o.root);
    disposeTree(o.root);
  }
  for (const o of st.wild) {
    st.scene.remove(o.root);
    disposeTree(o.root);
  }
  st.objs.clear();
  st.wild = [];
  for (const p of plan.placed) {
    const o = makeObj(p.name, p.n, p.text);
    o.root.position.set(p.x, 0, p.z);
    o.root.rotation.y = p.ry;
    o.root.visible = false;
    st.scene.add(o.root);
    st.objs.set(p.id, o);
  }
  for (const w of plan.wild) {
    const o = makeObj(w.name, 0);
    o.root.position.set(w.x, 0, w.z);
    o.root.rotation.y = w.ry;
    o.root.visible = false;
    st.scene.add(o.root);
    st.wild.push(o);
  }
  st.planKey = plan.key;
}

// Weathering colours.
const C = {
  weather: new THREE.Color('#8B8072'),
  moss: new THREE.Color('#4F7F3A'),
  rust: new THREE.Color('#8A4B2A'),
  broken: new THREE.Color('#2E3236'),
  char: new THREE.Color('#2A2522'),
  snow: new THREE.Color('#F4F8FC'),
  autumn: new THREE.Color('#D9822B'),
  spring: new THREE.Color('#8ED16A'),
  wet: new THREE.Color('#3A3A44'),
  moundA: new THREE.Color('#8D8778'),
  moundB: new THREE.Color('#5C8B44'),
};

function styleObj(o: Obj, w: State, char: number, t: number): void {
  const L = Math.log10(1 + w.age);
  const kind = o.kind;
  const bldg = kind === 'building';
  const weather = bldg ? clamp01(L / 2.2) * 0.55 : clamp01(L / 1.8) * 0.6;
  const vines = bldg || kind === 'thing' ? clamp01((L - 1.4) / 1.2) * 0.5 : 0;
  const rust = clamp01((L - 0.8) / 1.0);
  const broken = clamp01((L - 1.3) / 0.5);
  for (const { m, base, role } of o.mats) {
    const c = m.color.copy(base);
    if (role === 'fire' || role === 'water') continue;
    if (role === 'wall' || role === 'wood' || role === 'roof' || role === 'stone' || role === 'cloth') c.lerp(C.weather, weather);
    if (role === 'wall' || role === 'stone' || role === 'roof' || role === 'wood') c.lerp(C.moss, vines);
    if (role === 'metal' || role === 'paint') c.lerp(C.rust, rust * (role === 'paint' ? 0.85 : 0.7));
    if (role === 'glass' || role === 'light') c.lerp(C.broken, broken * 0.8);
    if (role === 'leaf') {
      c.lerp(C.autumn, w.autumn * 0.85);
      c.lerp(C.spring, w.spring * 0.35);
    }
    if (char > 0) c.lerp(C.char, char * 0.9);
    if (w.snow > 0 && (role === 'roof' || role === 'leaf')) c.lerp(C.snow, w.snow * (o.name === 'pine' ? 0.4 : 0.8));
    if (w.wet > 0) c.lerp(C.wet, w.wet * 0.12);
    if (role === 'light') m.emissiveIntensity = (w.night * 1.3 + w.dusk * 0.5) * (1 - broken) * (1 - char);
  }
  // Leaves fall in winter.
  for (const l of o.leaves) l.scale.setScalar(Math.max(0.001, 1 - w.winter * (o.name === 'pine' ? 0 : 0.9)));
  for (const a of o.anim) a(t);
  // Roofs fall in, then the walls crumble to a grassy mound.
  const roofFall = Math.max(bldg ? clamp01((L - 1.85) / 0.7) : kind === 'thing' || kind === 'vehicle' ? clamp01((L - 2.0) / 0.8) : 0, char > 0.7 ? (char - 0.7) * 2 : 0);
  for (const r of o.roofs) {
    r.visible = roofFall < 0.97;
    r.scale.y = Math.max(0.001, 1 - roofFall * 0.9);
  }
  const collapse = bldg ? clamp01((L - 2.5) / 1.2) : kind === 'thing' || kind === 'vehicle' ? clamp01((L - 1.9) / 1.2) : 0;
  o.body.scale.y = lerp(1, 0.1, easeInOut(collapse)) * (1 - char * 0.12);
  o.body.rotation.z = (kind === 'plant' ? o.body.rotation.z : 0) + collapse * 0.08;
  if (o.mound) {
    const m = bldg ? clamp01((L - 2.8) / 0.9) : clamp01((L - 2.2) / 1.0) * 0.6;
    o.mound.visible = m > 0.01;
    o.mound.scale.y = Math.max(0.001, m * (bldg ? 1.25 : 0.4));
    (o.mound.material as THREE.MeshStandardMaterial).color.copy(C.moundA).lerp(C.moundB, clamp01((L - 3.2) / 0.7));
  }
}

// ── Camera ────────────────────────────────────────────────────────────────
interface Shot {
  yaw: number;
  pitch: number;
  dist: number;
  at: [number, number, number];
}
const mixShot = (a: Shot, b: Shot, k: number): Shot => ({
  yaw: lerp(a.yaw, b.yaw, k),
  pitch: lerp(a.pitch, b.pitch, k),
  dist: lerp(a.dist, b.dist, k),
  at: [lerp(a.at[0], b.at[0], k), lerp(a.at[1], b.at[1], k), lerp(a.at[2], b.at[2], k)],
});

function wideShot(plan: Plan, i: number): Shot {
  if (plan.anyUnder) return { yaw: 30, pitch: 24, dist: 42, at: [0, -3.2, 0] };
  const h = plan.tallAt[i] ?? 1;
  return { yaw: 30, pitch: 25, dist: 41 + 2.2 * Math.max(0, h - 2.6), at: [0, -2.4 + 0.45 * Math.min(h, 7), 0] };
}

/** Where an orbit line ends: 50 degrees on from where it starts (the end of an orbit just before it, else the wide yaw). */
function orbitEnd(beats: StoryBeat[], i: number, wideYaw: number): number {
  const isOrbit = (k: number): boolean => k >= 0 && beats[k].tags.includes('cam=orbit');
  let k = i;
  while (isOrbit(k - 1)) k--;
  return wideYaw - 50 * (i - k + 1);
}

function shotOf(plan: Plan, beats: StoryBeat[], i: number): Shot {
  const b = beats[i];
  const cam = b.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? '';
  const wide = wideShot(plan, i);
  if (cam === 'top') return { yaw: 20, pitch: 60, dist: 36, at: [0, -1.5, 0.4] };
  if (cam === 'front') return { yaw: 0, pitch: 10, dist: 36, at: [0, plan.anyUnder ? -3.4 : -1.4, 0] };
  if (cam === 'low') return { yaw: 24, pitch: 5, dist: 26, at: [0, 1.2, 0.5] };
  if (cam === 'orbit') return { ...wide, yaw: orbitEnd(beats, i, wide.yaw) };
  if (cam === 'close') {
    const on = b.tags.find((x) => x.startsWith('on='))?.slice(3);
    const p = (on && [...plan.placed].reverse().find((x) => x.name === on && x.add <= b.start + 0.5 && x.del > b.start)) || plan.firstOf.get(i);
    if (p) {
      const h = HEIGHT[p.name] ?? 1.5;
      return { yaw: 22 + (p.x > 2 ? -12 : p.x < -2 ? 12 : 0), pitch: 22, dist: Math.max(19, 13 + 3.2 * p.r + 2.4 * h), at: [p.x * 0.8, h * 0.4 - 0.6, p.z * 0.8] };
    }
    const u = plan.under.find((x) => x.beat === i);
    if (u) {
      const a = ANCHOR[u.item];
      return { yaw: 18, pitch: a[1] > 0 ? 28 : 12, dist: 30, at: [a[0] * 0.7, (a[1] > 0 ? a[1] * 0.5 : a[1]) - 1.2, a[2] > 3 ? 2 : a[2]] };
    }
  }
  return wide;
}

// ── Frame ─────────────────────────────────────────────────────────────────
const SKY: Record<string, [string, string, string]> = {
  day: ['#7EC8F7', '#CDEBFF', '#F4FAFF'],
  dusk: ['#2E2A6B', '#B65B7A', '#FFB27A'],
  night: ['#060A22', '#16204E', '#2B3570'],
  space: ['#020309', '#070B1C', '#10152E'],
  studio: ['#F2F3F6', '#E1E4EA', '#CDD2DB'],
};
const HIGHLIGHTS: Record<string, string> = { yellow: '#FFD43B', orange: '#FF9F1C', green: '#4ADE80', white: '#FFFFFF' };
const mixHex = (a: string, b: string, k: number): string => `#${new THREE.Color(a).lerp(new THREE.Color(b), clamp01(k)).getHexString()}`;

const numOf = (s: string): number | null => {
  const m = /\d[\d,]*(?:\.\d+)?/.exec(s.replace(/\s/g, ''));
  if (!m) return null;
  let n = Number(m[0].replace(/,/g, ''));
  if (/-\s*[$€£]?\s*\d/.test(s)) n = -n;
  if (/\d\s*k\b/i.test(s)) n *= 1000;
  if (/\d\s*(?:m|mil|million)\b/i.test(s) && !/\d\s*m\s*(?:deep|tall|high|long|wide|down|up)\b/i.test(s)) n *= 1e6;
  if (/\d\s*(?:b|bn|billion)\b/i.test(s)) n *= 1e9;
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (a >= 1e7) return `${(n / 1e6).toFixed(0)}M`;
  return Math.round(n).toLocaleString('en-US');
};

// Two blocks: one over the other, each with its own pieces, weather, camera, tag and counter.
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  slot: number;
}
const stages = new Map<number, Stage>();
const blockOf = (b: StoryBeat): number => (b.tags.includes('block=2') ? 2 : b.tags.includes('block=1') ? 1 : 0);
/** One block's lines: lines for the other block keep their timing and nothing else. */
function slotBeats(beats: StoryBeat[], slot: number): StoryBeat[] {
  if (!slot) return beats;
  return beats.map((x) => {
    const k = blockOf(x);
    return !k || k === slot ? x : { ...x, visual: '', a: '', b: '', tags: x.tags.filter((g) => !DIO_FLAG.test(g)) };
  });
}

interface Count {
  txt: string;
  v: number;
  max: number;
}
/** The corner number at time t (show: this line's value, counting up to it; total: the sum so far). */
function counterOf(beats: StoryBeat[], i: number, t: number, mode: string): Count | null {
  let max = 0;
  let sum = 0;
  for (const x of beats) {
    const n = numOf(x.b);
    if (n === null) continue;
    max = Math.max(max, Math.abs(n));
    sum += n;
  }
  let total = 0;
  let any = false;
  let shownVal: number | null = null;
  let prevVal: number | null = null;
  let raw = '';
  let start = 0;
  for (let k = 0; k <= i; k++) {
    const x = beats[k];
    const n = numOf(x.b);
    if (n === null) continue;
    any = true;
    prevVal = shownVal;
    shownVal = n;
    raw = x.b;
    start = x.start;
    total += n * easeOut(clamp01((t - x.start - 0.3) / 0.9));
  }
  if (!any) return null;
  if (mode === 'total') {
    const money = beats.some((x) => x.b.includes('$'));
    return { txt: `${total < 0 ? '-' : ''}${money ? '$' : ''}${fmt(Math.abs(total))}`, v: total, max: Math.max(Math.abs(sum), max) };
  }
  const r = raw.trim();
  const yearish = /^\d{3,5}$/.test(r) || /(?:^|\D)[12]\d{3}(?!\d|,)/.test(r) || /^(?:year|yr)\s*\d/i.test(r);
  // A year just appears the first time; later years count on from the one before.
  const v = lerp(prevVal ?? (yearish ? (shownVal ?? 0) : 0), shownVal ?? 0, easeOut(clamp01((t - start - 0.15) / 1.1)));
  const m = /^([^\d-]*?)-?([$€£]?)\d[\d,.]*(?:\s*(?:k|m(?!\s*(?:deep|tall|high|long|wide|down|up)\b)|b|bn|mil|million|billion)\b)?(.*)$/i.exec(r);
  const body = yearish ? String(Math.round(v)) : fmt(Math.abs(v));
  return { txt: m ? `${v < 0 ? '-' : ''}${m[1]}${m[2]}${body}${m[3]}` : body, v, max };
}

/** Where a tornado is at time t (it crosses the block left to right). */
function twPos(tw: Plan['twisters'][number], t: number): [number, number] {
  const u = clamp01((t - tw.a) / Math.max(0.1, tw.b - tw.a));
  return [lerp(-BX + 0.6, BX - 0.6, u), tw.z + 0.35 * Math.sin(t * 1.3)];
}
/** How far a piece can go from (x, z) along (dx, dz) and stay on the block. */
function edgeDist(x: number, z: number, dx: number, dz: number, r: number): number {
  const ex = BX - r - 0.1;
  const ez = BZ - r - 0.1;
  const ux = Math.abs(dx) < 1e-3 ? Infinity : ((dx > 0 ? ex : -ex) - x) / dx;
  const uz = Math.abs(dz) < 1e-3 ? Infinity : ((dz > 0 ? ez : -ez) - z) / dz;
  return Math.max(0, Math.min(ux, uz));
}
/** Cracks across the ground after a quake, growing while it shakes (k = 0..1). */
function paintCracks(g: CanvasRenderingContext2D, seed: number, k: number): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let c = 0; c < 4; c++) {
    let x = TW * (0.2 + 0.6 * hash(seed * 3 + c));
    let y = TH * (0.2 + 0.6 * hash(seed * 5 + c + 1));
    let a = hash(seed + c * 7) * Math.PI * 2;
    const pts: Array<[number, number]> = [[x, y]];
    const n = Math.max(1, Math.round(11 * k));
    for (let j = 0; j < n; j++) {
      a += (hash(seed + c * 13 + j) - 0.5) * 1.3;
      x += Math.cos(a) * 34;
      y += Math.sin(a) * 34;
      pts.push([x, y]);
    }
    for (const [lw, col] of [
      [10, 'rgba(255,255,255,0.16)'],
      [6, 'rgba(40,26,16,0.88)'],
    ] as const) {
      g.lineWidth = lw;
      g.strokeStyle = col;
      g.beginPath();
      pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }
  }
}
function puff(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  ctx.fill();
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const hiKey = str(env.fields, 'highlight');
  const hi = hiKey === 'accent' ? env.accent[1] : (HIGHLIGHTS[hiKey] ?? HIGHLIGHTS.yellow);
  if (!Object.keys(HEIGHT).length)
    for (const n of Object.keys(BUILD)) {
      const probe = makeObj(n, 0);
      HEIGHT[n] = probe.h;
      disposeTree(probe.root);
    }
  const two = str(env.fields, 'blocks') === 'two';
  const frames: Frame[] = two
    ? [
        { x: 0, y: 0, w: W, h: H / 2, slot: 1 },
        { x: 0, y: H / 2, w: W, h: H / 2, slot: 2 },
      ]
    : [{ x: 0, y: 0, w: W, h: H, slot: 0 }];
  for (const [k, s] of [...stages])
    if (!frames.some((f) => f.slot === k)) {
      s.renderer.dispose();
      s.renderer.forceContextLoss();
      stages.delete(k);
      plans.delete(k);
    }

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  let light = true;
  for (const fr of frames) if (!drawBlock(ctx, env, slotBeats(beats, fr.slot), i, t, fr, hi)) light = false;
  if (two) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, H / 2 - 3, W, 6);
  }
  captions(ctx, env, b, local, two ? H / 2 + 6 : 1500, hi);
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(light);
}

/** One block in its frame (the whole picture, or half of it). Returns whether the frame is light. */
function drawBlock(ctx: Ctx, env: Env, beats: StoryBeat[], i: number, t: number, fr: Frame, hi: string): boolean {
  const b = beats[i];
  const local = t - b.start;
  const ground = groundOf(env.fields);
  const G = GROUNDS[ground];
  const half = fr.h < H;
  // A half-height block is filmed from closer so it fills its half; drawn effects shrink to match.
  const distK = half ? 0.6 : 1;
  const zk = half ? fr.h / H / distK : 1;

  const fast = perfNow().fast3d;
  const rh = half ? Math.round((RW * fr.h) / fr.w) : RH;
  const key = `${fast}:${ground}:${rh}`;
  let st = stages.get(fr.slot);
  if (st && st.key !== key) {
    st.renderer.dispose();
    st.renderer.forceContextLoss();
    st = undefined;
  }
  if (!st) {
    st = buildStage(key, fast, ground, RW, rh);
    stages.set(fr.slot, st);
  }
  const signText = str(env.fields, 'sign_text').trim();
  const planKey = `${fr.slot}|${ground}|${signText}|${beats.map((x) => `${x.start.toFixed(2)}:${x.visual}:${x.tags.join(',')}`).join('|')}`;
  const plan = makePlan(beats, planKey, signText, fr.slot);
  syncObjs(st, plan);
  const w = worldAt(beats, plan, env.fields, t, ground);
  const L = Math.log10(1 + w.age);
  const mode = str(env.fields, 'counter') || 'total';
  const count = counterOf(beats, i, t, mode);
  // A money pile follows the counter (half by size, half by order of magnitude).
  const fill = count && count.max > 0 ? Math.max(1 / 14, clamp01((0.5 * Math.abs(count.v)) / count.max + (0.5 * Math.log10(1 + Math.abs(count.v))) / Math.log10(1 + count.max))) : 1;

  // Disasters going on now.
  const bump = (s0: number, d: number, fin: number, fout: number): number => (t < s0 || t > s0 + d ? 0 : Math.min(1, (t - s0) / fin) * (1 - prog(t, s0 + d - fout, fout)));
  let quake = 0;
  for (const q of plan.quakes) quake = Math.max(quake, bump(q.start, q.dur, 0.15, 0.5));
  const twNow = plan.twisters.find((x) => t >= x.start && t < x.b + 0.6) ?? null;
  const wind = twNow ? bump(twNow.start, twNow.b + 0.6 - twNow.start, 0.6, 0.8) : 0;
  let impact = 0;
  for (const m of plan.meteors) if (t >= m.hit) impact = Math.max(impact, 1 - clamp01((t - m.hit) / 0.9));
  let eruptK = 0;
  for (const e of plan.erupts) eruptK = Math.max(eruptK, bump(e.start, e.dur + 1.5, 0.4, 1.5));
  const dim = Math.max(w.rain, wind * 0.65, eruptK * 0.4);

  // Pieces: pop in (buildings go up floor by floor, cars drive in), shrink out (or get carried off), weather.
  let lastFire: State['fires'][number] | null = null;
  for (const f of w.fires) if (t >= f.start) lastFire = f;
  const charOf = (id: number): number => {
    let c = 0;
    for (const f of w.fires) if (f.target === id && t >= f.start) c = Math.max(c, clamp01((t - f.start - 0.3) / Math.max(0.8, f.dur * 0.85)));
    return c;
  };
  const shown: Array<{ p: Placed; o: Obj; s: number }> = [];
  for (const p of plan.placed) {
    const o = st.objs.get(p.id)!;
    const spec = specOf(p.name);
    const pin = clamp01((t - p.add) / 0.6);
    const fly = p.fly && t >= p.fly.t ? clamp01((t - p.fly.t) / 1.0) : 0;
    const pout = p.fly ? (fly >= 1 ? 1 : 0) : clamp01((t - p.del) / 0.45);
    const gone = spec.kind === 'living' ? clamp01((L - 1.2) / 0.6) : 0;
    let s = pin <= 0 ? 0 : Math.max(0.001, easeBack(pin)) * (1 - easeInOut(pout)) * (1 - gone);
    let ox = 0;
    let oy = (1 - easeOut(pin)) * 1.0;
    let oz = 0;
    let ry = p.ry;
    let spin = 0;
    let tumble = 0;
    // Buildings go up floor by floor.
    const rise = dioRiseTime(p.name);
    let cutY = 1e4;
    if (rise && t >= p.add) {
      s = 1 - easeInOut(pout);
      oy = 0;
      const rk = clamp01((t - p.add) / rise);
      if (rk < 1) {
        const F = DIO_RISE[p.name];
        const f = rk * F;
        cutY = ((o.top + 0.05) * (Math.floor(f) + easeInOut(clamp01((f % 1) * 1.5)))) / F;
      }
    }
    // Cars, vans, trucks and tractors drive in from the edge of the block, and drive off when taken away.
    if (spec.kind === 'vehicle' && p.name !== 'rocket' && p.name !== 'boat' && pin > 0) {
      const dx = Math.cos(p.ry);
      const dz = -Math.sin(p.ry);
      const back = edgeDist(p.x, p.z, -dx, -dz, p.r);
      const q = clamp01((t - p.add) / Math.min(1.2, 0.35 + back * 0.22));
      s = Math.min(1, (t - p.add) / 0.2);
      oy = 0;
      ox -= dx * back * (1 - easeOut(q));
      oz -= dz * back * (1 - easeOut(q));
      if (!p.fly && t >= p.del) {
        const u = clamp01((t - p.del) / 0.9);
        const fwd = edgeDist(p.x, p.z, dx, dz, p.r) * u * u;
        ox += dx * fwd;
        oz += dz * fwd;
        s = u >= 1 ? 0 : Math.min(1, (1 - u) / 0.25);
      }
    }
    // People and animals wander round their spot.
    if (spec.kind === 'living' && p.name !== 'crowd' && p.wr > 0.05 && !fly) {
      const a = t * (p.name === 'dog' ? 0.9 : p.name === 'cow' ? 0.25 : 0.45) + hash(p.id * 3.7) * 6.28;
      ox += p.wr * Math.sin(a);
      oz += p.wr * 0.6 * Math.sin(2 * a);
      const vx = Math.cos(a);
      const vz = 1.2 * Math.cos(2 * a);
      ry = p.name === 'dog' || p.name === 'cow' ? Math.atan2(-vz, vx) : Math.atan2(vx, vz);
    }
    // Boats bob, and float up on a flood.
    if (p.name === 'boat') oy = Math.max(oy, Math.max(0, w.flood) * 0.9) + 0.04 * Math.sin(t * 2 + p.id);
    // Carried off: up into a tornado, thrown out by a meteor, washed away by a wave.
    if (p.fly && fly > 0) {
      const f = p.fly;
      if (f.how === 'up') {
        const tw = plan.twisters[f.src];
        const [cx, cz] = tw ? twPos(tw, t) : [p.x, p.z];
        const pull = easeOut(Math.min(1, fly * 2));
        const rr = 0.5 + fly * 1.6;
        ox = (cx - p.x) * pull + Math.cos(t * 6 + p.id) * rr * pull;
        oz = (cz - p.z) * pull + Math.sin(t * 6 + p.id) * rr * pull;
        oy = fly * fly * 6;
        spin = fly * 9;
        tumble = fly * 3;
        s *= 1 - fly * fly;
      } else if (f.how === 'out') {
        ox = f.dx * fly * 4.5;
        oz = f.dz * fly * 4.5;
        oy = 7 * fly * (1 - fly) + fly * 0.5;
        spin = fly * 6;
        tumble = fly * 5;
        s *= 1 - fly * fly * fly;
      } else {
        oz = fly * 3.5;
        ox = (hash(p.id) - 0.5) * fly;
        oy = 0.7 * Math.sin(fly * Math.PI) + fly * 0.4;
        tumble = fly * 4;
        s *= 1 - fly * fly * fly;
      }
    }
    if (spec.kind === 'plant') s *= 1 + 0.5 * clamp01(L / 2) + 0.4 * w.grow;
    o.root.visible = s > 0.01;
    if (!o.root.visible) continue;
    o.root.scale.setScalar(s);
    o.root.position.set(p.x + ox, oy, p.z + oz);
    o.root.rotation.set(tumble, ry + spin, 0);
    styleObj(o, w, charOf(p.id), t);
    if (o.clip && o.cap) {
      o.clip.constant = cutY;
      o.cap.visible = cutY < 1e3;
      o.cap.position.y = Math.min(cutY, o.top);
    }
    // A quake shakes everything; buildings are left leaning a little.
    const lean = p.tilt && t >= p.tiltAt ? p.tilt * easeInOut(clamp01((t - p.tiltAt) / 1.5)) : 0;
    o.body.rotation.x = lean + quake * (spec.kind === 'building' ? 0.05 : 0.08) * Math.sin(t * 38 + p.id * 1.7) + (p.name === 'boat' ? 0.06 * Math.sin(t * 1.6 + p.id) : 0);
    // A tornado takes the roofs off what it passes.
    if (p.roofOff < Infinity) {
      const rq = t >= p.roofOff ? clamp01((t - p.roofOff) / 0.9) : 0;
      o.roofs.forEach((r, j) => {
        const base = o.roofBase[j];
        r.position.copy(base.p);
        r.rotation.copy(base.r);
        if (rq <= 0) return;
        r.position.y += rq * 5;
        r.position.x += rq * 1.6 * (j % 2 ? 1 : -1);
        r.rotation.z += rq * 4;
        if (rq >= 1) r.visible = false;
      });
    }
    if (p.name === 'rocket') {
      const [ship, flame] = o.extra;
      const lt = t - p.launch;
      if (lt >= 0) {
        const ign = clamp01(lt / 0.4);
        const fl = Math.max(0, lt - 0.8);
        flame.scale.set(Math.max(0.001, ign), Math.max(0.001, ign * (1 + 0.5 * Math.abs(Math.sin(t * 23)) + fl * 0.4)), Math.max(0.001, ign));
        ship.position.y = 2.6 * fl * fl + (fl > 0 ? 0 : 0.03 * Math.sin(t * 70) * ign);
        ship.visible = ship.position.y < 45;
      } else {
        flame.scale.setScalar(0.001);
        ship.position.y = 0;
        ship.visible = true;
      }
    }
    if (p.name === 'money')
      o.extra.forEach((sk, j) => {
        const v = clamp01(fill * o.extra.length - j);
        sk.visible = v > 0.02;
        sk.scale.y = Math.max(0.001, v);
      });
    if (p.name === 'volcano') {
      let run = 0;
      let heat = 0.35;
      for (const e of plan.erupts) {
        if (e.id !== p.id || t < e.start) continue;
        run = Math.max(run, clamp01((t - e.start - 0.3) / Math.max(0.6, e.dur * 0.6)));
        heat = t < e.start + e.dur ? 1 : Math.max(0.15, 1 - (t - e.start - e.dur) / 3);
      }
      const [disc, ...runs] = o.extra;
      ((disc as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + heat * (0.8 + 0.3 * Math.sin(t * 7));
      runs.forEach((r, j) => (r.scale.y = Math.max(0.001, clamp01(run * 1.3 - j * 0.1))));
      const rm = (runs[0].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      rm.emissiveIntensity = heat * 1.2;
      rm.color.set(mixHex('#3A2A24', '#FF7A1A', heat));
      rm.emissive.set(mixHex('#2A1A14', '#FF7A1A', heat));
    }
    shown.push({ p, o, s });
  }
  plan.wild.forEach((wd, k) => {
    const o = st.wild[k];
    const s = clamp01((L - wd.th) / 0.7) * wd.s * (1 + 0.3 * clamp01((L - 3) / 1));
    o.root.visible = s > 0.01;
    if (!o.root.visible) return;
    o.root.scale.setScalar(s);
    styleObj(o, { ...w, age: 0 }, 0, t);
  });

  // Underground builds.
  const built: Built[] = [];
  for (const u of plan.under) if (t >= u.start) built.push({ item: u.item, p: clamp01((t - u.start) / 1.4) });
  for (const [item, o] of Object.entries(st.underProps) as Array<[CutItem, THREE.Object3D]>) {
    const p = built.find((x) => x.item === item)?.p ?? 0;
    o.visible = p > 0.05 && (item !== 'pool' || p > 0.7);
    o.scale.setScalar(Math.max(0.001, item === 'pool' ? easeOut(prog(p, 0.7, 0.3)) : easeBack(clamp01(p / 0.7))));
  }

  // Grass.
  const mow = [...w.mows].reverse().find((m) => t >= m.start) ?? null;
  const rows = 7;
  const z0 = mow ? mow.z0 : -BZ + 0.3;
  const mowT0 = mow ? mow.start + 0.3 : 0;
  const rowT = mow ? (mow.dur * 0.88 - 0.3) / rows : 1;
  const rowW = (BZ - 0.2 - z0) / rows;
  const cutAt = (x: number, z: number): number => {
    if (!mow) return Infinity;
    if (z < z0) return mow.start + mow.dur * 0.9;
    const r = Math.min(rows - 1, Math.floor((z - z0) / rowW));
    const u = (x + BX) / (BX * 2);
    return mowT0 + (r + (r % 2 ? 1 - u : u)) * rowT;
  };
  const grassLong = (x: number, z: number): number => {
    let v = str(env.fields, 'grass') === 'long' ? 0.42 : 0;
    const keys = w.grassKeys;
    const events: Array<{ t: number; k?: Key; mow?: boolean }> = keys.map((k) => ({ t: k.t, k }));
    for (const m of w.mows) events.push({ t: cutAt(x, z) < Infinity && m === mow ? cutAt(x, z) : m.start + m.dur * 0.5, mow: true });
    events.sort((a, b2) => a.t - b2.t);
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      if (ev.t > t) break;
      if (ev.mow) v = 0;
      else if (ev.k) {
        const end = e + 1 < events.length ? Math.min(t, events[e + 1].t) : t;
        v = lerp(v, ev.k.v, easeInOut(prog(end, ev.k.t, ev.k.dur)));
      }
    }
    return v;
  };
  const craters = plan.meteors.filter((m) => t >= m.hit);
  if (st.grass) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v3 = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let anyLong = 0;
    for (let k = 0; k < GRASS_N; k++) {
      const [x, z, gry, hs] = st.grassAt[k];
      let h = grassLong(x, z) * hs;
      if (h > 0.02)
        for (const s of shown) {
          if (specOf(s.p.name).kind === 'living') continue;
          if (Math.hypot(s.p.x - x, s.p.z - z) < s.p.r * 0.75 * Math.min(1, s.s)) {
            h = 0;
            break;
          }
        }
      if (w.flood > 0.05) h = 0;
      if (built.some((bb) => (bb.item === 'pool' && x > 0.6 && x < 3.8 && z > 0.6) || (bb.item === 'pond' && Math.hypot((x + 3.1) / 1.4, (z - 3.0) / 1.1) < 1))) h = 0;
      if (craters.some((m) => Math.hypot(m.x - x, m.z - z) < m.r * 0.8)) h = 0;
      anyLong = Math.max(anyLong, h);
      e.set(0.12 * Math.sin(t * 1.6 + gry * 3) * (1 + w.rain * 2 + wind * 4), gry, 0);
      q.setFromEuler(e);
      sc.set(1, Math.max(0.001, h), 1);
      v3.set(x, 0, z);
      m4.compose(v3, q, h > 0.02 ? sc : sc.set(0.001, 0.001, 0.001));
      st.grass.setMatrixAt(k, m4);
    }
    st.grass.instanceMatrix.needsUpdate = true;
    st.grass.visible = anyLong > 0.02;
    const gm = st.grass.material as THREE.MeshStandardMaterial;
    gm.color.set('#FFFFFF').lerp(C.autumn, w.autumn * 0.35).lerp(C.snow, w.snow * 0.85);
  }
  // The mower, row by row.
  if (mow && t < mow.start + mow.dur) {
    const q = clamp01((t - mowT0) / (rowT * rows)) * rows;
    const r = Math.min(rows - 1, Math.floor(q));
    const u = q >= rows ? 1 : q - r;
    const dir = r % 2 ? -1 : 1;
    const x = (r % 2 ? 1 - u : u) * (BX * 2 - 0.8) - (BX - 0.4);
    st.mower.visible = true;
    st.mower.position.set(x, Math.abs(Math.sin(t * 14)) * 0.02, z0 + (r + 0.5) * rowW);
    st.mower.rotation.y = dir > 0 ? 0 : Math.PI;
  } else st.mower.visible = false;

  // Fire.
  const burning = lastFire && t < lastFire.start + lastFire.dur ? lastFire : null;
  if (burning) {
    const o = st.objs.get(burning.target);
    const p = plan.placed.find((x) => x.id === burning.target);
    if (o && p && o.root.visible) {
      const k = clamp01((t - burning.start) / 0.6) * (1 - prog(t, burning.start + burning.dur - 0.5, 0.5));
      st.flames.visible = k > 0.01;
      const h = (HEIGHT[p.name] ?? 1.5) * o.body.scale.y;
      st.flames.children.forEach((f, j) => {
        const a = (j / st.flames.children.length) * Math.PI * 2 + j;
        const rr = p.r * (0.3 + 0.5 * hash(j + 2));
        f.position.set(p.x + Math.cos(a) * rr, h * (0.35 + 0.6 * hash(j + 9)), p.z + Math.sin(a) * rr * 0.8);
        f.scale.set(k * (1 + 0.6 * hash(j)), k * (0.8 + 0.7 * Math.abs(Math.sin(t * (7 + j) + j))) * (1 + p.r * 0.6), k * (1 + 0.6 * hash(j)));
      });
    } else st.flames.visible = false;
  } else st.flames.visible = false;

  // Flood water.
  st.flood.visible = w.flood > -0.02;
  if (st.flood.visible) {
    const hgt = w.flood + 0.03;
    st.flood.scale.y = Math.max(0.01, hgt);
    st.flood.position.y = hgt / 2 - 0.03 + 0.02 * Math.sin(t * 2);
  }

  // Disasters in 3D: the tornado, the meteor, the wave, lava bombs.
  if (twNow && wind > 0.01) {
    const [cx, cz] = twPos(twNow, t);
    st.twister.visible = true;
    st.twister.position.set(cx, 0, cz);
    st.twister.scale.set(wind, Math.max(0.01, wind), wind);
    st.rings.forEach((r, j) => {
      r.rotation.y = t * (7 - j * 0.5);
      r.position.x = 0.25 * Math.sin(t * 2.2 + j * 0.55) * (j / 8);
    });
    st.debris.forEach((d, j) => {
      const q = (t * 0.5 + j / st.debris.length) % 1;
      const y = q * 6;
      const rr = ringR(y / 0.7) + 0.15;
      d.position.set(Math.cos(t * 5 + j * 2.3) * rr, y, Math.sin(t * 5 + j * 2.3) * rr);
      d.rotation.set(t * 7 + j, t * 5, 0);
    });
  } else st.twister.visible = false;
  const fall = [...plan.meteors].reverse().find((m) => t >= m.start && t < m.hit) ?? null;
  const meteorAt = (m: Plan['meteors'][number], u: number): [number, number, number] => {
    const e2 = u * u;
    return [lerp(m.x - 12, m.x, e2), lerp(22, 0.3, e2), lerp(m.z - 5, m.z, e2)];
  };
  if (fall) {
    st.meteor.visible = true;
    st.meteor.position.set(...meteorAt(fall, (t - fall.start) / (fall.hit - fall.start)));
    st.meteor.rotation.set(t * 4, t * 3, 0);
  } else st.meteor.visible = false;
  const wv = plan.waves.find((x) => t >= x.a && t < x.b) ?? null;
  if (wv) {
    const u = (t - wv.a) / (wv.b - wv.a);
    const front = lerp(-BZ, BZ, u);
    const hgt = u < 0.25 ? lerp(0.3, 2.4, easeOut(u / 0.25)) : lerp(2.4, 0.75, easeInOut((u - 0.25) / 0.75));
    const depth = Math.max(0.3, front + BZ);
    st.wave.visible = true;
    st.waveBody.scale.set(1, hgt, depth);
    st.waveBody.position.set(0, hgt / 2, front - depth / 2);
    st.foam.position.set(0, hgt + 0.02, front - 0.2);
  } else st.wave.visible = false;
  const er = plan.erupts.find((e) => t >= e.start && t < e.start + e.dur) ?? null;
  const vol = er ? plan.placed.find((x) => x.id === er.id) : undefined;
  const volOn = !!vol && !!st.objs.get(vol.id)?.root.visible;
  st.bombs.forEach((o, j) => {
    if (!er || !vol || !volOn) {
      o.visible = false;
      return;
    }
    const per = 1.3;
    const since = t - er.start + (j * per) / st.bombs.length;
    const tt = since % per;
    const a = hash(j * 3 + Math.floor(since / per) * 17) * 6.28;
    const sp = 0.8 + 1.4 * hash(j + 7 + Math.floor(since / per));
    const y = 2.25 + (4.5 + 2 * hash(j + 11)) * tt - 4.9 * tt * tt;
    o.visible = y > 0 && t - er.start > 0.25;
    o.position.set(vol.x + Math.cos(a) * sp * tt, y, vol.z + Math.sin(a) * sp * tt);
  });

  // Paint the ground and the cut face.
  const tg = st.top.g;
  tg.drawImage(topCanvas(ground), 0, 0);
  if (ground === 'beach') {
    tg.fillStyle = '#4FB3E0';
    tg.beginPath();
    tg.moveTo(0, TH);
    for (let x = 0; x <= TW; x += 16) tg.lineTo(x, tz(2.6) + 10 * Math.sin(x * 0.02 + t * 1.5));
    tg.lineTo(TW, TH);
    tg.fill();
    tg.strokeStyle = 'rgba(255,255,255,0.8)';
    tg.lineWidth = 5;
    tg.beginPath();
    for (let x = 0; x <= TW; x += 16) tg.lineTo(x, tz(2.6) + 10 * Math.sin(x * 0.02 + t * 1.5));
    tg.stroke();
  }
  paintTopItems(tg, built, t);
  // Mowed stripes where the mower has been (and the grass is short).
  if (G.grass && w.mows.some((m) => t >= m.start)) {
    const fresh = grassLong(0, 2.5) < 0.12 || grassLong(-3, 2.5) < 0.12;
    if (fresh)
      for (let z = z0, r = 0; r < rows; r++, z += rowW) {
        const done = mow ? clamp01((t - (mowT0 + r * rowT)) / rowT) : 1;
        if (done <= 0) break;
        tg.fillStyle = r % 2 ? 'rgba(255,255,255,0.13)' : 'rgba(0,40,0,0.10)';
        const x0 = r % 2 ? TW * (1 - done) : 0;
        tg.fillRect(x0, tz(z), TW * done, tz(z + rowW) - tz(z));
      }
  }
  // Years: wild patches and moss; snow; wet; scorch marks; cracks; craters.
  const wildness = clamp01((L - 1.2) / 2);
  if (wildness > 0) {
    tg.fillStyle = G.wild;
    for (let k = 0; k < 70; k++) {
      const r = 20 + hash(k + 3) * 70;
      tg.globalAlpha = wildness * 0.45 * hash(k + 11);
      tg.beginPath();
      tg.ellipse(hash(k + 1) * TW, hash(k + 2) * TH, r * 1.3, r, 0, 0, Math.PI * 2);
      tg.fill();
    }
    tg.globalAlpha = 1;
  }
  if (w.snow > 0 && ground !== 'snow') {
    tg.fillStyle = `rgba(244,248,252,${0.9 * w.snow})`;
    tg.fillRect(0, 0, TW, TH);
  }
  if (w.wet > 0) {
    tg.fillStyle = `rgba(30,40,60,${0.18 * w.wet})`;
    tg.fillRect(0, 0, TW, TH);
  }
  for (const f of w.fires) {
    if (t < f.start) continue;
    const p = plan.placed.find((x) => x.id === f.target);
    if (!p) continue;
    const cleared = w.clearAt.find((x) => x > f.start && x <= t);
    const c = clamp01((t - f.start) / Math.max(0.8, f.dur)) * (cleared === undefined ? 1 : 1 - clamp01((t - cleared) / 1.2));
    if (c <= 0) continue;
    const g2 = tg.createRadialGradient(tx(p.x), tz(p.z), 4, tx(p.x), tz(p.z), p.r * 120);
    g2.addColorStop(0, `rgba(30,22,18,${0.75 * c})`);
    g2.addColorStop(1, 'rgba(30,22,18,0)');
    tg.fillStyle = g2;
    tg.fillRect(0, 0, TW, TH);
  }
  for (const q of plan.quakes) if (t >= q.start) paintCracks(tg, q.start, clamp01((t - q.start) / Math.max(0.6, q.dur * 0.7)));
  for (const m of craters) {
    const cx = tx(m.x);
    const cz = tz(m.z);
    const cr = m.r * 0.8 * (TW / (BX * 2)) * easeOut(clamp01((t - m.hit) / 0.3));
    const g3 = tg.createRadialGradient(cx, cz, cr * 0.1, cx, cz, Math.max(1, cr));
    g3.addColorStop(0, 'rgba(25,18,14,0.95)');
    g3.addColorStop(0.7, 'rgba(70,52,38,0.85)');
    g3.addColorStop(1, 'rgba(70,52,38,0)');
    tg.fillStyle = g3;
    tg.beginPath();
    tg.arc(cx, cz, Math.max(1, cr), 0, Math.PI * 2);
    tg.fill();
    tg.strokeStyle = 'rgba(150,125,95,0.7)';
    tg.lineWidth = 10;
    tg.beginPath();
    tg.arc(cx, cz, Math.max(1, cr * 0.78), 0, Math.PI * 2);
    tg.stroke();
  }
  st.top.tex.needsUpdate = true;
  paintFront(st.front.g, built, t, soilCanvas(ground, FW, 1));
  st.front.tex.needsUpdate = true;

  // Light: day / dusk / night, a sun that sweeps while years pass, darker under a storm, a tornado or ash.
  const night = w.night;
  const space = G.sky === 'space';
  st.hemi.intensity = lerp(lerp(1.2, 0.95, w.dusk), 0.45, night) * (1 - 0.3 * dim) * (space ? 0.75 : 1);
  st.sun.intensity = lerp(lerp(2.4, 1.6, w.dusk), 0.9, night) * (1 - 0.5 * dim);
  st.sun.color.set(mixHex(mixHex('#FFF3E0', '#FFB27A', w.dusk), '#9FB4FF', night));
  const sweep = w.ageMoving * Math.sin(t * 5) * 1.2;
  st.sun.position.set(9 * Math.cos(sweep) - 11 * Math.sin(sweep) * 0.6, 16, 11 * Math.cos(sweep) + 9 * Math.sin(sweep) * 0.6);

  // Camera (shaken by a quake, a meteor or an eruption).
  const from = i > 0 ? shotOf(plan, beats, i - 1) : wideShot(plan, 0);
  const camTag = b.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? '';
  const to0 = shotOf(plan, beats, i);
  // An orbit swings 50 degrees round to the front over its line (and the next line starts from where it ended).
  const to = camTag === 'orbit' ? { ...to0, yaw: to0.yaw + 50 } : to0;
  const sh = mixShot(from, to, easeInOut(prog(local, 0, 0.9)));
  sh.dist *= distK;
  // In a half frame the deep soil is cut at the seam, so the ground and what is on it get the room.
  if (half) sh.at = [sh.at[0], sh.at[1] + 1.4, sh.at[2]];
  const orbit = camTag === 'orbit' ? -50 * easeInOut(prog(local, 0, b.dur)) : 0;
  const yaw = (sh.yaw + orbit + 7 * Math.sin(t * 0.12)) * D;
  const pitch = sh.pitch * D;
  const shake = quake * 0.28 + impact * 0.6 + eruptK * 0.05;
  const ax = sh.at[0] + shake * Math.sin(t * 53.1);
  const ay = sh.at[1] + shake * 0.6 * Math.sin(t * 61.7 + 1);
  const az = sh.at[2] + shake * Math.sin(t * 47.3 + 2);
  const c = st.camera;
  c.position.set(ax + Math.sin(yaw) * Math.cos(pitch) * sh.dist, ay + Math.sin(pitch) * sh.dist, az + Math.cos(yaw) * Math.cos(pitch) * sh.dist);
  c.lookAt(ax, ay, az);
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  const toScreen = (p: [number, number, number]): { x: number; y: number } => {
    const v = new THREE.Vector3(...p).project(c);
    return { x: fr.x + ((v.x + 1) / 2) * fr.w, y: fr.y + ((1 - v.y) / 2) * fr.h };
  };
  const cover = (): void => ctx.fillRect(fr.x - fr.w, fr.y - fr.h, fr.w * 3, fr.h * 3);

  ctx.save();
  if (half) {
    ctx.beginPath();
    ctx.rect(fr.x, fr.y, fr.w, fr.h);
    ctx.clip();
  }
  const skyName = G.sky ?? 'day';
  const base = SKY[skyName];
  const sky = (k: number): string => (G.sky ? base[k] : mixHex(mixHex(base[k], SKY.dusk[k], w.dusk), SKY.night[k], night));
  const flick = w.ageMoving * 0.35 * (0.5 + 0.5 * Math.sin(t * 10));
  const g = ctx.createLinearGradient(0, fr.y, 0, fr.y + fr.h);
  g.addColorStop(0, mixHex(sky(0), '#0A0E22', flick));
  g.addColorStop(0.55, mixHex(sky(1), '#1A2350', flick));
  g.addColorStop(1, mixHex(sky(2), '#2B3570', flick));
  ctx.fillStyle = g;
  cover();
  if (space || night > 0.3) {
    ctx.fillStyle = '#FFFFFF';
    for (let k = 0; k < 90; k++) {
      ctx.globalAlpha = (space ? 0.85 : night) * (0.4 + 0.6 * hash(k + 4)) * (0.75 + 0.25 * Math.sin(t * 2 + k));
      ctx.fillRect(fr.x + hash(k) * fr.w, fr.y + hash(k + 1) * fr.h * 0.75, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  if (space) {
    const ex = fr.x + fr.w * 0.78;
    const ey = fr.y + fr.h * 0.16;
    const er2 = 80 * Math.min(1, zk);
    const eg = ctx.createRadialGradient(ex - er2 / 4, ey - er2 / 4, 10, ex, ey, er2 * 1.1);
    eg.addColorStop(0, '#7FC4FF');
    eg.addColorStop(1, '#1F4FA3');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, er2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (dim > 0) {
    ctx.fillStyle = `rgba(40,50,70,${0.4 * dim})`;
    cover();
  }
  // A soft shadow under the floating block.
  const under = toScreen([0, -BY - 0.6, 0]);
  const shR = 460 * zk;
  const sg = ctx.createRadialGradient(under.x, under.y, 10, under.x, under.y, shR);
  sg.addColorStop(0, 'rgba(20,30,60,0.28)');
  sg.addColorStop(1, 'rgba(20,30,60,0)');
  ctx.fillStyle = sg;
  ctx.save();
  ctx.translate(under.x, under.y);
  ctx.scale(1, 0.25);
  ctx.translate(-under.x, -under.y);
  ctx.fillRect(under.x - shR - 20, under.y - shR - 20, shR * 2 + 40, shR * 2 + 40);
  ctx.restore();
  st.renderer.render(st.scene, c);
  ctx.drawImage(st.renderer.domElement, fr.x, fr.y, fr.w, fr.h);

  // Smoke and glow over a fire.
  if (burning) {
    const p = plan.placed.find((x) => x.id === burning.target);
    if (p) {
      const top = toScreen([p.x, HEIGHT[p.name] ?? 1.5, p.z]);
      const k = clamp01((t - burning.start) / 0.6);
      const gl = ctx.createRadialGradient(top.x, top.y + 60 * zk, 10, top.x, top.y + 60 * zk, 300 * zk);
      gl.addColorStop(0, `rgba(255,140,40,${0.35 * k})`);
      gl.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(top.x - 300 * zk, top.y - 240 * zk, 600 * zk, 600 * zk);
      for (let j = 0; j < 12; j++) {
        const q = (t * 0.45 + j / 12) % 1;
        puff(ctx, top.x + ((hash(j) - 0.5) * 80 + q * 120) * zk, top.y - q * 520 * zk, (30 + q * 90) * zk, `rgba(60,60,64,${0.5 * k * (1 - q)})`);
      }
    }
  }
  // A launch: smoke billowing from the pad, a trail, the glow of the engine.
  for (const p of plan.placed) {
    if (p.name !== 'rocket' || t < p.launch || t > p.launch + 3.4) continue;
    const o = st.objs.get(p.id);
    if (!o || !o.root.visible) continue;
    const lt = t - p.launch;
    const fade = 1 - clamp01((lt - 2.2) / 1.2);
    const pad = toScreen([p.x, 0.15, p.z]);
    for (let j = 0; j < 18; j++) {
      const age = clamp01((lt - 0.3 - j * 0.05) / 2.0);
      if (age <= 0) continue;
      const side = j % 2 ? 1 : -1;
      puff(ctx, pad.x + side * (30 + age * 240 * (0.5 + hash(j + 3))) * zk, pad.y - (age * 70 * hash(j + 5) + 10) * zk, (26 + age * 60) * zk, `rgba(238,238,242,${0.75 * (1 - age * 0.6) * fade})`);
    }
    if (o.extra[0].visible) {
      const fl = Math.max(0, lt - 0.8);
      const tip = toScreen([p.x, 2.6 * fl * fl - 0.4, p.z]);
      if (fl > 0) {
        ctx.strokeStyle = `rgba(240,240,244,${0.6 * fade})`;
        ctx.lineWidth = 30 * zk;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pad.x, pad.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
      const gl = ctx.createRadialGradient(tip.x, tip.y, 4, tip.x, tip.y, 170 * zk);
      gl.addColorStop(0, `rgba(255,200,90,${0.7 * clamp01(lt / 0.4)})`);
      gl.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(tip.x - 170 * zk, tip.y - 170 * zk, 340 * zk, 340 * zk);
    }
  }
  // A meteor: the fiery trail, then the flash, the blast ring and the dust.
  for (const m of plan.meteors) {
    if (t >= m.start && t < m.hit) {
      const u = (t - m.start) / (m.hit - m.start);
      const a = toScreen(meteorAt(m, u));
      const tl = toScreen(meteorAt(m, Math.max(0, u - 0.18)));
      const g2 = ctx.createLinearGradient(tl.x, tl.y, a.x, a.y);
      g2.addColorStop(0, 'rgba(255,140,40,0)');
      g2.addColorStop(1, 'rgba(255,200,100,0.9)');
      ctx.strokeStyle = g2;
      ctx.lineWidth = 38 * zk;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      const gl = ctx.createRadialGradient(a.x, a.y, 4, a.x, a.y, 100 * zk);
      gl.addColorStop(0, 'rgba(255,230,160,0.9)');
      gl.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(a.x - 100 * zk, a.y - 100 * zk, 200 * zk, 200 * zk);
    }
    const q = t - m.hit;
    if (q >= 0 && q < 3) {
      const c0 = toScreen([m.x, 0, m.z]);
      const age = clamp01(q / 3);
      for (let j = 0; j < 16; j++) {
        const a2 = (j / 16) * Math.PI * 2;
        const rr = (40 + 300 * easeOut(clamp01(q / 1.2)) * (0.6 + 0.4 * hash(j))) * zk;
        puff(ctx, c0.x + Math.cos(a2) * rr, c0.y + Math.sin(a2) * rr * 0.4 - age * 140 * zk * hash(j + 2), (40 + 70 * age) * zk, `rgba(125,105,85,${0.55 * (1 - age)})`);
      }
      const gl = ctx.createRadialGradient(c0.x, c0.y, 6, c0.x, c0.y, 260 * zk);
      gl.addColorStop(0, `rgba(255,150,50,${0.6 * (1 - age)})`);
      gl.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(c0.x - 260 * zk, c0.y - 260 * zk, 520 * zk, 520 * zk);
      if (q < 0.8) {
        const rr = (60 + q * 900) * zk;
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - q / 0.8)})`;
        ctx.lineWidth = 12 * zk;
        ctx.beginPath();
        ctx.ellipse(c0.x, c0.y, rr, rr * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (q < 0.35) {
        ctx.fillStyle = `rgba(255,244,225,${0.85 * (1 - q / 0.35)})`;
        cover();
      }
    }
  }
  // An eruption: a glow in the crater and a column of ash.
  for (const e of plan.erupts) {
    const k3 = bump(e.start, e.dur + 2.5, 0.4, 2.5);
    if (k3 <= 0) continue;
    const vp = plan.placed.find((x) => x.id === e.id);
    const o = st.objs.get(e.id);
    if (!vp || !o || !o.root.visible) continue;
    const cr = toScreen([vp.x, 2.3, vp.z]);
    const gl = ctx.createRadialGradient(cr.x, cr.y, 6, cr.x, cr.y, 240 * zk);
    gl.addColorStop(0, `rgba(255,120,40,${(t < e.start + e.dur ? 0.55 : 0.2) * k3})`);
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(cr.x - 240 * zk, cr.y - 240 * zk, 480 * zk, 480 * zk);
    for (let j = 0; j < 20; j++) {
      const q = ((t - e.start) * 0.3 + j / 20) % 1;
      puff(ctx, cr.x + ((hash(j) - 0.5) * 70 + q * 180) * zk, cr.y - q * 820 * zk, (36 + q * 160) * zk, `rgba(58,52,54,${0.75 * k3 * (1 - q * 0.6)})`);
    }
  }
  // Dust swirling at the foot of a tornado.
  if (twNow && wind > 0.05) {
    const [cx, cz] = twPos(twNow, t);
    const foot = toScreen([cx, 0.1, cz]);
    for (let j = 0; j < 10; j++) {
      const a = t * 4 + j * 0.63;
      puff(ctx, foot.x + Math.cos(a) * 90 * zk, foot.y + (Math.sin(a) * 26 - 10) * zk, (30 + 20 * hash(j)) * zk, `rgba(130,112,90,${0.35 * wind})`);
    }
  }
  // Rain, snowfall, lightning.
  if (w.rain > 0) {
    ctx.strokeStyle = `rgba(200,220,255,${0.55 * w.rain})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k < 160; k++) {
      const x = fr.x + ((hash(k) * fr.w * 1.2 + t * 260) % (fr.w * 1.2)) - fr.w * 0.1;
      const y = fr.y + ((hash(k + 7) * fr.h + t * 2100 * (0.8 + 0.4 * hash(k + 3))) % fr.h);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 14, y + 60);
    }
    ctx.stroke();
  }
  const snowing = dioThings(b.visual).some((x) => x.name === 'snow') || (b.tags.includes('season=winter') && local < 3);
  if (snowing) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 140; k++) {
      const x = fr.x + ((hash(k) * fr.w + 30 * Math.sin(t * 1.3 + k)) % fr.w);
      const y = fr.y + ((hash(k + 5) * fr.h + t * 160 * (0.7 + 0.6 * hash(k + 2))) % fr.h);
      ctx.beginPath();
      ctx.arc(x, y, 3 + 4 * hash(k + 9), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (w.storm && w.rain > 0) {
    const fl = Math.max(0, 1 - Math.abs(local - b.dur * 0.35) * 8) + Math.max(0, 1 - Math.abs(local - b.dur * 0.72) * 8);
    if (fl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.min(1, fl)})`;
      cover();
    }
  }

  // The tag on what this line added, or a title when it added nothing.
  const topY = half ? (fr.slot === 2 ? fr.y + 230 : 440) : 470;
  const label = b.a.replace(/\*/g, '').trim();
  const first = plan.firstOf.get(i) ?? null;
  const und = plan.under.find((x) => x.beat === i) ?? null;
  if (label && (first || und)) {
    let ap: { x: number; y: number };
    if (first) {
      const o = st.objs.get(first.id);
      const h = (HEIGHT[first.name] ?? 1.2) * (o ? o.body.scale.y : 1);
      ap = toScreen([first.x, h + 0.1, first.z]);
    } else ap = toScreen(ANCHOR[und!.item]);
    const k = easeBack(prog(local, 0.5, 0.35));
    if (k > 0) {
      const lx = Math.min(fr.x + fr.w - 200, Math.max(fr.x + 200, ap.x + (ap.x > fr.x + fr.w / 2 ? -150 : 150)));
      const ly = Math.max(topY, ap.y - 230 * zk);
      withAlpha(ctx, clamp01(k), () => {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y);
        ctx.lineTo(lx, ly + 36);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 10, 0, Math.PI * 2);
        ctx.fill();
        chip(ctx, label, lx, ly, k, hi, 50);
      });
    }
  } else if (label) {
    const k = easeBack(prog(local, 0.15, 0.4));
    withAlpha(ctx, clamp01(k), () => chip(ctx, label, fr.x + fr.w / 2, topY, k, hi, half ? 54 : 64));
  }

  // The counter, and with two blocks each block's name.
  const cy = half && fr.slot === 2 ? fr.y + 40 : 250;
  if (mode !== 'off' && count) {
    const lab = str(env.fields, 'counter_label') || (mode === 'show' ? '' : 'TOTAL');
    font(ctx, 62, 900, FONT.meme);
    const tw = Math.max(320, ctx.measureText(count.txt).width + 64);
    rrect(ctx, 60, cy, tw, lab ? 132 : 100, 28);
    ctx.fillStyle = 'rgba(17,19,24,0.82)';
    ctx.fill();
    ctx.textAlign = 'left';
    if (lab) {
      font(ctx, 30, 800, FONT.mono);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(lab.toUpperCase(), 92, cy + 48);
    }
    font(ctx, 62, 900, FONT.meme);
    ctx.fillStyle = hi;
    ctx.fillText(count.txt, 92, cy + (lab ? 108 : 72));
  }
  const name = half ? str(env.fields, fr.slot === 2 ? 'block2' : 'block1').trim().toUpperCase() : '';
  if (name) {
    font(ctx, 54, 900, FONT.meme);
    const tw = Math.min(560, ctx.measureText(name).width + 64);
    rrect(ctx, W - 60 - tw, cy, tw, 100, 28);
    ctx.fillStyle = 'rgba(17,19,24,0.82)';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(name, W - 60 - tw / 2, cy + 70, tw - 40);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  return !space && night < 0.5 && w.dusk < 0.5;
}

function chip(ctx: Ctx, text: string, x: number, y: number, k: number, hi: string, max: number): void {
  const c2 = fit(ctx, text, { maxW: W - 160, maxH: max + 20, max, min: 30, maxLines: 1, weight: 800, family: FONT.meme });
  font(ctx, c2.size, 800, FONT.meme);
  const line = c2.lines[0] ?? text;
  const w = ctx.measureText(line).width + 48;
  const h = c2.size + 30;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  rrect(ctx, -w / 2, -h / 2, w, h, 22);
  ctx.fillStyle = '#111318';
  ctx.fill();
  ctx.fillStyle = hi;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, 0, 2);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

registerPreset('diorama', draw);
