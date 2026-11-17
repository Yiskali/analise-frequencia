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
    if (/^V[íi]nculo:/.test(first)) { cur.vinculo = t.replace(/^.*?V[íi]nculo:\s*/, '').trim(); continue; }
    if (first === 'Jornada Padrão' || first === 'Horário Padrão') {
      const r = restText(l); const mv = r.match(/V[íi]nculo:\s*(.*)$/);
      if (mv) cur.vinculo = mv[1].trim(); cur.jornadaPadrao = r.replace(/-?\s*V[íi]nculo:.*$/, '').trim(); continue;
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
    if (/Homologado com ressalva/i.test(t)) { mode = 'ressalvas'; continue; }
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
        const desc = l.items[1] ? l.items[1].str : '';
        const hr = desc.match(/(\d{2}):(\d{2})\s*(?:[àa]s|-)\s*(\d{2}):(\d{2})/i);
        const ini = hr ? +hr[1] * 60 + +hr[2] : null, fim = hr ? +hr[3] * 60 + +hr[4] : null;
        cur.jornadas[first] = { codigo: first, descricao: desc, ch: toMin(times[0]), intervalo: toMin(times[times.length - 1]),
          intervaloFora: l.items.some(i => /fora da jornada/i.test(i.str)), sobreaviso: /sobreaviso/i.test(desc),
          inicio: ini, duracao: hr ? ((fim - ini + 1440) % 1440 || 1440) : null };
      }
      continue;
    }

    if (mode === 'ressalvas') {
      const md = t.match(/^(\d{2}\/\d{2}\/\d{4})\s*(\S+)?\s*\*?\s*(.*)$/);
      if (md) (cur.ressalvas ||= []).push({ data: md[1], texto: md[3].replace(/^\*\s*/, '').trim() });
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
// Ocorrências cujo tempo vai para pagamento: não são inconsistências.
const PAGAMENTO = [
  { re: /extensao de jornada remunerada/, label: 'Extensão de jornada remunerada', modo: 'excedente' },
  { re: /jornada extraordinaria remunerada/, label: 'Jornada extraordinária remunerada', modo: 'total' },
  { re: /sobreaviso/, label: 'Plantão de sobreaviso', modo: 'total' }
];
const AFAST_RE = /licen[çc]a|atestado|afastamento|abono|abonad|folga compensat|dispensa|nojo|gala|luto|casamento|doa[çc][ãa]o|paternidade|maternidade|INSS|acidente/i;
const DESCANSO_RE = /sem jornada|\bdsr\b|folga|descanso/;
const TOL_HC = 10;      // tolerância (min) ao comparar horas consideradas com os registros
const DUP_MIN = 5;      // registros com até 5 min de diferença = duplicidade
const MARGEM = 240;     // janela de busca dos registros: 4h antes/depois da jornada

function capitalize(s) { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }
const hhmm = t => { const m = ((t % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dataCurta = (dia, mes) => String(dia).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0');

// minutos entre 22:00 e 05:00 dentro de [a, b] (minutos absolutos)
function minutosNoturnos(a, b) {
  let tot = 0;
  for (let d = Math.floor(a / 1440) - 1; d <= Math.floor(b / 1440); d++) {
    const ini = d * 1440 + 22 * 60, fim = d * 1440 + 29 * 60;
    tot += Math.max(0, Math.min(b, fim) - Math.max(a, ini));
  }
  return tot;
}

export function analisar(emp) {
  const ano = emp.ano, mes = emp.mes;
  const nDias = new Date(ano, mes + 1, 0).getDate();
  const T = emp.totais || {};
  const diaria = T.diaria ?? 360;
  const semanal = T.semanal ?? diaria * 6;
  const nDiasSem = Math.max(1, Math.min(7, Math.round(semanal / diaria)));
  const diasContrat = nDiasSem >= 7 ? [0,1,2,3,4,5,6] : Array.from({ length: nDiasSem }, (_, i) => i + 1);
  const jorn = c => emp.jornadas[c] || null;
  const chPadrao = Object.values(emp.jornadas).find(j => !j.sobreaviso)?.ch ?? null;

  const dias = [];
  for (let d = 1; d <= nDias; d++) {
    const p = emp.dias[d] || { dia: d, codigo: '', registros: '', regTexto: '', hc: null, saldo: null, ocorrencia: '', obs: '' };
    const dow = new Date(ano, mes, d).getDay();
    const txt = norm(p.regTexto + ' ' + p.ocorrencia);
    const J = jorn(p.codigo);
    let pagamento = null;
    for (const r of PAGAMENTO) if (r.re.test(txt)) { pagamento = r; break; }
    if (!pagamento && J && J.sobreaviso) pagamento = PAGAMENTO[2];
    const feriado = /feriado/.test(txt);
    const ferias = /ferias/.test(txt);
    const descanso = !ferias && DESCANSO_RE.test(txt);
    const ehFimSemanaTxt = /^(s[áa]bado|domingo)$/i.test(p.regTexto.trim());
    let afast = null;
    if (ferias) afast = 'Férias';
    else if (!feriado && !pagamento && !descanso && !p.registros) {
      if (p.regTexto && !ehFimSemanaTxt) afast = capitalize(p.regTexto);
      else if (AFAST_RE.test(p.ocorrencia)) afast = capitalize(p.ocorrencia);
    }
    const contratual = diasContrat.includes(dow) && !feriado ? diaria : 0;
    const escalada = p.codigo ? (J?.ch ?? chPadrao ?? 0) : 0;
    const hc = p.hc ?? 0;
    const credito = !p.codigo && hc > 0 && !p.registros ? hc : 0;
    let grupo = 'trabalho';
    if (afast) grupo = 'afast:' + afast;
    else if (pagamento) grupo = 'pag:' + pagamento.label;
    else if (feriado && !p.registros) grupo = 'feriado';
    dias.push({ ...p, dia: d, dow, data: new Date(ano, mes, d), feriado, afast, descanso, pagamento: pagamento ? pagamento.label : null,
                pagModo: pagamento ? pagamento.modo : null, sobreaviso: !!(J && J.sobreaviso),
                contratual, escalada, hc, credito, grupo, issues: [] });
  }

  // ---------- registros de ponto x jornada ----------
  const issues = [];
  const addIssue = (d, o) => { const it = { dia: d.dia, data: dataCurta(d.dia, mes), ...o }; issues.push(it); d.issues.push(it); };
  const punches = [];
  dias.forEach(d => {
    const re = /(\d{2}):(\d{2})\s*([rmc])?/gi; let m;
    while ((m = re.exec(d.registros))) {
      const tipo = (m[3] || '').toLowerCase();
      if (tipo !== 'c') punches.push({ t: (d.dia - 1) * 1440 + +m[1] * 60 + +m[2], tipo, dia: d.dia, used: false });
    }
  });
  punches.sort((a, b) => a.t - b.t);
  const turnos = dias.filter(d => d.codigo && jorn(d.codigo)?.inicio != null).map(d => {
    const J = jorn(d.codigo); const s = (d.dia - 1) * 1440 + J.inicio;
    return { d, J, s, e: s + J.duracao };
  });
  for (const tr of turnos) {
    const { d, J, s, e } = tr;
    const take = punches.filter(p => !p.used && p.t >= s - MARGEM && p.t <= e + MARGEM);
    take.forEach(p => p.used = true);
    if (d.afast || (d.feriado && !take.length)) continue;
    const reg = [], dups = [];
    take.forEach(p => { const ult = reg[reg.length - 1]; if (ult && p.t - ult.t <= DUP_MIN) dups.push([ult, p]); else reg.push(p); });
    const fmtP = p => hhmm(p.t) + (p.dia !== d.dia ? ' (' + dataCurta(p.dia, mes) + ')' : '');
    d.turno = reg.map(p => hhmm(p.t));
    if (dups.length) addIssue(d, { nivel: 'verificar', tipo: 'duplicidade',
      titulo: 'Registros em duplicidade',
      texto: dups.map(([a, b]) => `${fmtP(a)} e ${fmtP(b)}`).join('; ') + '. Registros repetidos podem levar o sistema a combinar entradas e saídas erradas.' });
    if (d.pagamento || d.sobreaviso) continue;
    const n = reg.length;
    if (n === 0) {
      if (!d.hc && !d.ocorrencia) addIssue(d, { nivel: 'verificar', tipo: 'sem-registro', titulo: 'Dia escalado sem registro', texto: 'Não há registro de ponto nem ocorrência para este dia.' });
      continue;
    }
    if (n % 2 === 1) {
      addIssue(d, { nivel: 'ajustar', tipo: 'batida-impar', titulo: 'Batida ímpar',
        texto: `${n} ${n === 1 ? 'registro' : 'registros'} (${reg.map(fmtP).join(', ')}): falta uma entrada ou saída.` +
          (d.saldo != null && d.saldo < 0 ? ` O saldo negativo do dia (${fmt(d.saldo, true)}) vem dessa batida.` : d.saldo != null && d.saldo > 0 ? ` O saldo do dia (${fmt(d.saldo, true)}) não é confiável.` : '') +
          ' É preciso ajustar o registro de ponto.', impacto: null });
      continue;
    }
    let trab = 0, noturno = 0;
    for (let k = 0; k < n; k += 2) { trab += reg[k + 1].t - reg[k].t; noturno += minutosNoturnos(reg[k].t, reg[k + 1].t); }
    const calc = trab + Math.round(noturno / 7) - (J.intervaloFora ? (J.intervalo || 0) : 0);
    d.hcCalc = calc;
    if (d.hc && Math.abs(d.hc - calc) > TOL_HC && Math.abs(d.hc - J.ch) > TOL_HC) {
      const esperado = calc - J.ch;
      addIssue(d, { nivel: 'ajustar', tipo: 'hc-divergente', titulo: 'Horas consideradas incompatíveis com os registros',
        texto: `O relatório considerou ${fmt(d.hc)}, mas os registros (${reg.map(fmtP).join(' → ')}) somam ${fmt(calc)}${noturno ? ' com o adicional noturno' : ''}. ` +
          `O saldo do dia deveria ser ${fmt(esperado, true)}, não ${fmt(d.saldo ?? d.hc - J.ch, true)}.`,
        impacto: d.hc - calc });
    }
  }
  // registros que não pertencem a nenhuma jornada
  const soltos = punches.filter(p => !p.used && !(p.dia === 1 && p.t < 720));
  const porDia = {};
  soltos.forEach(p => { (porDia[p.dia] ||= []).push(p); });
  Object.entries(porDia).forEach(([dia, ps]) => {
    const d = dias[+dia - 1];
    if (d.pagamento || d.afast) return;
    addIssue(d, { nivel: 'verificar', tipo: 'fora-escala', titulo: 'Registro fora da jornada escalada',
      texto: `${ps.map(p => hhmm(p.t)).join(', ')} sem jornada correspondente. Verifique se houve trabalho fora da escala ou erro de registro.` });
  });

  // ---------- férias: escala x CH contratual do período ----------
  let bloco = null; const blocos = [];
  dias.forEach(d => { if (d.afast === 'Férias') { if (!bloco) { bloco = []; blocos.push(bloco); } bloco.push(d); } else bloco = null; });
  blocos.forEach(b => {
    const esc = b.reduce((a, d) => a + d.escalada, 0), con = b.reduce((a, d) => a + d.contratual, 0), dif = esc - con;
    if (!dif) return;
    const plantao12 = b.some(d => d.escalada >= 720);
    const periodo = `${dataCurta(b[0].dia, mes)} a ${dataCurta(b[b.length - 1].dia, mes)}`;
    const base = `Nas férias (${periodo}) a escala somou ${fmt(esc)} e a CH contratual do período é ${fmt(con)}: ${fmt(Math.abs(dif))} ${dif > 0 ? 'a mais' : 'a menos'}.`;
    if (plantao12 && Math.abs(dif) <= 720) addIssue(b[0], { nivel: 'verificar', tipo: 'ferias-escala', titulo: 'Escala nas férias diferente da CH contratual',
      texto: base + ' Na escala 12x36 a diferença é admitida, desde que não passe de 12h.', impacto: dif });
    else addIssue(b[0], { nivel: 'ajustar', tipo: 'ferias-escala', titulo: 'Escala nas férias diferente da CH contratual',
      texto: base + ' O gestor não pode escalar a mais nem a menos que a CH contratual no período de férias.', impacto: dif });
  });
  (emp.ressalvas || []).forEach(r => {
    const dia = parseInt(r.data, 10); const d = dias[dia - 1];
    if (d) addIssue(d, { nivel: 'info', tipo: 'ressalva', titulo: 'Homologado com ressalva', texto: r.texto ? `Ressalva registrada: “${r.texto}”.` : 'Dia homologado com ressalva.' });
  });
  const ordemNivel = { ajustar: 0, verificar: 1, info: 2 };
  issues.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel] || a.dia - b.dia);

  // ---------- semanas (domingo a sábado) ----------
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
    w.afast = [...new Set(w.dias.filter(d => d.afast).map(d => d.afast))];
    w.pagamentos = [...new Set(w.dias.filter(d => d.pagamento).map(d => d.pagamento))];
    w.issues = w.dias.reduce((a, d) => a + d.issues.filter(i => i.nivel !== 'info').length, 0);
    const ini = w.dias[0].dia, fim = w.dias[w.dias.length - 1].dia;
    w.periodo = `${String(ini).padStart(2, '0')} a ${String(fim).padStart(2, '0')}`;
  }

  // ---------- mês ----------
  const sum = (k, arr = dias) => arr.reduce((a, d) => a + (d[k] || 0), 0);
  const M = { contratual: sum('contratual'), escalada: sum('escalada'), hc: sum('hc'), saldoDiario: sum('saldo'), credito: sum('credito') };
  M.saldo = M.hc - M.contratual;
  M.difEscala = M.escalada - M.contratual;
  M.creditoFeriado = dias.filter(d => d.credito && d.feriado).reduce((a, d) => a + d.credito, 0);
  M.impactoInconsist = issues.filter(i => i.tipo === 'hc-divergente').reduce((a, i) => a + (i.impacto || 0), 0);
  M.saldoCorrigido = M.saldo - M.impactoInconsist;

  // ---------- de onde vem o saldo ----------
  const trabDias = dias.filter(d => d.grupo === 'trabalho');
  const partes = [];
  const sd = sum('saldo', trabDias), esc = sum('escalada', trabDias), con = sum('contratual', trabDias), hcT = sum('hc', trabDias);
  const outrosT = (hcT - con) - sd - (esc - con);
  partes.push({ id: 'ponto', tipo: 'trabalho', titulo: 'Ponto × escala', sub: 'soma do Saldo Diário', v: sd });
  partes.push({ id: 'escala', tipo: 'trabalho', titulo: esc - con < 0 ? 'Escala abaixo da contratual' : esc - con > 0 ? 'Escala acima da contratual' : 'Escala igual à contratual',
                sub: `${fmt(esc)} escaladas × ${fmt(con)}`, v: esc - con, esc, con });
  if (outrosT) partes.push({ id: 'outros-trab', tipo: 'trabalho', titulo: 'Outros créditos', sub: 'dias sem código de jornada', v: outrosT });
  const trabalho = { v: hcT - con, sd, esc, con, hc: hcT };
  const grupos = {};
  dias.filter(d => d.grupo !== 'trabalho').forEach(d => {
    const g = grupos[d.grupo] ||= { id: d.grupo, nome: d.grupo === 'feriado' ? 'Feriado' : d.grupo.replace(/^\w+:/, ''), tipo: d.grupo.split(':')[0], dias: [], contratual: 0, hc: 0, escalada: 0, nEscala: 0, nContrat: 0, modo: d.pagModo };
    g.dias.push(d.dia); g.contratual += d.contratual; g.hc += d.hc; g.escalada += d.escalada;
    if (d.escalada) g.nEscala++; if (d.contratual) g.nContrat++;
  });
  const listaDias = ds => ds.map(x => String(x).padStart(2, '0')).join(', ').replace(/, ([^,]*)$/, ' e $1') + '/' + String(mes + 1).padStart(2, '0');
  Object.values(grupos).forEach(g => {
    g.v = g.hc - g.contratual; g.lista = listaDias(g.dias);
    partes.push({ id: g.id, tipo: g.tipo, titulo: g.nome, sub: g.tipo === 'feriado' ? `${g.lista}, sem plantão` : g.tipo === 'pag' ? 'vai para pagamento' : `${fmt(g.hc)} creditadas × ${fmt(g.contratual)}`, v: g.v, g });
  });
  const resid = M.saldo - partes.reduce((a, p) => a + p.v, 0);
  if (resid) partes.push({ id: 'resid', tipo: 'outros', titulo: 'Outros ajustes', sub: 'diferenças do relatório', v: resid });

  // conferência com os totais do relatório
  const conf = [];
  if (T.contratual != null) conf.push({ item: 'CH Contratual Mês', calc: M.contratual, rel: T.contratual, essencial: true });
  if (T.escalada != null) conf.push({ item: 'CH Escalada Mês', calc: M.escalada, rel: T.escalada, essencial: false });
  if (T.executada != null) conf.push({ item: 'CH Executada', calc: M.hc, rel: T.executada, essencial: true });
  if (T.diferenca != null) conf.push({ item: 'Saldo do mês', calc: M.saldo, rel: T.diferenca, essencial: true });
  conf.forEach(c => c.ok = c.calc === c.rel);

  return { emp, dias, semanas, M, trabalho, partes, grupos: Object.values(grupos), issues, conf, diaria, semanal, diasContrat };
}

export { MESES };
