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

    if (!mRel) for (const it of l.items) {
      const mm = it.str.trim().match(/^([A-Za-zçÇ]+)\s*\/\s*(\d{4})$/);
      const ix = mm ? MESES.map(norm).indexOf(norm(mm[1])) : -1;
      if (ix >= 0) { mesAno = { mes: ix, ano: +mm[2] }; if (cur && cur.mes == null) { cur.mes = ix; cur.ano = +mm[2]; } break; }
    }

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

// ---------------- Espelho de Ponto (Not. Judicial) ----------------
export function ehEspelho(pages) {
  return pages.some(items => items.some(i => /Espelho de Ponto/i.test(i.str)));
}

export function parseEspelho(pages) {
  const lines = buildLines(pages);
  const emps = [];
  let cur = null, cols = null, mode = null, mesAno = null, totHeader = false;
  const DIA_RE = /^(\d{1,2})\s*(DOM|SEG|TER|QUA|QUI|SEX|S[ÁA]B)\b/i;

  for (const l of lines) {
    const first = l.items[0].str, t = l.text;
    const mp = t.match(/Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (mp) mesAno = { mes: +mp[2] - 1, ano: +mp[3] };
    if (first === 'Empregado') {
      const txt = restText(l); const mm = txt.match(/^(.*?)\s*-\s*(\d+)\s*$/);
      const nome = mm ? mm[1].trim() : txt, matricula = mm ? mm[2] : '';
      if (!cur || cur.matricula !== matricula || (mesAno && (cur.mes !== mesAno.mes || cur.ano !== mesAno.ano))) {
        cur = { tipo: 'espelho', nome, matricula, cargo: '', unidade: '', lotacao: '', jornadaPadrao: '', vinculo: '', homologada: '',
                mes: mesAno ? mesAno.mes : null, ano: mesAno ? mesAno.ano : null, dias: {}, totais: null, totaisEspelho: null, jornadas: {}, obsMes: {}, ressalvas: [] };
        emps.push(cur);
      }
      mode = null; continue;
    }
    if (!cur) continue;
    if (cur.mes == null && mesAno) { cur.mes = mesAno.mes; cur.ano = mesAno.ano; }
    if (first === 'Cargo Efetivo') { cur.cargo = restText(l); continue; }
    if (first === 'Unidade') {
      const r = restText(l); const ml = r.match(/-?\s*Lota[çc][ãa]o Exerc[ií]cio:\s*(.*)$/);
      cur.unidade = r.replace(/-?\s*Lota[çc][ãa]o Exerc[ií]cio:.*$/, '').trim(); if (ml) cur.lotacao = ml[1].trim(); continue;
    }
    if (first === 'Jornada Padrão' || first === 'Horário Padrão') {
      const r = restText(l); const mv = r.match(/V[íi]nculo:\s*(.*)$/); if (mv) cur.vinculo = mv[1].trim();
      cur.jornadaPadrao = r.replace(/-?\s*V[íi]nculo:.*$/, '').replace(/\s*-\s*$/, '').replace(/CH:\s*(\d+)/, '(CH: $1)').trim(); continue;
    }
    if (/HOMOLOGADA/i.test(t)) { cur.homologada = t.trim(); continue; }

    if (l.items.some(i => i.str === 'D. Sem.')) {
      const gx = re => (l.items.find(i => re.test(i.str)) || {}).x;
      cols = { cod: 55, reg: 95, ad: (gx(/^Ad\.Not/) ?? 240) - 8, jud: (gx(/^Judiciais/) ?? 310) - 8, sp: (gx(/^Sem Pgto/) ?? 362) - 8,
               ext: (gx(/^Extras/) ?? 438) - 12, fer: (gx(/^Feriado/) ?? 497) - 12, hc: (gx(/^Consideradas/) ?? 548) - 8,
               sal: (gx(/^Saldo/) ?? 622) - 14, oc: 660 };
      cols.reg = Math.min(cols.reg, 100);
      mode = 'dias'; continue;
    }
    if (first === 'TOTAL' && mode === 'dias' && cols) {
      const val = (a, b) => { const it = l.items.find(i => i.x >= a && i.x < b && /\d/.test(i.str)); return it ? toMin(it.str) : null; };
      cur.totaisEspelho = { adnot: val(cols.ad, cols.jud), extras: val(cols.ext, cols.fer), feriado: val(cols.fer, cols.hc), hc: val(cols.hc, cols.sal) };
      mode = null; continue;
    }
    if (mode === 'dias' && cols) {
      const md = first.match(DIA_RE);
      if (!md) {
        // continuação de ocorrência
        continue;
      }
      const d = { dia: +md[1], codigo: '', registros: '', regTexto: '', hc: null, saldo: null, ocorrencia: '', obs: '', extras: null, adnot: null, feriadoH: null, judic: null, semPgto: null };
      for (const it of l.items.slice(1)) {
        const s = it.str.trim(), x = it.x;
        if (x < cols.reg) { if (/^\d{3,4}$/.test(s)) d.codigo = s; }
        else if (x < cols.ad) { if (/\d{2}:\d{2}/.test(s)) d.registros = (d.registros + ' ' + s).trim(); else d.regTexto = (d.regTexto + ' ' + s).trim(); }
        else if (x < cols.jud) d.adnot = toMin(s);
        else if (x < cols.sp) d.judic = toMin(s);
        else if (x < cols.ext) d.semPgto = toMin(s);
        else if (x < cols.fer) d.extras = toMin(s);
        else if (x < cols.hc) d.feriadoH = toMin(s);
        else if (x < cols.sal) d.hc = toMin(s);
        else if (x < cols.oc) d.saldo = toMin(s);
        else d.ocorrencia = (d.ocorrencia + ' ' + s).trim();
      }
      cur.dias[d.dia] = d; continue;
    }
    if (l.items.some(i => /^CH Contratual$/.test(i.str)) && l.items.some(i => /^CH Executada$/.test(i.str))) { totHeader = true; mode = 'tot'; continue; }
    if (mode === 'tot' && totHeader && l.items.length >= 6 && l.items.every(i => /^[+-]?\s*\d{1,4}(:\d{2})?$/.test(i.str))) {
      const v = l.items.map(i => i.str);
      cur.totais = { escalada: null, contratual: toMin(v[0]), executada: toMin(v[1]), diferenca: toMin(v[2]), semanal: toMin(v[3]), diaria: toMin(v[4]),
                     diasUteis: parseInt(v[5], 10), feriados: +v[6] || 0, pontoFacultativo: +v[7] || 0, afastamentos: +v[8] || 0, ferias: +v[10] || 0 };
      totHeader = false; mode = null; continue;
    }
    if (/^Observa[çc][õo]es Do m[êe]s/i.test(t)) { mode = 'obs'; continue; }
    if (/Homologado com ressalva/i.test(t)) { mode = 'ressalvas'; continue; }
    if (/Detalhamento do Hor[áa]rio/.test(t)) { mode = 'jornadas'; continue; }
    if (/^OSM\b|Consultoria e Sistemas|^\d+ de \d+$|^Hor[áa]rios contratuais/.test(t) || first === 'EBSERH') continue;
    if (mode === 'obs') {
      const mo = t.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+\*+\s*(.*)$/);
      if (mo && +mo[2] - 1 === cur.mes) cur.obsMes[+mo[1]] = mo[4].trim();
      continue;
    }
    if (mode === 'ressalvas') {
      const mr = t.match(/^(\d{2}\/\d{2}\/\d{4})\s+\S+\s+\*?\s*(.*)$/);
      if (mr) cur.ressalvas.push({ data: mr[1], texto: mr[2].replace(/^\*\s*/, '').trim() });
      continue;
    }
    if (mode === 'jornadas' && /^\d{3,4}$/.test(first)) {
      const times = l.items.slice(1).filter(i => /^\d{1,2}:\d{2}$/.test(i.str)).map(i => i.str);
      const desc = l.items[1] ? l.items[1].str : '';
      const hr = desc.match(/(\d{2}):(\d{2})\s*(?:[àa]s|-)\s*(\d{2}):(\d{2})/i);
      const ini = hr ? +hr[1] * 60 + +hr[2] : null, fim = hr ? +hr[3] * 60 + +hr[4] : null;
      cur.jornadas[first] = { codigo: first, descricao: desc, ch: toMin(times[0]), intervalo: toMin(times[times.length - 1]),
        intervaloFora: l.items.some(i => /fora da jornada/i.test(i.str)), sobreaviso: /sobreaviso/i.test(desc),
        inicio: ini, duracao: hr ? ((fim - ini + 1440) % 1440 || 1440) : null };
    }
  }
  // ocorrência completa a partir das observações do mês
  emps.forEach(e => {
    Object.values(e.dias).forEach(d => {
      const o = e.obsMes[d.dia];
      if (o) {
        const limpa = o.replace(/^afastamento \(\d+\)\s*-\s*/i, '').replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}.*$/, '').replace(/\s*-\s*\(.*$/, '').replace(/\s*\(sem jornada:.*$/i, '').replace(/[.\s]+$/, '');
        d.ocorrencia = limpa || d.ocorrencia;
      } else d.ocorrencia = d.ocorrencia.replace(/^afastamento \(\d+\)\s*/i, '');
    });
  });
  return emps;
}

export function lerRelatorio(pages) {
  return ehEspelho(pages) ? parseEspelho(pages) : parseReport(pages);
}

// ---------------- Análise ----------------
// Checklist de Triagem e Tratamento (POP.DGP.127, Anexo III)
const CHECK = {
  A1: { ref: 'A1', prov: 'Orientar o empregado a solicitar a regularização pelo Portal do Empregado, com justificativa e aprovação do gestor. Se a frequência já estiver homologada, a solicitação deve ser feita por processo SEI à UAP, com anuência do gestor.', func: 'Frequência > Ponto Eletrônico > Registro de Frequência' },
  A2: { ref: 'A2', prov: 'Conferir o código de jornada e a compatibilidade com os horários trabalhados, inclusive jornadas consecutivas com interjornada inferior a 11h. Avaliar a correção do código ou a rejeição fundamentada de registro comprovadamente equivocado.', func: 'Frequência > Ponto Eletrônico > Registro de Frequência; Frequência > Horário > Cadastro Horário Excepcional' },
  A3: { ref: 'A3', prov: 'Conferir se as marcações causam batida ímpar ou erro de contabilização. Se a apuração estiver correta, não ajustar só por causa da quantidade de registros.', func: 'Não se aplica' },
  A4: { ref: 'A4', prov: 'Verificar duplicidade de marcação ou dobra de plantão. Se houver erro na contabilização, avaliar a rejeição da marcação e/ou a adequação do código de jornada.', func: 'Frequência > Ponto Eletrônico > Registro de Frequência; Frequência > Horário > Cadastro Horário Excepcional' },
  B1: { ref: 'B1', prov: 'Conferir se há código de jornada cadastrado para o dia e, quando cabível, registrar o código da jornada planejada.', func: 'Frequência > Horário > Cadastro Horário Excepcional' },
  B3: { ref: 'B3', prov: 'Orientar gestor e empregado a considerar o saldo na elaboração da escala seguinte e pactuar compensação quando cabível.', func: 'Não se aplica' },
  B4: { ref: 'B4', prov: 'O sistema só considera registros feitos até 3h antes do início e 3h depois do término da jornada cadastrada. Se necessário, ajustar o horário de trabalho ou o código de jornada.', func: 'Frequência > Horário > Cadastro Horário Excepcional' },
  B5: { ref: 'B4/B5', prov: 'Verificar registros fora da janela de 3h e a ocorrência de duas jornadas consecutivas. Avaliar a rejeição de registro e/ou a alteração da jornada cadastrada.', func: 'Frequência > Ponto Eletrônico > Registro de Frequência; Frequência > Horário > Cadastro Horário Excepcional' },
  C2: { ref: 'C2', prov: 'Inserir o código de jornada planejado para o dia e efetuar o recálculo do banco de horas.', func: 'Frequência > Horário > Cadastro Horário Excepcional; Frequência > Banco de Horas > Recalcular BH Homologado' },
  C3: { ref: 'C3', prov: 'Verificar se há código “sem jornada” ou “ausência com compensação” e, se for o caso, substituir pelo código da jornada a ser considerada.', func: 'Frequência > Horário > Cadastro Horário Excepcional' },
  F19: { ref: 'Falta', prov: 'A falta deve ser classificada pelo gestor como ausência com compensação ou falta injustificada, ou pela gestão de pessoas com registro de afastamento legal. Na homologação automática, a falta não classificada vira falta injustificada.', func: 'Portal do Empregado / Frequência' }
};

// Ocorrências cujo tempo vai para pagamento: não são inconsistências.
const PAGAMENTO = [
  { re: /extensao de jornada/, label: 'Extensão de jornada remunerada', modo: 'excedente' },
  { re: /jornada extraordinaria/, label: 'Jornada extraordinária remunerada', modo: 'total' },
  { re: /sobreaviso/, label: 'Plantão de sobreaviso', modo: 'total' }
];
const PAG_NOME = { 'Extensão de jornada remunerada': 'Extensão de jornada', 'Jornada extraordinária remunerada': 'Jornada extraordinária', 'Plantão de sobreaviso': 'Sobreaviso' };
const AFAST_RE = /licen[çc]a|atestado|afastamento|abono|abonad|folga compensat|dispensa|nojo|gala|luto|casamento|doa[çc][ãa]o|paternidade|maternidade|INSS|acidente/i;
const DESCANSO_RE = /sem jornada|\bdsr\b|folga|descanso/;
const TOL_HC = 10;      // tolerância (min) ao comparar horas consideradas com os registros
const DUP_MIN = 14;     // marcações consecutivas com intervalo inferior a 15 min (POP.DGP.127, A4)
const MARGEM = 180;     // o sistema só considera registros até 3h antes do início e 3h depois do término (B4)
const INTERJORNADA = 660; // 11h entre jornadas

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
      if (p.regTexto && !ehFimSemanaTxt) afast = /^afastamento$/i.test(p.regTexto.trim()) && p.ocorrencia ? capitalize(p.ocorrencia.replace(/^afastamento por\s*/i, '').replace(/\s*-\s*at[eé].*$/i, '')) : capitalize(p.regTexto);
      else if (AFAST_RE.test(p.ocorrencia)) afast = capitalize(p.ocorrencia);
    }
    const contratual = diasContrat.includes(dow) && !feriado ? diaria : 0;
    const escalada = p.codigo ? (J?.ch ?? chPadrao ?? 0) : 0;
    const hc = p.hc ?? 0;
    const credito = !p.codigo && hc > 0 && !p.registros ? hc : 0;
    let grupo = 'trabalho';
    if (/\bfalta\b/.test(norm(p.ocorrencia)) && !p.registros.replace(/\d{2}:\d{2}\s*c/gi, '').match(/\d{2}:\d{2}/)) grupo = 'falta';
    if (afast) grupo = 'afast:' + afast;
    else if (pagamento) grupo = 'pag:' + pagamento.label;
    else if (feriado && !p.registros) grupo = 'feriado';
    dias.push({ ...p, dia: d, dow, data: new Date(ano, mes, d), feriado, afast, descanso, pagamento: pagamento ? pagamento.label : null,
                pagModo: pagamento ? pagamento.modo : null, sobreaviso: !!(J && J.sobreaviso),
                contratual, escalada, hc, credito, grupo, issues: [] });
  }

  // ---------- registros de ponto x jornada ----------
  // Cada ponto de atenção traz: título simples, o que aconteceu, uma demonstração (visual) e o que fazer.
  const DOWC = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dLonga = d => DOWC[d.dow] + ', ' + dataCurta(d.dia, mes);
  const issues = [];
  const addIssue = (d, o) => {
    const c = o.check ? CHECK[o.check] : null;
    const it = { dia: d.dia, data: o.mes ? 'Mês todo' : dLonga(d), ref: c?.ref, providencia: c?.prov,
                 onde: c && c.func !== 'Não se aplica' ? c.func.split(';')[0].trim().replace(/ > /g, ' › ') : null, ...o };
    issues.push(it); if (!o.mes) d.issues.push(it);
  };
  const hm = m => { const a = Math.abs(Math.round(m)); const h = Math.floor(a / 60), mi = a % 60; return h + 'h' + (mi ? String(mi).padStart(2, '0') : ''); };
  const conta = (linhas) => ({ tipo: 'conta', linhas });
  const L = (l, v, t) => ({ l, v, t: t || '' });
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
  const quando = (p, d) => (p.dia !== d.dia ? DOWC[dias[p.dia - 1].dow].toLowerCase() + ' ' + String(p.dia).padStart(2, '0') + ' · ' : '') + hhmm(p.t);
  for (const tr of turnos) {
    const { d, J, s, e } = tr;
    const take = punches.filter(p => !p.used && p.t >= s - MARGEM && p.t <= e + MARGEM);
    take.forEach(p => p.used = true);
    tr.take = take;
    if (d.afast || (d.feriado && !take.length)) continue;
    const reg = [], dups = [];
    take.forEach(p => { const ult = reg[reg.length - 1]; if (ult && p.t - ult.t <= DUP_MIN) dups.push([ult, p]); else reg.push(p); });
    const fmtP = p => hhmm(p.t) + (p.dia !== d.dia ? ' (' + dataCurta(p.dia, mes) + ')' : '');
    d.turno = reg.map(p => hhmm(p.t));
    d.turnoDias = reg.map(p => p.dia);
    d.turnoReg = reg; d.turnoIni = s; d.turnoFim = e;
    if (dups.length) {
      const itens = [];
      take.forEach(p => { const rep = dups.some(([, b]) => b === p); itens.push({ h: fmtP(p), t: rep ? 'repetida' : '', estado: rep ? 'erro' : 'ok' }); });
      const difs = [...new Set(dups.map(([a, b]) => b.t - a.t))];
      addIssue(d, { nivel: 'verificar', tipo: 'duplicidade', check: 'A4',
        titulo: `Batidas repetidas, com ${difs.length === 1 ? difs[0] + ' ' + (difs[0] === 1 ? 'minuto' : 'minutos') : 'poucos minutos'} de diferença`,
        aconteceu: 'O ponto foi batido duas vezes seguidas. Batidas repetidas podem confundir o sistema na hora de juntar entrada e saída.',
        visual: { tipo: 'batidas', itens },
        fazer: 'Confirmar com a empregada se é batida repetida ou dobra de plantão. Se for repetida, rejeitar a marcação com justificativa.' });
    }
    if (take.length > 4 && !dups.length) addIssue(d, { nivel: 'info', tipo: 'excesso', check: 'A3',
      titulo: `${take.length} batidas no mesmo plantão`,
      aconteceu: 'Houve várias entradas e saídas na mesma jornada.',
      visual: { tipo: 'batidas', itens: take.map(p => ({ h: fmtP(p), t: '', estado: 'neutro' })) },
      fazer: 'Se a conta do dia estiver certa, não precisa ajustar só pela quantidade de batidas.' });
    if (d.pagamento || d.sobreaviso) continue;
    if (/\bfalta\b/.test(norm(d.ocorrencia))) continue;
    if (emp.tipo === 'espelho' && d.feriado) continue;
    const n = reg.length;
    if (n === 0) {
      if (!d.hc && !d.ocorrencia) addIssue(d, { nivel: 'verificar', tipo: 'sem-registro',
        titulo: 'Plantão sem nenhuma batida e sem ocorrência',
        aconteceu: 'Havia plantão na escala, mas não há registro de ponto nem justificativa.',
        visual: conta([L('Escalado', fmt(J.ch)), L('Registros', 'nenhum'), L('Ocorrência', 'nenhuma', 'sub')]),
        fazer: 'Verificar se houve ausência (tratar como falta ou afastamento) ou se a pessoa trabalhou e não registrou.' });
      continue;
    }
    if (n % 2 === 1) {
      const itens = reg.map((p, k) => ({ h: quando(p, d), t: k % 2 === 0 ? 'entrada' : 'saída', estado: 'ok' }));
      itens.push({ h: '— : —', t: n % 2 === 1 ? 'saída não registrada' : 'entrada não registrada', estado: 'erro' });
      addIssue(d, { nivel: 'ajustar', tipo: 'batida-impar', check: 'A1',
        titulo: 'Falta uma batida: entrada sem saída',
        aconteceu: `Há ${n} ${n === 1 ? 'batida' : 'batidas'} no plantão. Sem o par, o sistema não fecha a conta do dia` +
          (d.saldo != null && d.saldo < 0 ? ` e o saldo do dia fica ${fmt(d.saldo, true).replace(/\s/g, '')}.` : d.saldo != null ? ` e o saldo do dia (${fmt(d.saldo, true).replace(/\s/g, '')}) não é confiável.` : '.'),
        visual: { tipo: 'batidas', itens },
        fazer: 'Orientar a empregada a pedir a regularização no Portal do Empregado, com aprovação do gestor. Se a frequência já foi homologada: processo SEI à UAP.' });
      continue;
    }
    let trab = 0, noturno = 0;
    for (let k = 0; k < n; k += 2) { trab += reg[k + 1].t - reg[k].t; noturno += minutosNoturnos(reg[k].t, reg[k + 1].t); }
    const ficta = Math.round(noturno / 7), intv = J.intervaloFora ? (J.intervalo || 0) : 0;
    const calc = trab + ficta - intv;
    d.hcCalc = calc;
    if (d.hc && Math.abs(d.hc - calc) > TOL_HC && Math.abs(d.hc - J.ch) > TOL_HC) {
      const partesTxt = [hm(trab) + ' trabalhadas'];
      if (ficta) partesTxt.push(hm(ficta) + ' de hora noturna');
      if (intv) partesTxt.push('− ' + hm(intv) + ' de intervalo');
      addIssue(d, { nivel: 'ajustar', tipo: 'hc-divergente', check: 'B5',
        titulo: `O sistema contou ${hm(d.hc)} num plantão de ${hm(J.ch)}`,
        aconteceu: `Pelos registros, foram cerca de ${hm(calc)}. O relatório considerou ${hm(d.hc)}.` +
          (dups.length ? ' Provável causa: as batidas repetidas fizeram o sistema juntar este plantão com outro.' : ''),
        visual: { tipo: 'plantao', ent: quando(reg[0], d), sai: quando(reg[n - 1], d), conta: partesTxt.join(' + ').replace('+ −', '−') + ' = ' + hm(calc),
                  barras: [{ l: 'Pelos registros', v: fmt(calc), pct: Math.min(100, calc / Math.max(calc, d.hc) * 100), erro: false },
                           { l: 'No relatório', v: fmt(d.hc), pct: Math.min(100, d.hc / Math.max(calc, d.hc) * 100), erro: true }] },
        fazer: 'Conferir as batidas fora da janela de 3h ou duas jornadas seguidas. Rejeitar o registro errado ou ajustar a jornada.',
        impacto: d.hc - calc, esperado: calc - J.ch });
    }
  }
  // interjornada inferior a 11h entre jornadas planejadas
  const jornadasReais = turnos.filter(t => !t.d.sobreaviso && !t.d.afast);
  for (let k = 1; k < jornadasReais.length; k++) {
    const a = jornadasReais[k - 1], b = jornadasReais[k], gap = b.s - a.e;
    if (gap >= 0 && gap < INTERJORNADA) {
      const dA = DOWC[a.d.dow].toLowerCase(), fimA = Math.floor(a.e / 1440) + 1;
      addIssue(b.d, { nivel: 'verificar', tipo: 'interjornada', check: 'A2',
        titulo: `Só ${hm(gap)} de descanso entre dois plantões (o mínimo é 11h)`,
        aconteceu: `O plantão de ${dA} ${dataCurta(a.d.dia, mes)} terminou às ${hhmm(a.e)}${fimA !== a.d.dia ? ' do dia ' + dataCurta(fimA, mes) : ''}. O seguinte começou às ${hhmm(b.s)}${Math.floor(b.s / 1440) + 1 !== fimA ? ' do dia ' + dataCurta(b.d.dia, mes) : ' do mesmo dia'}.`,
        visual: { tipo: 'faixa', segs: [{ t: 'Plantão ' + hm(a.J.duracao), f: a.J.duracao, kind: 'plantao' }, ...(gap ? [{ t: 'Descanso ' + hm(gap), f: gap, kind: 'descanso' }] : []), { t: 'Plantão ' + hm(b.J.duracao), f: b.J.duracao, kind: 'plantao' }],
                  nota: `Descanso: ${hm(gap)} · mínimo exigido: 11h · faltaram ${hm(INTERJORNADA - gap)}` },
        fazer: 'Conferir se a escala está certa. Se foi trabalhado assim, comunicar ao gestor: corrigir o ponto não regulariza a jornada.' });
    }
  }
  // registros que não pertencem a nenhuma jornada
  const soltos = punches.filter(p => !p.used && !(p.dia === 1 && p.t < 720));
  const porDia = {};
  soltos.forEach(p => { (porDia[p.dia] ||= []).push(p); });
  Object.entries(porDia).forEach(([dia, ps]) => {
    const d = dias[+dia - 1];
    if (d.pagamento || d.afast) return;
    const perto = turnos.find(t => ps.some(p => p.t >= t.s - 360 && p.t <= t.e + 360));
    const hs = ps.map(p => hhmm(p.t)).join(', ');
    if (perto) {
      const ini = perto.s - MARGEM, fim = perto.e + MARGEM, antes = ps[0].t < perto.s;
      addIssue(d, { nivel: 'verificar', tipo: 'fora-escala', check: 'B4',
        titulo: `${ps.length > 1 ? 'Batidas' : 'Batida'} às ${hs} não ${ps.length > 1 ? 'foram contadas' : 'foi contada'}`,
        aconteceu: 'O sistema só considera batidas até 3h antes do início e 3h depois do fim da jornada.',
        visual: { tipo: 'faixa', segs: antes
            ? [{ t: hs + ' fora', f: 120, kind: 'fora' }, { t: 'janela ' + hhmm(ini), f: MARGEM, kind: 'janela' }, { t: 'Plantão ' + hhmm(perto.s) + ' às ' + hhmm(perto.e), f: perto.J.duracao, kind: 'plantao' }, { t: 'até ' + hhmm(fim), f: MARGEM, kind: 'janela' }]
            : [{ t: 'desde ' + hhmm(ini), f: MARGEM, kind: 'janela' }, { t: 'Plantão ' + hhmm(perto.s) + ' às ' + hhmm(perto.e), f: perto.J.duracao, kind: 'plantao' }, { t: 'janela ' + hhmm(fim), f: MARGEM, kind: 'janela' }, { t: hs + ' fora', f: 120, kind: 'fora' }],
          nota: `Batida às ${hs} · janela aceita: ${hhmm(ini)} às ${hhmm(fim)}` },
        fazer: 'Se a pessoa trabalhou nesse horário, ajustar o horário de trabalho ou o código de jornada do dia.' });
    } else {
      addIssue(d, { nivel: 'verificar', tipo: 'fora-escala', check: 'B1',
        titulo: 'Batidas em dia sem jornada cadastrada',
        aconteceu: 'Há registros de ponto, mas nenhum código de jornada no dia. Essas horas não são contadas.',
        visual: conta([L('Registros', hs), L('Código de jornada', 'nenhum'), L('Horas contadas', '00:00', 'total')]),
        fazer: 'Conferir se havia jornada prevista e cadastrar o código correspondente.' });
    }
  });

  // ---------- férias: escala x CH contratual do período ----------
  let bloco = null; const blocos = [];
  dias.forEach(d => { if (d.afast === 'Férias') { if (!bloco) { bloco = []; blocos.push(bloco); } bloco.push(d); } else bloco = null; });
  blocos.forEach(b => {
    const esc = b.reduce((a, d) => a + d.escalada, 0), con = b.reduce((a, d) => a + d.contratual, 0), dif = esc - con;
    if (!dif) return;
    const plantao12 = b.some(d => d.escalada >= 720);
    const nEsc = b.filter(d => d.escalada).length, nCon = b.filter(d => d.contratual).length;
    const chEsc = nEsc ? Math.round(esc / nEsc) : 0;
    const vis = conta([L(`Escalado nas férias: ${nEsc} ${nEsc === 1 ? 'dia' : 'dias'} × ${hm(chEsc)}`, fmt(esc)), L(`Contrato do período: ${nCon} dias × ${hm(diaria)}`, fmt(con), 'sub'),
                       L(plantao12 && Math.abs(dif) <= 720 ? 'Diferença (limite: 12h)' : 'Diferença', fmt(dif, true).replace(/\s/g, ''), 'total')]);
    const ok12 = plantao12 && Math.abs(dif) <= 720;
    addIssue(b[0], { nivel: ok12 ? 'verificar' : 'ajustar', tipo: 'ferias-escala', impacto: dif, data: `${dataCurta(b[0].dia, mes)} a ${dataCurta(b[b.length - 1].dia, mes)}`,
      titulo: `Escala nas férias ${hm(Math.abs(dif))} ${dif > 0 ? 'acima' : 'abaixo'} do contrato`,
      aconteceu: ok12 ? 'Na 12x36 a diferença nas férias é admitida, desde que não passe de 12h.' : `No período de férias, o gestor escalou ${dif > 0 ? 'mais' : 'menos'} horas do que o contrato prevê. Isso não é permitido.`,
      visual: vis,
      fazer: ok12 ? 'Conferir se a diferença está dentro do limite. Se estiver, não precisa ajustar.' : 'Pedir ao gestor que ajuste a escala do período de férias para igualar a CH contratual.',
      refTxt: ok12 ? 'Regra interna da 12x36' : 'Regra interna: fora da 12x36, a diferença deve ser zero' });
  });

  // ---------- afastamentos, faltas e escala do mês ----------
  dias.forEach(d => {
    if (d.afast && d.afast !== 'Férias' && d.contratual && !d.codigo && !d.hc && !d.descanso)
      addIssue(d, { nivel: 'verificar', tipo: 'afast-sem-codigo', check: 'C2',
        titulo: `${d.afast} em dia sem jornada cadastrada`,
        aconteceu: 'O afastamento foi lançado, mas o dia não tem código de jornada. As horas podem não ser abonadas.',
        visual: conta([L('Afastamento', d.afast), L('Código de jornada', 'nenhum'), L('Horas abonadas', '00:00', 'total')]),
        fazer: 'Inserir o código de jornada planejado para o dia e recalcular o banco de horas.' });
    if (d.afast && d.contratual && /sem jornada|ausencia com compensacao/.test(norm(d.regTexto + ' ' + d.ocorrencia)) && !d.hc)
      addIssue(d, { nivel: 'verificar', tipo: 'afast-codigo', check: 'C3',
        titulo: `${d.afast} lançado junto com “sem jornada”`,
        aconteceu: 'O dia tem afastamento, mas o código é “sem jornada” ou “ausência com compensação”. O afastamento pode não ser contado.',
        visual: conta([L('Afastamento', d.afast), L('Código no dia', /compensacao/.test(norm(d.regTexto + ' ' + d.ocorrencia)) ? 'Ausência com compensação' : 'Sem jornada', 'erro'), L('Horas abonadas', '00:00', 'total')]),
        fazer: 'Substituir o código pelo da jornada que deveria ser considerada.' });
    const oc = norm(d.ocorrencia + ' ' + d.regTexto);
    if (/\bfalta\b/.test(oc) && !/injustificada/.test(oc))
      addIssue(d, { nivel: 'ajustar', tipo: 'falta', check: 'F19',
        titulo: 'Ausência no plantão sem justificativa tratada',
        aconteceu: 'Havia jornada prevista e o dia está como “falta”, sem classificação.',
        visual: conta([L('Escalado', d.escalada ? fmt(d.escalada) : '—'), L('Registros', d.registros ? d.registros.replace(/[rmc]/g, '') : 'nenhum'), L('Saldo do dia', d.saldo != null ? fmt(d.saldo, true).replace(/\s/g, '') : '—', 'total')]),
        fazer: 'O gestor classifica como ausência com compensação ou falta injustificada, ou a GP registra afastamento legal. Na homologação automática, vira falta injustificada.' });
    else if (/falta injustificada/.test(oc))
      addIssue(d, { nivel: 'info', tipo: 'falta-inj',
        titulo: 'Falta classificada como injustificada',
        aconteceu: 'O gestor classificou a ausência como falta injustificada.',
        visual: conta([L('Escalado', d.escalada ? fmt(d.escalada) : '—'), L('Saldo do dia', d.saldo != null ? fmt(d.saldo, true).replace(/\s/g, '') : '—', 'total')]),
        fazer: 'Nenhum ajuste na frequência. A falta tem reflexo na folha de pagamento e nas férias.' });
  });
  {
    const diasJ = dias.filter(d => d.escalada && !d.sobreaviso);
    const escJ = diasJ.reduce((a, d) => a + d.escalada, 0);
    const conM = dias.reduce((a, d) => a + d.contratual, 0);
    const nUteis = dias.filter(d => d.contratual).length;
    const dif = escJ - conM;
    if (dif && dias.length) {
      const porCod = {};
      diasJ.forEach(d => { const J = jorn(d.codigo); const k = d.codigo; (porCod[k] ||= { n: 0, ch: d.escalada, J, ferias: 0 }); porCod[k].n++; if (d.afast === 'Férias') porCod[k].ferias++; });
      const nomeJ = (J) => {
        if (!J || J.inicio == null) return ['jornada', 'jornadas'];
        const fim = (J.inicio + J.duracao) % 1440;
        return J.duracao >= 600 ? (J.inicio >= 17 * 60 || fim < J.inicio ? ['plantão noturno', 'plantões noturnos'] : ['plantão diurno', 'plantões diurnos']) : J.inicio < 12 * 60 ? ['manhã', 'manhãs'] : J.inicio < 18 * 60 ? ['tarde', 'tardes'] : ['noite', 'noites'];
      };
      const linhas = Object.values(porCod).sort((a, b) => b.ch - a.ch).map(p => L(`${p.n} ${nomeJ(p.J)[p.n === 1 ? 0 : 1]} × ${hm(p.ch)}${p.ferias ? ` (${p.ferias} em férias)` : ''}`, fmt(p.n * p.ch)));
      linhas.push(L('Escalado no mês', fmt(escJ), 'sub'), L(`Contrato: ${nUteis} dias × ${hm(diaria)}`, '− ' + fmt(conM)), L(dif > 0 ? 'Escala a mais' : 'Escala a menos', fmt(dif, true).replace(/\s/g, ''), 'total'));
      addIssue(dias[0], { nivel: 'verificar', tipo: 'escala-mes', check: 'B3', mes: true,
        titulo: `A escala teve ${hm(Math.abs(dif))} a ${dif > 0 ? 'mais' : 'menos'} do que o contrato`,
        aconteceu: `Somando os plantões do mês, o gestor escalou ${dif > 0 ? 'mais' : 'menos'} horas do que o contrato pede${dias.some(d => d.sobreaviso) ? '. O sobreaviso não entra nessa conta' : ''}.`,
        visual: conta(linhas),
        fazer: 'Avisar o gestor e a empregada: considerar essa diferença na próxima escala ou combinar a compensação.' });
    }
  }
  (emp.ressalvas || []).forEach(r => {
    const dia = parseInt(r.data, 10); const d = dias[dia - 1];
    if (d) addIssue(d, { nivel: 'info', tipo: 'ressalva',
      titulo: 'O gestor deixou uma ressalva no dia',
      aconteceu: 'A frequência foi homologada com ressalva, que aparece no rodapé do relatório.',
      visual: conta([L('Ressalva', r.texto ? '“' + r.texto + '”' : '—')]),
      fazer: 'Ler a ressalva antes de concluir a análise do dia.' });
  });
  // ---------- validação dia a dia: como está × como deveria ser ----------
  const TOL_DIA = 2;
  const fmtT = (t, d) => { const dia = Math.floor(t / 1440) + 1; return (dia !== d.dia ? DOWC[new Date(ano, mes, dia).getDay()] + ' ' + String(dia).padStart(2, '0') + ' · ' : '') + hhmm(t); };
  dias.forEach(d => {
    const J = jorn(d.codigo);
    const v = { escala: J && J.inicio != null ? (J.sobreaviso ? 'Sobreaviso ' : '') + hhmm(J.inicio) + ' → ' + hhmm(J.inicio + J.duracao) : '', entrada: '', saida: '', hc: 0, saldo: null, motivo: '', status: 'ok' };
    const batidas = []; { const re = /(\d{2}):(\d{2})\s*([rmc])?/gi; let m; while ((m = re.exec(d.registros))) batidas.push({ h: m[1] + ':' + m[2], tipo: (m[3] || '').toLowerCase() }); }
    v.batidas = batidas;
    if (d.turnoReg && d.turnoReg.length && !(J && J.sobreaviso)) { const r = d.turnoReg; v.entrada = fmtT(r[0].t, d); v.saida = r.length % 2 === 0 ? fmtT(r[r.length - 1].t, d) : ''; }
    const meus = punches.filter(p => p.dia === d.dia);
    if (d.afast) {
      const fic = J && J.inicio != null && !J.sobreaviso ? Math.round(minutosNoturnos(J.inicio, J.inicio + J.duracao) / 7) : 0;
      const hcEsc = d.escalada + (d.escalada ? fic : 0);
      const cred = Math.abs((d.hc || 0) - hcEsc) <= TOL_DIA ? hcEsc : d.escalada;
      v.hc = cred;
      v.motivo = !d.escalada ? `${d.afast}: sem escala no dia, sem crédito` : cred > d.escalada ? `${d.afast}: crédito da escala (${fmt(d.escalada)}) + ${fic} min de hora ficta` : `${d.afast}: crédito da escala do dia`;
    }
    else if (d.feriado && !d.registros) { v.hc = d.codigo ? d.escalada : (d.contratual ? 0 : diaria); v.motivo = 'Feriado sem plantão: crédito da CH diária'; if (!d.codigo) v.hc = diaria; }
    else if (d.pagamento && d.pagModo === 'excedente') { v.hc = d.escalada; v.motivo = 'Extensão remunerada: conta só a CH da escala; o excedente é pago'; }
    else if (d.pagamento) { v.hc = 0; v.motivo = d.sobreaviso && d.turnoReg && d.turnoReg.length ? `Sobreaviso com acionamento (${d.turnoReg.map(p => hhmm(p.t)).join(', ')}): o tempo vai para pagamento` : 'O tempo trabalhado vai para pagamento'; }
    else if (d.codigo && J && !J.sobreaviso) {
      const reg = d.turnoReg || [];
      if (!reg.length) { v.hc = 0; v.saldo = d.contratual || d.escalada ? -J.ch : null; v.motivo = d.ocorrencia ? capitalize(d.ocorrencia) : 'Sem batidas no plantão'; v.status = d.ocorrencia ? 'info' : 'incompleto'; }
      else if (reg.length % 2) { v.hc = null; v.saldo = null; v.motivo = 'Falta uma batida: não dá para calcular o dia'; v.status = 'incompleto'; }
      else {
        let trab = 0, not = 0;
        for (let k = 0; k < reg.length; k += 2) { trab += reg[k + 1].t - reg[k].t; not += minutosNoturnos(reg[k].t, reg[k + 1].t); }
        const calc = trab + Math.round(not / 7) - (J.intervaloFora ? (J.intervalo || 0) : 0);
        const dentroTol = Math.abs(reg[0].t - d.turnoIni) <= 5 && Math.abs(reg[reg.length - 1].t - d.turnoFim) <= 5 && Math.abs(calc - J.ch) <= 10;
        v.hc = dentroTol ? J.ch : calc;
        v.saldo = v.hc - J.ch;
        v.motivo = (dentroTol ? 'Dentro da tolerância de 5 min por batida' : `${Math.floor(trab / 60)}h${String(trab % 60).padStart(2, '0')} trabalhadas`) + (!dentroTol && not ? ` + ${Math.round(not / 7)} min de hora noturna` : '') + (!dentroTol && J.intervaloFora && J.intervalo ? ` − ${J.intervalo} min de intervalo` : '');
      }
    }
    else if (d.sobreaviso) { v.hc = 0; v.motivo = 'Sobreaviso: o tempo vai para pagamento'; }
    else if (d.registros && meus.length && meus.every(p => p.used)) { v.hc = 0; v.motivo = 'A batida é a saída do plantão do dia anterior'; }
    else if (d.registros) { v.hc = 0; v.motivo = 'Sem jornada cadastrada: essas horas não contam'; v.status = 'info'; }
    else { v.hc = 0; v.motivo = d.descanso ? 'Sem jornada' : (d.contratual ? 'Sem plantão' : 'Descanso'); }
    if (d.grupo === 'falta') { v.hc = 0; v.saldo = null; v.entrada = ''; v.saida = ''; v.motivo = 'Falta: o dia não foi trabalhado e conta zero'; v.status = 'info'; }
    if (v.status === 'ok') {
      const hcOk = Math.abs((d.hc || 0) - (v.hc || 0)) <= TOL_DIA;
      const sOk = Math.abs((d.saldo || 0) - (v.saldo || 0)) <= TOL_DIA || (d.saldo == null && !v.saldo) || (v.saldo == null && d.pagamento);
      v.hcOk = hcOk; v.saldoOk = d.pagamento || d.afast || (d.feriado && !d.registros) ? hcOk : sOk;
      if (!hcOk || !v.saldoOk) v.status = 'diverge';
    }
    if (d.issues.some(i => i.tipo === 'duplicidade') && v.status === 'ok') v.status = 'atencao';
    d.valid = v;
  });

  // ---------- Espelho de Ponto: extras, adicional noturno e feriado ----------
  if (emp.tipo === 'espelho') {
    dias.forEach(d => {
      const J = jorn(d.codigo); if (!J || J.sobreaviso || d.afast) return;
      const reg = d.turnoReg || [];
      if (reg.length && reg.length % 2 === 0) {
        let not = 0; for (let k = 0; k < reg.length; k += 2) not += minutosNoturnos(reg[k].t, reg[k + 1].t);
        const exp = Math.round(not * 60 / 52.5);
        d.adnotEsp = exp;
        if (Math.abs((d.adnot || 0) - exp) > TOL_HC) addIssue(d, { nivel: 'verificar', tipo: 'adnot',
          titulo: d.adnot ? `Adicional noturno de ${hm(d.adnot)}, mas os registros dão ${hm(exp)}` : 'Adicional noturno não lançado',
          aconteceu: `O plantão teve ${hm(not)} entre 22h e 5h, que valem ${hm(exp)} de adicional noturno. O espelho mostra ${d.adnot ? fmt(d.adnot) : 'a coluna vazia'}.`,
          visual: conta([L('Entre 22h e 5h (relógio)', fmt(not)), L('Em horas noturnas (52min30s)', fmt(exp), 'sub'), L('No espelho', d.adnot ? fmt(d.adnot) : 'vazio', 'erro')]),
          fazer: 'Conferir o lançamento do adicional noturno do dia.' + (d.feriado ? ' Em feriado, verificar se as horas foram só para a coluna Feriado.' : '') });
      }
      if (d.pagamento) {
        const own = punches.filter(p => p.dia === d.dia);
        const P = [...new Set([...own, ...reg.filter(p => p.dia !== d.dia)])].sort((a, b) => a.t - b.t);
        const Pd = []; P.forEach(p => { const u = Pd[Pd.length - 1]; if (!u || p.t - u.t > DUP_MIN) Pd.push(p); });
        let total = null;
        if (Pd.length && Pd.length % 2 === 0) { let tr = 0, nt = 0; for (let k = 0; k < Pd.length; k += 2) { tr += Pd[k + 1].t - Pd[k].t; nt += minutosNoturnos(Pd[k].t, Pd[k + 1].t); } total = tr + Math.round(nt / 7); }
        const exp = total == null ? null : d.pagModo === 'excedente' ? Math.max(0, total - J.ch) : total;
        d.extrasEsp = exp;
        if (d.valid && Pd.length) { const f = t => fmtT(t, d); d.valid.entrada = f(Pd[0].t); d.valid.saida = Pd.length % 2 === 0 ? f(Pd[Pd.length - 1].t) : ''; d.valid.semPar = Pd.length % 2 === 1; }
        const itens = Pd.map((p, k) => ({ h: (p.dia !== d.dia ? DOWC[dias[p.dia - 1].dow] + ' ' + String(p.dia).padStart(2, '0') + ' · ' : '') + hhmm(p.t), t: k % 2 ? 'saída' : 'entrada', estado: 'ok' }));
        const canceladas = !own.length && /c/.test(d.registros);
        // batidas canceladas que separavam a extensão do plantão
        const canc = []; { const re = /(\d{2}):(\d{2})\s*c/gi; let m; while ((m = re.exec(d.registros))) canc.push({ t: (d.dia - 1) * 1440 + +m[1] * 60 + +m[2], dia: d.dia, canc: true }); }
        let alt = null;
        if (canc.length && Pd.length) {
          const all = [...Pd, ...canc].sort((a, b) => a.t - b.t);
          if (all.length % 2 === 0) {
            const pares = []; for (let k = 0; k < all.length; k += 2) pares.push([all[k], all[k + 1]]);
            const ini = d.turnoIni ?? ((d.dia - 1) * 1440 + J.inicio), fim = ini + J.duracao;
            const fora = pares.filter(([a, b]) => b.t <= ini + TOL_HC || a.t >= fim - TOL_HC);
            const dentro = pares.filter(pp => !fora.includes(pp));
            if (fora.length && dentro.length) {
              const dur = ([a, b]) => b.t - a.t;
              const ext = fora.reduce((x, pp) => x + dur(pp), 0);
              const trabP = dentro.reduce((x, pp) => x + dur(pp), 0), notP = dentro.reduce((x, [a, b]) => x + minutosNoturnos(a.t, b.t), 0);
              const exced = Math.max(0, trabP + Math.round(notP / 7) - J.ch);
              alt = { ext, exced, fora, dentro, trabP, ficta: Math.round(notP / 7) };
            }
          }
        }
        if (alt && d.extras) {
          const f = p => (p.dia !== d.dia ? DOWC[dias[p.dia - 1].dow] + ' ' + String(p.dia).padStart(2, '0') + ' · ' : '') + hhmm(p.t);
          const linhas = [
            ...alt.fora.map(([a, b]) => L(`Extensão: ${f(a)} → ${f(b)}`, fmt(b.t - a.t))),
            ...alt.dentro.map(([a, b]) => L(`Plantão: ${f(a)} → ${f(b)}`, fmt(b.t - a.t) + (alt.ficta ? ' + ' + hm(alt.ficta) + ' noturna' : ''))),
            L('Excedente do plantão (− ' + hm(J.ch) + ')', fmt(alt.exced), 'sub'),
            L('Extras no espelho', fmt(d.extras), 'erro')
          ];
          d.extrasEsp = null; d.extrasAlt = alt;
          addIssue(d, { nivel: 'verificar', tipo: 'extras-cancelada', titulo: `Extras de ${hm(d.extras)} contadas sobre batidas canceladas`,
            aconteceu: `As batidas ${canc.map(c => hhmm(c.t)).join(' e ')} foram canceladas. Sem elas, o espelho juntou ${f(Pd[0])} → ${f(Pd[Pd.length - 1])} num período só. Separando a extensão do plantão, a extensão foi de ${hm(alt.ext)}.`,
            visual: conta(linhas),
            fazer: 'Conferir se o cancelamento estava correto. Se as batidas eram válidas, restabelecê-las para que a extensão e o plantão sejam calculados separadamente.' });
        } else if (!d.extras) {
          let porque = 'A coluna Extras está vazia neste dia.';
          let fazer = 'Conferir o código de jornada e as batidas do dia para que o tempo seja pago como extra.';
          if (canceladas) porque = 'A coluna Extras está vazia e as batidas do dia foram canceladas.';
          else if (total != null && exp === 0 && J.ch >= 1440) { porque = `Com a jornada de ${hm(J.ch)} (código ${d.codigo}), as batidas (${hm(total)}) ficam dentro da jornada e não viram extras. O dia recebeu ${fmt(d.hc || 0)} nas consideradas.`; fazer = 'Usar o código da jornada realmente trabalhada para que o tempo da extensão seja calculado como extra.'; }
          else if (exp) porque = `Pelos registros, ${hm(exp)} deveriam ir para Extras, mas a coluna está vazia.`;
          else if (total == null && Pd.length) porque = 'A coluna Extras está vazia e falta uma batida para calcular o tempo.';
          addIssue(d, { nivel: 'verificar', tipo: 'extras-ausente', titulo: `${PAG_NOME[d.pagamento] || d.pagamento} sem horas extras lançadas`, aconteceu: porque,
            visual: itens.length ? { tipo: 'batidas', itens } : conta([L('Batidas válidas', 'nenhuma'), L('Extras no espelho', 'vazio', 'erro')]), fazer });
        } else if (exp != null && Math.abs(d.extras - exp) > TOL_HC) {
          addIssue(d, { nivel: 'ajustar', tipo: 'extras-diverge', titulo: `Extras de ${hm(d.extras)}, mas os registros dão ${hm(exp)}`,
            aconteceu: 'O tempo lançado como extra não bate com as batidas do dia.',
            visual: conta([L('Tempo trabalhado (com hora noturna)', fmt(total)), L(d.pagModo === 'excedente' ? '− CH da jornada' : 'Tudo vai para extra', d.pagModo === 'excedente' ? '− ' + fmt(J.ch) : ''), L('Extras pelos registros', fmt(exp), 'sub'), L('No espelho', fmt(d.extras), 'erro')]),
            fazer: 'Conferir as batidas e o código de jornada do dia.' });
        }
      }
      if (d.feriado && d.registros && d.valid) { d.valid.status = 'info'; d.valid.motivo = `Feriado trabalhado: o espelho lança ${d.feriadoH ? fmt(d.feriadoH) : 'as horas'} na coluna Feriado`; }
    });
  }

  const ordemNivel = { ajustar: 0, verificar: 1, info: 2 };
  issues.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel] || (a.mes ? -1 : b.mes ? 1 : a.dia - b.dia));
  issues.forEach(i => { if (!i.texto) i.texto = i.aconteceu; });

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
    const g = grupos[d.grupo] ||= { id: d.grupo, nome: d.grupo === 'feriado' ? 'Feriado' : d.grupo === 'falta' ? 'Falta' : d.grupo.replace(/^\w+:/, ''), tipo: d.grupo.split(':')[0], dias: [], contratual: 0, hc: 0, escalada: 0, nEscala: 0, nContrat: 0, modo: d.pagModo };
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
  if (emp.tipo === 'espelho' && emp.totaisEspelho) {
    const TE = emp.totaisEspelho, soma = k => dias.reduce((x, d) => x + (d[k] || 0), 0);
    if (TE.adnot != null) conf.push({ item: 'Ad. Noturno', calc: soma('adnot'), rel: TE.adnot, essencial: false });
    if (TE.extras != null) conf.push({ item: 'Horas extras', calc: soma('extras'), rel: TE.extras, essencial: false });
    if (TE.feriado != null) conf.push({ item: 'Horas em feriado', calc: soma('feriadoH'), rel: TE.feriado, essencial: false });
  }
  conf.forEach(c => c.ok = c.calc === c.rel);

  return { emp, dias, semanas, M, trabalho, partes, grupos: Object.values(grupos), issues, conf, diaria, semanal, diasContrat };
}

export { MESES };
