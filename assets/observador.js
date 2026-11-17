// Vista do observador: paisagem simulada no nível da rua, vista do céu e vista do horizonte (360°),
// com terreno do MDT e edificações (WFS EDIFICACAO + envelopes licenciados). Three.js r160.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const W15 = 256 * 2 ** 15, RT = 6378137;
const gxOf = lon => (lon + 180) / 360 * W15;
const gyOf = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * W15; };
const latOfGy = gy => { const n = Math.PI - 2 * Math.PI * gy / W15; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
const R_ED = 1500;   // raio (m) das edificações na cena
const CEL = 2;       // resolução (m) da grade de alturas usada na análise de céu/horizonte
const N = (2 * R_ED) / CEL;
const PASSO_AZ = 0.5; // graus
const COR = { parede: 0xc2c2c2, teto: 0x9f9f9f, alvo: 0xf2b134, lic: 0xd7191c, licG: 0x8f0f12 };
const DEG = Math.PI / 180;
const fmt = (v, d = 0) => v == null || isNaN(v) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const rumo = az => ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((az % 360) + 360) % 360 / 45) % 8];

let UI = null, R = null, S = null, texCache = null;

// ---------------- Interface ----------------
function montarUI() {
  const el = document.createElement('div');
  el.id = 'obs-overlay';
  el.innerHTML = `
    <div class="obs-bar">
      <b id="obs-tit">Vista do observador</b>
      <button data-m="rua" class="on">🚶 Nível da rua</button>
      <button data-m="ceu">☁ Vista do céu</button>
      <button data-m="hor">⟷ Horizonte 360°</button>
      <label>Altura do olho <input type="number" id="obs-eye" min="0.5" max="200" step="0.1" value="1.6"> m</label>
      <label>Campo de visão <input type="range" id="obs-fov" min="15" max="130" value="70"><span id="obs-fov-v">70°</span></label>
      <span class="sp"></span>
      <button id="obs-close">✕ Voltar ao mapa</button>
    </div>
    <div class="obs-bar obs-bar-sol">
      <b>☀ Sol</b>
      <button data-d="12-21">21/12</button><button data-d="03-20">Equinócio</button><button data-d="06-21">21/06</button>
      <label>Data <input type="date" id="obs-data" value="2026-12-21"></label>
      <label>Hora solar <input type="range" id="obs-hora" min="5" max="19" step="any" value="15" style="width:220px"><span id="obs-hora-v" style="width:44px">15h00</span></label>
      <button id="obs-play" title="Animar o dia">▶ Animar o dia</button>
      <span id="obs-sol-info" style="font-size:12px;color:#b9c8d8"></span>
    </div>
    <div class="obs-main">
      <div class="obs-view" id="obs-view">
        <div class="obs-hud" id="obs-hud"></div>
        <div class="obs-msg" id="obs-msg">Montando a cena…</div>
      </div>
      <aside class="obs-side">
        <section><h4>Observador</h4><table id="obs-tab"></table></section>
        <section><h4>Vista do céu (olho de peixe)</h4><canvas id="obs-fish" width="520" height="520"></canvas>
          <div class="hint" id="obs-sol-leg" style="color:#e9eef4;margin:4px 0"></div>
          <div class="hint">Zênite no centro, horizonte na borda; norte para cima e leste à esquerda (como visto de baixo). Cinza = edificações, marrom = relevo.
          Trajetórias do sol em hora solar verdadeira: linha cheia e ponto preenchido = sol direto; tracejado e ponto vazado = sol bloqueado. Horas de sol direto ao lado de cada data.</div></section>
        <section><h4>Perfil do horizonte</h4><canvas id="obs-prof" width="560" height="220"></canvas>
          <div class="hint">Ângulo de obstrução por azimute (0° = N, sentido horário).</div></section>
        <section class="hint"><b>Navegação</b><br>Arrastar: olhar em volta · Roda: campo de visão<br>W A S D / setas: andar · Shift: correr · Q / E: subir e descer o olho<br>Esc: voltar ao mapa<br><br>
          Edificações do WFS num raio de 1,5 km (só as já carregadas no mapa), com base na cota MDT e altura estimada (MDE − MDT). Terreno: MDT reconstruído (≈ 4,8 m) com o mapa base do BHGEO. Cenário simulado: as edificações existentes dentro dos lotes licenciados são substituídas pelos envelopes (vermelho). Sem vegetação e sem mobiliário urbano.</section>
      </aside>
    </div>`;
  document.body.appendChild(el);
  const $ = id => el.querySelector('#' + id);
  UI = { el, $, view: $('obs-view'), hud: $('obs-hud'), msg: $('obs-msg') };
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => setModo(b.dataset.m));
  $('obs-close').onclick = fechar;
  $('obs-eye').oninput = e => { if (S) { S.eye = Math.max(0.5, +e.target.value || 1.6); posicionarCamera(); agendarAnalise(); } };
  $('obs-fov').oninput = e => { if (S) { S.fov = +e.target.value; aplicarFov(); } };
  // data e hora do sol (persistem entre aberturas)
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { $('obs-data').value = '2026-' + b.dataset.d; atualizarSol(); });
  $('obs-data').oninput = atualizarSol;
  $('obs-hora').oninput = () => { animando = false; $('obs-play').textContent = '▶ Animar o dia'; atualizarSol(); };
  $('obs-play').onclick = () => { animando = !animando; $('obs-play').textContent = animando ? '⏸ Pausar' : '▶ Animar o dia'; };
  document.addEventListener('keydown', e => {
    if (!el.classList.contains('open')) return;
    if (e.key === 'Escape') { fechar(); return; }
    if (e.target.closest('input')) return;
    S && (S.keys[e.key.toLowerCase()] = true);
  });
  document.addEventListener('keyup', e => { if (S) S.keys[e.key.toLowerCase()] = false; });
}

function iniciarRenderer() {
  R = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  R.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  R.shadowMap.enabled = true;
  R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.outputColorSpace = THREE.SRGBColorSpace;
  UI.view.prepend(R.domElement);
  const cv = R.domElement;
  let arr = null;
  cv.addEventListener('pointerdown', e => { arr = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointerup', e => { arr = null; cv.style.cursor = 'grab'; });
  cv.addEventListener('pointermove', e => {
    if (!arr || !S) return;
    const k = 0.2 * S.fov / 70;
    S.yaw -= (e.clientX - arr.x) * k; S.pitch += (e.clientY - arr.y) * k;
    S.pitch = Math.max(-89.9, Math.min(89.9, S.pitch));
    arr = { x: e.clientX, y: e.clientY }; S.dirty = true;
  });
  cv.addEventListener('wheel', e => {
    if (!S) return; e.preventDefault();
    S.fov = Math.max(15, Math.min(130, S.fov + e.deltaY * 0.04)); aplicarFov();
  }, { passive: false });
  new ResizeObserver(() => { if (S) { redimensionar(); S.dirty = true; } }).observe(UI.view);
}

// ---------------- Abertura ----------------
window.abrirObservador = async function (op) {
  const O = window.OUS;
  if (!O || !O.MDT || !O.MDT.H) { alert('O MDT ainda está carregando.'); return; }
  if (!UI) montarUI();
  UI.el.classList.add('open');
  if (!R) iniciarRenderer();
  UI.msg.style.display = ''; UI.msg.textContent = 'Montando a cena…';
  await new Promise(r => setTimeout(r, 30)); // deixa a mensagem aparecer
  try { construirCena(op); }
  catch (e) { console.error(e); UI.msg.textContent = 'Erro ao montar a cena: ' + e.message; return; }
  UI.msg.style.display = 'none';
  redimensionar();
  setModo('rua');
  analisar();
  carregarTextura();
  if (!S.loop) { S.loop = true; requestAnimationFrame(quadro); }
};

function fechar() {
  UI.el.classList.remove('open');
  if (S) { S.loop = false; descartar(); S = null; }
}

function descartar() {
  S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== S.matTerrenoComp) o.material.dispose?.(); });
  R.renderLists.dispose();
}

// ---------------- Cena ----------------
function construirCena(op) {
  const O = window.OUS, M = O.MDT.meta, H = O.MDT.H;
  const origem = op.alvo || op.pos;
  const gx0 = gxOf(origem[0]), gy0 = gyOf(origem[1]);
  const ppm = W15 / (2 * Math.PI * RT * Math.cos(origem[1] * DEG)); // pixels z15 por metro
  const toLocal = (lon, lat) => [(gxOf(lon) - gx0) / ppm, (gyOf(lat) - gy0) / ppm];
  const terreno = (x, z) => O.cotaMDT(gx0 + x * ppm, gy0 + z * ppm);
  const e0 = terreno(0, 0);
  const ext = { // extensão do MDT em coordenadas locais
    x0: (M.x0 * 256 - gx0) / ppm, x1: ((M.x1 + 1) * 256 - gx0) / ppm,
    z0: (M.y0 * 256 - gy0) / ppm, z1: ((M.y1 + 1) * 256 - gy0) / ppm,
  };
  S = { op, gx0, gy0, ppm, e0, toLocal, terreno, ext, eye: +UI.$('obs-eye').value || 1.6, fov: 70, yaw: 0, pitch: 3,
        modo: 'rua', keys: {}, dirty: true, bgrid: new Float32Array(N * N), loop: false };
  const scene = new THREE.Scene();
  S.scene = scene;
  scene.fog = new THREE.Fog(0xdfe9f3, 2500, 14000);

  // céu
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { topo: { value: new THREE.Color(0x2f6fc4) }, hor: { value: new THREE.Color(0xe3edf6) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 topo; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); gl_FragColor = vec4(mix(hor, topo, pow(h,0.55)),1.0); }',
  }));
  sky.renderOrder = -1; S.sky = sky; scene.add(sky);

  // luz: sol ao norte (hemisfério sul), 55° de altura
  S.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f6a, 1.5);
  scene.add(S.hemi);
  const sol = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(4096, 4096);
  Object.assign(sol.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, near: 1, far: 3000 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.6;
  scene.add(sol, sol.target); S.sol = sol;

  // terreno (passo de 2 px ≈ 9,6 m)
  const st = 2, W = M.width, Hh = M.height;
  const nc = Math.floor((W - 1) / st) + 1, nr = Math.floor((Hh - 1) / st) + 1;
  const pos = new Float32Array(nc * nr * 3), uv = new Float32Array(nc * nr * 2), col = new Float32Array(nc * nr * 3);
  for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
    const px = i * st, py = j * st, k = j * nc + i, h = H[py * W + px];
    pos[3 * k] = (M.x0 * 256 + px + 0.5 - gx0) / ppm;
    pos[3 * k + 1] = h - e0;
    pos[3 * k + 2] = (M.y0 * 256 + py + 0.5 - gy0) / ppm;
    uv[2 * k] = (px + 0.5) / W; uv[2 * k + 1] = (py + 0.5) / Hh;
    const c = O.corCota(h); col[3 * k] = c[0] / 255; col[3 * k + 1] = c[1] / 255; col[3 * k + 2] = c[2] / 255;
  }
  const idx = new Uint32Array((nc - 1) * (nr - 1) * 6); let t = 0;
  for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc - 1; i++) {
    const a = j * nc + i, b = a + 1, c = a + nc, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const gT = new THREE.BufferGeometry();
  gT.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  gT.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  gT.setAttribute('color', new THREE.BufferAttribute(col, 3));
  gT.setIndex(new THREE.BufferAttribute(idx, 1));
  gT.computeVertexNormals();
  const matT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const terr = new THREE.Mesh(gT, matT); terr.receiveShadow = true;
  scene.add(terr); S.terrMesh = terr;
  if (texCache) aplicarTextura(texCache);

  // edificações
  const P = [], C = [];
  const cor = new THREE.Color();
  const tri = (a, b, c, hex) => { P.push(...a, ...b, ...c); cor.setHex(hex); for (let q = 0; q < 3; q++) C.push(cor.r, cor.g, cor.b); };
  const prisma = (ring, base, topo, corP, corT) => { // ring em coordenadas locais [x,z]
    let r = ring;
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
    if (r.length < 3) return;
    const yb = base - e0, yt = topo - e0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      tri([a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], yt, b[1]], corP);
      tri([a[0], yb, a[1]], [b[0], yt, b[1]], [a[0], yt, a[1]], corP);
    }
    const v2 = r.map(p => new THREE.Vector2(p[0], p[1]));
    for (const f of THREE.ShapeUtils.triangulateShape(v2, [])) tri([r[f[0]][0], yt, r[f[0]][1]], [r[f[1]][0], yt, r[f[1]][1]], [r[f[2]][0], yt, r[f[2]][1]], corT);
    preencherGrade(r, topo);
  };
  // cenário simulado: edificações existentes dentro dos lotes licenciados dão lugar ao envelope
  const lotes = O.projetos.filter(p => p.lote).map(p => p.lote.map(q => toLocal(q[0], q[1])));
  const dentro = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  let nEd = 0, nSub = 0;
  for (const f of O.edFeatures) {
    const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const p0 = polys[0][0][0]; const [cx, cz] = toLocal(p0[0], p0[1]);
    if (Math.abs(cx) > R_ED || Math.abs(cz) > R_ED) continue;
    if (lotes.length) {
      let sx = 0, sz = 0; const anel = polys[0][0];
      for (const q of anel) { const l = toLocal(q[0], q[1]); sx += l[0]; sz += l[1]; }
      if (lotes.some(r => dentro(sx / anel.length, sz / anel.length, r))) { nSub++; continue; }
    }
    const h = +f.properties.h || 3;
    let cota = +f.properties.cota;
    if (!(cota > 500)) cota = terreno(cx, cz);
    const ehAlvo = op.idEd != null && f.properties.id === op.idEd;
    if (ehAlvo) S.hAlvo = h;
    for (const poly of polys) prisma(poly[0].map(q => toLocal(q[0], q[1])), cota - 3, cota + h, ehAlvo ? COR.alvo : COR.parede, ehAlvo ? COR.alvo : COR.teto);
    nEd++;
  }
  for (const p of O.projetos) {
    const c = O.centroDe(p), [lx, lz] = toLocal(c[0], c[1]);
    if (Math.abs(lx) > R_ED || Math.abs(lz) > R_ED) continue;
    const g0 = terreno(lx, lz), corL = p.tipo === 'Gerador' ? COR.licG : COR.lic;
    for (const f of p.pavs) prisma(f.coords.map(q => toLocal(q[0], q[1])), g0 + (f.base > 0 ? f.base : -3), g0 + f.topo, corL, corL);
    if (op.nome && p.nome === op.nome) S.hAlvo = Math.max(...p.pavs.map(f => f.topo));
  }
  if (P.length) {
    const gB = new THREE.BufferGeometry();
    gB.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    gB.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    gB.computeVertexNormals();
    const mB = new THREE.Mesh(gB, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
    mB.castShadow = true; mB.receiveShadow = true;
    scene.add(mB);
  }
  S.nEd = nEd; S.nSub = nSub;

  // câmera e posição inicial
  S.cam = new THREE.PerspectiveCamera(70, 1, 0.3, 60000);
  S.cam.rotation.order = 'YXZ';
  S.panoCams = [0, 90, 180, 270].map(az => { const c = new THREE.PerspectiveCamera(53.13, 2, 0.3, 60000); c.rotation.order = 'YXZ'; c.rotation.y = -az * DEG; return c; });
  if (op.alvo) {
    const bb = op.bbox || [origem[0], origem[1], origem[0], origem[1]];
    const [ax0, az0] = toLocal(bb[0], bb[3]), [ax1, az1] = toLocal(bb[2], bb[1]);
    const r0 = Math.hypot(ax1 - ax0, az1 - az0) / 2 + 6;
    const p = posicaoLivre(r0, (op.azVisada || 0) + 180);
    S.x = p[0]; S.z = p[1];
    S.yaw = Math.atan2(-S.x, S.z) / DEG; // de frente para o alvo (origem)
    const d = Math.hypot(S.x, S.z);
    S.pitch = Math.min(35, Math.atan2((S.hAlvo || 10) * 0.45, d) / DEG);
  } else {
    S.x = 0; S.z = 0; S.yaw = op.azVisada || 0; S.pitch = 4;
  }
  UI.$('obs-tit').textContent = 'Vista do observador' + (op.nome ? ' — ' + op.nome : '');
  posicionarCamera();
}

function preencherGrade(ring, topo) {
  const g = S.bgrid, pts = ring.map(p => [(p[0] + R_ED) / CEL, (p[1] + R_ED) / CEL]);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const j0 = Math.max(0, Math.ceil(y0 - 0.5)), j1 = Math.min(N - 1, Math.floor(y1 - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const yc = j + 0.5; xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(N - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = i0; i <= i1; i++) if (topo > g[j * N + i]) g[j * N + i] = topo;
    }
  }
}
const alturaEd = (x, z) => {
  const i = Math.floor((x + R_ED) / CEL), j = Math.floor((z + R_ED) / CEL);
  return i < 0 || j < 0 || i >= N || j >= N ? 0 : S.bgrid[j * N + i];
};
function posicaoLivre(r0, azBase) {
  const offs = [0, 20, -20, 40, -40, 60, -60, 90, -90, 120, -120, 150, -150, 180];
  for (let d = r0; d < r0 + 150; d += 2) for (const o of offs) {
    const a = (azBase + o) * DEG, x = Math.sin(a) * d, z = -Math.cos(a) * d;
    let livre = true;
    for (let dx = -2; dx <= 2 && livre; dx += 2) for (let dz = -2; dz <= 2; dz += 2) if (alturaEd(x + dx, z + dz) > 0) { livre = false; break; }
    if (livre) return [x, z];
  }
  return [Math.sin(azBase * DEG) * r0, -Math.cos(azBase * DEG) * r0];
}

// ---------------- Textura do mapa base (WMS) ----------------
async function carregarTextura() {
  if (texCache) return;
  const M = window.OUS.MDT.meta, PR = Math.PI * RT;
  const mx = gx => gx / W15 * 2 * PR - PR, my = gy => PR - gy / W15 * 2 * PR;
  const bbox = [mx(M.x0 * 256), my((M.y1 + 1) * 256), mx((M.x1 + 1) * 256), my(M.y0 * 256)].join(',');
  for (const w of [4096, 2048]) {
    const h = Math.round(w * M.height / M.width);
    const url = `https://bhmap.pbh.gov.br/v2/api/idebhgeo/wms?service=WMS&version=1.3.0&request=GetMap&layers=MAPA_BASE&styles=&crs=EPSG:3857&bbox=${bbox}&width=${w}&height=${h}&format=image/jpeg`;
    try {
      const r = await fetch(url);
      if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) continue;
      const bmp = await createImageBitmap(await r.blob());
      const tex = new THREE.Texture(bmp);
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = R.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true; texCache = tex;
      if (S) aplicarTextura(tex);
      return;
    } catch (e) { console.warn('textura WMS', e); }
  }
}
function aplicarTextura(tex) {
  const m = S.terrMesh.material;
  // o mapa base é muito claro; um tom de terra reduz o ofuscamento do chão iluminado pelo sol
  m.map = tex; m.vertexColors = false; m.color.setHex(0xc9c1b0); m.needsUpdate = true; S.dirty = true;
}

// ---------------- Câmera, modos e quadro ----------------
function posicionarCamera() {
  const y = S.terreno(S.x, S.z) - S.e0 + S.eye;
  S.cam.position.set(S.x, y, S.z);
  S.panoCams.forEach(c => c.position.copy(S.cam.position));
  S.sky.position.copy(S.cam.position);
  S.sol.target.position.set(S.x, y, S.z);
  aplicarSol();
  S.dirty = true;
}

// ---------------- Sol por data e hora ----------------
let animando = false;
function declinacao(iso) { // aproximação de Cooper: δ = −23,44° · cos(360/365 · (n + 10))
  const d = new Date(iso + 'T12:00:00'); if (isNaN(d)) return 0;
  const n = Math.round((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return -23.44 * Math.cos(2 * Math.PI / 365 * (n + 10));
}
function solAtual() {
  const lat = latOfGy(S.gy0 + S.z * S.ppm), dec = declinacao(UI.$('obs-data').value), h = +UI.$('obs-hora').value;
  return { ...posSol(lat, dec, h), h, dec };
}
function aplicarSol() {
  if (!S || !S.sol) return;
  const p = solAtual(), alt = p.alt * DEG, az = p.az * DEG;
  const c = S.cam ? S.cam.position : new THREE.Vector3(S.x, 0, S.z);
  const dia = THREE.MathUtils.clamp((p.alt + 4) / 14, 0, 1);       // 0 à noite, 1 com o sol acima de ~10°
  const baixo = 1 - THREE.MathUtils.clamp((p.alt - 2) / 25, 0, 1);  // tom quente perto do horizonte
  S.sol.position.set(c.x + Math.sin(az) * Math.cos(alt) * 1200, c.y + Math.max(Math.sin(alt), 0.02) * 1200, c.z - Math.cos(az) * Math.cos(alt) * 1200);
  S.sol.intensity = p.alt > 0 ? 2.6 * Math.min(1, p.alt / 12) : 0;
  S.sol.color.setRGB(1, 0.96 - 0.25 * baixo, 0.88 - 0.45 * baixo);
  S.hemi.intensity = 0.25 + 1.25 * dia;
  const u = S.sky.material.uniforms;
  u.topo.value.setRGB(0.05 + 0.13 * dia, 0.09 + 0.35 * dia, 0.2 + 0.57 * dia);
  u.hor.value.setRGB(0.25 + 0.64 * dia + 0.1 * baixo * dia, 0.27 + 0.66 * dia - 0.12 * baixo * dia, 0.35 + 0.61 * dia - 0.35 * baixo * dia);
  S.scene.fog.color.copy(u.hor.value);
  // sol direto no observador?
  let luz = null;
  if (S.analise) { const n = S.analise.elev.length; luz = p.alt > 0 && p.alt > S.analise.elev[Math.round(p.az / PASSO_AZ) % n]; }
  S.solInfo = { ...p, luz };
  UI.$('obs-hora-v').textContent = fmtH(p.h);
  UI.$('obs-sol-info').textContent = p.alt <= 0 ? 'Sol abaixo do horizonte'
    : `altura ${fmt(p.alt)}° · azimute ${fmt(p.az)}° (${rumo(p.az)})` + (luz == null ? '' : luz ? ' · ☀ sol direto no observador' : ' · ⛅ observador à sombra');
  S.dirty = true;
}
function atualizarSol() {
  if (!S) return;
  aplicarSol();
  if (S.analise) desenharFisheye(S.analise.elev, S.analise.tipo, S.analise.fvc, S.analise.sol);
}
function aplicarFov() {
  UI.$('obs-fov').value = Math.round(S.fov); UI.$('obs-fov-v').textContent = Math.round(S.fov) + '°';
  S.dirty = true;
}
function setModo(m) {
  if (!S) return;
  S.modo = m;
  UI.el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  if (m === 'rua') { if (S.pitch > 60) S.pitch = 5; S.pitch = Math.min(Math.max(S.pitch, -10), 35); S.fov = 70; }
  if (m === 'ceu') { S.pitch = 89.9; S.fov = 120; }
  if (m === 'hor') { S.pitch = 0; S.fov = 75; }
  aplicarFov(); redimensionar();
}
function redimensionar() {
  const w = UI.view.clientWidth, h = UI.view.clientHeight;
  R.setSize(w, h, false);
  R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px';
  UI.view.querySelectorAll('.obs-pano-lbl').forEach(e => e.remove());
  if (S && S.modo === 'hor') {
    const sh = Math.round(w / 4 / 2);
    const lbls = ['N', 'L', 'S', 'O'];
    lbls.forEach((l, i) => {
      const d = document.createElement('div'); d.className = 'obs-pano-lbl';
      d.style.left = ((i + 0.5) * w / 4) + 'px'; d.textContent = l; UI.view.appendChild(d);
      const d2 = document.createElement('div'); d2.className = 'obs-pano-lbl'; d2.style.opacity = .7;
      d2.style.left = ((i + 1) * w / 4) + 'px'; d2.textContent = ['NE', 'SE', 'SO', 'NO'][i]; if (i < 3) UI.view.appendChild(d2);
    });
    S.stripH = sh;
  } else if (S) S.stripH = 0;
}

let tAnt = 0;
function quadro(t) {
  if (!S || !S.loop) return;
  const dt = tAnt ? Math.min(0.1, (t - tAnt) / 1000) : 0; tAnt = t;
  const k = S.keys, v = (k.shift ? 12 : 2.5) * dt;
  let fw = 0, sd = 0;
  if (k.w || k.arrowup) fw += 1; if (k.s || k.arrowdown) fw -= 1;
  if (k.d || k.arrowright) sd += 1; if (k.a || k.arrowleft) sd -= 1;
  if (k.q) { S.eye = Math.min(200, S.eye + 6 * dt); UI.$('obs-eye').value = S.eye.toFixed(1); }
  if (k.e) { S.eye = Math.max(0.5, S.eye - 6 * dt); UI.$('obs-eye').value = S.eye.toFixed(1); }
  if (fw || sd || k.q || k.e) {
    const a = S.yaw * DEG;
    S.x += (Math.sin(a) * fw + Math.cos(a) * sd) * v; S.z += (-Math.cos(a) * fw + Math.sin(a) * sd) * v;
    posicionarCamera(); agendarAnalise();
  }
  if (animando) {
    const hr = UI.$('obs-hora'); let h = +hr.value + dt * 0.8; // 0,8 h por segundo
    if (h > 19) h = 5;
    hr.value = h; atualizarSol();
  }
  if (S.dirty) { desenhar(); S.dirty = false; }
  requestAnimationFrame(quadro);
}
function desenhar() {
  const w = UI.view.clientWidth, h = UI.view.clientHeight, sh = S.stripH || 0;
  S.cam.rotation.y = -S.yaw * DEG; S.cam.rotation.x = S.pitch * DEG;
  S.cam.fov = S.fov; S.cam.aspect = w / Math.max(1, h - sh); S.cam.updateProjectionMatrix();
  R.setScissorTest(true);
  R.setViewport(0, sh, w, h - sh); R.setScissor(0, sh, w, h - sh);
  R.render(S.scene, S.cam);
  if (sh) S.panoCams.forEach((c, i) => {
    c.aspect = (w / 4) / sh; c.fov = 2 * Math.atan(Math.tan(45 * DEG) / c.aspect) / DEG; c.updateProjectionMatrix();
    R.setViewport(i * w / 4, 0, w / 4, sh); R.setScissor(i * w / 4, 0, w / 4, sh);
    R.render(S.scene, c);
  });
  R.setScissorTest(false);
  const az = ((S.yaw % 360) + 360) % 360;
  UI.hud.textContent = `Rumo ${fmt(az)}° (${rumo(az)}) · inclinação ${fmt(S.pitch)}° · olho a ${fmt(S.eye, 1)} m do chão`;
}

// ---------------- Análise: céu e horizonte ----------------
let tAnalise = null;
function agendarAnalise() { clearTimeout(tAnalise); tAnalise = setTimeout(analisar, 350); }
function analisar() {
  if (!S) return;
  const nAz = Math.round(360 / PASSO_AZ), elev = new Float32Array(nAz), tipo = new Uint8Array(nAz);
  const chao = S.terreno(S.x, S.z), olho = chao + S.eye, E = S.ext;
  for (let k = 0; k < nAz; k++) {
    const a = k * PASSO_AZ * DEG, dx = Math.sin(a), dz = -Math.cos(a);
    let mx = -90, tp = 0;
    for (let r = 1; r < 9000;) {
      const x = S.x + dx * r, z = S.z + dz * r;
      if (x < E.x0 || x > E.x1 || z < E.z0 || z > E.z1) break;
      const ht = S.terreno(x, z), hb = r <= R_ED + 50 ? alturaEd(x, z) : 0;
      const at = Math.atan2(ht - olho, r), ab = hb ? Math.atan2(hb - olho, r) : -2;
      if (at > mx * DEG) { mx = at / DEG; tp = 2; }
      if (ab > mx * DEG) { mx = ab / DEG; tp = 1; }
      r += r < 200 ? 1 : r < R_ED ? 2 : 15;
    }
    elev[k] = Math.max(0, mx); tipo[k] = mx > 0 ? tp : 0;
  }
  let soma = 0, maxE = 0, maxAz = 0, obsEd = 0;
  for (let k = 0; k < nAz; k++) {
    soma += Math.sin(elev[k] * DEG) ** 2;
    if (elev[k] > maxE) { maxE = elev[k]; maxAz = k * PASSO_AZ; }
    if (tipo[k] === 1 && elev[k] > 10) obsEd++;
  }
  const fvc = 1 - soma / nAz;
  const lon = (S.gx0 + S.x * S.ppm) / W15 * 360 - 180, lat = latOfGy(S.gy0 + S.z * S.ppm);
  const sol = trajetorias(lat, elev);
  S.analise = { elev, tipo, fvc, maxE, maxAz, sol };
  aplicarSol();
  desenharFisheye(elev, tipo, fvc, sol);
  desenharPerfil(elev, tipo);
  const O = window.OUS;
  const dAlvo = S.op.alvo ? Math.hypot(S.x, S.z) : null;
  UI.$('obs-tab').innerHTML = [
    ['Cota do terreno (MDT)', fmt(chao, 1) + ' m'],
    ['Cota do olho', fmt(olho, 1) + ' m'],
    dAlvo != null ? ['Distância ao alvo', fmt(dAlvo, 0) + ' m'] : null,
    ['Fator de visão do céu', fmt(fvc * 100, 0) + '%'],
    ['Maior obstrução', `${fmt(maxE, 0)}° a ${fmt(maxAz, 0)}° (${rumo(maxAz)})`],
    ['Horizonte barrado por edificações (> 10°)', fmt(obsEd / nAz * 100, 0) + '%'],
    ...sol.map(d => [`Sol direto em ${d.nome}`, `${fmtH(d.horas)} de ${fmtH(d.dia)}`]),
    ['Edificações na cena', fmt(S.nEd)],
    ['Substituídas pelos envelopes', fmt(S.nSub)],
    ['Posição', `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
  ].filter(Boolean).map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
}
// ---------------- Trajetória do sol ----------------
// Posição do sol por hora solar verdadeira, nas datas de referência; o sol "bate" no observador quando
// sua altura supera o ângulo de obstrução (edificações ou relevo) daquele azimute.
const DATAS_SOL = [
  // declinação solar: em 21/12 o sol está sobre o Trópico de Capricórnio (−23,44°)
  { nome: '21/12 (solstício de verão)', curto: '21/12', dec: -23.44, cor: '#eb6834' },
  { nome: '20/03 e 22/09 (equinócios)', curto: 'equinócios', dec: 0, cor: '#eda100' },
  { nome: '21/06 (solstício de inverno)', curto: '21/06', dec: 23.44, cor: '#e87ba4' },
];
const fmtH = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
function posSol(latDeg, decDeg, horaSolar) {
  const f = latDeg * DEG, d = decDeg * DEG, H = (horaSolar - 12) * 15 * DEG;
  const e = -Math.cos(d) * Math.sin(H);
  const n = Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(H) * Math.sin(f);
  const u = Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(H) * Math.cos(f);
  return { alt: Math.asin(u) / DEG, az: ((Math.atan2(e, n) / DEG) + 360) % 360 };
}
function trajetorias(latDeg, elev) {
  const n = elev.length, passo = 5 / 60; // 5 minutos
  return DATAS_SOL.map(D => {
    const dec = D.dec, pts = [];
    let horas = 0, dia = 0;
    for (let h = 0; h <= 24 + 1e-9; h += passo) {
      const p = posSol(latDeg, dec, h);
      if (p.alt <= 0) continue;
      const k = Math.round(p.az / PASSO_AZ) % n;
      const luz = p.alt > elev[k];
      dia += passo; if (luz) horas += passo;
      pts.push({ ...p, h, luz });
    }
    return { ...D, pts, horas, dia };
  });
}

function desenharFisheye(elev, tipo, fvc, sol = []) {
  const cv = UI.$('obs-fish'), c = cv.getContext('2d'), W = cv.width, cx = W / 2, cy = W / 2, Rr = W / 2 - 26;
  c.clearRect(0, 0, W, W);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, Rr);
  g.addColorStop(0, '#2f6fc4'); g.addColorStop(1, '#cfe0f2');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, Rr, 0, 2 * Math.PI); c.fill();
  const n = elev.length, da = 2 * Math.PI / n;
  for (let k = 0; k < n; k++) {
    if (elev[k] <= 0) continue;
    const a = k * da, r = Rr * (90 - elev[k]) / 90;
    // visto de baixo: N acima, L à esquerda
    const ang0 = -Math.PI / 2 - a - da / 2, ang1 = -Math.PI / 2 - a + da / 2;
    c.fillStyle = tipo[k] === 1 ? '#8c8c8c' : '#8a6d4b';
    c.beginPath(); c.arc(cx, cy, Rr, ang0, ang1); c.arc(cx, cy, r, ang1, ang0, true); c.closePath(); c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
  for (const e of [30, 60]) { c.beginPath(); c.arc(cx, cy, Rr * (90 - e) / 90, 0, 2 * Math.PI); c.stroke(); }
  c.fillStyle = '#e9eef4'; c.font = 'bold 22px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', cx, 12); c.fillText('S', cx, W - 12); c.fillText('L', 12, cy); c.fillText('O', W - 12, cy);
  // trajetórias do sol: linha contínua onde há sol direto, tracejada onde está obstruído; pontos nas horas cheias
  const xy = p => { const r = Rr * (90 - p.alt) / 90, a = -Math.PI / 2 - p.az * DEG; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  for (const D of sol) {
    for (let i = 1; i < D.pts.length; i++) {
      const a = D.pts[i - 1], b = D.pts[i], [x0, y0] = xy(a), [x1, y1] = xy(b);
      c.setLineDash(b.luz ? [] : [5, 5]);
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = D.cor; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.setLineDash([]);
    for (const p of D.pts) {
      if (Math.abs(p.h - Math.round(p.h)) > 1e-6) continue;
      const [x, y] = xy(p);
      c.beginPath(); c.arc(x, y, 6, 0, 2 * Math.PI);
      c.fillStyle = p.luz ? D.cor : '#0b1622'; c.fill();
      c.strokeStyle = p.luz ? 'rgba(0,0,0,.6)' : D.cor; c.lineWidth = 2; c.stroke();
      if (p.h === 9 || p.h === 12 || p.h === 15) {
        c.font = 'bold 15px system-ui'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3;
        c.strokeText(p.h + 'h', x + 14, y - 10); c.fillText(p.h + 'h', x + 14, y - 10);
      }
    }
  }
  // dia escolhido (se diferente das datas de referência) e posição atual do sol
  if (S && S.solInfo) {
    const si = S.solInfo, lat = latOfGy(S.gy0 + S.z * S.ppm);
    if (!DATAS_SOL.some(D => Math.abs(D.dec - si.dec) < 0.5)) {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.setLineDash([2, 4]); c.beginPath();
      let ini = true;
      for (let h = 0; h <= 24; h += 1 / 12) { const p = posSol(lat, si.dec, h); if (p.alt <= 0) { ini = true; continue; } const [x, y] = xy(p); ini ? c.moveTo(x, y) : c.lineTo(x, y); ini = false; }
      c.stroke(); c.setLineDash([]);
    }
    if (si.alt > 0) {
      const [x, y] = xy(si);
      c.beginPath(); c.arc(x, y, 13, 0, 2 * Math.PI); c.fillStyle = si.luz ? '#ffd23f' : 'rgba(255,210,63,.25)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
      c.font = 'bold 16px system-ui'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 3; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.strokeText(fmtH(si.h), x + 18, y + 2); c.fillText(fmtH(si.h), x + 18, y + 2);
    }
  }
  c.font = 'bold 22px system-ui'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4;
  const txt = `FVC ${Math.round(fvc * 100)}%`;
  c.strokeText(txt, 4, W - 8); c.fillText(txt, 4, W - 8);
  const leg = UI.$('obs-sol-leg');
  if (leg) leg.innerHTML = sol.map(D => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:10px"><i style="width:16px;height:3px;background:${D.cor};display:inline-block"></i>${D.curto}: <b>${fmtH(D.horas)}</b></span>`).join('');
}
function desenharPerfil(elev, tipo) {
  const cv = UI.$('obs-prof'), c = cv.getContext('2d'), W = cv.width, Hh = cv.height, pl = 40, pb = 26, pt = 8;
  const top = Math.max(30, Math.ceil(Math.max(...elev) / 10) * 10);
  c.clearRect(0, 0, W, Hh);
  c.fillStyle = '#16304f'; c.fillRect(pl, pt, W - pl - 4, Hh - pt - pb);
  const n = elev.length, bw = (W - pl - 4) / n, y = e => pt + (Hh - pt - pb) * (1 - e / top);
  for (let k = 0; k < n; k++) {
    if (elev[k] <= 0) continue;
    c.fillStyle = tipo[k] === 1 ? '#9a9a9a' : '#8a6d4b';
    c.fillRect(pl + k * bw, y(elev[k]), Math.ceil(bw), y(0) - y(elev[k]));
  }
  c.fillStyle = '#8fa3b8'; c.font = '18px system-ui'; c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let e = 0; e <= top; e += top > 40 ? 20 : 10) { c.fillText(e + '°', pl - 6, y(e)); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(pl, y(e), W - pl - 4, 1); c.fillStyle = '#8fa3b8'; }
  c.textAlign = 'center'; c.textBaseline = 'top';
  ['N', 'L', 'S', 'O', 'N'].forEach((l, i) => c.fillText(l, pl + i * (W - pl - 4) / 4, Hh - pb + 4));
}
