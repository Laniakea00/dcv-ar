// "Кампус 500 МВт" по генплану площадки (Разбивочный план М1:2000): ограждение, дороги с двумя КПП, водопроводные
// сооружения и ЛОС на западе, станция понижения на восточной границе. Первая очередь (ЦОД-1) стоит там, где на
// генплане кластер первой очереди, вторая — рядом, на месте второй очереди; очереди 3–10 — концепция: такие же
// модули на 50 МВт в сетке дорог генплана.
// ЦОД-1 остаётся полным макетом со всеми слоями и историями; модули 2–10 — облегчённые копии
// (model/campus_module.glb: центральный корпус, два энергоблока, резервные плиты, РУ 35 кВ, свои площадки и дороги),
// станция понижения — подстанция макета (model/campus_gpp.glb). Все координаты — система модуля из Unity-экспорта
// (метры модели, glTF: x = −Unity x); север генплана — вверху (−z), как на макете.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { tubeMaterial } from './story.js';

// one module tile: road centre to road centre around the central building and its reserve slabs (make_campus_glb.mjs)
const TILE = { x0: -277, x1: 236.5, z0: -247, z1: 284.5 };
const PX = TILE.x1 - TILE.x0, PZ = TILE.z1 - TILE.z0;
const RU = { x: 198, z: 104 };                     // the 35 kV switchgear rows of a module (feeders come in here)
// генплан -> module frame: pixels of the drawing, 3.4 m of the model per pixel, ЦОД-1 on the phase-1 cluster
const K = 3.4, P = (x, y) => [(x - 486.5) * K + (TILE.x0 + TILE.x1) / 2, (y - 368) * K + (TILE.z0 + TILE.z1) / 2];
const FENCE = [[548, 72], [1045, 60], [1062, 64], [1062, 675], [880, 750], [300, 795], [283, 440], [322, 387], [400, 268]].map(p => P(...p));
const box = (a, b) => { const [x0, z0] = P(...a), [x1, z1] = P(...b); return { x0, z0, x1, z1 }; };
const STATION = box([925, 282], [1050, 442]);       // «Станция понижения»
const RESERVE = box([952, 82], [1048, 660]);        // её участок на генплане (красный контур)
const WATER = { x0: -620, x1: -330, z0: P(0, 470)[1], z1: P(0, 555)[1] };                         // «Водопроводные сооружения»
const LOS = { x0: -615, x1: -455, z0: 930, z1: 1390 };                                            // «ЛОС»
const KPP = [{ at: [-548, 70], out: [[-495, 73], [-579, 83], P(262, 322)] }, { at: [P(1040, 78)[0], P(1040, 78)[1]], out: [P(1040, 78), P(1040, 60), P(1040, 30)] }];
const INSET = 22;                                   // the perimeter road runs this far inside the fence

// phase order: the phase-1 cluster (ЦОД-1), phase 2 next to it (as on the генплан), then the grid outwards
const SLOTS = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, -1], [2, -1], [0, 2], [1, 2]];
export const TILES = SLOTS.map(([c, r], i) => ({ n: i + 1, c, r, dx: c * PX, dz: r * PZ }));

const X_MIN = -800, X_MAX = 2150, Z_MIN = -1150, Z_MAX = 1490;
export const CAMPUS = { center: new THREE.Vector3((X_MIN + X_MAX) / 2, 0, (Z_MIN + Z_MAX) / 2), width: X_MAX - X_MIN, depth: Z_MAX - Z_MIN };

const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));

// ---- plane geometry helpers (x/z)
function area(poly) { let a = 0; poly.forEach(([x, z], i) => { const [u, w] = poly[(i + 1) % poly.length]; a += x * w - u * z; }); return a / 2; }
function inset(poly, d) { // offset every edge inwards by d, corners = intersections of neighbouring offset edges
  const s = area(poly) > 0 ? 1 : -1, n = poly.length;
  const lines = poly.map(([x, z], i) => { const [u, w] = poly[(i + 1) % n]; const l = Math.hypot(u - x, w - z), nx = -s * (w - z) / l, nz = s * (u - x) / l; return [x + nx * d, z + nz * d, (u - x) / l, (w - z) / l]; });
  return lines.map((b, i) => {
    const a = lines[(i + n - 1) % n], den = a[2] * b[3] - a[3] * b[2];
    if (Math.abs(den) < 1e-6) return [b[0], b[1]];
    const t = ((b[0] - a[0]) * b[3] - (b[1] - a[1]) * b[2]) / den;
    return [a[0] + a[2] * t, a[1] + a[3] * t];
  });
}
function inside(poly, x, z) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function segDist(x, z, [ax, az], [bx, bz]) { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
function cut(poly, horiz, c) { // where the line x = c (or z = c) crosses the polygon: sorted pairs of segments
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], k = horiz ? 1 : 0, o = 1 - k;
    if ((a[k] > c) !== (b[k] > c)) hits.push(a[o] + (b[o] - a[o]) * (c - a[k]) / (b[k] - a[k]));
  }
  hits.sort((p, q) => p - q);
  const segs = []; for (let i = 0; i + 1 < hits.length; i += 2) segs.push(horiz ? [[hits[i], c], [hits[i + 1], c]] : [[c, hits[i]], [c, hits[i + 1]]]);
  return segs;
}
const inBox = (b, x, z, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

export class Campus {
  constructor({ model, labels, grass, pad, road }) {
    this.model = model; this.labels = labels;
    this.grass = grass || new THREE.Color(0x7fae55); this.pad = pad || new THREE.Color(0xdfe3e6); this.road = road || new THREE.Color(0x8d949b);
    this.root = new THREE.Group(); this.root.name = 'Campus (генплан)'; this.root.visible = false; model.add(this.root);
    this.f = 0; this.target = 0; this.time = 0;
    this.built = 1; this.state = { built: 1, gpp: false, lines: false, plots: false, infra: false };
    this.mods = []; this.tags = []; this.ready = null; this.gppA = 0; this.infraA = 0; this.lineGrow = 0;
  }

  // module frame -> mat: the whole site inside w x h (m), same orientation as the module, ground at y = 0
  fitFor(w, h = w) {
    const s = Math.min(w / CAMPUS.width, h / CAMPUS.depth);
    const pos = CAMPUS.center.clone().multiplyScalar(-s); pos.y = 0.5 * s;
    return { pos, quat: new THREE.Quaternion(), scale: s };
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const [mod, gpp] = await Promise.all([load('model/campus_module.glb'), load('model/campus_gpp.glb')]);
      this.ring = inset(FENCE, INSET);
      this.buildGround(); this.buildRoads(); this.buildInfra();
      for (const t of TILES) {
        if (t.n === 1) { this.mods.push(null); continue; }            // ЦОД-1 is the real, detailed model
        const g = new THREE.Group(); g.name = `ЦОД-${t.n}`;
        const m = mod.clone(true);
        m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x49d6ff); o.material.emissiveIntensity = 0; o.castShadow = o.receiveShadow = true; } });
        g.add(m); g.position.set(t.dx, 0, t.dz); g.scale.y = 0.001; g.visible = false; this.root.add(g);
        this.mods.push({ t, g, a: 0, mats: (() => { const a = []; m.traverse(o => { if (o.isMesh) a.push(o.material); }); return a; })() });
      }
      // «Станция понижения»: the module's substation, a bit larger, in its square on the east boundary
      const bb = new THREE.Box3().setFromObject(gpp), c = bb.getCenter(new THREE.Vector3()), sc = 1.25;
      this.gpp = new THREE.Group(); this.gpp.name = 'Станция понижения';
      const k = gpp.clone(true); k.position.set(-c.x * sc, 0, -c.z * sc); k.scale.setScalar(sc);
      this.gpp.add(k); this.gpp.position.set((STATION.x0 + STATION.x1) / 2, 0, (STATION.z0 + STATION.z1) / 2);
      this.stationRU = new THREE.Vector3(RU.x, 0, RU.z).sub(c).multiplyScalar(sc).add(this.gpp.position);
      this.gpp.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.gpp.scale.y = 0.001; this.gpp.visible = false; this.root.add(this.gpp);
      this.buildGrid(); this.buildLines(); this.buildPlots(); this.buildTrees(); this.buildTags();
    })();
    return this.ready;
  }

  mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o }); }
  plane(b, y, color, parent = this.root) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0).rotateX(-Math.PI / 2), color.isMaterial ? color : this.mat(color));
    m.position.set((b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2); m.receiveShadow = true; parent.add(m); return m;
  }

  buildGround() {
    const steppe = this.grass.clone().lerp(new THREE.Color(0x9c9a78), 0.55); // dry steppe around the fence
    this.plane({ x0: X_MIN - 140, x1: X_MAX + 140, z0: Z_MIN - 140, z1: Z_MAX + 140 }, -0.9, steppe);    // around the site
    const shape = new THREE.Shape(FENCE.map(([x, z]) => new THREE.Vector2(x, z)));                     // inside the fence
    const lawn = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), this.mat(this.grass, { side: THREE.DoubleSide }));
    lawn.position.y = -0.6; lawn.receiveShadow = true; this.root.add(lawn);
    // the fence: a low white wall (like the rim of the maket) and a crisp line on top
    const pos = [];
    FENCE.forEach(([x, z], i) => { const [u, w] = FENCE[(i + 1) % FENCE.length]; pos.push(x, 0, z, u, 0, w, u, 9, w, x, 0, z, u, 9, w, x, 9, z); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    this.root.add(new THREE.Mesh(g, this.mat(0xe9eef1, { side: THREE.DoubleSide })));
    this.root.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(FENCE.map(([x, z]) => new THREE.Vector3(x, 9.2, z))), new THREE.LineBasicMaterial({ color: 0xffffff })));
  }

  // asphalt ribbons, one mesh: the perimeter road and the entrance roads (the grid roads follow in buildGrid)
  ribbons(list, y, color) {
    const m = new THREE.Mesh(this.ribbonGeo(list, y), this.mat(color, { side: THREE.DoubleSide })); m.receiveShadow = true; this.root.add(m); return m;
  }
  ribbonGeo(list, y) {
    const pos = [];
    for (const [a, b, w] of list) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const p = [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
      for (const i of [0, 1, 2, 0, 2, 3]) pos.push(p[i][0], y, p[i][1]);
      pos.push(a[0] + w / 2, y, a[1], a[0], y, a[1] + w / 2, a[0] - w / 2, y, a[1], a[0] - w / 2, y, a[1], a[0], y, a[1] - w / 2, a[0] + w / 2, y, a[1]); // round-ish joint
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  }
  buildRoads() {
    const r = this.ring, list = r.map((p, i) => [p, r[(i + 1) % r.length], 13]);
    for (const k of KPP) for (let i = 1; i < k.out.length; i++) list.push([k.out[i - 1], k.out[i], 15]);
    this.ribbons(list, 0.4, this.road);
  }
  buildGrid() { // the road grid of the генплан, through the module tiles (tiles bring their own roads on top)
    const list = [];
    this.gridSegs = [];
    for (let rr = -1; rr <= 3; rr++) {
      const z = TILE.z0 + rr * PZ;
      for (let [a, b] of cut(this.ring, true, z)) {
        if (z > STATION.z0 && z < STATION.z1) b = [Math.min(b[0], STATION.x0), z];   // ends at the station gate
        list.push([a, b, 18]); this.gridSegs.push([a, b]);
      }
    }
    for (let cc = 0; cc <= 3; cc++) for (const [a, b] of cut(this.ring, false, TILE.x0 + cc * PX)) { list.push([a, b, 18]); this.gridSegs.push([a, b]); }
    this.ribbons(list, 0.5, this.road);
  }

  buildInfra() { // water works, ЛОС, КПП, the station pad and plot: they rise when the site plan is shown
    this.infra = new THREE.Group(); this.infra.name = 'Инфраструктура генплана'; this.infra.scale.y = 0.001; this.infra.visible = false; this.root.add(this.infra);
    const white = this.mat(0xeef2f4), tank = this.mat(0xdfe6ea, { roughness: 0.6 }), water = this.mat(0x4f97c2, { roughness: 0.25, emissive: 0x1d5b80, emissiveIntensity: 0.35 }), dark = this.mat(0x6b747c);
    const P0 = this.infra, blk = (x, z, w, d, h, m = white) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m); o.position.set(x, 0, z); o.castShadow = o.receiveShadow = true; P0.add(o); return o; };
    const cyl = (x, z, r, h, m = tank) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36).translate(0, h / 2, 0), m); o.position.set(x, 0, z); o.castShadow = o.receiveShadow = true; P0.add(o); return o; };
    const pool = (x, z, w, d) => { blk(x, z, w, d, 5, tank); const s = new THREE.Mesh(new THREE.PlaneGeometry(w - 4, d - 4).rotateX(-Math.PI / 2), water); s.position.set(x, 5.1, z); P0.add(s); };
    // «Водопроводные сооружения»: two clean-water reservoirs, a treatment block, the pump station
    this.plane(WATER, 0.3, this.pad, P0);
    const wx = (WATER.x0 + WATER.x1) / 2, wz = (WATER.z0 + WATER.z1) / 2;
    cyl(WATER.x0 + 70, wz - 70, 44, 12); cyl(WATER.x0 + 70, wz + 70, 44, 12);
    pool(wx + 60, wz + 60, 110, 70); blk(wx + 60, wz - 60, 90, 50, 12); blk(wx + 60, wz - 60, 30, 14, 16, dark);
    // «ЛОС»: aeration lanes, two clarifiers, the service building
    this.plane(LOS, 0.3, this.pad, P0);
    const lx = (LOS.x0 + LOS.x1) / 2;
    for (let i = 0; i < 3; i++) pool(LOS.x0 + 32 + i * 48, LOS.z0 + 130, 38, 170);
    for (const x of [LOS.x0 + 45, LOS.x1 - 45]) { cyl(x, LOS.z0 + 300, 32, 6); const s = new THREE.Mesh(new THREE.CircleGeometry(29, 36).rotateX(-Math.PI / 2), water); s.position.set(x, 6.1, LOS.z0 + 300); P0.add(s); }
    blk(lx, LOS.z1 - 45, 110, 45, 11); blk(lx - 20, LOS.z0 + 25, 50, 26, 8);
    // КПП at both gates
    for (const k of KPP) { blk(k.at[0], k.at[1], 26, 16, 8); blk(k.at[0], k.at[1], 40, 26, 1.2, dark).position.y = 9; }
    // the station: pad, fence, and its land plot from the генплан (dashed)
    this.plane(STATION, 0.35, this.pad, P0);
    const outline = (b, dashed) => {
      const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1], [b.x0, b.z0]].map(([x, z]) => new THREE.Vector3(x, 2, z));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashed ? new THREE.LineDashedMaterial({ color: 0xff8a6a, dashSize: 26, gapSize: 16 }) : new THREE.LineBasicMaterial({ color: 0xf2f5f7 }));
      if (dashed) l.computeLineDistances(); P0.add(l);
    };
    outline(STATION, false); outline(RESERVE, true);
    // the grid comes from the east: two overhead lines on towers into the station
    const tower = new THREE.ConeGeometry(5, 46, 4).translate(0, 23, 0), arm = new THREE.BoxGeometry(2, 2, 34).translate(0, 38, 0);
    const wire = new THREE.LineBasicMaterial({ color: 0x3e464d });
    for (const z of [STATION.z0 + 110, STATION.z1 - 110]) {
      const xs = [STATION.x1 - 6, STATION.x1 + 105, STATION.x1 + 215, X_MAX];
      for (const x of xs.slice(1, 3)) { const t = new THREE.Mesh(tower, dark); t.position.set(x, 0, z); t.castShadow = true; P0.add(t); const a = new THREE.Mesh(arm, dark); a.position.set(x, 0, z); P0.add(a); }
      for (const dz of [-15, 0, 15]) P0.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(xs.map((x, i) => new THREE.Vector3(x, i === 0 ? 24 : 38, z + dz))), wire));
    }
  }

  buildLines() { // feeders: station -> along the grid roads -> each module's 35 kV switchgear
    this.lines = new THREE.Group(); this.lines.visible = false; this.root.add(this.lines);
    const y = 16, V = (x, z, h = y) => new THREE.Vector3(x, h, z);
    const tube = (pts, r) => {
      const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const mat = tubeMaterial(new THREE.Color('#62b8ff'), false, false);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(24, pts.length * 40), r, 6, false), mat);
      mesh.frustumCulled = false; this.lines.add(mesh); this.lineMats.push(mat);
    };
    this.lineMats = [];
    const s = this.stationRU, north = TILE.z0, south = TILE.z0 + 2 * PZ, xb = STATION.x0 - 30;
    tube([V(s.x, s.z, 8), V(s.x, s.z), V(xb, s.z), V(xb, north), V(TILE.x1, north)], 4.5);            // trunk to the north rows
    tube([V(xb, s.z), V(xb, south), V(TILE.x1, south)], 4.5);                                           // trunk to the south rows
    for (const t of TILES) {
      const xr = TILE.x1 + t.dx, zr = RU.z + t.dz, z0 = t.r <= 0 ? north : south;
      tube([V(xr, z0), V(xr, zr), V(RU.x + t.dx + 8, zr), V(RU.x + t.dx + 8, zr, 8)], 3);
    }
  }

  buildPlots() { // footprints of the ten modules (while the plan is laid out, and under a rising module)
    this.plots = [];
    const d = 16; // a glowing frame just inside the tile's roads, and a faint fill
    for (const t of TILES) {
      const c = [[TILE.x0 + d, TILE.z0 + d], [TILE.x1 - d, TILE.z0 + d], [TILE.x1 - d, TILE.z1 - d], [TILE.x0 + d, TILE.z1 - d]].map(([x, z]) => [x + t.dx, z + t.dz]);
      const mat = new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0, depthWrite: false });
      this.root.add(new THREE.Mesh(this.ribbonGeo(c.map((p, i) => [p, c[(i + 1) % 4], 7]), 3), mat));
      this.plane({ x0: c[0][0], x1: c[1][0], z0: c[0][1], z1: c[2][1] }, 2.5, fill);
      this.plots.push({ t, mat, fill });
    }
  }

  buildTrees() { // tree lines along the fence, groves in the free corners (never on roads, plots or structures)
    const busy = [...TILES.map(t => ({ x0: TILE.x0 + t.dx - 12, x1: TILE.x1 + t.dx + 12, z0: TILE.z0 + t.dz - 12, z1: TILE.z1 + t.dz + 12 })),
      { x0: -520, x1: TILE.x0, z0: -360, z1: TILE.z1 + 20 },                // ЦОД-1's own entrance, admin building and trees
      { ...RESERVE }, STATION, WATER, LOS, ...KPP.map(k => ({ x0: k.at[0] - 40, x1: k.at[0] + 40, z0: k.at[1] - 40, z1: k.at[1] + 40 }))];
    const roads = [...this.gridSegs, ...this.ring.map((p, i) => [p, this.ring[(i + 1) % this.ring.length]]), ...KPP.flatMap(k => k.out.slice(1).map((p, i) => [k.out[i], p]))];
    const ok = (x, z, clear) => inside(this.ring, x, z) && !busy.some(b => inBox(b, x, z, 14)) && !roads.some(s => segDist(x, z, ...s) < clear);
    const pts = [];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const row = inset(FENCE, INSET + 20);
    row.forEach((a, i) => { const b = row[(i + 1) % row.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 20; d < l; d += 46) { const x = a[0] + (b[0] - a[0]) * d / l, z = a[1] + (b[1] - a[1]) * d / l; if (ok(x, z, 12)) pts.push([x, z]); } });
    for (let x = X_MIN; x < X_MAX; x += 62) for (let z = Z_MIN; z < Z_MAX; z += 62) {
      const px = x + (rnd() - 0.5) * 40, pz = z + (rnd() - 0.5) * 40;
      if (rnd() < 0.55 && ok(px, pz, 22)) pts.push([px, pz]);
    }
    const crown = new THREE.ConeGeometry(8, 20, 7).translate(0, 18, 0), trunk = new THREE.CylinderGeometry(1.2, 1.5, 9, 5).translate(0, 4.5, 0);
    const trees = new THREE.InstancedMesh(crown, this.mat(0x3f7d3a), pts.length), trunks = new THREE.InstancedMesh(trunk, this.mat(0x6b5238), pts.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const s = 0.8 + rnd() * 0.5; m.makeScale(s, s, s).setPosition(x, 0, z);
      trees.setMatrixAt(i, m); trunks.setMatrixAt(i, m); trees.setColorAt(i, col.setHSL(0.26 + rnd() * 0.07, 0.42, 0.26 + rnd() * 0.12));
    });
    trees.castShadow = trunks.castShadow = true;
    this.root.add(trees, trunks);
  }

  buildTags() {
    const tag = (text, pos, cls = '') => { const el = document.createElement('div'); el.className = 'tag campus ' + cls; el.textContent = text; el.style.opacity = 0; this.labels.appendChild(el); const t = { el, pos }; this.tags.push(t); return t; };
    for (const t of TILES) tag(t.n === 1 ? 'ЦОД-1 · 50 МВт' : `ЦОД-${t.n}`, new THREE.Vector3((TILE.x0 + TILE.x1) / 2 + t.dx, 60, (TILE.z0 + TILE.z1) / 2 + t.dz), t.n === 1 ? 'first' : '');
    this.gppTag = tag('Станция понижения', new THREE.Vector3((STATION.x0 + STATION.x1) / 2, 60, (STATION.z0 + STATION.z1) / 2), 'infra');
    this.infraTags = [
      tag('Водопровод', new THREE.Vector3((WATER.x0 + WATER.x1) / 2, 30, (WATER.z0 + WATER.z1) / 2), 'infra'),
      tag('ЛОС', new THREE.Vector3((LOS.x0 + LOS.x1) / 2, 30, (LOS.z0 + LOS.z1) / 2), 'infra'),
      tag('КПП', new THREE.Vector3(KPP[0].at[0], 20, KPP[0].at[1]), 'infra'),
    ];
  }

  // story / mode control: how many modules stand, the station, the feeders, the plots, the site infrastructure
  apply(st) { Object.assign(this.state, st); }
  enter() { this.target = 1; this.root.visible = true; return this.init(); }
  exit() { this.target = 0; }
  get mw() { return 50 * Math.round(this.built); }

  tick(dt) {
    this.time += dt;
    this.f += Math.sign(this.target - this.f) * Math.min(Math.abs(this.target - this.f), dt / 1.6);
    this.root.visible = this.f > 0.001;
    if (!this.mods.length) return;
    const step = (v, want, T) => v + Math.sign(want - v) * Math.min(Math.abs(want - v), dt / T);
    // modules rise one after another (0.55 s apart), glow while they rise
    this.built = step(this.built, this.state.built, 0.55);
    for (const m of this.mods) {
      if (!m) continue;
      m.a = step(m.a, this.built >= m.t.n - 0.02 ? 1 : Math.max(0, this.built - (m.t.n - 1)), 0.9);
      m.g.visible = m.a > 0.002; m.g.scale.y = Math.max(0.001, ease(m.a));
      const glow = m.a > 0 && m.a < 1 ? 0.9 * (1 - m.a) : 0;
      for (const mat of m.mats) mat.emissiveIntensity = glow;
    }
    for (const p of this.plots) {
      const m = this.mods[p.t.n - 1], rising = m && m.a > 0 && m.a < 1;
      const built = p.t.n === 1 || (m && m.a >= 1);
      const a = (this.state.plots || rising) && !built ? (0.6 + 0.3 * Math.sin(this.time * 3)) * this.f : 0;
      p.mat.opacity = a; p.fill.opacity = 0.14 * a; p.mat.visible = p.fill.visible = a > 0.01;
    }
    this.gppA = step(this.gppA, this.state.gpp ? 1 : 0, 1.2);
    this.gpp.visible = this.gppA > 0.002; this.gpp.scale.y = Math.max(0.001, ease(this.gppA));
    this.infraA = step(this.infraA, this.state.infra ? 1 : 0, 1.2);
    this.infra.visible = this.infraA > 0.002; this.infra.scale.y = Math.max(0.001, ease(this.infraA));
    this.lines.visible = this.state.lines;
    this.lineGrow = this.state.lines ? Math.min(1, this.lineGrow + dt / 2.5) : 0;
    for (const mat of this.lineMats) { mat.uniforms.time.value = this.time; mat.uniforms.grow.value = this.lineGrow; mat.uniforms.fade.value = this.f; }
  }

  // HTML captions
  // (cam = the rendering camera); on a small screen tags that would overlap give way: ЦОД-1 and the station first
  drawTags(cam) {
    if (!this.gppTag) return;
    const v = new THREE.Vector3(), used = [];
    const order = [0, this.tags.indexOf(this.gppTag), ...this.tags.map((_, i) => i).filter(i => i > 0 && this.tags[i] !== this.gppTag)];
    for (const i of order) {
      const t = this.tags[i];
      let show = this.f > 0.95;
      if (show && i < 10) show = i === 0 || (this.mods[i] && this.mods[i].a > 0.9);
      if (show && t === this.gppTag) show = this.gppA > 0.9;
      if (show && this.infraTags.includes(t)) show = this.infraA > 0.9;
      if (show) { v.copy(t.pos); this.model.localToWorld(v).project(cam); show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; }
      if (show) {
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, w = (t.el.offsetWidth || 60) / 2 + 3;
        const r = { l: x - w, r: x + w, t: y - (t.el.offsetHeight || 20) - 3, b: y };
        if (used.some(q => !(r.r < q.l || r.l > q.r || r.b < q.t || r.t > q.b))) show = false;
        else { used.push(r); t.el.style.left = x + 'px'; t.el.style.top = y + 'px'; }
      }
      t.el.style.opacity = show ? 1 : 0;
    }
  }
}
