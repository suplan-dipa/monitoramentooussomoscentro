// Renderização dos indicadores núcleo. Dados e componentes brutos (fictícios) em indicadores_dados.js.

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (v, dec) => v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtS = (v, dec) => (v > 0 ? '+' : '') + fmt(v, dec);

// Séries derivadas dos componentes brutos
IND.forEach(d => {
  d.serie = d.kind === 'fluxo' ? serie(d.valorTri) : serie(d.valor);
  if (d.kind === 'fluxo') {
    d.tri = d.serie.slice();
    let s = d.base; d.acc = d.serie.map(v => (s += v));
  } else {
    d.acc = d.serie.slice();
    d.tri = d.serie.map((v, i) => v - (i ? d.serie[i - 1] : d.base));
  }
  // meta pro-rata (linear de base até H2 no 8º trimestre)
  d.metaQ = d.meta == null ? null : QUARTERS.map((_, i) => d.base + (d.meta - d.base) * (i + 1) / QUARTERS.length);
});

const ICON = {
  good: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.5 8.2l2.2 2.2 4.6-4.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 16 16"><path d="M8 1.5l7 13H1z" fill="currentColor"/><path d="M8 6v4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="12.3" r="1" fill="#fff"/></svg>',
  critical: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

function situacao(d, q) {
  const v = d.acc[q];
  if (d.limiar != null) {
    if (v < d.limiar) return { cls: 'critical', txt: 'Alerta: abaixo do limiar', pct: null };
    if (v < d.alerta) return { cls: 'warning', txt: 'Atenção: perto do limiar', pct: null };
    return { cls: 'good', txt: 'Acima do limiar', pct: null };
  }
  const pct = (v - d.base) / (d.metaQ[q] - d.base);
  if (pct >= 0.8) return { cls: 'good', txt: 'Em trajetória', pct };
  if (pct >= 0.5) return { cls: 'warning', txt: 'Atenção', pct };
  return { cls: 'critical', txt: 'Abaixo da trajetória', pct };
}

let state = { q: QUARTERS.length - 1, mode: 'tri' };
const charts = {};

function buildControls() {
  const sel = document.getElementById('quarter');
  sel.innerHTML = QUARTERS.map((l, i) => `<option value="${i}">${l} (trimestre ${i + 1} desde T0)</option>`).join('');
  sel.value = state.q;
  sel.onchange = () => { state.q = +sel.value; render(); };
  document.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
    state.mode = b.dataset.m;
    document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b));
    render();
  });
}

function buildCards() {
  const grid = document.getElementById('grid');
  grid.innerHTML = IND.map(d => `
    <article class="card" id="card-${d.id}">
      <div class="card-head">
        <span class="code">${d.id}</span>
        <div><h3>${d.nome}</h3><div class="legal">${d.legal}</div></div>
      </div>
      <div class="metric">${d.metrica} <span style="color:var(--text-muted)">(${d.un})</span></div>
      <div class="kpis">
        <div class="kpi"><div class="lbl" data-k="lt"></div><div class="val" data-k="vt"></div></div>
        <div class="kpi"><div class="lbl" data-k="la"></div><div class="val" data-k="va"></div></div>
        <div class="kpi"><div class="lbl" data-k="lm"></div><div class="val" data-k="vm"></div></div>
      </div>
      <div class="progress" title="Atingimento da meta do período"><i data-k="bar"></i></div>
      <div class="chart-box"><canvas></canvas></div>
      <div class="card-foot"><span class="status" data-k="st"></span><span data-k="ft"></span></div>
      <div class="calc"><span class="lbl">Cálculo em <span data-k="cq"></span>:</span> <span data-k="calc"></span></div>
      <details class="brutos"><summary>Números brutos</summary><div class="tbl-scroll" data-k="brutos"></div></details>
      <button class="btn small ficha-btn" data-ficha="${d.id}">Métricas de leitura e desagregação →</button>
    </article>`).join('');
  grid.onclick = e => { const b = e.target.closest('[data-ficha]'); if (b) abrirFicha(b.dataset.ficha); };
}

// Valor de uma linha bruta no trimestre q (fluxo: no trimestre; estoque/derivado: posição; fixo: constante)
const valBruto = (b, q) => b.tipo === 'fixo' ? b.t0 : b.s[q];
const fmtB = (v, b) => fmt(v, b.dec ?? (Math.abs(v) < 100 && !Number.isInteger(v) ? 2 : 0));

function tabelaBrutosCard(d, q) {
  const temFluxo = d.brutos.some(b => b.tipo === 'fluxo');
  const head = temFluxo
    ? `<tr><th>Componente</th><th>No trimestre</th><th>Acumulado</th></tr>`
    : `<tr><th>Componente</th><th>T0</th><th>${q ? QUARTERS[q - 1] : 'T0'}</th><th class="sel">${QUARTERS[q]}</th></tr>`;
  const rows = d.brutos.map(b => {
    const un = `<span class="un">${b.un}</span>`;
    if (temFluxo) return `<tr><td>${b.nome}</td><td>${fmtB(b.s[q], b)}</td><td>${fmtB(acum(b.s)[q], b)} ${un}</td></tr>`;
    const t0 = b.tipo === 'derivado' ? (b.un === '%' ? 0 : 100) : b.t0;
    const ant = q ? valBruto(b, q - 1) : t0;
    return `<tr class="${b.tipo === 'derivado' ? 'deriv' : ''}"><td>${b.nome}</td><td>${t0 == null ? '—' : fmtB(t0, b)}</td><td>${fmtB(ant, b)}</td><td class="sel">${fmtB(valBruto(b, q), b)} ${un}</td></tr>`;
  }).join('');
  return `<table class="data mini">${head}${rows}</table>`;
}

// ---------- Ficha: métricas de leitura e desagregação ----------
function abrirFicha(id) {
  const d = IND.find(x => x.id === id), q = state.q, f = d.ficha;
  let dlg = document.getElementById('ficha');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'ficha'; document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-fechar]')) dlg.close(); });
  }
  const barras = g => {
    const max = Math.max(...g.itens.map(i => Math.abs(i[1])), 1e-9);
    return `<div class="barras">${g.itens.map(([n, v]) => `<div class="barra-l"><span class="n">${n}</span><span class="b"><i style="width:${Math.abs(v) / max * 100}%"></i></span><span class="v">${fmt(v, g.dec ?? 0)} <small>${g.un || ''}</small></span></div>`).join('')}</div>`;
  };
  const kv = g => `<table class="kv">${g.itens.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('')}</table>`;
  const serieCompleta = `<table class="data mini"><tr><th>Componente</th><th>T0</th>${QUARTERS.map((l, i) => `<th class="${i === q ? 'sel' : ''}">${l}</th>`).join('')}</tr>${d.brutos.map(b => {
      const t0 = b.tipo === 'fluxo' ? '—' : b.tipo === 'derivado' ? '' : fmtB(b.t0, b);
      const vals = QUARTERS.map((_, i) => `<td class="${i === q ? 'sel' : ''}">${fmtB(b.tipo === 'fluxo' ? acum(b.s)[i] : valBruto(b, i), b)}</td>`).join('');
      return `<tr class="${b.tipo === 'derivado' ? 'deriv' : ''}"><td>${b.nome} <span class="un">(${b.un}${b.tipo === 'fluxo' ? ', acum.' : ''})</span></td><td>${t0}</td>${vals}</tr>`;
    }).join('')}<tr class="ind"><td><b>${d.id} — ${d.metrica}</b> <span class="un">(${d.un})</span></td><td>${fmt(d.base, d.dec)}</td>${QUARTERS.map((_, i) => `<td class="${i === q ? 'sel' : ''}"><b>${fmt(d.acc[i], d.dec)}</b></td>`).join('')}</tr></table>`;
  dlg.innerHTML = `
    <div class="ficha-head"><span class="code">${d.id}</span><div><h3>${d.nome}</h3><div class="legal">${d.legal} · referência: ${QUARTERS[q]}</div></div><button class="btn small" data-fechar>✕ Fechar</button></div>
    <div class="ficha-body">
      <section><h4>Métrica principal (recebe meta)</h4><p>${f.principal}</p>
        <p class="calc"><span class="lbl">Cálculo em ${QUARTERS[q]}:</span> ${d.formula(q)}</p></section>
      <section><h4>Números brutos — série completa</h4><div class="tbl-scroll">${serieCompleta}</div></section>
      <section><h4>Métricas de leitura e desagregação</h4><p>${f.leitura}</p>
        <div class="desag">${d.desag(q).map(g => `<div class="desag-box"><h5>${g.titulo}</h5>${g.tipo === 'kv' ? kv(g) : barras(g)}</div>`).join('')}</div></section>
      <section class="ficha-meta"><table class="kv">
        <tr><td>Fonte (letras da Metodologia)</td><td>${f.fonte}</td></tr><tr><td>Recorte</td><td>${f.recorte}</td></tr>
        <tr><td>Periodicidade</td><td>${f.periodicidade}</td></tr><tr><td>Linha de base (T0)</td><td>${f.t0}</td></tr>
        <tr><td>Limites de interpretação</td><td>${f.limites}</td></tr></table></section>
      <p class="note">Todos os números são fictícios. Textos da ficha: matriz v2 (aba 02_Indicadores, 20/10/2026).</p>
    </div>`;
  dlg.showModal();
}

function render() {
  const q = state.q;
  let cnt = { good: 0, warning: 0, critical: 0 };
  IND.forEach(d => {
    const el = document.getElementById('card-' + d.id);
    const $ = k => el.querySelector(`[data-k="${k}"]`);
    const s = situacao(d, q);
    cnt[s.cls]++;
    $('lt').textContent = d.kind === 'fluxo' ? `No trimestre (${QUARTERS[q]})` : `Variação em ${QUARTERS[q]}`;
    $('vt').innerHTML = (d.kind === 'fluxo' ? fmt(d.tri[q], d.dec) : fmtS(d.tri[q], d.dec)) + ` <small>${d.un}</small>`;
    $('la').textContent = d.kind === 'fluxo' ? 'Acumulado desde T0' : 'Posição acumulada';
    $('va').innerHTML = fmt(d.acc[q], d.dec) + ` <small>${d.un}</small>`;
    if (d.limiar != null) {
      $('lm').textContent = 'Limiar mínimo';
      $('vm').innerHTML = fmt(d.limiar, d.dec);
      $('bar').style.width = Math.max(0, Math.min(100, (d.acc[q] - 90) / 10 * 100)) + '%';
      $('ft').textContent = 'Salvaguarda (alerta dispara relatório)';
    } else {
      $('lm').textContent = 'Meta do período';
      $('vm').innerHTML = fmt(d.metaQ[q], d.dec) + ` <small>${d.un}</small>`;
      $('bar').style.width = Math.max(0, Math.min(100, s.pct * 100)) + '%';
      $('ft').textContent = `Meta H2: ${fmt(d.meta, d.dec)} ${d.un} · ${fmt(s.pct * 100, 0)}% do período`;
    }
    const st = $('st'); st.className = 'status ' + s.cls; st.innerHTML = ICON[s.cls] + s.txt;
    $('cq').textContent = QUARTERS[q];
    $('calc').innerHTML = d.formula(q);
    $('brutos').innerHTML = tabelaBrutosCard(d, q);
    drawChart(d, el.querySelector('canvas'));
  });
  document.getElementById('summary').innerHTML =
    `<span class="pill status good">${ICON.good}${cnt.good} em trajetória</span>` +
    `<span class="pill status warning">${ICON.warning}${cnt.warning} atenção</span>` +
    `<span class="pill status critical">${ICON.critical}${cnt.critical} abaixo/alerta</span>`;
  renderTable();
}

function drawChart(d, canvas) {
  const q = state.q, acc = state.mode === 'acc';
  const c1 = css('--series-1'), cStrong = css('--series-1-strong'), cSoft = css('--series-1-soft');
  const ref = css('--ref-line'), muted = css('--text-muted'), grid = '#ecebe7';
  const data = acc ? d.acc : d.tri;
  const ds = [];
  if (acc) {
    ds.push({ type: 'line', label: d.kind === 'fluxo' ? 'Acumulado' : 'Posição', data, borderColor: c1, backgroundColor: c1,
      borderWidth: 2, tension: 0, pointRadius: data.map((_, i) => i === q ? 5 : 3), pointBackgroundColor: data.map((_, i) => i === q ? cStrong : c1),
      pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: 6, order: 1 });
    const refData = d.limiar != null ? QUARTERS.map(() => d.limiar) : d.metaQ;
    ds.push({ type: 'line', label: d.limiar != null ? 'Limiar' : 'Meta do período', data: refData, borderColor: ref,
      borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, order: 2 });
  } else {
    ds.push({ type: 'bar', label: d.kind === 'fluxo' ? 'No trimestre' : 'Variação no trimestre', data,
      backgroundColor: data.map((_, i) => i === q ? cStrong : (i > q ? cSoft : c1)),
      borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26, categoryPercentage: .8, barPercentage: .9 });
  }
  const cfg = {
    data: { labels: QUARTERS, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: acc, position: 'top', align: 'end', labels: { boxWidth: 14, boxHeight: 2, font: { size: 11 }, color: muted } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${(acc || d.kind === 'fluxo') ? fmt(c.parsed.y, d.dec) : fmtS(c.parsed.y, d.dec)} ${d.un}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, font: { size: 10 }, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: !(d.limiar != null && acc) && !(d.base > 0 && acc), grid: { color: grid }, border: { display: false },
             ticks: { color: muted, font: { size: 10 }, maxTicksLimit: 5, callback: v => fmt(v, d.dec > 1 ? 1 : d.dec) } },
      },
    },
  };
  if (charts[d.id]) charts[d.id].destroy();
  charts[d.id] = new Chart(canvas, cfg);
}

function renderTable() {
  const q = state.q;
  const head = `<thead><tr><th>ID</th><th>Indicador (unidade)</th>${QUARTERS.map((l, i) => `<th class="${i === q ? 'sel' : ''}">${l}</th>`).join('')}<th>Meta H2</th></tr></thead>`;
  const rows = IND.map(d => {
    const r1 = `<tr><td><b>${d.id}</b></td><td>${d.nome} — ${d.kind === 'fluxo' ? 'no trimestre' : 'variação'} (${d.un})</td>${d.tri.map((v, i) => `<td class="${i === q ? 'sel' : ''}">${d.kind === 'fluxo' ? fmt(v, d.dec) : fmtS(v, d.dec)}</td>`).join('')}<td></td></tr>`;
    const r2 = `<tr><td></td><td style="color:var(--text-secondary)">${d.kind === 'fluxo' ? 'acumulado' : 'posição acumulada'}</td>${d.acc.map((v, i) => `<td class="${i === q ? 'sel' : ''}">${fmt(v, d.dec)}</td>`).join('')}<td>${d.meta != null ? fmt(d.meta, d.dec) : 'limiar ' + fmt(d.limiar, d.dec)}</td></tr>`;
    const r3 = d.brutos.map(b => `<tr class="bruto"><td></td><td>↳ ${b.nome} (${b.un}${b.tipo === 'fluxo' ? ', no trimestre' : ''})</td>${QUARTERS.map((_, i) => `<td class="${i === q ? 'sel' : ''}">${fmtB(valBruto(b, i), b)}</td>`).join('')}<td>${b.tipo === 'fixo' || (b.t0 != null && b.tipo !== 'fluxo') ? 'T0 ' + fmtB(b.t0, b) : ''}</td></tr>`).join('');
    return r1 + r2 + r3;
  }).join('');
  document.getElementById('tbl').innerHTML = head + '<tbody>' + rows + '</tbody>';
}

buildControls();
buildCards();
render();
