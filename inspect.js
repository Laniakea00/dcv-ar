// Equipment inspector — the web port of MaketHologramInspector (+ MaketInstalledInspection) of the Unity app.
// Tap a unit: its articulated "hero" model (model/hero/<Kind>.glb, the same models the Unity app opens) replaces the
// installed instance, rises out of its layer, grows and turns its front (for racks: the slots) to the viewer.
// Tap it again: it comes apart with the offsets of MaketHologramInspector.Collect (fans and the DRUPS flywheel turn).
// NVL72 rack: tap a compute tray -> the tray slides out, flies to the front, the lid comes off, the cold plates lift,
// 4 GPU + 2 CPU are shown with the coolant loop (blue supply -> red return) and the GPU thermal glow; tap = back.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const loadHero = kind => {
  if (!cache.has(kind)) cache.set(kind, new Promise((res, rej) => loader.load(`model/hero/${kind}.glb`, g => res(g.scene), undefined, rej)));
  return cache.get(kind).then(s => s.clone(true));
};
const smooth = t => t * t * (3 - 2 * t);
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

// MaketHologramInspector.Collect offsets (Unity local units), Unity x -> glTF -x
function offsetFor(kind, name, i) {
  const V = (x, y, z) => new THREE.Vector3(-x, y, z);
  let o = new THREE.Vector3();
  if (/SidePanel_Left|^Left_panel/.test(name)) o = V(0.65, 0, 0);
  else if (/SidePanel_Right|^Right_panel/.test(name)) o = V(-0.65, 0, 0);
  else if (/Rear_door/.test(name)) o = V(0, 0, -0.8);
  else if (/^Door/.test(name)) o = V(-0.9, 0.05, 1.1);
  else if (/^ComputeTray/.test(name)) o = V(0, 0, 0.32 + 0.08 * (i % 3));
  else if (/^NVLink/.test(name)) o = V(0, 0, 0.22);
  else if (/^PowerShelf/.test(name)) o = V(0, 0, 0.15);
  else if (/^Engine/.test(name)) o = V(0.8, 0, 0);
  else if (/^Radiator/.test(name)) o = V(1.2, 0, 0);
  else if (/^Flywheel/.test(name) && !/rotor/.test(name)) o = V(0, 0.9, 0);
  else if (/^Control_cabinet/.test(name)) o = V(-0.8, 0, 0);
  else if (/^Plate_heat/.test(name)) o = V(0, 0.2, 0.6);
  else if (/^Pump_/.test(name)) o = V(0, 0, 0.4);
  else if (/^Tank/.test(name)) o = V(0, 1.8, 0);
  else if (/^Lid/.test(name)) o = V(-0.8, 0.25, -0.1);
  else if (/^GPU_ColdPlate/.test(name)) o = V(0, 0.16, 0);
  else if (/^CPU_ColdPlate/.test(name)) o = V(0, 0.10, 0);
  else if (/^NetworkSwitch/.test(name)) o = V(0, 0, 0.28 + 0.08 * (i % 3));
  else if (/^Fan_|^FanRotor_/.test(name)) o = V(0, 0.55, 0);
  else if (kind === 'CRAH' && name === 'Cabinet') o = V(1.3, 0, 0);
  else if (kind === 'CRAH' && /^Heat_exchanger/.test(name)) o = V(0, 0, 0.3);
  else if (/^Cylinder_/.test(name)) o = V((i - 1.5) * 0.12, 0.18, 0);
  else if (name === 'Fire_manifold_and_frame') o = V(0, 0, -0.35);
  if (kind === 'DryCooler') {
    if (name === 'Frame_and_V_coils') o = V(0, 0.24, 0);
    else if (/^Supply_return/.test(name)) o = V(0, 0.3, 1.6);
    else if (/^FanRotor_/.test(name)) o = V(0, 1.35, 0);
    else if (/^Fan_/.test(name)) o = V(0, 2.15, 0);
  }
  if (kind === 'CDU' && /^Pipework/.test(name)) o = V(0, 0, -0.85);
  return o;
}

// card texts: MaketInstalledInspection.TickInstalled (title, metric, body) + level texts of MaketHologramInspector.Words
const TEXT = {
  Rack: ['AI · NVL72', '120 кВт · 72 GPU', 'AI-вычисления · жидкостный контур\nМощность принята для расчёта'],
  StandardRack: ['Серверная стойка', '10 кВт / стойка', 'Серверы общего назначения\nМощность принята для расчёта'],
  DRUPS: ['DRUPS · энергоблок', 'Одна из 24 машин', 'Дизель · генератор · маховик\nНепрерывность питания серверов'],
  DryCooler: ['Сухой охладитель', '1 040 кВт', 'Передаёт тепло наружному воздуху\nНоминал из концепции проекта'],
  Chiller: ['Чиллер', '320 кВт', 'Поддержка жидкостного контура\nНоминал из концепции проекта'],
  CDU: ['CDU · жидкостное охлаждение', '520 кВт', 'Разделяет жидкостные контуры\nТеплообменник и насосы'],
  CRAH: ['CRAH · охлаждение воздуха', '148,9 кВт', 'Отводит тепло из воздуха зала\nНоминал из концепции проекта'],
  Network: ['Сетевой шкаф', 'Два направления', 'Два независимых направления связи'],
  Fire: ['Пожарная защита', 'Один зал', 'Локальная защита серверного зала'],
  Transformer: ['Трансформатор', 'Преобразование напряжения', 'Преобразование напряжения для оборудования'],
  Switchgear: ['Распределение питания', 'Управление линией', 'Силовые шины · коммутация · измерение · защита'],
  Operations: ['Операторское место', 'Управление системой', 'Управление инженерными системами'],
};
const TRAY_TEXT = ['Вычислительный лоток', '4 GPU · 2 CPU', '4 GPU и 2 CPU · холодные пластины отводят тепло\nСиний — подвод жидкости, красный — отвод',
  'Устройство по документации NVIDIA · геометрия для демонстрации'];

// coolant loop along a path: dashes run from supply (blue) to return (red)
function flowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, fade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float time, fade;
      void main(){ vec3 c = mix(vec3(0.15,0.55,1.0), vec3(1.0,0.28,0.08), smoothstep(0.1,0.9,vUv.x));
        float d = smoothstep(0.35,0.5,fract(vUv.x*26.0 - time*1.6)) * (1.0 - smoothstep(0.5,0.65,fract(vUv.x*26.0 - time*1.6)));
        gl_FragColor = vec4(c*(0.55+1.2*d), (0.35+0.65*d)*fade); }`,
  });
}

export class Inspector {
  constructor({ model, labels, onChange }) {
    this.model = model; this.labels = labels; this.onChange = onChange || (() => {});
    this.s = null; this.time = 0;
    this.fx = { rotor: 1, engine: false }; // story effects: DRUPS flywheel speed, diesel running
    this.leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x7de8ff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.leader.frustumCulled = false; this.leader.visible = false; model.add(this.leader);
    this.halo = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2), 0, Math.sin(i / 64 * Math.PI * 2)))),
    new THREE.LineBasicMaterial({ color: 0x7de8ff, transparent: true, depthWrite: false }));
    this.halo.visible = false; model.add(this.halo);
    this.tags = [];
    loadHero('Rack').catch(() => {}); // warm the cache: racks are what people open first
  }
  get open() { return !!this.s; }
  get selected() { return this.s?.e || null; }

  async openUnit(e) {
    if (this.s && this.s.e === e && !this.s.returning) return true;
    this.closeNow();
    const s = this.s = { e, kind: e.kind, open: 0, explode: 0, level: 0, returning: false, age: 0, ready: false, tray: null };
    e.hidden = true;
    this.onChange();
    let hero;
    try { hero = await loadHero(e.kind); } catch (err) { console.warn('no hero model for', e.kind, err); }
    if (this.s !== s) return false;
    if (!hero) { e.hidden = false; this.s = null; this.onChange(); return false; }
    const pivot = s.pivot = new THREE.Group();
    const root = s.root = hero.children.length === 1 && !hero.children[0].isMesh ? hero.children[0] : hero;
    pivot.add(hero);
    // materials per instance (the rack fades behind an opened tray)
    hero.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = false; o.receiveShadow = false; } });
    pivot.updateMatrixWorld(true);
    s.parts = this.collect(root, e.kind);
    // installed transform (from the Unity export) and the stage: 230 m units wide/tall, 105 above (non-layer inspector)
    const t = e.trs;
    s.pos0 = new THREE.Vector3(t[0], t[1], t[2]);
    s.quat0 = new THREE.Quaternion(t[3], t[4], t[5], t[6]);
    s.scale0 = t[7];
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    s.size = size; s.box = box;
    s.scale1 = 230 / Math.max(size.x, size.y);
    s.lift = 105;
    pivot.position.copy(s.pos0); pivot.quaternion.copy(s.quat0); pivot.scale.setScalar(s.scale0);
    this.model.add(pivot);
    s.yaw = new THREE.Euler().setFromQuaternion(s.quat0, 'YXZ').y;
    s.ready = true;
    if (e.kind === 'Rack') loadHero('Tray').catch(() => {});
    this.onChange();
    return true;
  }

  collect(root, kind) {
    const parts = [];
    [...root.children].forEach((o, i) => {
      let obj = o;
      if (/^FanRotor_|Flywheel_rotor/.test(o.name)) { // spin about the part's own centre
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        root.worldToLocal(c);
        const holder = new THREE.Group(); holder.name = o.name + '_pivot'; holder.position.copy(c);
        root.add(holder); holder.attach(o); obj = holder;
      }
      parts.push({ obj, name: o.name, home: obj.position.clone(), q0: obj.quaternion.clone(), off: offsetFor(kind, o.name, i),
        spin: /^FanRotor_/.test(o.name) ? 'y' : /Flywheel_rotor/.test(o.name) ? 'x' : null });
    });
    return parts;
  }

  // tap on the hero model; returns true if handled
  tap(hitObject) {
    const s = this.s; if (!s || !s.ready || s.returning) return false;
    let o = hitObject; while (o && o.parent !== s.root && o !== s.pivot) o = o.parent;
    if (s.tray) { // anything on the tray (or the rack) while a tray is out: put it back
      if (s.tray.stage === 'out') s.tray.back = true;
      return true;
    }
    if (s.kind === 'Rack' && o && /^ComputeTray_/.test(o.name) && s.open > 0.98) { this.pullTray(o); return true; }
    this.setLevel(s.level ? 0 : 1);
    return true;
  }
  setLevel(l) { if (this.s && !this.s.tray) { this.s.level = l; this.onChange(); } }
  canExplode() { return !!this.s?.parts?.some(p => p.off.lengthSq() > 1e-6); }

  async pullTray(node) {
    const s = this.s;
    const b = new THREE.Box3().setFromObject(node); s.root.worldToLocal(b.min); // bottom of this slot, rack units
    const tr = s.tray = { node, home: node.position.clone(), slide: 0, fly: 0, openT: 0, stage: 'slide', back: false, y0: b.min.y, obj: null };
    s.level = 0;
    this.onChange();
    const hero = await loadHero('Tray').catch(() => null);
    if (this.s !== s || s.tray !== tr) return;
    if (!hero) { s.tray = null; return; }
    const root = hero.children.length === 1 ? hero.children[0] : hero;
    hero.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.castShadow = false; } });
    tr.obj = new THREE.Group(); tr.obj.add(hero); tr.obj.visible = false; tr.obj.updateMatrixWorld(true);
    tr.root = root; tr.parts = this.collect(root, 'Tray');
    // tray close-up: the lid moves aside, the cold plates lift clear of the GPU / CPU packages
    for (const p of tr.parts) {
      if (/^Lid/.test(p.name)) p.off.set(0.64, 0.2, 0);
      else if (/^GPU_ColdPlate/.test(p.name)) p.off.set(0, 0.2, 0);
      else if (/^CPU_ColdPlate/.test(p.name)) p.off.set(0, 0.13, 0);
    }
    // GPU thermal glow (MaketHologramInspector.AddThermalEdges / thermal colour)
    tr.glow = tr.parts.filter(p => /^GPU_ColdPlate/.test(p.name)).map(p => p.obj);
    // coolant loop over the cold plates (tray units, after the plates have lifted)
    const c = n => { const p = tr.parts.find(q => q.name === n); const bb = new THREE.Box3().setFromObject(p.obj); root.worldToLocal(bb.min); root.worldToLocal(bb.max);
      const m = bb.getCenter(new THREE.Vector3()); m.add(p.off); m.y = bb.max.y + p.off.y + 0.012; return m; };
    const pts = [new THREE.Vector3(-0.24, 0.1, 0.62), c('GPU_ColdPlate_01'), c('CPU_ColdPlate_01'), c('GPU_ColdPlate_03'),
      c('GPU_ColdPlate_04'), c('CPU_ColdPlate_02'), c('GPU_ColdPlate_02'), new THREE.Vector3(0.24, 0.1, 0.62)];
    tr.flowMat = flowMaterial();
    tr.flow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 160, 0.009, 8), tr.flowMat);
    root.add(tr.flow);
    // part labels
    // anchor = [x, z] inside the part's box (0..1), label sits on its top
    const lab = (text, part, ax, az) => ({ text, parts: tr.parts.filter(p => p.name === part), ax, az });
    tr.labelDefs = [lab('GPU · холодная пластина', 'GPU_ColdPlate_02', 0.5, 0.5), lab('CPU', 'CPU_ColdPlate_02', 0.5, 0.5),
      lab('Вентиляторы и I/O', 'Fans_and_IO', 0.5, 0.98), lab('Плата и питание', 'PCB_and_passive_components', 0.1, 0.1),
      lab('Подвод · отвод жидкости', 'Tray_chassis', 0.5, 1.0)];
    for (const d of tr.labelDefs) { d.el = document.createElement('div'); d.el.className = 'tag'; d.el.textContent = d.text; d.el.style.opacity = 0; this.labels.appendChild(d.el); this.tags.push(d.el); }
    s.root.add(tr.obj);
  }

  // story helpers
  pullTrayByName(name) { const s = this.s; if (!s || !s.ready || s.tray) return; const n = s.root.children.find(o => o.name === name); if (n) { s.level = 0; this.pullTray(n); } }
  trayBack() { if (this.s?.tray) this.s.tray.back = true; }
  close() { if (this.s) { this.s.returning = true; if (this.s.tray) this.s.tray.back = true; this.s.level = 0; } }
  closeNow() {
    const s = this.s; if (!s) return;
    if (s.pivot) s.pivot.removeFromParent();
    s.e.hidden = false; this.s = null;
    this.leader.visible = this.halo.visible = false;
    for (const t of this.tags) t.remove(); this.tags = [];
    this.onChange();
  }

  // camera position in model space, dt in s
  tick(dt, camModel) {
    this.time += dt;
    const s = this.s; if (!s || !s.ready) return;
    s.age += dt;
    const tr = s.tray;
    s.explode = toward(s.explode, s.level ? 1 : 0, dt / 1.1);
    const folded = s.explode < 0.001 && !tr;
    s.open = toward(s.open, s.returning && folded ? 0 : 1, dt / 1.2);
    if (s.returning && s.open <= 0) { this.closeNow(); return; }
    const k = smoother(s.open), ex = smooth(s.explode);
    // rise, grow and face the viewer (slots = +z of the rack)
    const base = s.pos0.clone(); base.y += s.e.y;
    const target = base.clone(); target.y += s.lift;
    s.pivot.position.lerpVectors(base, target, k);
    s.pivot.scale.setScalar(THREE.MathUtils.lerp(s.scale0, s.scale1, k));
    const want = Math.atan2(camModel.x - s.pivot.position.x, camModel.z - s.pivot.position.z) + Math.sin(s.age * 0.3) * 0.1;
    let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); s.yaw += d * Math.min(1, dt * 3);
    s.pivot.quaternion.slerpQuaternions(s.quat0, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, 0)), k);
    for (const p of s.parts) {
      p.obj.position.copy(p.home).addScaledVector(p.off, ex);
      if (p.spin === 'y') p.obj.quaternion.copy(p.q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * (1.5 + 2.5 * k)));
      if (p.spin === 'x') { s.rotorAngle = (s.rotorAngle || 0) + dt * 3.1 * k * this.fx.rotor; p.obj.quaternion.copy(p.q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.rotorAngle)); }
      if (this.fx.engine && /^Engine/.test(p.name)) p.obj.position.y += Math.sin(this.time * 45) * 0.012;
    }
    // leader line and halo at the installed place
    const lp = this.leader.geometry.attributes.position;
    lp.setXYZ(0, base.x, base.y, base.z); lp.setXYZ(1, s.pivot.position.x, s.pivot.position.y, s.pivot.position.z); lp.needsUpdate = true;
    this.leader.visible = this.halo.visible = k > 0.02;
    this.halo.position.set(base.x, base.y + 0.3, base.z);
    this.halo.scale.setScalar(Math.max(s.size.x, s.size.z) * s.scale0 * 0.6 + 1);
    if (tr) this.tickTray(dt, tr, camModel);
  }

  tickTray(dt, tr, camModel) {
    const s = this.s;
    if (!tr.back) {
      tr.slide = toward(tr.slide, 1, dt / 0.7);
      if (tr.slide >= 1 && tr.obj) { tr.fly = toward(tr.fly, 1, dt / 1.1); }
      if (tr.fly >= 1) { tr.openT = toward(tr.openT, 1, dt / 1.4); tr.stage = 'out'; }
    } else {
      tr.stage = 'back';
      tr.openT = toward(tr.openT, 0, dt / 0.9);
      if (tr.openT <= 0) tr.fly = toward(tr.fly, 0, dt / 0.9);
      if (tr.fly <= 0) tr.slide = toward(tr.slide, 0, dt / 0.6);
      if (tr.slide <= 0) { this.endTray(); return; }
    }
    const sl = smooth(tr.slide), fl = smoother(tr.fly), op = smooth(tr.openT);
    tr.node.position.copy(tr.home); tr.node.position.z += 0.55 * sl;
    if (!tr.obj) return;
    const swapped = tr.fly > 0.001 || tr.openT > 0;
    tr.node.visible = !swapped; tr.obj.visible = swapped;
    // from the slot to the front stage: 2.2x, tilted so the top faces the viewer
    const from = new THREE.Vector3(0, tr.y0 - 0.006, 0.55), to = new THREE.Vector3(-0.2, 1.5, 1.5);
    tr.obj.position.lerpVectors(from, to, fl);
    tr.obj.scale.setScalar(THREE.MathUtils.lerp(1, 2.3, fl));
    tr.obj.rotation.set(0.45 * fl, 0, 0);
    // the rack fades behind the tray
    s.root.traverse(o => { if (o.isMesh && !tr.obj.getObjectById(o.id)) { o.material.transparent = fl > 0.01; o.material.opacity = 1 - 0.8 * fl; o.material.depthWrite = fl < 0.5; } });
    for (const p of tr.parts) {
      p.obj.position.copy(p.home).addScaledVector(p.off, op);
      if (/^Lid/.test(p.name)) p.obj.traverse(m => { if (m.isMesh) { m.material.transparent = true; m.material.opacity = 1 - 0.8 * op; m.material.depthWrite = op < 0.5; } });
    }
    const load = 0.65 + 0.1 * Math.sin(this.time * 0.7);
    const hot = new THREE.Color(0.15, 0.75, 1).lerp(new THREE.Color(1, 0.32, 0.06), load);
    for (const g of tr.glow) g.traverse(m => { if (m.isMesh) { m.material.emissive.copy(hot); m.material.emissiveIntensity = op * (0.55 + 0.25 * Math.sin(this.time * 3)); } });
    tr.flowMat.uniforms.time.value = this.time; tr.flowMat.uniforms.fade.value = Math.max(0, op * 1.4 - 0.4);
    tr.flow.visible = op > 0.3;
  }
  endTray() {
    const s = this.s, tr = s.tray;
    tr.node.position.copy(tr.home); tr.node.visible = true;
    tr.obj.removeFromParent();
    s.root.traverse(o => { if (o.isMesh) { o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; } });
    for (const d of tr.labelDefs || []) d.el.remove();
    this.tags = this.tags.filter(t => t.isConnected);
    s.tray = null;
    this.onChange();
  }

  // HTML captions of the opened tray; cam = the rendering camera
  drawLabels(cam) {
    const tr = this.s?.tray; if (!tr || !tr.labelDefs) return;
    const op = smooth(tr.openT), v = new THREE.Vector3();
    for (const d of tr.labelDefs) {
      const p = d.parts[0];
      if (!p) { d.el.style.opacity = 0; continue; }
      if (!d.box) { d.box = new THREE.Box3(); p.obj.traverse(m => { if (m.isMesh) { m.geometry.computeBoundingBox(); d.box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix).applyMatrix4(m === p.obj ? new THREE.Matrix4() : p.obj.matrix)); } }); d.box.min.sub(p.obj.position); d.box.max.sub(p.obj.position); }
      // root-local anchor on top of the part, moved with the part
      v.set(THREE.MathUtils.lerp(d.box.min.x, d.box.max.x, d.ax), d.box.max.y, THREE.MathUtils.lerp(d.box.min.z, d.box.max.z, d.az)).add(p.obj.position);
      tr.root.localToWorld(v).project(cam);
      const show = op > 0.9 && v.z < 1;
      d.el.style.opacity = show ? 1 : 0;
      if (show) { d.el.style.left = (v.x + 1) / 2 * innerWidth + 'px'; d.el.style.top = (1 - v.y) / 2 * innerHeight + 'px'; }
    }
  }

  // card contents for the HUD
  card() {
    const s = this.s; if (!s) return null;
    if (s.tray) return { title: TRAY_TEXT[0], metric: TRAY_TEXT[1], body: TRAY_TEXT[2], note: `${s.e.name} · ${s.tray.node.name.replace('ComputeTray_', 'лоток ')} · касание — вернуть лоток\n${TRAY_TEXT[3]}`, level: -1 };
    let [title, metric, body] = TEXT[s.kind] || [s.e.name, '', ''];
    if (s.kind === 'Chiller' && s.e.name.includes('-AIR-')) { metric = '290 кВт'; body = 'Охлаждение воздушного контура\nНоминал из концепции проекта'; }
    if (s.kind === 'Rack' && s.level) body = '18 вычислительных лотков · 9 NVLink-коммутаторов\n8 блоков питания · коллекторы подвода и отвода';
    const hint = s.kind === 'Rack' ? 'касание по лотку — выдвинуть · по стойке — раскрыть' : this.canExplode() ? (s.level ? 'касание — собрать' : 'касание — раскрыть') : 'поворот — за камерой';
    return { title, metric, body, note: `${s.e.name}${s.e.reserve ? ' · резерв' : ''} · ${hint}`, level: s.level, canExplode: this.canExplode() };
  }

  // world-space centre and height of the hero on its stage (3D camera framing)
  focus() {
    const s = this.s; if (!s || !s.ready) return null;
    if (s.tray && s.tray.obj && s.tray.fly > 0.5) { // frame the opened tray
      const b = new THREE.Box3().setFromObject(s.tray.obj), c = b.getCenter(new THREE.Vector3());
      const inv = this.model.matrixWorld.clone().invert(); c.applyMatrix4(inv);
      return { center: c, height: 1.1 * 2.3 * s.scale1 };
    }
    const c = s.pos0.clone(); c.y += s.e.y + s.lift + s.size.y * s.scale1 * 0.5;
    return { center: c, height: Math.max(s.size.x, s.size.y, s.size.z) * s.scale1 };
  }
  pickables() { return this.s?.pivot ? [this.s.pivot] : []; }
}
