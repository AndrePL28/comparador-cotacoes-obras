// Interface do comparador. JavaScript puro; as regras de negócio vêm de /core
// (os mesmos módulos testados no servidor).
import { interpretarListaItens } from '/core/items.js';
import { interpretarUnidade, formatarUnidade, fmtNum } from '/core/units.js';
import { montarMapa } from '/core/quoteMap.js';
import { gerarAlertas, rotuloCampo } from '/core/alerts.js';
import { pendenciasRevisao, statusMapaFinal } from '/core/review.js';

const CHAVE_LS = 'comparador:v1';
const $ = (s) => document.querySelector(s);

const EXEMPLO = `Cimento CP-II-E-32 50kg; 120; sc
Areia média lavada; 18; m³
Brita 1; 12; m³
Bloco cerâmico 14x19x29; 4000; un
Vergalhão CA-50 10mm (barra 12 m); 80; barra
Arame recozido 18; 25; kg
Prego 17x27 com cabeça; 30; kg
Tubo PVC soldável 25mm; 40; barra 6m
Joelho 90° PVC soldável 25mm; 60; un
Fio flexível 2,5mm²; 8; rolo 100m
Argamassa AC-II; 90; sc 20kg
Impermeabilizante acrílico; 6; balde 18l
Tinta acrílica fosca branca; 10; lata 18l
Parafuso chipboard 4,2x32; 2000; un
Manta asfáltica 3mm; 15; rolo 10m2`;

let estado = { textoItens: '', itens: [], propostas: [] };
let ia = { disponivel: false, modelo: null, hoje: null };
let fila = []; // extrações em andamento ou com erro

// ---------- utilidades
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const brl = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
const brl4 = (n) => (Number.isFinite(n) ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—');
const numInput = (n) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }) : '');
function parseNum(s) {
  let t = String(s ?? '').trim().replace(/^R\$\s*/i, '');
  if (!t) return null;
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const hoje = () => ia.hoje || new Date().toISOString().slice(0, 10);
const novoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function salvar() {
  try { localStorage.setItem(CHAVE_LS, JSON.stringify(estado)); } catch { /* armazenamento indisponível */ }
}
function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_LS) || 'null');
    if (s && Array.isArray(s.itens) && Array.isArray(s.propostas)) estado = s;
  } catch { /* ignora */ }
}

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] ??= {};
  o[ks.at(-1)] = v;
}

// ---------- status da IA
async function verificarIA() {
  try {
    const r = await fetch('/api/status');
    ia = { ...(await r.json()) };
    ia.disponivel = !!ia.iaDisponivel;
  } catch {
    ia.disponivel = false;
  }
  const selo = $('#status-ia');
  selo.textContent = ia.disponivel ? `IA ativa · ${ia.modelo}` : 'IA desativada · modo manual';
  selo.className = `selo ${ia.disponivel ? 'ok' : 'off'}`;
  $('#aviso-sem-chave').hidden = ia.disponivel;
  $('#lbl-arquivo').classList.toggle('desativado', !ia.disponivel);
  $('#inp-arquivo').disabled = !ia.disponivel;
  $('#btn-colar').disabled = !ia.disponivel;
  if (!ia.disponivel) $('#lbl-arquivo').title = 'Configure ANTHROPIC_API_KEY para extrair com IA';
}

// ---------- itens
function aplicarItens() {
  const { itens, erros } = interpretarListaItens($('#txt-itens').value);
  $('#erros-itens').innerHTML = erros.map((e) => `<li>Linha ${e.linha}: "${esc(e.texto)}" — ${esc(e.motivo)}</li>`).join('');
  if (!itens.length) return;
  if (estado.propostas.length && !confirm('Trocar a lista de itens pode desfazer as associações das propostas já enviadas. Continuar?')) return;
  estado.textoItens = $('#txt-itens').value;
  estado.itens = itens;
  const ids = new Set(itens.map((i) => i.id));
  for (const p of estado.propostas) for (const l of p.itens) if (l.itemId && !ids.has(l.itemId)) l.itemId = null;
  salvar();
  renderTudo();
}

function renderItens() {
  const el = $('#lista-itens');
  if (!estado.itens.length) {
    el.innerHTML = '<p class="vazio">Nenhum item ainda.</p>';
    return;
  }
  el.innerHTML = `<table><thead><tr><th>#</th><th>Descrição</th><th class="n">Qtd</th><th>Unidade</th></tr></thead><tbody>
    ${estado.itens.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.descricao)}</td><td class="n">${fmtNum(i.quantidade)}</td>
    <td>${esc(formatarUnidade(i.unidade))}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- propostas
function propostaVazia(modo) {
  return {
    id: novoId('p'),
    origem: { arquivo: null, tipo: 'manual', modo },
    fornecedor: { nome: '', cnpj: null },
    frete: { tipo: 'nao_informado', valor: null },
    prazoEntrega: { dias: null, texto: null },
    condicaoPagamento: null,
    descontoAVistaPercentual: null,
    dataProposta: hoje(),
    validade: { data: null, dias: null },
    totalDeclarado: null,
    observacoes: null,
    itens: estado.itens.map((i, k) => ({
      id: `l${k + 1}`, itemId: i.id, descricao: i.descricao, quantidade: i.quantidade,
      unidade: { ...i.unidade }, precoUnitario: null, total: null,
    })),
    confianca: {},
    revisada: false,
  };
}

function exigirItens() {
  if (!estado.itens.length) {
    alert('Informe primeiro a lista de itens (etapa 1).');
    return false;
  }
  return true;
}

function lerBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(arquivo);
  });
}

async function extrair(corpo, rotulo) {
  const entrada = { id: novoId('f'), rotulo, estado: 'enviando', mensagem: '' };
  fila.push(entrada);
  renderFila();
  try {
    const r = await fetch('/api/extrair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: estado.itens, propostaId: novoId('p'), ...corpo }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados?.erro?.mensagem || `Erro ${r.status}`);
    const p = dados.proposta;
    p.extracao = { custoUSD: dados.custoUSD, duracaoMs: dados.duracaoMs, modelo: dados.modelo, problemas: dados.problemas };
    estado.propostas.push(p);
    fila = fila.filter((f) => f !== entrada);
    salvar();
    renderTudo();
  } catch (e) {
    entrada.estado = 'erro';
    entrada.mensagem = e.message;
    renderFila();
  }
}

function renderFila() {
  $('#fila').innerHTML = fila.map((f) => `<div class="fila-item ${f.estado === 'erro' ? 'erro' : ''}">
    <span>${f.estado === 'erro' ? '' : '<span class="spinner"></span>'}${esc(f.rotulo)}${f.estado === 'erro'
      ? ` — ${esc(f.mensagem)}` : ' — extraindo com IA…'}</span>
    ${f.estado === 'erro' ? `<button class="btn btn-mini btn-sec" data-acao="fechar-fila" data-id="${f.id}" type="button">ok</button>` : ''}
  </div>`).join('');
}

function chipConfianca(c) {
  if (!c) return '';
  if (c.confirmado && c.nivel !== 'alta') return '<span class="chip ok">revisado</span>';
  return `<span class="chip ${c.nivel}">${{ alta: 'alta', media: 'média', baixa: 'baixa' }[c.nivel]}</span>`;
}

function classeConf(c) {
  if (!c || c.confirmado) return '';
  return c.nivel === 'alta' ? '' : c.nivel;
}

function blocoNota(c, chave) {
  if (!c) return '';
  const nota = c.nota ? `<span class="nota ${c.confirmado ? 'nota-ok' : ''}">${esc(c.nota)}</span>` : '';
  const btn = c.nivel === 'baixa' && !c.confirmado
    ? `<button class="btn btn-mini btn-sec" type="button" data-acao="confirmar" data-chave="${esc(chave)}">Confirmar valor</button>` : '';
  return nota + btn;
}

function campo(p, rotulo, chaveConf, controles) {
  const c = p.confianca?.[chaveConf];
  return `<div class="campo ${classeConf(c)}" data-conf="${esc(chaveConf)}">
    <label>${esc(rotulo)} <span class="conf-chip">${chipConfianca(c)}</span></label>${controles}
    <div class="conf-nota">${blocoNota(c, chaveConf)}</div></div>`;
}

const inp = (path, valor, tipo = 'texto', extra = '') =>
  `<input data-path="${path}" data-tipo="${tipo}" value="${esc(valor ?? '')}" ${tipo === 'num' ? 'inputmode="decimal"' : ''}
    ${tipo === 'data' ? 'type="date"' : ''} ${extra}>`;

function cardProposta(p) {
  const origem = origemCard(p);
  const opcoesItens = (sel) => `<option value="">— nenhum —</option>` +
    estado.itens.map((i) => `<option value="${i.id}" ${sel === i.id ? 'selected' : ''}>${esc(i.descricao)}</option>`).join('');

  const linhas = p.itens.map((l) => {
    const chave = `itens.${l.id}`;
    const c = p.confianca?.[chave];
    const unTxt = l.unidade?.codigo ? formatarUnidade(l.unidade) : (l.unidade?.texto || '');
    return `<tr class="${classeConf(c)}" data-linha="${l.id}" data-conf="${esc(chave)}">
      <td class="w-desc"><input data-campo="descricao" value="${esc(l.descricao)}"></td>
      <td><select data-campo="itemId">${opcoesItens(l.itemId)}</select></td>
      <td class="w-num"><input data-campo="quantidade" inputmode="decimal" value="${numInput(l.quantidade)}"></td>
      <td class="w-un"><input data-campo="unidade" value="${esc(unTxt)}" title="Escrito na proposta: ${esc(l.unidade?.texto || '')}">
        <span class="un-lida ${l.unidade?.codigo ? '' : 'erro'}">${l.unidade?.codigo ? '' : 'não reconhecida'}</span></td>
      <td class="w-num"><input data-campo="precoUnitario" inputmode="decimal" value="${numInput(l.precoUnitario)}"></td>
      <td class="w-num"><input data-campo="total" inputmode="decimal" value="${numInput(l.total)}"></td>
      <td><span class="conf-chip">${chipConfianca(c)}</span> <div class="conf-nota">${blocoNota(c, chave)}</div></td>
      <td><button class="btn btn-mini btn-perigo" type="button" data-acao="remover-linha" data-linha="${l.id}" title="Remover linha">×</button></td>
    </tr>`;
  }).join('');

  return `<div class="card ${p.revisada ? 'revisada' : ''}" data-prop="${p.id}">
    <div class="card-topo">${topoCard(p, origem)}</div>
    <div class="card-corpo">
      <div class="campos">
        ${campo(p, 'Fornecedor', 'fornecedor', inp('fornecedor.nome', p.fornecedor.nome))}
        ${campo(p, 'CNPJ', 'fornecedor', inp('fornecedor.cnpj', p.fornecedor.cnpj))}
        ${campo(p, 'Frete', 'frete', `<div class="duplo"><select data-path="frete.tipo" data-tipo="select">
            ${[['nao_informado', 'Não informado'], ['CIF', 'CIF (incluso)'], ['FOB', 'FOB (à parte)']]
              .map(([v, t]) => `<option value="${v}" ${p.frete.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select>${inp('frete.valor', numInput(p.frete.valor), 'num', 'placeholder="R$"')}</div>`)}
        ${campo(p, 'Prazo de entrega (dias)', 'prazoEntrega', inp('prazoEntrega.dias', numInput(p.prazoEntrega?.dias), 'num'))}
        ${campo(p, 'Condição de pagamento', 'condicaoPagamento', inp('condicaoPagamento', p.condicaoPagamento))}
        ${campo(p, 'Desconto à vista (%)', 'condicaoPagamento', inp('descontoAVistaPercentual', numInput(p.descontoAVistaPercentual), 'num'))}
        ${campo(p, 'Data da proposta', 'dataProposta', inp('dataProposta', p.dataProposta, 'data'))}
        ${campo(p, 'Validade (data ou dias)', 'validade', `<div class="duplo">${inp('validade.data', p.validade?.data, 'data')}
          ${inp('validade.dias', numInput(p.validade?.dias), 'num', 'placeholder="dias"')}</div>`)}
        ${campo(p, 'Total declarado', 'totalDeclarado', inp('totalDeclarado', numInput(p.totalDeclarado), 'num'))}
      </div>
      <div class="tabela-wrap"><table class="tabela-linhas"><thead><tr><th>Descrição na proposta</th><th>Item da lista</th><th class="n">Qtd</th>
        <th>Unidade</th><th class="n">Preço unit.</th><th class="n">Total</th><th>Confiança</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <button class="btn btn-mini btn-sec" type="button" data-acao="add-linha">+ linha</button>
      ${p.observacoes ? `<p class="ajuda">Observações: ${esc(p.observacoes)}</p>` : ''}
    </div>
    <div class="card-rodape">${rodapeCard(p)}</div>
  </div>`;
}

function origemCard(p) {
  const ex = p.extracao;
  return p.origem?.modo === 'ia'
    ? `IA · ${esc(p.origem.arquivo)}${ex ? ` · ${(ex.duracaoMs / 1000).toFixed(1)} s · US$ ${ex.custoUSD.toFixed(4)}` : ''}`
    : 'entrada manual';
}

function topoCard(p, origem = origemCard(p)) {
  return `<div><span class="card-titulo">${esc(p.fornecedor.nome || 'Fornecedor sem nome')}</span>
      <span class="card-origem">${origem}</span></div>
    <div>${p.revisada ? '<span class="chip ok">revisada</span>' : '<span class="chip media">aguardando revisão</span>'}
      <button class="btn btn-mini btn-perigo" type="button" data-acao="remover-proposta">Remover</button></div>`;
}

function rodapeCard(p) {
  const pend = pendenciasRevisao(p);
  return `<span class="pendencias ${pend.length ? '' : 'ok'}">${pend.length
      ? `${pend.length} valor(es) de baixa confiança para revisar: ${pend.map((x) => esc(rotuloCampo(x.campo, p))).join(', ')}`
      : 'Sem pendências de baixa confiança.'}</span>
    ${p.revisada
      ? '<button class="btn btn-sec" type="button" data-acao="reabrir">Reabrir revisão</button>'
      : `<button class="btn" type="button" data-acao="revisar" ${pend.length ? 'disabled' : ''}>Marcar como revisada</button>`}`;
}

/** Atualiza só o estado visual (confiança, pendências, revisão) sem recriar os campos. */
function atualizarCard(p) {
  const card = document.querySelector(`.card[data-prop="${p.id}"]`);
  if (!card) return renderPropostas();
  card.classList.toggle('revisada', !!p.revisada);
  card.querySelector('.card-topo').innerHTML = topoCard(p);
  card.querySelector('.card-rodape').innerHTML = rodapeCard(p);
  card.querySelectorAll('[data-conf]').forEach((el) => {
    const chave = el.dataset.conf;
    const c = p.confianca?.[chave];
    el.classList.remove('baixa', 'media');
    const cls = classeConf(c);
    if (cls) el.classList.add(cls);
    const chip = el.querySelector(':scope .conf-chip');
    if (chip) chip.innerHTML = chipConfianca(c);
    const nota = el.querySelector(':scope .conf-nota');
    if (nota) nota.innerHTML = blocoNota(c, chave);
  });
  card.querySelectorAll('tr[data-linha]').forEach((tr) => {
    const l = p.itens.find((x) => x.id === tr.dataset.linha);
    const lida = tr.querySelector('.un-lida');
    if (l && lida) {
      lida.textContent = l.unidade?.codigo ? '' : 'não reconhecida';
      lida.classList.toggle('erro', !l.unidade?.codigo);
    }
  });
}

function renderPropostas() {
  const el = $('#propostas');
  el.innerHTML = estado.propostas.length
    ? estado.propostas.map(cardProposta).join('')
    : '<p class="vazio">Nenhuma proposta ainda.</p>';
}

/** Re-renderiza um card preservando o foco do campo em edição. */
function rerenderCard(id) {
  const atual = document.querySelector(`.card[data-prop="${id}"]`);
  const p = estado.propostas.find((x) => x.id === id);
  if (!atual || !p) return renderPropostas();
  const ativo = document.activeElement;
  let seletor = null;
  if (ativo && atual.contains(ativo)) {
    const tr = ativo.closest('tr[data-linha]');
    seletor = ativo.dataset.path ? `[data-path="${ativo.dataset.path}"]`
      : tr && ativo.dataset.campo ? `tr[data-linha="${tr.dataset.linha}"] [data-campo="${ativo.dataset.campo}"]` : null;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = cardProposta(p);
  const novo = tmp.firstElementChild;
  atual.replaceWith(novo);
  if (seletor) novo.querySelector(seletor)?.focus();
}

function confirmar(p, chave) {
  if (p.confianca?.[chave]) p.confianca[chave].confirmado = true;
}

function aoAlterar(ev) {
  const card = ev.target.closest('.card[data-prop]');
  if (!card) return;
  const p = estado.propostas.find((x) => x.id === card.dataset.prop);
  const t = ev.target;
  if (t.dataset.path) {
    let v = t.value;
    if (t.dataset.tipo === 'num') {
      v = parseNum(v);
      if (Number.isNaN(v)) { t.classList.add('invalido'); alert('Número inválido. Use vírgula para decimais, ex.: 12,50'); return; }
    } else if (t.dataset.tipo === 'data' || t.dataset.tipo === 'texto') v = v.trim() || null;
    setPath(p, t.dataset.path, v);
    if (t.dataset.path === 'fornecedor.nome' && !v) p.fornecedor.nome = '';
    confirmar(p, t.closest('[data-conf]')?.dataset.conf);
  } else if (t.dataset.campo) {
    const tr = t.closest('tr[data-linha]');
    const l = p.itens.find((x) => x.id === tr.dataset.linha);
    const campoNome = t.dataset.campo;
    if (campoNome === 'unidade') l.unidade = interpretarUnidade(t.value);
    else if (campoNome === 'itemId') l.itemId = t.value || null;
    else if (campoNome === 'descricao') l.descricao = t.value;
    else {
      const n = parseNum(t.value);
      if (Number.isNaN(n)) { alert('Número inválido. Use vírgula para decimais, ex.: 12,50'); return; }
      l[campoNome] = n;
    }
    confirmar(p, `itens.${l.id}`);
  }
  p.revisada = false; // qualquer edição exige nova revisão
  salvar();
  atualizarCard(p);
  renderMapa();
}

function aoClicar(ev) {
  const b = ev.target.closest('[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao;
  if (acao === 'fechar-fila') {
    fila = fila.filter((f) => f.id !== b.dataset.id);
    return renderFila();
  }
  const card = b.closest('.card[data-prop]');
  const p = card && estado.propostas.find((x) => x.id === card.dataset.prop);
  if (!p) return;
  if (acao === 'confirmar' || acao === 'revisar' || acao === 'reabrir') {
    if (acao === 'confirmar') confirmar(p, b.dataset.chave);
    else if (acao === 'revisar') {
      if (pendenciasRevisao(p).length) return;
      p.revisada = true;
    } else p.revisada = false;
    salvar();
    atualizarCard(p);
    return renderMapa();
  } else if (acao === 'remover-proposta') {
    if (!confirm(`Remover a proposta de ${p.fornecedor.nome || 'fornecedor sem nome'}?`)) return;
    estado.propostas = estado.propostas.filter((x) => x !== p);
    salvar();
    return renderTudo();
  } else if (acao === 'add-linha') {
    const n = p.itens.length + 1;
    let id = `l${n}`;
    while (p.itens.some((x) => x.id === id)) id += 'b';
    p.itens.push({ id, itemId: null, descricao: '', quantidade: null, unidade: { codigo: null, conteudo: null, texto: '' }, precoUnitario: null, total: null });
    p.revisada = false;
  } else if (acao === 'remover-linha') {
    p.itens = p.itens.filter((x) => x.id !== b.dataset.linha);
    delete p.confianca[`itens.${b.dataset.linha}`];
    p.revisada = false;
  }
  salvar();
  rerenderCard(p.id);
  renderMapa();
}

// ---------- mapa
function renderMapa() {
  const { itens, propostas } = estado;
  const elMapa = $('#mapa');
  if (!itens.length || !propostas.length) {
    elMapa.innerHTML = '<p class="vazio">O mapa aparece quando houver itens e pelo menos uma proposta.</p>';
    $('#resumo').innerHTML = '';
    $('#alertas').innerHTML = '';
    $('#mapa-status').textContent = '';
    $('#btn-exportar').disabled = true;
    return;
  }
  const mapa = montarMapa(itens, propostas);
  const alertas = gerarAlertas(itens, propostas, { hoje: hoje() });
  const st = statusMapaFinal(propostas);
  $('#mapa-status').textContent = st.liberado
    ? 'Todas as propostas foram revisadas. Este é o mapa final.'
    : `Prévia: ${st.naoRevisadas.length} proposta(s) ainda não revisada(s) (${st.naoRevisadas.join(', ')}). A exportação fica liberada depois da revisão.`;

  const cab = propostas.map((p) => `<th colspan="2" class="forn">${esc(p.fornecedor.nome || 'sem nome')}
    ${p.revisada ? '' : '<span class="rascunho">não revisada</span>'}</th>`).join('');
  const sub = propostas.map(() => '<th class="n ini">Preço unit.</th><th class="n">Total</th>').join('');
  const corpo = mapa.linhas.map((l) => {
    const cels = propostas.map((p) => {
      const c = l.celulas[p.id];
      if (c.status === 'nao_cotado') return '<td class="nc ini" colspan="2">não cotado</td>';
      if (c.status === 'sem_preco') return '<td class="inc ini" colspan="2">sem preço</td>';
      if (c.status === 'incompativel') return `<td class="inc ini" colspan="2">${esc(c.motivo)}</td>`;
      const menor = l.menorPreco.includes(p.id) ? 'menor' : '';
      return `<td class="n ini ${menor}" title="${esc(c.conversao || '')}">${brl4(c.precoUnitario)}
          ${c.conversao ? '<span class="conv">⇄ convertido</span>' : ''}</td><td class="n ${menor}">${brl(c.totalItem)}</td>`;
    }).join('');
    return `<tr><td>${esc(l.item.descricao)}</td><td class="n">${fmtNum(l.item.quantidade)}</td>
      <td>${esc(formatarUnidade(l.item.unidade))}</td>${cels}</tr>`;
  }).join('');
  const linhaTot = (rot, fn) => `<tr class="total"><td colspan="3">${rot}</td>${mapa.fornecedores.map((f) =>
    `<td class="ini"></td><td class="n">${fn(f)}</td>`).join('')}</tr>`;
  elMapa.innerHTML = `<table class="mapa"><thead><tr><th rowspan="2">Item</th><th rowspan="2" class="n">Qtd</th>
    <th rowspan="2">Un</th>${cab}</tr><tr>${sub}</tr></thead><tbody>${corpo}
    ${linhaTot('Subtotal (sem frete)', (f) => brl(f.subtotal))}
    ${linhaTot('Frete', (f) => (f.freteInformado ? brl(f.frete) : 'não informado'))}
    ${linhaTot('Total com frete', (f) => brl(f.totalComFrete))}
    ${linhaTot('Total à vista', (f) => (f.totalAVista != null ? brl(f.totalAVista) : '—'))}
    ${linhaTot('Itens cotados', (f) => `${f.itensCotados}/${itens.length}`)}
    ${linhaTot('Prazo (dias)', (f) => (f.prazoDias ?? '—'))}
    ${linhaTot('Pagamento', (f) => esc(f.condicaoPagamento || '—'))}
    </tbody></table>`;

  const nome = (id) => propostas.find((p) => p.id === id)?.fornecedor.nome || id;
  const avisoFrete = (c) => (c.fornecedoresSemFrete?.length
    ? `<br><strong class="aviso-frete">Atenção: frete a combinar com ${c.fornecedoresSemFrete.map(nome).map(esc).join(', ')} — contado como zero, o total real será maior.</strong>`
    : '');
  const comb = mapa.melhorCombinacao;
  const combF = mapa.melhorCombinacaoComFrete;
  const unico = mapa.melhorFornecedorUnico;
  const cards = [
    `<div class="resumo-card destaque"><div class="rot">Melhor combinação (cada item do mais barato)</div>
      <div class="val">${brl(comb.total)}</div>
      <div class="det">${brl(comb.subtotal)} + frete ${brl(comb.frete)} · ${comb.fornecedoresUsados.map(nome).map(esc).join(', ')}
      ${comb.itensSemCotacao.length ? `<br><strong>${comb.itensSemCotacao.length} item(ns) sem cotação</strong>` : ''}
      ${avisoFrete(comb)}</div></div>`,
  ];
  if (combF && Math.abs(combF.total - comb.total) > 0.005) {
    cards.push(`<div class="resumo-card"><div class="rot">Considerando o frete de cada fornecedor</div>
      <div class="val">${brl(combF.total)}</div><div class="det">${combF.fornecedoresUsados.map(nome).map(esc).join(', ')} ·
      economiza ${brl(comb.total - combF.total)} em relação à combinação item a item ${avisoFrete(combF)}</div></div>`);
  }
  cards.push(unico
    ? `<div class="resumo-card"><div class="rot">Melhor fornecedor único (proposta completa)</div>
      <div class="val">${brl(unico.total)}</div><div class="det">${esc(unico.nome)} · diferença para a melhor opção:
      ${brl(unico.total - Math.min(comb.total, combF?.total ?? Infinity))}</div></div>`
    : '<div class="resumo-card"><div class="rot">Melhor fornecedor único</div><div class="det">Nenhum fornecedor cotou todos os itens.</div></div>');
  $('#resumo').innerHTML = cards.join('');

  const ordem = { erro: 0, aviso: 1, info: 2 };
  const ocultarInfo = $('#chk-info')?.checked ?? false;
  const lista = alertas.slice().sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
    .filter((a) => !(ocultarInfo && a.severidade === 'info'));
  const cont = (s) => alertas.filter((a) => a.severidade === s).length;
  $('#alertas').innerHTML = `<div class="filtros"><span>${cont('erro')} erro(s) · ${cont('aviso')} aviso(s) · ${cont('info')} informação(ões)</span>
    <label><input type="checkbox" id="chk-info" ${ocultarInfo ? 'checked' : ''}> ocultar informações</label></div>` +
    (lista.length ? lista.map((a) => `<div class="alerta ${a.severidade}"><span class="tipo">${esc(a.tipo.replace(/_/g, ' '))}</span>${esc(a.mensagem)}</div>`).join('')
      : '<p class="vazio">Nenhum alerta.</p>');

  $('#btn-exportar').disabled = !st.liberado;
  $('#exportar-motivo').textContent = st.liberado ? '' : 'Revise todas as propostas para exportar.';
}

async function exportar() {
  const btn = $('#btn-exportar');
  btn.disabled = true;
  try {
    const r = await fetch('/api/exportar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: estado.itens, propostas: estado.propostas }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.erro?.mensagem || `Erro ${r.status}`);
    }
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-cotacao-${hoje()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    alert(`Não foi possível exportar: ${e.message}`);
  } finally {
    renderMapa();
  }
}

function renderTudo() {
  $('#txt-itens').value = estado.textoItens || '';
  renderItens();
  renderFila();
  renderPropostas();
  renderMapa();
}

// ---------- eventos
function ligar() {
  $('#btn-itens').addEventListener('click', aplicarItens);
  $('#btn-exemplo').addEventListener('click', () => { $('#txt-itens').value = EXEMPLO; aplicarItens(); });
  $('#btn-nova').addEventListener('click', () => {
    if (!confirm('Apagar a cotação atual e começar outra?')) return;
    estado = { textoItens: '', itens: [], propostas: [] };
    fila = [];
    salvar();
    renderTudo();
  });
  $('#btn-manual').addEventListener('click', () => {
    if (!exigirItens()) return;
    estado.propostas.push(propostaVazia('manual'));
    salvar();
    renderTudo();
  });
  $('#inp-arquivo').addEventListener('change', async (ev) => {
    if (!exigirItens()) { ev.target.value = ''; return; }
    const arquivos = [...ev.target.files];
    ev.target.value = '';
    await Promise.all(arquivos.map(async (f) => {
      if (f.size > 10 * 1024 * 1024) {
        fila.push({ id: novoId('f'), rotulo: f.name, estado: 'erro', mensagem: 'Arquivo maior que 10 MB.' });
        return renderFila();
      }
      return extrair({ arquivo: { nome: f.name, base64: await lerBase64(f) } }, f.name);
    }));
  });
  $('#btn-colar').addEventListener('click', () => { if (exigirItens()) { $('#colar-area').hidden = false; $('#txt-colar').focus(); } });
  $('#btn-colar-cancelar').addEventListener('click', () => { $('#colar-area').hidden = true; });
  $('#btn-colar-enviar').addEventListener('click', () => {
    const t = $('#txt-colar').value.trim();
    if (!t) return;
    $('#colar-area').hidden = true;
    $('#txt-colar').value = '';
    extrair({ texto: t }, 'texto colado');
  });
  $('#propostas').addEventListener('change', aoAlterar);
  $('#propostas').addEventListener('click', aoClicar);
  $('#fila').addEventListener('click', aoClicar);
  $('#alertas').addEventListener('change', (ev) => { if (ev.target.id === 'chk-info') renderMapa(); });
  $('#btn-exportar').addEventListener('click', exportar);
}

carregar();
ligar();
renderTudo();
verificarIA().then(renderMapa);
