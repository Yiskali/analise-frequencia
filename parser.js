// Leitor do "Relatório de Frequência" do MentorH + lógica de análise de saldo
// Entrada: páginas como listas de itens {str, x, y} (coordenadas do PDF)

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS_ABREV = { DOM:0, SEG:1, TER:2, QUA:3, QUI:4, SEX:5, 'SÁB':6, SAB:6 };
export const DIAS_NOME = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function toMin(s) {
  if (s == null) return null;
  const m = String(s).replace(/\s+/g, '').match(/^([+-])?(\d{1,4}):(\d{2})$/);
  if (!m) return null;
  const v = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return m[1] === '-' ? -v : v;
}

export function fmt(min, signed = false) {
  if (min == null) return '';
  const neg = min < 0, a = Math.abs(Math.round(min));
  const s = String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  if (signed) return (neg ? '− ' : min > 0 ? '+ ' : '') + s;
  return (neg ? '− ' : '') + s;
}

function buildLines(pages) {
  const lines = [];
  pages.forEach((items, p) => {
    const its = items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str.trim(), x: i.x, y: i.y }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const pl = [];
    for (const it of its) {
      const ln = pl.find(l => Math.abs(l.y - it.y) <= 2.5);
      if (ln) ln.items.push(it); else pl.push({ y: it.y, page: p, items: [it] });
    }
    pl.sort((a, b) => b.y - a.y);
    pl.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str).join(' '); });
    lines.push(...pl);
  });
  return lines;
}

const restText = (l, from = 1) => l.items.slice(from).map(i => i.str).join(' ').replace(/\s+-\s*$/, '').trim();

export function parseReport(pages) {
  const lines = buildLines(pages);
  const emps = [];
  let cur = null, cols = null, mode = null, mesAno = null, lastDay = null, totHeader = false;

  for (const l of lines) {
    const first = l.items[0].str;
    const t = l.text;

    const mRel = t.match(/Relat[óo]rio de Frequ[êe]ncia\s*-\s*([A-Za-zçÇ]+)\s*\/\s*(\d{4})/i);
    if (mRel) { mesAno = { mes: MESES.indexOf(norm(mRel[1]).replace('marco', 'março')), ano: +mRel[2] }; if (mesAno.mes < 0) mesAno.mes = MESES.map(norm).indexOf(norm(mRel[1])); }

    if (first === 'Empregado') {
      const txt = restText(l);
      const mm = txt.match(/^(.*?)\s*-\s*(\d+)\s*$/);
      const nome = mm ? mm[1].trim() : txt, matricula = mm ? mm[2] : '';
      const same = cur && cur.matricula === matricula && cur.nome === nome && (!mesAno || (cur.mes === mesAno.mes && cur.ano === mesAno.ano));
      if (!same) {
        cur = { nome, matricula, cargo: '', unidade: '', lotacao: '', jornadaPadrao: '', vinculo: '', homologada: '',
                mes: mesAno ? mesAno.mes : null, ano: mesAno ? mesAno.ano : null, dias: {}, totais: null, jornadas: {} };
        emps.push(cur);
      }
      mode = 'header'; continue;
    }
    if (!cur) continue;
    if (cur.mes == null && mesAno) { cur.mes = mesAno.mes; cur.ano = mesAno.ano; }

    if (first === 'Cargo Efetivo') { cur.cargo = restText(l); continue; }
    if (first === 'Unidade') { cur.unidade = restText(l); continue; }
    if (first === 'Lotação Exercício' || /^Lota[çc][ãa]o/.test(first)) { cur.lotacao = restText(l); continue; }
    if (first === 'Jornada Padrão') {
      const r = restText(l); const mv = r.match(/V[íi]nculo:\s*(.*)$/);
      cur.vinculo = mv ? mv[1].trim() : ''; cur.jornadaPadrao = r.replace(/-?\s*V[íi]nculo:.*$/, '').trim(); continue;
    }
    if (/HOMOLOGADA/i.test(t)) { cur.homologada = t.trim(); continue; }

    // Cabeçalho da tabela diária
    if (l.items.some(i => i.str === 'Dia') && l.items.some(i => /Registros de Ponto/.test(i.str))) {
      const gx = re => (l.items.find(i => re.test(i.str)) || {}).x;
      const xCod = gx(/^C[óo]digo/), xReg = gx(/Registros/), xHor = gx(/^Horas/), xSal = gx(/^Saldo/), xOc = gx(/^Ocorr/), xObs = gx(/^Obs/);
      cols = { cod: (xCod ?? 100) - 10, reg: (xReg ?? 180) - 25, hc: (xHor ?? 305) - 20, sal: (xSal ?? 360) - 12, oc: (xOc ?? 400) - 5, obs: (xObs ?? 560) - 5 };
      mode = 'dias'; continue;
    }

    if (l.items.some(i => i.str === 'CH Escalada')) { mode = 'totais'; totHeader = true; continue; }
    if (l.items.some(i => /Detalhamento do Hor/.test(i.str))) { mode = 'jornadas'; continue; }
    if (/^OSM\b|Consultoria e Sistemas|^\d+ de \d+$/.test(t) || first === 'EBSERH') continue;

    if (mode === 'dias' && cols) {
      // reconstrói o rótulo do dia a partir dos itens à esquerda da coluna Código
      const left = l.items.filter(i => i.x < cols.cod).map(i => i.str).join(' ');
      const md = left.match(/^(\d{1,2})\s*(DOM|SEG|TER|QUA|QUI|SEX|S[ÁA]B)\b/i);
      const rest = l.items.filter(i => i.x >= cols.cod);
      if (md) {
        const d = { dia: +md[1], dow: DIAS_ABREV[md[2].toUpperCase()] ?? null, codigo: '', registros: '', regTexto: '', hc: null, saldo: null, ocorrencia: '', obs: '' };
        assignCols(d, rest, cols);
        cur.dias[d.dia] = d; lastDay = d; continue;
      }
      if (lastDay && rest.length && l.items.length === rest.length) {
        // linha de continuação (texto quebrado)
        const tmp = { codigo: '', registros: '', regTexto: '', hc: null, saldo: null, ocorrencia: '', obs: '' };
        assignCols(tmp, rest, cols);
        if (tmp.ocorrencia) lastDay.ocorrencia = (lastDay.ocorrencia + ' ' + tmp.ocorrencia).trim();
        if (tmp.obs) lastDay.obs = (lastDay.obs + ' ' + tmp.obs).trim();
        if (tmp.regTexto) lastDay.regTexto = (lastDay.regTexto + ' ' + tmp.regTexto).trim();
        if (tmp.registros) lastDay.registros = (lastDay.registros + ' ' + tmp.registros).trim();
      }
      continue;
    }

    if (mode === 'totais') {
      if (totHeader && l.items.every(i => /^[+-]?\s*\d{1,4}(:\d{2})?$/.test(i.str)) && l.items.length >= 6) {
        const v = l.items.map(i => i.str);
        cur.totais = { escalada: toMin(v[0]), contratual: toMin(v[1]), executada: toMin(v[2]), diferenca: toMin(v[3]),
                       semanal: toMin(v[4]), diaria: toMin(v[5]), diasUteis: v[6] != null ? parseInt(v[6], 10) : null };
        totHeader = false;
      }
      continue;
    }

    if (mode === 'jornadas') {
      if (/^\d{3,4}$/.test(first)) {
        const times = l.items.slice(1).filter(i => /^\d{1,2}:\d{2}$/.test(i.str)).map(i => i.str);
        cur.jornadas[first] = { codigo: first, descricao: l.items[1] ? l.items[1].str : '', ch: toMin(times[0]), intervalo: toMin(times[times.length - 1]) };
      }
      continue;
    }
  }
  return emps;
}

function assignCols(d, items, c) {
  for (const it of items) {
    const s = it.str;
    if (it.x < c.reg) { if (/^\d{3,4}$/.test(s)) d.codigo = s; else d.regTexto = (d.regTexto + ' ' + s).trim(); }
    else if (it.x < c.hc) {
      if (/\d{2}:\d{2}\s*[rmc]?/.test(s) && /\d{2}:\d{2}/.test(s)) d.registros = (d.registros + ' ' + s).trim();
      else d.regTexto = (d.regTexto + ' ' + s).trim();
    }
    else if (it.x < c.sal) { if (/^\d{1,4}:\d{2}$/.test(s)) d.hc = toMin(s); else if (/^[+-]\s*\d/.test(s)) d.saldo = toMin(s); else d.regTexto = (d.regTexto + ' ' + s).trim(); }
    else if (it.x < c.oc) { if (/^[+-]?\s*\d{1,4}:\d{2}$/.test(s)) d.saldo = toMin(s); else d.ocorrencia = (d.ocorrencia + ' ' + s).trim(); }
    else if (it.x < c.obs) d.ocorrencia = (d.ocorrencia + ' ' + s).trim();
    else d.obs = (d.obs + ' ' + s).trim();
  }
}

// ---------------- Análise ----------------
const AFAST_RE = /f[ée]rias|licen[çc]a|atestado|afastamento|abono|abonad|folga compensat|dispensa|nojo|gala|luto|casamento|doa[çc][ãa]o|paternidade|maternidade|INSS|acidente/i;

function capitalize(s) { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function analisar(emp) {
  const ano = emp.ano, mes = emp.mes;
  const nDias = new Date(ano, mes + 1, 0).getDate();
  const T = emp.totais || {};
  const diaria = T.diaria ?? 360;
  const semanal = T.semanal ?? diaria * 6;
  const nDiasSem = Math.max(1, Math.min(7, Math.round(semanal / diaria)));
  const diasContrat = nDiasSem >= 7 ? [0,1,2,3,4,5,6] : Array.from({ length: nDiasSem }, (_, i) => i + 1); // a partir de segunda
  const chPadrao = Object.values(emp.jornadas)[0]?.ch ?? null;

  const dias = [];
  for (let d = 1; d <= nDias; d++) {
    const p = emp.dias[d] || { dia: d, codigo: '', registros: '', regTexto: '', hc: null, saldo: null, ocorrencia: '', obs: '' };
    const dow = new Date(ano, mes, d).getDay();
    const txt = (p.regTexto + ' ' + p.ocorrencia);
    const feriado = /feriado/i.test(txt);
    const ehFimSemanaTxt = /^(s[áa]bado|domingo)$/i.test(p.regTexto.trim());
    let afast = null;
    if (!feriado) {
      if (p.regTexto && !ehFimSemanaTxt && !p.registros) afast = capitalize(p.regTexto);
      else if (!p.registros && AFAST_RE.test(p.ocorrencia)) afast = capitalize(p.ocorrencia);
    }
    if (afast && /^f[ée]rias$/i.test(afast)) afast = 'Férias';
    const contratual = diasContrat.includes(dow) && !feriado ? diaria : 0;
    const escalada = p.codigo ? (emp.jornadas[p.codigo]?.ch ?? chPadrao ?? 0) : 0;
    const hc = p.hc ?? 0;
    const credito = !p.codigo && hc > 0 && !p.registros ? hc : 0;
    dias.push({ ...p, dia: d, dow, data: new Date(ano, mes, d), feriado, afast, contratual, escalada, hc, credito,
                grupo: afast || 'Trabalho efetivo' });
  }

  // semanas de domingo a sábado
  const semanas = []; let s = null;
  for (const d of dias) {
    if (!s || d.dow === 0) { s = { n: semanas.length + 1, dias: [] }; semanas.push(s); }
    s.dias.push(d);
  }
  for (const w of semanas) {
    const sum = k => w.dias.reduce((a, d) => a + (d[k] || 0), 0);
    w.contratual = sum('contratual'); w.escalada = sum('escalada'); w.credito = sum('credito');
    w.hc = sum('hc'); w.saldoDiario = sum('saldo'); w.saldo = w.hc - w.contratual;
    const prev = w.escalada + w.credito;
    w.difEscala = prev - w.contratual;
    w.statusEscala = w.difEscala < 0 ? 'Deficitária' : w.difEscala > 0 ? 'Superavitária' : 'Adequada';
    w.statusExec = w.saldo < 0 ? 'Deficitária' : w.saldo > 0 ? 'Superavitária' : 'Adequada';
    const g = [...new Set(w.dias.filter(d => d.afast).map(d => d.afast))];
    w.afast = g;
    const ini = w.dias[0].dia, fim = w.dias[w.dias.length - 1].dia;
    w.periodo = `${String(ini).padStart(2, '0')} a ${String(fim).padStart(2, '0')}`;
  }

  const sum = k => dias.reduce((a, d) => a + (d[k] || 0), 0);
  const M = { contratual: sum('contratual'), escalada: sum('escalada'), hc: sum('hc'), saldoDiario: sum('saldo'), credito: sum('credito') };
  M.saldo = M.hc - M.contratual;
  M.difEscala = M.escalada - M.contratual;
  M.outros = M.saldo - (M.saldoDiario + M.difEscala + M.credito);
  M.creditoFeriado = dias.filter(d => d.credito && d.feriado).reduce((a, d) => a + d.credito, 0);
  M.creditoOutros = M.credito - M.creditoFeriado;

  // grupos: trabalho efetivo x afastamentos
  const grupos = {};
  for (const d of dias) {
    const g = grupos[d.grupo] ||= { nome: d.grupo, contratual: 0, hc: 0, escalada: 0, nDias: 0, nContrat: 0, nEscala: 0, dias: [] };
    g.contratual += d.contratual; g.hc += d.hc; g.escalada += d.escalada; g.dias.push(d.dia);
    if (d.contratual) g.nContrat++; if (d.escalada) g.nEscala++;
  }
  Object.values(grupos).forEach(g => { g.saldo = g.hc - g.contratual; });

  // conferência com os totais do relatório
  const conf = [];
  if (T.contratual != null) conf.push({ item: 'CH Contratual Mês', calc: M.contratual, rel: T.contratual });
  if (T.escalada != null) conf.push({ item: 'CH Escalada Mês', calc: M.escalada, rel: T.escalada });
  if (T.executada != null) conf.push({ item: 'CH Executada', calc: M.hc, rel: T.executada });
  if (T.diferenca != null) conf.push({ item: 'Saldo do mês', calc: M.saldo, rel: T.diferenca });
  conf.forEach(c => c.ok = c.calc === c.rel);

  return { emp, dias, semanas, M, grupos: Object.values(grupos), conf, diaria, semanal, diasContrat };
}

export { MESES };
