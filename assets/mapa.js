// Mapa 3D da OUS Somos Centro — MapLibre + serviços da IDE BHGEO
const WMS = 'https://bhmap.pbh.gov.br/v2/api/idebhgeo/wms';
const WFS = 'https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs';
const wmsTiles = layer => [`${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true`];
const STORE_KEY = 'ous_licenciados_v1';
const EXEMPLOS = [
  { url: 'data/envelopes_exemplo/envelope_CUIS_NO002.kml', tipo: 'Receptor' },
  { url: 'data/envelopes_exemplo/envelope_CUIS_NO003.kml', tipo: 'Gerador' },
];
// abaixo do zoom 14,5 só os recortes da OUS são buscados, então dá para carregar já na vista ampla
const MIN_ZOOM_ED = 11.5, TILE_Z = 15, MAX_TILES = 48;
const ED_COLOR = '#a3a3a3', LIC_COLOR = '#d7191c', LIC_COLOR_G = '#8f0f12';

const statusEl = document.getElementById('status');
const setStatus = t => { statusEl.textContent = t; statusEl.style.display = t ? '' : 'none'; };
const fmt = (v, d = 0) => v == null || v === '' || isNaN(+v) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

let ousUnion = null, ousBbox = null;
let projetos = [];          // empreendimentos licenciados
const edIds = new Set();    // ids de edificações já carregadas
const edFeatures = [];
const tilesDone = new Set(), tilesPending = new Set();

// ---------- Terreno 3D (MDT reconstruído por ferramentas/gerar_mdt.html) ----------
// Grade Terrarium alinhada aos ladrilhos z15; ladrilhos de qualquer zoom são reamostrados dela.
const MDT = { meta: null, H: null };
async function carregarMDT() {
  const meta = await (await fetch('data/mdt/mdt_ous.json')).json();
  const blob = await (await fetch('data/mdt/mdt_ous.png')).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height), ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const H = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < H.length; i++) H[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
  MDT.meta = meta; MDT.H = H;
  return meta;
}
function cotaMDT(gx15, gy15) { // bilinear na grade (coordenadas de pixel globais em z15), com borda estendida
  const m = MDT.meta, W = m.width, Hh = m.height;
  let x = gx15 - m.x0 * 256 - 0.5, y = gy15 - m.y0 * 256 - 0.5;
  x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(Hh - 1.001, y));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, H = MDT.H;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const mdtPronto = carregarMDT();
maplibregl.addProtocol('mdt', async params => {
  await mdtPronto;
  const [z, x, y] = params.url.replace('mdt://', '').split('/').map(Number);
  const cv = new OffscreenCanvas(256, 256), ctx = cv.getContext('2d');
  const img = ctx.createImageData(256, 256), k = 2 ** (15 - z);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const v = cotaMDT((x * 256 + i + 0.5) * k, (y * 256 + j + 0.5) * k) + 32768;
    const o = (j * 256 + i) * 4, fl = Math.floor(v);
    img.data[o] = fl >> 8; img.data[o + 1] = fl & 255; img.data[o + 2] = Math.round((v - fl) * 256) & 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { data: await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer() };
});

// Hipsometria realçada: cores calculadas do MDT, com a rampa esticada às cotas da área (opcional)
const RAMPA = [[820, [46, 125, 50]], [850, [124, 179, 66]], [880, [220, 210, 110]], [920, [230, 160, 70]], [970, [170, 95, 45]], [1050, [120, 80, 60]], [1200, [240, 240, 240]]];
function corCota(h) {
  if (h <= RAMPA[0][0]) return RAMPA[0][1];
  for (let i = 1; i < RAMPA.length; i++) if (h <= RAMPA[i][0]) {
    const [h0, c0] = RAMPA[i - 1], [h1, c1] = RAMPA[i], t = (h - h0) / (h1 - h0);
    return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
  }
  return RAMPA[RAMPA.length - 1][1];
}
maplibregl.addProtocol('hipso', async params => {
  await mdtPronto;
  const [z, x, y] = params.url.replace('hipso://', '').split('/').map(Number);
  const cv = new OffscreenCanvas(256, 256), ctx = cv.getContext('2d');
  const img = ctx.createImageData(256, 256), k = 2 ** (15 - z);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const c = corCota(cotaMDT((x * 256 + i + 0.5) * k, (y * 256 + j + 0.5) * k)), o = (j * 256 + i) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { data: await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer() };
});

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: wmsTiles('MAPA_BASE'), tileSize: 256, attribution: 'IDE BHGEO / PBH' },
      hip: { type: 'raster', tiles: wmsTiles('MAPA_HIPSOMETRICO'), tileSize: 256 },
      hip2: { type: 'raster', tiles: ['hipso://{z}/{x}/{y}'], tileSize: 256, maxzoom: 16 },
      dem: { type: 'raster-dem', tiles: ['mdt://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 15 },
      demhs: { type: 'raster-dem', tiles: ['mdt://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 15 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'base', type: 'raster', source: 'base' },
      { id: 'hip', type: 'raster', source: 'hip', paint: { 'raster-opacity': 0.55 } },
      { id: 'hip2', type: 'raster', source: 'hip2', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
      { id: 'relevo', type: 'hillshade', source: 'demhs', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#3b3328', 'hillshade-highlight-color': '#ffffff' } },
    ],
  },
  center: [-43.94, -19.918], zoom: 13.5, pitch: 55, bearing: -20, maxPitch: 75,
  maxBounds: [[-44.3, -20.2], [-43.6, -19.6]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

// ---------- Área da OUS ----------
async function carregarArea() {
  const fc = await (await fetch('data/ous_area.geojson')).json();
  let u = null;
  for (const f of fc.features) u = u ? turf.union(u, f) : f;
  ousUnion = u;
  ousBbox = turf.bbox(fc);
  const mask = turf.difference(turf.bboxPolygon([-45, -21, -43, -19]), ousUnion);
  map.addSource('mask', { type: 'geojson', data: mask });
  map.addSource('ous', { type: 'geojson', data: ousUnion });
  map.addSource('sub', { type: 'geojson', data: fc });
  map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.62 } });
  map.addLayer({ id: 'sub-line', type: 'line', source: 'sub', paint: { 'line-color': '#0d366b', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } });
  map.addLayer({ id: 'ous-line', type: 'line', source: 'ous', paint: { 'line-color': '#0d366b', 'line-width': 3 } });
}

function irParaOUS(anim = true) {
  if (!ousBbox) return;
  map.fitBounds([[ousBbox[0], ousBbox[1]], [ousBbox[2], ousBbox[3]]], { padding: 30, pitch: 55, bearing: -20, duration: anim ? 1200 : 0 });
}

// ---------- Edificações existentes (WFS, por ladrilho z15) ----------
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

function ladrilhosVisiveis() {
  const b = map.getBounds(), z = TILE_Z;
  const x0 = lon2x(b.getWest(), z), x1 = lon2x(b.getEast(), z), y0 = lat2y(b.getNorth(), z), y1 = lat2y(b.getSouth(), z);
  const c = map.getCenter(), cx = lon2x(c.lng, z), cy = lat2y(c.lat, z);
  const out = [];
  const m = MDT.meta; // só onde há terreno
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
    if (!m || (x >= m.x0 && x <= m.x1 && y >= m.y0 && y <= m.y1)) out.push([x, y]);
  out.sort((a, b2) => (Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b2[0] - cx, b2[1] - cy)));
  // em vista ampla, só os recortes que tocam a área da OUS
  if (map.getZoom() < 14.5 && ousBbox) {
    const ox0 = lon2x(ousBbox[0], z), ox1 = lon2x(ousBbox[2], z), oy0 = lat2y(ousBbox[3], z), oy1 = lat2y(ousBbox[1], z);
    return out.filter(([x, y]) => x >= ox0 && x <= ox1 && y >= oy0 && y <= oy1).slice(0, MAX_TILES);
  }
  return out.slice(0, MAX_TILES);
}

let fila = [], ativos = 0, refreshTimer = null, falhas = 0;
const recortesFalhos = new Set();
function agendarRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => map.getSource('ed')?.setData({ type: 'FeatureCollection', features: edFeatures }), 250);
}
function atualizarStatus() {
  const pend = fila.length + ativos;
  if (map.getZoom() < MIN_ZOOM_ED) setStatus(`Aproxime (zoom ≥ ${MIN_ZOOM_ED}) para ver as edificações existentes · ${edFeatures.length.toLocaleString('pt-BR')} carregadas`);
  else setStatus((pend ? `Carregando edificações… ${pend} recorte(s) na fila · ${edFeatures.length.toLocaleString('pt-BR')} carregadas` : `${edFeatures.length.toLocaleString('pt-BR')} edificações carregadas`)
    + (falhas ? ` · ⚠ ${falhas} recorte(s) sem resposta da IDE BHGEO (mova o mapa para tentar de novo)` : ''));
}
function pedirEdificacoes() {
  if (!document.getElementById('ly-ed').checked) return;
  if (map.getZoom() < MIN_ZOOM_ED) { atualizarStatus(); return; }
  const novos = ladrilhosVisiveis().filter(([x, y]) => !tilesDone.has(x + '/' + y) && !tilesPending.has(x + '/' + y));
  novos.forEach(t => tilesPending.add(t.join('/')));
  fila.push(...novos);
  bombear();
}
function bombear() {
  atualizarStatus();
  while (ativos < 4 && fila.length) {
    const [x, y] = fila.shift(); ativos++;
    const chave = x + '/' + y;
    carregarLadrilho(x, y).then(() => { recortesFalhos.delete(chave); }).catch(e => { recortesFalhos.add(chave); console.warn('WFS', e); }).finally(() => {
      falhas = recortesFalhos.size;
      ativos--; tilesPending.delete(x + '/' + y); bombear();
    });
  }
}
async function carregarLadrilho(x, y) {
  const z = TILE_Z;
  const w = x2lon(x, z), e = x2lon(x + 1, z), n = y2lat(y, z), s = y2lat(y + 1, z);
  const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=ide_bhgeo:EDIFICACAO&outputFormat=application/json&srsName=EPSG:4326` +
    `&propertyName=GEOMETRIA,ALT_EST_MAXMDE_MINMDT,AREA,COTA_MIN_MDT,ID_LOTE_CTM&count=8000&bbox=${w},${s},${e},${n},EPSG:4326`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  for (const f of j.features || []) {
    const id = f.properties.ID_EDIF ?? f.id;
    if (edIds.has(id)) continue;
    edIds.add(id);
    let h = +f.properties.ALT_EST_MAXMDE_MINMDT;
    if (!(h > 0.5)) h = 3; if (h > 250) h = 250;
    const bb = f.bbox || turf.bbox(f);
    const pt = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    const dentro = ousUnion ? turf.booleanPointInPolygon(pt, ousUnion) : true;
    edFeatures.push({ type: 'Feature', geometry: f.geometry,
      properties: { id, h: Math.round(h * 10) / 10, area: f.properties.AREA, cota: f.properties.COTA_MIN_MDT, lote: f.properties.ID_LOTE_CTM, dentro } });
  }
  tilesDone.add(x + '/' + y);
  agendarRefresh();
}

// ---------- Empreendimentos licenciados (KML de envelopes) ----------
function textoData(pm) {
  const o = {};
  for (const d of pm.getElementsByTagName('Data')) o[d.getAttribute('name')] = (d.getElementsByTagName('value')[0]?.textContent || '').trim();
  for (const d of pm.getElementsByTagName('SimpleData')) o[d.getAttribute('name')] = (d.textContent || '').trim();
  return o;
}
const coordsDe = el => el.getElementsByTagName('coordinates')[0].textContent.trim().split(/\s+/).map(s => s.split(',').map(Number));
const anel2d = c => c.map(p => [p[0], p[1]]);

function parseKML(texto, nomeArq, tipoPadrao) {
  const doc = new DOMParser().parseFromString(texto, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('KML inválido: ' + nomeArq);
  const pms = [...doc.getElementsByTagName('Placemark')];
  let props = null, lote = null; const pavs = [];
  for (const pm of pms) {
    const nome = (pm.getElementsByTagName('name')[0]?.textContent || '').trim();
    const estilo = (pm.getElementsByTagName('styleUrl')[0]?.textContent || '').trim();
    const d = textoData(pm);
    const polys = [...pm.getElementsByTagName('Polygon')];
    if (!polys.length) continue;
    if (estilo === '#lote' || nome.toLowerCase() === 'lote') {
      props = d; lote = anel2d(coordsDe(polys[0]));
    } else if (estilo === '#massa' || d.pavimento != null) {
      // a face horizontal (z constante) é a planta do pavimento
      let planta = null, zs = [];
      for (const p of polys) {
        const c = coordsDe(p); zs.push(...c.map(q => q[2] || 0));
        if (!planta && c.every(q => Math.abs((q[2] || 0) - (c[0][2] || 0)) < 0.01)) planta = c;
      }
      if (!planta) continue;
      const base = d.base_m != null && d.base_m !== '' ? +d.base_m : Math.min(...zs);
      const topo = d.topo_m != null && d.topo_m !== '' ? +d.topo_m : Math.max(...zs);
      pavs.push({ coords: anel2d(planta), base, topo, pav: d.pavimento, torre: d.torre });
    }
  }
  if (!props) {
    // KML genérico: usa o primeiro polígono com dados como lote
    const pm = pms.find(p => p.getElementsByTagName('Polygon').length);
    if (!pm) throw new Error('Sem polígonos em ' + nomeArq);
    props = textoData(pm); lote = anel2d(coordsDe(pm.getElementsByTagName('Polygon')[0]));
  }
  if (!pavs.length && lote) {
    const alt = +props.altura_m || (+props.pavimentos || 1) * 3;
    pavs.push({ coords: lote, base: 0, topo: alt });
  }
  const nomeDoc = (doc.getElementsByTagName('Document')[0]?.getElementsByTagName('name')[0]?.textContent || '').trim();
  const tipoArq = (props.tipo || props.tipo_ous || props.TIPO || '').trim();
  const tipo = /gera/i.test(tipoArq) ? 'Gerador' : /recep/i.test(tipoArq) ? 'Receptor' : tipoPadrao;
  return {
    id: props.projeto || nomeDoc || nomeArq,
    nome: props.projeto || nomeDoc || nomeArq,
    arquivo: nomeArq, tipo, props, lote, pavs,
  };
}

async function lerArquivo(file, tipoPadrao) {
  const nome = file.name || 'arquivo';
  if (/\.kml$/i.test(nome)) return [parseKML(await file.text(), nome, tipoPadrao)];
  const zip = await JSZip.loadAsync(file);
  const out = [];
  for (const [p, ent] of Object.entries(zip.files)) {
    if (ent.dir || !/\.kml$/i.test(p)) continue;
    out.push(parseKML(await ent.async('string'), p.split('/').pop(), tipoPadrao));
  }
  if (!out.length) throw new Error('Nenhum .kml dentro de ' + nome);
  return out;
}

function salvar() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(projetos)); } catch (e) { /* armazenamento indisponível */ }
}
function adicionarProjetos(lista) {
  for (const p of lista) {
    const i = projetos.findIndex(q => q.id === p.id);
    if (i >= 0) projetos[i] = p; else projetos.push(p);
  }
  salvar(); desenharLicenciados();
}

function desenharLicenciados() {
  const pav = [], lotes = [];
  projetos.forEach((p, idx) => {
    p.pavs.forEach(f => pav.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [f.coords] },
      properties: { idx, base: f.base, topo: f.topo, tipo: p.tipo } }));
    if (p.lote) lotes.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [p.lote] }, properties: { idx, tipo: p.tipo } });
  });
  map.getSource('lic')?.setData({ type: 'FeatureCollection', features: pav });
  map.getSource('lic-lote')?.setData({ type: 'FeatureCollection', features: lotes });
  // painel
  const tot = projetos.reduce((a, p) => {
    a.u += +p.props.unidades || 0; a.a += +p.props.area_construida_m2 || 0;
    a[p.tipo === 'Gerador' ? 'g' : 'r']++; return a;
  }, { u: 0, a: 0, r: 0, g: 0 });
  document.getElementById('t-n').textContent = projetos.length;
  document.getElementById('t-u').textContent = fmt(tot.u);
  document.getElementById('t-a').innerHTML = fmt(tot.a) + ' <small>m²</small>';
  document.getElementById('t-rg').textContent = `${tot.r} / ${tot.g}`;
  const el = document.getElementById('lic-list');
  el.innerHTML = projetos.length ? projetos.map((p, i) => `
    <div class="lic-item" data-i="${i}">
      <div><div class="t">${esc(p.nome)} <span class="badge ${p.tipo === 'Gerador' ? 'gerador' : ''}">${p.tipo}</span></div>
      <div class="s">${fmt(p.props.area_construida_m2)} m² · ${fmt(p.props.pavimentos)} pav. · ${fmt(p.props.unidades)} UH · ${esc(p.props.cenario || '')}</div></div>
      <button class="x" title="Remover" data-del="${i}">×</button>
    </div>`).join('') : '<div style="font-size:12.5px;color:var(--text-muted)">Nenhum empreendimento carregado.</div>';
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function popupProjeto(i, lngLat) {
  const p = projetos[i], d = p.props;
  const linhas = [
    ['Tipo', `<span class="badge ${p.tipo === 'Gerador' ? 'gerador' : ''}">${p.tipo}</span>`],
    ['Área construída', fmt(d.area_construida_m2) + ' m²'],
    ['Pavimentos', fmt(d.pavimentos)],
    ['Unidades', fmt(d.unidades)],
    ['Altura', d.altura_m ? fmt(d.altura_m, 1) + ' m' : '—'],
    ['Área do lote', d.area_m2 ? fmt(d.area_m2) + ' m²' : '—'],
    ['CA praticado / aplicável', d.ca_praticado ? `${fmt(d.ca_praticado, 2)} / ${fmt(d.ca_aplicavel, 2)}` : '—'],
    ['Zona', esc(d.zona || '—')],
    ['Subárea', esc(d.cenario || '—')],
  ];
  const pop = new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(lngLat).setHTML(`<div class="pop">
    <h5>${esc(p.nome)}</h5>
    <table>${linhas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    <div class="muted">${esc(d.lotes_cp || d.lote || '')}<br>Arquivo: ${esc(p.arquivo)}</div>
    ${BOTAO_OBS}</div>`).addTo(map);
  const ring = p.lote || p.pavs[0].coords;
  ligarBotaoObs(pop, { alvo: centroDe(p), bbox: bboxAnel(ring), nome: p.nome, altura: +d.altura_m || null });
}

// ---------- Vista do observador (assets/observador.js) ----------
const BOTAO_OBS = '<button class="btn small obs-btn" style="margin-top:8px;width:100%">👁 Vista do observador (nível da rua)</button>';
const bboxAnel = r => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
function ligarBotaoObs(pop, alvo) {
  const b = pop.getElement().querySelector('.obs-btn');
  if (!b) return;
  b.onclick = () => {
    pop.remove();
    if (typeof window.abrirObservador !== 'function') { alert('O visualizador do observador ainda está carregando.'); return; }
    window.abrirObservador({ ...alvo, azVisada: map.getBearing() });
  };
}
// estado compartilhado com o visualizador do observador
window.OUS = {
  map, cotaMDT, get MDT() { return MDT; }, get edFeatures() { return edFeatures; }, get projetos() { return projetos; },
  centroDe, corCota,
};

// ---------- Navegação: órbita, giro, inclinação e posicionamento do observador ----------
let orbitando = false, ultimoQuadro = 0, colocarObs = false;
const velOrbita = () => +(document.getElementById('orb-vel')?.value || 6); // graus por segundo
function passoOrbita(t) {
  if (!orbitando) return;
  const dt = ultimoQuadro ? (t - ultimoQuadro) / 1000 : 0; ultimoQuadro = t;
  map.setBearing(map.getBearing() + velOrbita() * dt * (window._orbSentido || 1));
  requestAnimationFrame(passoOrbita);
}
function setOrbita(on) {
  orbitando = on; ultimoQuadro = 0;
  document.getElementById('nav-orb')?.classList.toggle('on', on);
  if (on) requestAnimationFrame(passoOrbita);
}
// qualquer gesto do usuário interrompe a órbita
['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvasContainer().addEventListener(ev, () => orbitando && setOrbita(false), { passive: true }));

class NavExtra {
  onAdd() {
    const el = document.createElement('div');
    el.className = 'maplibregl-ctrl nav-extra';
    el.innerHTML = `
      <button id="nav-orb" title="Orbitar em torno do centro da tela (clique de novo para parar)">⟳ Orbitar</button>
      <div class="nav-row"><button data-r="-45" title="Girar 45° à esquerda">↶</button><button data-r="45" title="Girar 45° à direita">↷</button></div>
      <div class="nav-row"><button data-t="10" title="Inclinar mais (vista rasante)">⤓</button><button data-t="-10" title="Inclinar menos (vista de cima)">⤒</button></div>
      <div class="nav-row"><button data-z="1" title="Aproximar">＋</button><button data-z="-1" title="Afastar">－</button></div>
      <button data-n title="Norte para cima">N ↑</button>
      <button id="nav-obs" title="Clique no mapa para posicionar o observador">👁 Observador</button>
      <label title="Velocidade da órbita" style="display:block;font-size:10.5px;color:#555;margin-top:4px">vel.<input id="orb-vel" type="range" min="2" max="30" value="8" style="width:64px"></label>`;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'nav-orb') { setOrbita(!orbitando); return; }
      if (b.id === 'nav-obs') { setColocarObs(!colocarObs); return; }
      setOrbita(false);
      if (b.dataset.r) map.easeTo({ bearing: map.getBearing() + +b.dataset.r, duration: 600 });
      if (b.dataset.t) map.easeTo({ pitch: Math.max(0, Math.min(80, map.getPitch() + +b.dataset.t)), duration: 500 });
      if (b.dataset.z) map.easeTo({ zoom: map.getZoom() + +b.dataset.z, duration: 500 });
      if (b.dataset.n !== undefined) map.easeTo({ bearing: 0, duration: 700 });
    };
    return el;
  }
  onRemove() {}
}
map.addControl(new NavExtra(), 'top-right');
function setColocarObs(on) {
  colocarObs = on;
  document.getElementById('nav-obs')?.classList.toggle('on', on);
  map.getCanvas().style.cursor = on ? 'crosshair' : '';
  setStatus(on ? 'Clique no mapa (numa rua ou praça) para posicionar o observador' : '');
  if (!on) atualizarStatus();
}
document.addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea') || document.getElementById('obs-overlay')?.classList.contains('open')) return;
  if (e.key === 'o' || e.key === 'O') setOrbita(!orbitando);
  if (e.key === 'Escape' && colocarObs) setColocarObs(false);
});

function centroDe(p) {
  const c = p.lote || p.pavs[0].coords; let x = 0, y = 0;
  c.forEach(q => { x += q[0]; y += q[1]; }); return [x / c.length, y / c.length];
}

// ---------- Montagem ----------
// 'style.load' não espera os ladrilhos WMS (o 'load' demora com a vista inclinada)
map.once('style.load', async () => {
  await carregarArea();
  const m = await mdtPronto;
  // limita a navegação à área coberta pelo MDT
  map.setMaxBounds([[x2lon(m.x0 - 1, 15), y2lat(m.y1 + 2, 15)], [x2lon(m.x1 + 2, 15), y2lat(m.y0 - 1, 15)]]);
  map.setTerrain({ source: 'dem', exaggeration: 1 });
  irParaOUS(false);

  map.addSource('ed', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const edPaint = op => ({
    'fill-extrusion-color': ED_COLOR,
    'fill-extrusion-height': ['get', 'h'],
    'fill-extrusion-base': 0,
    'fill-extrusion-opacity': op,
    'fill-extrusion-vertical-gradient': true,
  });
  map.addLayer({ id: 'ed-fora', type: 'fill-extrusion', source: 'ed', filter: ['!', ['get', 'dentro']], paint: edPaint(0.35) });
  map.addLayer({ id: 'ed-dentro', type: 'fill-extrusion', source: 'ed', filter: ['get', 'dentro'], paint: edPaint(0.92) });

  map.addSource('lic-lote', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('lic', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'lic-lote-fill', type: 'fill', source: 'lic-lote', paint: { 'fill-color': LIC_COLOR, 'fill-opacity': 0.18 } });
  map.addLayer({ id: 'lic-lote-line', type: 'line', source: 'lic-lote', paint: { 'line-color': LIC_COLOR, 'line-width': 2 } });
  map.addLayer({ id: 'lic', type: 'fill-extrusion', source: 'lic', paint: {
    'fill-extrusion-color': ['case', ['==', ['get', 'tipo'], 'Gerador'], LIC_COLOR_G, LIC_COLOR],
    'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'topo'], 'fill-extrusion-opacity': 0.95,
  } });

  // empreendimentos: armazenados ou exemplos
  let salvos = null;
  try { salvos = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { salvos = null; }
  if (Array.isArray(salvos)) { projetos = salvos; desenharLicenciados(); }
  else await carregarExemplos();

  map.on('moveend', pedirEdificacoes);
  // Nos movimentos programados (fitBounds/flyTo) o MapLibre 4 pode manter a altitude do centro em 0,
  // deixando a câmera abaixo do terreno ao aproximar. Corrige quando a cena termina de carregar.
  const ajustarAltitude = () => {
    if (!map.terrain || map.isMoving()) return;
    const e = map.terrain.getElevationForLngLatZoom(map.getCenter(), map.transform.tileZoom);
    if (isFinite(e) && Math.abs(map.transform.elevation - e) > 15) { map.transform.elevation = e; map.triggerRepaint(); }
  };
  map.on('moveend', ajustarAltitude);
  map.on('idle', ajustarAltitude);
  pedirEdificacoes();
});

async function carregarExemplos() {
  const lista = [];
  for (const ex of EXEMPLOS) {
    try { lista.push(parseKML(await (await fetch(ex.url)).text(), ex.url.split('/').pop(), ex.tipo)); }
    catch (e) { console.warn(e); }
  }
  projetos = []; adicionarProjetos(lista);
}

// cliques
map.on('click', e => {
  if (colocarObs) {
    setColocarObs(false);
    if (typeof window.abrirObservador === 'function') window.abrirObservador({ pos: [e.lngLat.lng, e.lngLat.lat], azVisada: map.getBearing() });
    return;
  }
  const lic = map.queryRenderedFeatures(e.point, { layers: ['lic', 'lic-lote-fill'] });
  if (lic.length) { popupProjeto(lic[0].properties.idx, e.lngLat); return; }
  const ed = map.queryRenderedFeatures(e.point, { layers: ['ed-dentro', 'ed-fora'] });
  if (ed.length) {
    const p = ed[0].properties;
    const pop = new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(`<div class="pop"><h5>Edificação existente</h5><table>
      <tr><td>ID</td><td>${p.id}</td></tr><tr><td>Altura estimada</td><td>${fmt(p.h, 1)} m</td></tr>
      <tr><td>Área de projeção</td><td>${fmt(p.area, 0)} m²</td></tr><tr><td>Cota mín. do terreno (MDT)</td><td>${fmt(p.cota, 1)} m</td></tr>
      <tr><td>Na OUS</td><td>${p.dentro ? 'Sim' : 'Não'}</td></tr></table>
      <div class="muted">WFS EDIFICACAO · IDE BHGEO</div>${BOTAO_OBS}</div>`).addTo(map);
    const f = edFeatures.find(q => q.properties.id === p.id);
    const bb = f ? turf.bbox(f) : [e.lngLat.lng, e.lngLat.lat, e.lngLat.lng, e.lngLat.lat];
    ligarBotaoObs(pop, { alvo: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], bbox: bb, idEd: p.id, nome: 'Edificação ' + p.id });
  }
});
['lic', 'lic-lote-fill', 'ed-dentro', 'ed-fora'].forEach(l => {
  map.on('mouseenter', l, () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', l, () => map.getCanvas().style.cursor = '');
});

// ---------- Controles do painel ----------
const vis = (ids, on) => ids.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
document.getElementById('ly-lic').onchange = e => vis(['lic', 'lic-lote-fill', 'lic-lote-line'], e.target.checked);
document.getElementById('ly-ed').onchange = e => { vis(['ed-dentro', 'ed-fora'], e.target.checked); if (e.target.checked) pedirEdificacoes(); };
const hipAtual = () => document.getElementById('hip-fonte').value;
const aplicarHip = () => { const on = document.getElementById('ly-hip').checked; vis(['hip'], on && hipAtual() === 'hip'); vis(['hip2'], on && hipAtual() === 'hip2'); };
document.getElementById('ly-hip').onchange = aplicarHip;
document.getElementById('hip-fonte').onchange = aplicarHip;
document.getElementById('ly-mask').onchange = e => vis(['mask'], e.target.checked);
document.getElementById('ly-base').onchange = e => vis(['base'], e.target.checked);
document.getElementById('op-hip').oninput = e => {
  ['hip', 'hip2'].forEach(l => map.setPaintProperty(l, 'raster-opacity', e.target.value / 100));
  document.getElementById('op-hip-v').textContent = e.target.value + '%';
};
const exag = () => +document.getElementById('exag').value;
document.getElementById('ly-ter').onchange = e => map.setTerrain(e.target.checked ? { source: 'dem', exaggeration: exag() } : null);
document.getElementById('exag').oninput = e => {
  document.getElementById('exag-v').textContent = String(e.target.value).replace('.', ',') + '×';
  if (document.getElementById('ly-ter').checked) map.setTerrain({ source: 'dem', exaggeration: exag() });
};
document.getElementById('ly-hs').onchange = e => vis(['relevo'], e.target.checked);
document.getElementById('home').onclick = () => irParaOUS(true);
document.getElementById('top').onclick = () => map.easeTo({ pitch: map.getPitch() > 5 ? 0 : 55, bearing: map.getPitch() > 5 ? 0 : -20, duration: 800 });

document.getElementById('lic-list').onclick = e => {
  const del = e.target.closest('[data-del]');
  if (del) { projetos.splice(+del.dataset.del, 1); salvar(); desenharLicenciados(); return; }
  const it = e.target.closest('.lic-item');
  if (!it) return;
  const i = +it.dataset.i, c = centroDe(projetos[i]);
  map.flyTo({ center: c, zoom: 17.3, pitch: 60, duration: 1400 });
  map.once('moveend', () => popupProjeto(i, c));
};
document.getElementById('reset').onclick = () => carregarExemplos();

const msg = document.getElementById('up-msg');
async function receber(files) {
  const tipo = document.getElementById('tipo-up').value;
  let novos = [], erros = [];
  for (const f of files) {
    try { novos.push(...await lerArquivo(f, tipo)); } catch (e) { erros.push(e.message); }
  }
  if (novos.length) {
    adicionarProjetos(novos);
    const bb = turf.bbox({ type: 'FeatureCollection', features: novos.map(p => turf.point(centroDe(p))) });
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 120, maxZoom: 17, pitch: 60 });
  }
  msg.textContent = `${novos.length} empreendimento(s) carregado(s)` + (erros.length ? ` · ${erros.length} erro(s)` : '');
  msg.style.color = erros.length ? 'var(--critical)' : 'var(--text-muted)';
  if (erros.length) console.warn(erros);
}
const drop = document.getElementById('drop'), fileIn = document.getElementById('file');
fileIn.onchange = () => { receber([...fileIn.files]); fileIn.value = ''; };
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => receber([...e.dataTransfer.files]));
