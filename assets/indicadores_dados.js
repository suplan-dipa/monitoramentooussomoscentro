// Dados do núcleo M01–M10 — TODOS OS NÚMEROS SÃO FICTÍCIOS (protótipo de visualização).
// Cada indicador é calculado a partir dos seus componentes brutos (numeradores, denominadores e bases T0),
// para que os números brutos exibidos reproduzam exatamente o valor do indicador.
// Textos da ficha: matriz v2 "OUS_Somos_Centro_Matriz_Decreto_Indicadores.xlsx" (aba 02_Indicadores, 20/10/2026).

const QUARTERS = ['1T/2027', '2T/2027', '3T/2027', '4T/2027', '1T/2028', '2T/2028', '3T/2028', '4T/2028'];
const NQ = QUARTERS.length;
const serie = fn => Array.from({ length: NQ }, (_, q) => fn(q));
const acum = a => { let s = 0; return a.map(v => (s += v)); };
// reparte um total inteiro segundo proporções, somando exatamente o total
function rep(total, nomes, pesos) {
  const soma = pesos.reduce((a, b) => a + b, 0);
  const brutos = pesos.map(p => total * p / soma), int = brutos.map(Math.floor);
  let resto = Math.round(total) - int.reduce((a, b) => a + b, 0);
  brutos.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { int[i]++; resto--; } });
  return nomes.map((n, i) => [n, int[i]]);
}

// ---------- componentes brutos ----------
// M01 — fluxos por trimestre
const M01_conc = [0, 0, 40, 104, 150, 198, 272, 350];
const M01_reg = [0, 0, 8, 16, 21, 29, 38, 52];
// M02 — estoque no cadastro imobiliário (IPTU)
const M02_p0 = 58400, M02_c0 = 112300;
const M02_alvo = [0.1, 0.3, 0.4, 0.7, 0.9, 1.2, 1.4, 1.7], M02_gc = q => 0.12 * (q + 1);
const M02_p = serie(q => Math.round(M02_p0 * (1 + (M02_gc(q) + M02_alvo[q]) / 100)));
const M02_c = serie(q => Math.round(M02_c0 * (1 + M02_gc(q) / 100)));
// M03 — universo elegível congelado em T0
const M03_U = 420, M03_Uarea = 386000;
const M03_t = [2, 5, 8, 11, 15, 17, 21, 26];
const M03_area = [1900, 4300, 7400, 10100, 13800, 15600, 19500, 24200];
// M04 — fluxos por trimestre
const M04_fundo = [0, 0, 0, 20, 12, 40, 25, 50];
const M04_amis = [0, 0, 0, 15, 8, 20, 20, 30];
// M05 — estabelecimentos ativos (CMC) e área
const M05_p0 = 21850, M05_ap = 486, M05_c0 = 30400, M05_ac = 702;
const M05_alvo = [0.0, 0.4, 0.9, 1.1, 1.8, 2.2, 2.9, 3.4], M05_ic = q => 100 + 0.25 * (q + 1);
const M05_c = serie(q => Math.round(M05_c0 * M05_ic(q) / 100));
const M05_p = serie(q => Math.round(M05_p0 * (M05_ic(q) + M05_alvo[q]) / 100));
// M06 — Área 1
const M06_e0 = 17500, M06_uh0 = 14350;
const M06_alvo = [0.82, 0.83, 0.84, 0.86, 0.88, 0.90, 0.92, 0.95];
const M06_e = serie(q => M06_e0 + 35 * (q + 1));
const M06_uh = serie(q => Math.round(M06_alvo[q] * M06_e[q]));
// M07 — extensão de faces de quadra da Área 1 (CTM)
const M07_ext = 186400;
const M07_pct = [0.3, 0.8, 1.5, 2.4, 3.6, 4.5, 5.9, 7.2];
const M07_tot = serie(q => Math.round(M07_ext * M07_pct[q] / 100));
const M07_ctr = serie(q => Math.round(M07_tot[q] * 0.5)), M07_afp = serie(q => Math.round(M07_tot[q] * 0.3));
const M07_obr = serie(q => M07_tot[q] - M07_ctr[q] - M07_afp[q]);
// M08 — Fundo (R$ milhões, valores reais, acumulado)
const M08_disp = [4.2, 9.8, 15.1, 22.6, 30.4, 37.9, 46.2, 55.0];
const M08_pct = [0, 5, 12, 18, 26, 31, 38, 44];
const M08_pago = serie(q => Math.round(M08_disp[q] * M08_pct[q]) / 100);
// M09 — bens protegidos
const M09_U = 312, M09_ok = [0, 2, 3, 5, 8, 10, 12, 14];
// M10 — UH padrão P1–P3 (casa, barracão, apartamento)
const M10_b0 = 4120, M10_a0 = 5750, M10_T0 = M10_b0 + M10_a0;
const M10_alvo = [100, 99.8, 99.9, 99.4, 99.1, 98.7, 98.9, 98.2];
const M10_b = serie(q => Math.round(M10_b0 * (1 - (100 - M10_alvo[q]) / 100 * 1.4)));
const M10_a = serie(q => Math.round(M10_T0 * M10_alvo[q] / 100) - M10_b[q]);

const n0 = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const nd = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const prog = q => (q + 1) / NQ;

// ---------- definição dos indicadores ----------
// kind: 'fluxo' (valor do trimestre = entregue no período; acumulado = soma) | 'nivel' (posição no fim do período)
// brutos: linhas exibidas. tipo 'fluxo' = valor do trimestre (com acumulado ao lado); 'estoque' = posição; 'fixo' = constante (T0)
const IND = [
  {
    id: 'M01', nome: 'Moradias entregues no âmbito da OUS', legal: 'Art. 2º, I (caput)',
    metrica: 'UH concluídas (baixa) + regularizadas', un: 'UH', kind: 'fluxo', base: 0, meta: 1500, dec: 0,
    brutos: [
      { nome: 'UH com Certidão de Baixa em empreendimentos enquadrados (TCU OUS)', un: 'UH', tipo: 'fluxo', s: M01_conc },
      { nome: 'UH regularizadas (arts. 9º, 16 e 27)', un: 'UH', tipo: 'fluxo', s: M01_reg },
    ],
    valorTri: q => M01_conc[q] + M01_reg[q],
    formula: q => `${n0(acum(M01_conc)[q])} UH com baixa + ${n0(acum(M01_reg)[q])} UH regularizadas = <b>${n0(acum(M01_conc)[q] + acum(M01_reg)[q])} UH</b> acumuladas`,
    ficha: { fonte: 'a + i + j', recorte: 'Perímetro; 1A; 1B; Área 2', periodicidade: 'Semestral',
      principal: 'Σ unidades residenciais com Certidão de Baixa (total ou parcial) em empreendimentos enquadrados (TCU OUS) + Σ unidades residenciais regularizadas com fundamento nos arts. 9º, 16 e 27, acumulado desde T0.',
      leitura: 'Por modalidade do Anexo III (retrofit e reconversão separados; EIS; itens 3–7); por Subárea 1A/1B/Área 2; tipologia (nº de quartos — lógica IN_CPa16) e área útil média; regularizadas em linha própria; pipeline (UH em projeto aprovado e em alvará — IN_CPa10, IN_HBi16) e razão entregues/aprovadas por coorte.',
      t0: 'Zero em T0 (fluxo novo). Contrafactual: UH com baixa no perímetro 2015–T0 (IN_CPa01 recortado) → média anual pré-OUS.',
      limites: 'Baixa ≠ ocupação nem preço acessível. Hospedagem não conta como moradia (Estrutura, reconversão, item 15). Regularizadas não são UH novas.' },
    desag: q => {
      const c = acum(M01_conc)[q], r = acum(M01_reg)[q], t = c + r;
      const aprov = Math.round(t * 2.6 + 380), alv = Math.round(t * 1.7 + 210);
      return [
        { titulo: 'Por modalidade do Anexo III (UH acumuladas)', un: 'UH', itens: [...rep(c, ['Retrofit', 'Reconversão', 'Obra nova incentivada (itens 3–7)', 'EIS'], [22, 18, 38, 22]), ['Regularizadas (linha própria)', r]] },
        { titulo: 'Por subárea (UH acumuladas)', un: 'UH', itens: rep(t, ['Subárea 1A', 'Subárea 1B', 'Área 2'], [41, 37, 22]) },
        { titulo: 'Tipologia das UH concluídas', un: 'UH', itens: rep(c, ['Estúdio e 1 quarto', '2 quartos', '3 quartos ou mais'], [46, 39, 15]) },
        { titulo: 'Pipeline e conversão', tipo: 'kv', itens: [['UH em projeto aprovado', n0(aprov)], ['UH com alvará', n0(alv)], ['UH entregues', n0(t)], ['Razão entregues / aprovadas', nd(t / aprov, 2)], ['Área útil média das UH concluídas', '41,8 m²']] },
      ];
    },
  },
  {
    id: 'M02', nome: 'Estoque residencial e população residente', legal: 'Art. 2º, I e I, d',
    metrica: 'Diferencial de crescimento do estoque residencial vs. área de comparação', un: 'p.p.', kind: 'nivel', base: 0, meta: 2.0, dec: 1,
    brutos: [
      { nome: 'UH residenciais no perímetro (IPTU)', un: 'UH', tipo: 'estoque', t0: M02_p0, s: M02_p },
      { nome: 'UH residenciais na área de comparação (IPTU)', un: 'UH', tipo: 'estoque', t0: M02_c0, s: M02_c },
      { nome: 'Variação no perímetro desde T0', un: '%', tipo: 'derivado', dec: 2, s: serie(q => (M02_p[q] / M02_p0 - 1) * 100) },
      { nome: 'Variação na comparação desde T0', un: '%', tipo: 'derivado', dec: 2, s: serie(q => (M02_c[q] / M02_c0 - 1) * 100) },
    ],
    valor: q => ((M02_p[q] / M02_p0 - 1) - (M02_c[q] / M02_c0 - 1)) * 100,
    formula: q => `(${n0(M02_p[q])} / ${n0(M02_p0)} − 1) − (${n0(M02_c[q])} / ${n0(M02_c0)} − 1) = ${nd((M02_p[q] / M02_p0 - 1) * 100, 2)}% − ${nd((M02_c[q] / M02_c0 - 1) * 100, 2)}% = <b>${nd(((M02_p[q] / M02_p0 - 1) - (M02_c[q] / M02_c0 - 1)) * 100, 1)} p.p.</b>`,
    ficha: { fonte: 'b + n', recorte: 'Perímetro; subáreas; comparação; município', periodicidade: 'Anual',
      principal: 'Diferencial de crescimento (p.p.) = variação % das unidades residenciais no cadastro imobiliário do perímetro desde T0 − variação % na área de comparação.',
      leitura: 'Densidade UH/ha (IN_CPb19) e m²/ha (IN_CPb21) por subárea; variação no município; população residente estimada = Σ setores [UH no IPTU × moradores por domicílio ocupado × taxa de ocupação (Censo 2022)]; verificação pelo Censo 2030 (população e domicílios vagos).',
      t0: 'Lançamento do IPTU do exercício de T0; Censo 2022 (população, domicílios ocupados e vagos por setor).',
      limites: 'IPTU cobre ~86% dos lotes CTM; recadastramentos mudam o estoque sem obra (registrar quebras); taxa de ocupação fixa não capta reocupação de vagos.' },
    desag: q => {
      const [a, b, c] = rep(M02_p[q], ['1A', '1B', 'A2'], [36, 30, 34]).map(x => x[1]);
      return [
        { titulo: 'Densidade residencial por subárea (UH/ha)', un: 'UH/ha', dec: 1, itens: [['Subárea 1A (152 ha)', a / 152], ['Subárea 1B (138 ha)', b / 138], ['Área 2 (196 ha)', c / 196], ['Área de comparação (702 ha)', M02_c[q] / 702]] },
        { titulo: 'Variação do estoque residencial desde T0', un: '%', dec: 2, itens: [['Perímetro da OUS', (M02_p[q] / M02_p0 - 1) * 100], ['Área de comparação', (M02_c[q] / M02_c0 - 1) * 100], ['Município', 0.1 * (q + 1)]] },
        { titulo: 'População residente estimada', tipo: 'kv', itens: [['UH no IPTU (perímetro)', n0(M02_p[q])], ['Moradores por domicílio ocupado (Censo 2022)', '2,31'], ['Taxa de ocupação (Censo 2022)', '88%'], ['População estimada', n0(Math.round(M02_p[q] * 2.31 * 0.88)) + ' hab.'], ['Densidade populacional', nd(M02_p[q] * 2.31 * 0.88 / 486, 1) + ' hab/ha']] },
      ];
    },
  },
  {
    id: 'M03', nome: 'Reaproveitamento do estoque ocioso ou subutilizado', legal: 'Art. 2º, I, d; art. 1º, § 3º',
    metrica: '% do universo elegível inventariado em T0 transformado', un: '%', kind: 'nivel', base: 0, meta: 8, dec: 1,
    brutos: [
      { nome: 'Universo elegível inventariado em T0', un: 'imóveis', tipo: 'fixo', t0: M03_U },
      { nome: 'Imóveis do universo com transformação concluída e enquadrada (acum.)', un: 'imóveis', tipo: 'estoque', t0: 0, s: M03_t },
      { nome: 'Área de terreno do universo em T0', un: 'm²', tipo: 'fixo', t0: M03_Uarea },
      { nome: 'Área de terreno transformada (acum.)', un: 'm²', tipo: 'estoque', t0: 0, s: M03_area },
    ],
    valor: q => M03_t[q] / M03_U * 100,
    formula: q => `${n0(M03_t[q])} imóveis transformados / ${n0(M03_U)} do universo T0 = <b>${nd(M03_t[q] / M03_U * 100, 1)}%</b> (por área: ${n0(M03_area[q])} / ${n0(M03_Uarea)} m² = ${nd(M03_area[q] / M03_Uarea * 100, 1)}%)`,
    ficha: { fonte: 'b + c + a + i', recorte: 'Área 1 (UR) e perímetro', periodicidade: 'Anual',
      principal: '% do universo elegível inventariado em T0 (nº de imóveis e área de terreno) com transformação concluída (baixa) e enquadramento OUS, por modalidade.',
      leitura: 'Universo T0: lotes só com estacionamento (CMC × IPTU — lógica IN_VZc11/c12, estendida ao perímetro); galpões (tipologia no cadastro do exercício da publicação — critério da Estrutura); obras paralisadas (alvará vencido sem baixa há ≥ 5 anos + ortofoto); edificações concluídas até o marco do retrofit (IPTU, Área 1); horizontais degradadas (Anexo XI + levantamento). Leitura: m² de área existente reabilitada/reconvertida sem dupla contagem; % residencial da área reconvertida; transformações sem enquadramento OUS.',
      t0: 'Inventário do universo congelado em T0 (sem efeito de enquadramento).',
      limites: 'Universo ≠ elegibilidade jurídica (decidida caso a caso). Ociosidade aqui não equivale ao conceito de PEUC.' },
    desag: q => {
      const tipos = ['Lotes só com estacionamento', 'Galpões', 'Obras paralisadas', 'Edificações até o marco do retrofit', 'Horizontais degradadas'];
      const univ = [168, 74, 23, 121, 34], tr = rep(M03_t[q], tipos, [35, 20, 5, 35, 5]);
      return [
        { titulo: 'Universo T0 por tipo (imóveis)', un: 'imóveis', itens: tipos.map((t, i) => [t, univ[i]]) },
        { titulo: 'Transformados por tipo (acumulado)', un: 'imóveis', itens: tr },
        { titulo: 'Leituras', tipo: 'kv', itens: [['Área existente reabilitada ou reconvertida', n0(Math.round(M03_area[q] * 2.9)) + ' m²'], ['Parcela residencial da área reconvertida', '71%'], ['Transformações sem enquadramento OUS', n0(Math.round(M03_t[q] * 0.4))]] },
      ];
    },
  },
  {
    id: 'M04', nome: 'Atendimento habitacional à Faixa 1', legal: 'Art. 2º, I e II, c; arts. 5º, 6º, 22',
    metrica: 'Famílias Faixa 1 atendidas com recursos/unidades da OUS', un: 'famílias', kind: 'fluxo', base: 0, meta: 300, dec: 0,
    brutos: [
      { nome: 'Famílias atendidas com recursos do Fundo (art. 5º, I)', un: 'famílias', tipo: 'fluxo', s: M04_fundo },
      { nome: 'Famílias atendidas com unidades do Amis (art. 6º, I)', un: 'famílias', tipo: 'fluxo', s: M04_amis },
    ],
    valorTri: q => M04_fundo[q] + M04_amis[q],
    formula: q => `${n0(acum(M04_fundo)[q])} via Fundo + ${n0(acum(M04_amis)[q])} via Amis = <b>${n0(acum(M04_fundo)[q] + acum(M04_amis)[q])} famílias</b> acumuladas`,
    ficha: { fonte: 'h + e + j', recorte: 'Perímetro e destinação legal', periodicidade: 'Semestral',
      principal: 'Nº de famílias distintas da Faixa 1 com atendimento formalizado pela PMH com recursos do Fundo (art. 5º, I) ou unidades do Amis (art. 6º, I), acumulado.',
      leitura: 'Modalidade (unidade, locação social, outra legal); unidades do Amis aceitas pela URBEL; R$ da PMH pagos (valores reais); UH EIS concluídas na OUS (de M01); imóveis em locação social isentos (art. 22, II); localização das unidades; famílias atendidas por R$ 1 milhão arrecadado.',
      t0: 'Zero em T0. Referência: atendimentos da PMH na área central 2015–T0.',
      limites: 'Receita ≠ atendimento (defasagem). EIS ≠ Faixa 1. Somente dados agregados.' },
    desag: q => {
      const f = acum(M04_fundo)[q], a = acum(M04_amis)[q], t = f + a, arrec = M08_disp[q];
      const eis = rep(acum(M01_conc)[q], ['r', 'rc', 'o', 'eis'], [22, 18, 38, 22])[3][1];
      return [
        { titulo: 'Por modalidade de atendimento', un: 'famílias', itens: rep(t, ['Unidade habitacional', 'Locação social', 'Outra modalidade legal'], [55, 38, 7]) },
        { titulo: 'Localização das unidades', un: 'famílias', itens: rep(t, ['No perímetro da OUS', 'Fora do perímetro'], [64, 36]) },
        { titulo: 'Leituras', tipo: 'kv', itens: [['Unidades do Amis aceitas pela URBEL', n0(a)], ['R$ da PMH pagos (reais)', 'R$ ' + nd(f * 0.118, 2) + ' mi'], ['UH EIS concluídas na OUS (de M01)', n0(eis)], ['Imóveis em locação social isentos (art. 22, II)', n0(Math.round(t * 0.38 * 0.6))], ['Famílias por R$ 1 milhão arrecadado', arrec ? nd(t / arrec, 1) : '—']] },
      ];
    },
  },
  {
    id: 'M05', nome: 'Vitalidade econômica e diversidade de usos', legal: 'Art. 2º, I, e',
    metrica: 'Índice de estabelecimentos/ha (T0 = 100) menos o índice da comparação', un: 'pontos', kind: 'nivel', base: 0, meta: 3.0, dec: 1,
    brutos: [
      { nome: 'Estabelecimentos ativos no perímetro (CMC)', un: 'estab.', tipo: 'estoque', t0: M05_p0, s: M05_p },
      { nome: 'Área do perímetro', un: 'ha', tipo: 'fixo', t0: M05_ap },
      { nome: 'Estabelecimentos ativos na comparação (CMC)', un: 'estab.', tipo: 'estoque', t0: M05_c0, s: M05_c },
      { nome: 'Área da comparação', un: 'ha', tipo: 'fixo', t0: M05_ac },
      { nome: 'Índice do perímetro (T0 = 100)', un: 'índice', tipo: 'derivado', dec: 1, s: serie(q => M05_p[q] / M05_p0 * 100) },
      { nome: 'Índice da comparação (T0 = 100)', un: 'índice', tipo: 'derivado', dec: 1, s: serie(q => M05_c[q] / M05_c0 * 100) },
    ],
    valor: q => (M05_p[q] / M05_p0 - M05_c[q] / M05_c0) * 100,
    formula: q => `(${n0(M05_p[q])}/${M05_ap} ha) ÷ (${n0(M05_p0)}/${M05_ap} ha) × 100 − (${n0(M05_c[q])}/${M05_ac} ha) ÷ (${n0(M05_c0)}/${M05_ac} ha) × 100 = ${nd(M05_p[q] / M05_p0 * 100, 1)} − ${nd(M05_c[q] / M05_c0 * 100, 1)} = <b>${nd((M05_p[q] / M05_p0 - M05_c[q] / M05_c0) * 100, 1)} pontos</b>`,
    ficha: { fonte: 'c + b + a', recorte: 'Perímetro; subáreas; comparação', periodicidade: 'Anual (retrato)',
      principal: 'Índice (T0 = 100) de estabelecimentos ativos no CMC por hectare no perímetro, comparado ao índice da área de comparação.',
      leitura: 'Diversidade: índice de Shannon normalizado por macrogrupo CNAE (novo), ao lado da taxa IN_CPc09; razão UH não residenciais/residenciais (IN_CPb25) e de área (IN_CPb28); extensão de fachada ativa com baixa (IN_EPa30, IN_EPa28); ISSQN arrecadado no perímetro (BHISS, reais).',
      t0: 'RETRATO DO CMC NA DATA T0 — obrigatório: a base só contém inscrições ativas na extração (Metodologia, fonte c).',
      limites: 'Inscrição ≠ emprego; MEI/formalização inflam contagens; razões escondem retrações absolutas (publicar totais).' },
    desag: q => [
      { titulo: 'Estabelecimentos ativos por hectare', un: 'estab./ha', dec: 1, itens: [['Subárea 1A', 71.2 + 0.4 * q], ['Subárea 1B', 38.5 + 0.3 * q], ['Área 2', 29.9 + 0.2 * q], ['Área de comparação', M05_c[q] / M05_ac]] },
      { titulo: 'Estabelecimentos por macrogrupo CNAE (perímetro)', un: 'estab.', itens: rep(M05_p[q], ['Comércio', 'Serviços pessoais e alimentação', 'Serviços profissionais e escritórios', 'Saúde e educação', 'Indústria e outros'], [38, 21, 24, 11, 6]) },
      { titulo: 'Leituras', tipo: 'kv', itens: [['Diversidade (Shannon normalizado, CNAE)', nd(0.71 + 0.004 * q, 3)], ['Razão UH não residenciais / residenciais', nd(0.48 - 0.004 * q, 2)], ['Razão de área não residencial / residencial', nd(0.62 - 0.005 * q, 2)], ['Fachada ativa com baixa (acum.)', n0(Math.round(M01_conc.slice(0, q + 1).reduce((a, b) => a + b, 0) * 1.6)) + ' m'], ['ISSQN arrecadado no perímetro (trimestre, reais)', 'R$ ' + nd(38.2 + 0.6 * q, 1) + ' mi']] },
    ],
  },
  {
    id: 'M06', nome: 'Equilíbrio moradia–atividade econômica (Área 1)', legal: 'Art. 2º, I, a e b',
    metrica: 'Razão UH residenciais (IPTU) / estabelecimentos ativos (CMC)', un: 'razão', kind: 'nivel', base: M06_uh0 / M06_e0, meta: 1.0, dec: 2,
    brutos: [
      { nome: 'UH residenciais na Área 1 (IPTU)', un: 'UH', tipo: 'estoque', t0: M06_uh0, s: M06_uh },
      { nome: 'Estabelecimentos ativos na Área 1 (CMC)', un: 'estab.', tipo: 'estoque', t0: M06_e0, s: M06_e },
    ],
    valor: q => M06_uh[q] / M06_e[q],
    formula: q => `${n0(M06_uh[q])} UH ÷ ${n0(M06_e[q])} estabelecimentos = <b>${nd(M06_uh[q] / M06_e[q], 2)}</b> (T0: ${n0(M06_uh0)} ÷ ${n0(M06_e0)} = ${nd(M06_uh0 / M06_e0, 2)})`,
    ficha: { fonte: 'b + c (proxy); q + n (plena)', recorte: 'Área 1; 1A; 1B', periodicidade: 'Anual',
      principal: 'Razão unidades residenciais (IPTU) / estabelecimentos ativos (CMC) na Área 1 [proxy imediata]; versão plena: domicílios ocupados / vínculos formais (RAIS).',
      leitura: 'Por subárea; comparação com centralidades regionais; % das UH da OUS em células com alta densidade de estabelecimentos (verificação de localização).',
      t0: 'T0 (IPTU + retrato CMC); Censo 2022 + RAIS do último ano disponível.',
      limites: 'Não mede quem mora perto de onde trabalha nem tempo de viagem (ver C02). Estabelecimento ≠ emprego.' },
    desag: q => [
      { titulo: 'Razão UH / estabelecimentos', un: 'razão', dec: 2, itens: [['Subárea 1A', 0.58 + 0.012 * q], ['Subárea 1B', 1.21 + 0.022 * q], ['Área 1 (total)', M06_uh[q] / M06_e[q]], ['Centralidade regional Venda Nova', 2.42], ['Centralidade regional Barreiro', 2.87]] },
      { titulo: 'Leituras', tipo: 'kv', itens: [['UH da OUS em células com alta densidade de estabelecimentos', '64%'], ['Versão plena (domicílios ocupados / vínculos RAIS)', 'só nas avaliações de marco']] },
    ],
  },
  {
    id: 'M07', nome: 'Frentes e calçadas qualificadas (Área 1)', legal: 'Art. 2º, II, a; art. 18',
    metrica: '% da extensão de faces de quadra com frente qualificada entregue', un: '%', kind: 'nivel', base: 0, meta: 10, dec: 1,
    brutos: [
      { nome: 'Extensão de faces de quadra da Área 1 (CTM)', un: 'm', tipo: 'fixo', t0: M07_ext },
      { nome: 'Contrapartidas do art. 18 recebidas (acum.)', un: 'm', tipo: 'estoque', t0: 0, s: M07_ctr },
      { nome: 'Afastamento frontal qualificado com baixa (acum.)', un: 'm', tipo: 'estoque', t0: 0, s: M07_afp },
      { nome: 'Trechos requalificados com Fundo / obras públicas (acum.)', un: 'm', tipo: 'estoque', t0: 0, s: M07_obr },
    ],
    valor: q => M07_tot[q] / M07_ext * 100,
    formula: q => `(${n0(M07_ctr[q])} + ${n0(M07_afp[q])} + ${n0(M07_obr[q])}) m ÷ ${n0(M07_ext)} m = ${n0(M07_tot[q])} ÷ ${n0(M07_ext)} = <b>${nd(M07_tot[q] / M07_ext * 100, 1)}%</b>`,
    ficha: { fonte: 'a + j + obras + CTM', recorte: 'Área 1; 1A; 1B', periodicidade: 'Anual',
      principal: '% da extensão de faces de quadra da Área 1 com frente qualificada entregue (contrapartidas do art. 18 recebidas + afastamento frontal qualificado com baixa + trechos requalificados com Fundo/obras públicas), sem dupla contagem.',
      leitura: 'Árvores plantadas (1 a cada 10 m de testada) e sobrevivência após 12 meses; AFP implantada (m² — IN_EPa24); fachada ativa (m — IN_EPa30); calçada ampliada/acessível (m); soluções baseadas na natureza (m²); por Subárea 1A/1B.',
      t0: 'Zero (fluxo). Preliminar da Estrutura: mediana de 2 árvores/projeto; 31% dos projetos com integração do afastamento ao passeio.',
      limites: 'Entrega ≠ uso (ver C04). Exige rotina de manutenção após o recebimento.' },
    desag: q => {
      const arv = Math.round(M07_tot[q] / 10), arv4 = q >= 4 ? Math.round(M07_tot[q - 4] / 10) : 0;
      return [
        { titulo: 'Frente qualificada por subárea (% da extensão)', un: '%', dec: 1, itens: [['Subárea 1A', M07_pct[q] * 1.18], ['Subárea 1B', M07_pct[q] * 0.8]] },
        { titulo: 'Leituras', tipo: 'kv', itens: [['Árvores plantadas (acum.)', n0(arv)], ['Sobrevivência após 12 meses', arv4 ? `${n0(Math.round(arv4 * 0.86))} de ${n0(arv4)} (86%)` : 'sem coorte com 12 meses'], ['AFP implantada', n0(Math.round(M07_afp[q] * 3.4)) + ' m²'], ['Fachada ativa', n0(Math.round(M07_tot[q] * 0.41)) + ' m'], ['Calçada ampliada ou acessível', n0(Math.round(M07_tot[q] * 0.63)) + ' m'], ['Soluções baseadas na natureza', n0(Math.round(M07_tot[q] * 0.9)) + ' m²']] },
      ];
    },
  },
  {
    id: 'M08', nome: 'Investimento realizado nas finalidades do art. 2º, II', legal: 'Art. 2º, II, a–c; arts. 5º, 7º',
    metrica: 'Taxa de execução do Fundo (pago / disponível)', un: '%', kind: 'nivel', base: 0, meta: 60, dec: 0,
    brutos: [
      { nome: 'Recursos disponíveis no Fundo (acum., reais)', un: 'R$ mi', tipo: 'estoque', t0: 0, dec: 2, s: M08_disp },
      { nome: 'Pago em intervenções concluídas (acum., reais)', un: 'R$ mi', tipo: 'estoque', t0: 0, dec: 2, s: M08_pago },
    ],
    valor: q => M08_disp[q] ? M08_pago[q] / M08_disp[q] * 100 : 0,
    formula: q => `R$ ${nd(M08_pago[q], 2)} mi pagos ÷ R$ ${nd(M08_disp[q], 2)} mi disponíveis = <b>${nd(M08_pago[q] / M08_disp[q] * 100, 0)}%</b>`,
    ficha: { fonte: 'e + j + executores', recorte: 'Área 1; perímetro', periodicidade: 'Semestral',
      principal: 'R$ (reais, IPCA-E) pagos em intervenções concluídas, por alínea do art. 2º, II (a, b, c): Fundo (art. 5º, II) + contrapartidas de patrimônio aplicadas (art. 7º) + contrapartidas físicas recebidas (art. 18; AFP), acumulado. A meta da aba 05_Metas recai sobre a taxa de execução do Fundo (pago/disponível).',
      leitura: 'Taxa de execução do Fundo (pago/disponível) por destinação; nº de intervenções concluídas por tipo; iniciativas do art. 5º, II, d–f e público agregado; mapa das intervenções.',
      t0: 'Zero em T0.',
      limites: 'Valor ≠ resultado. Valorar contrapartidas físicas exige método (orçamento de referência).' },
    desag: q => [
      { titulo: 'Pago por alínea do art. 2º, II (R$ mi, reais)', un: 'R$ mi', dec: 2, itens: [['a) equipamentos, espaços públicos e áreas verdes', M08_pago[q] * 0.62], ['b) restauro e preservação de bens protegidos', M08_pago[q] * 0.26], ['c) inclusão social e identidades culturais', M08_pago[q] * 0.12]] },
      { titulo: 'Taxa de execução por destinação', un: '%', dec: 0, itens: [['Alínea a', M08_pct[q] * 1.1], ['Alínea b', M08_pct[q] * 0.95], ['Alínea c', M08_pct[q] * 0.7]] },
      { titulo: 'Intervenções concluídas por tipo (acum.)', un: 'intervenções', itens: rep(Math.round(M08_pct[q] / 3), ['Praças e áreas verdes', 'Calçadas e travessias', 'Restauro de bens protegidos', 'Equipamentos e iniciativas culturais'], [35, 30, 20, 15]) },
    ],
  },
  {
    id: 'M09', nome: 'Patrimônio protegido recuperado e em uso', legal: 'Art. 2º, II, b; arts. 7º, 16, 19, 20',
    metrica: '% dos bens protegidos com intervenção concluída e uso ativo', un: '%', kind: 'nivel', base: 0, meta: 6, dec: 1,
    brutos: [
      { nome: 'Bens protegidos no perímetro em T0 (tombados e em processo)', un: 'bens', tipo: 'fixo', t0: M09_U },
      { nome: 'Bens com intervenção concluída e uso ativo (acum.)', un: 'bens', tipo: 'estoque', t0: 0, s: M09_ok },
    ],
    valor: q => M09_ok[q] / M09_U * 100,
    formula: q => `${n0(M09_ok[q])} bens recuperados e em uso ÷ ${n0(M09_U)} bens do universo T0 = <b>${nd(M09_ok[q] / M09_U * 100, 1)}%</b>`,
    ficha: { fonte: 'p + a + b + c + d', recorte: 'Perímetro; 1B; tipo de proteção', periodicidade: 'Anual',
      principal: '% dos bens protegidos (tombados e com processo de tombamento) do perímetro com intervenção concluída (baixa ou aceite do órgão de patrimônio) E uso residencial ou comercial ativo (IPTU + CMC/ALF), sobre o universo em T0.',
      leitura: 'Bens sem uso ativo em T0; bens com TDC gerada e renovada (art. 19, § 1º — atestado de bom estado gera dado de conservação); retrofits em bens protegidos; contrapartidas do art. 7º aplicadas; cobertura das vistorias.',
      t0: 'Universo e % em uso ativo em T0.',
      limites: 'Uso cadastral ≠ ocupação plena. Conservação só para bens vistoriados (informar cobertura).' },
    desag: q => [
      { titulo: 'Recuperados e em uso, por tipo de proteção', un: 'bens', itens: rep(M09_ok[q], ['Tombados (214)', 'Em processo de tombamento (98)'], [70, 30]) },
      { titulo: 'Recuperados e em uso, por subárea', un: 'bens', itens: rep(M09_ok[q], ['Subárea 1A', 'Subárea 1B', 'Área 2'], [30, 55, 15]) },
      { titulo: 'Leituras', tipo: 'kv', itens: [['Bens sem uso ativo em T0', '57'], ['Bens com TDC gerada (acum.)', n0(Math.round(2.5 * (q + 1)))], ['TDC renovadas (art. 19, § 1º)', n0(Math.max(0, q - 3))], ['Retrofits em bens protegidos', n0(Math.round(M09_ok[q] * 0.6))], ['Contrapartidas do art. 7º aplicadas', 'R$ ' + nd(M08_pago[q] * 0.26 * 0.4, 2) + ' mi'], ['Cobertura das vistorias', n0(38 + 4 * q) + '% dos bens']] },
    ],
  },
  {
    id: 'M10', nome: 'Permanência do estoque residencial popular', legal: 'Art. 2º, II, c; art. 24',
    metrica: 'Índice de UH padrão P1–P3 (T0 = 100) na Subárea 1B e Área 2', un: 'índice', kind: 'nivel', base: 100, meta: null, limiar: 95, alerta: 97, dec: 1,
    brutos: [
      { nome: 'UH P1–P3 (casa, barracão, apto.) na Subárea 1B (IPTU)', un: 'UH', tipo: 'estoque', t0: M10_b0, s: M10_b },
      { nome: 'UH P1–P3 (casa, barracão, apto.) na Área 2 (IPTU)', un: 'UH', tipo: 'estoque', t0: M10_a0, s: M10_a },
    ],
    valor: q => (M10_b[q] + M10_a[q]) / M10_T0 * 100,
    formula: q => `(${n0(M10_b[q])} + ${n0(M10_a[q])}) UH ÷ (${n0(M10_b0)} + ${n0(M10_a0)}) UH em T0 × 100 = ${n0(M10_b[q] + M10_a[q])} ÷ ${n0(M10_T0)} × 100 = <b>${nd((M10_b[q] + M10_a[q]) / M10_T0 * 100, 1)}</b>`,
    ficha: { fonte: 'b + m + l', recorte: 'Subárea 1B; Área 2', periodicidade: 'Anual',
      principal: 'Índice (T0 = 100) do nº de unidades residenciais de padrão P1–P3 e tipo casa, barracão ou apartamento (critério do art. 24) na Subárea 1B e na Área 2.',
      leitura: 'Imóveis beneficiados pela isenção do art. 24 (SMFA); valor/m² ITBI das transações residenciais (C03) × reajuste do IPTU (G05); famílias atendidas pela PMH residentes na área.',
      t0: 'T0.',
      limites: 'Reforma legítima altera o padrão; recadastramento gera quebra. Alerta dispara relatório específico, não sanção.' },
    desag: q => [
      { titulo: 'Índice por subárea (T0 = 100)', un: 'índice', dec: 1, itens: [['Subárea 1B', M10_b[q] / M10_b0 * 100], ['Área 2', M10_a[q] / M10_a0 * 100]] },
      { titulo: 'Leituras', tipo: 'kv', itens: [['Imóveis com isenção do art. 24 (SMFA)', n0(2140 + 15 * q)], ['Variação do valor/m² ITBI residencial desde T0 (reais)', '+' + nd(1.1 * (q + 1), 1) + '%'], ['Reajuste acumulado do IPTU (G05)', '+' + nd(0.9 * (q + 1), 1) + '%'], ['Famílias atendidas pela PMH residentes na área', n0(Math.round(acum(M04_fundo)[q] * 0.5))]] },
    ],
  },
];
