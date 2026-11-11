// Comparação extração × gabarito. Funções puras (testadas em test/eval.test.js).
import { razaoConversao } from '../src/core/units.js';
import { validadeEfetiva } from '../src/core/alerts.js';

export const CAMPOS_PRINCIPAIS = ['preco', 'quantidade', 'unidade', 'frete', 'prazo'];
export const CAMPOS_EXTRAS = ['correspondencia', 'fornecedor', 'dataProposta', 'validade', 'desconto', 'totalDeclarado'];

const ALERTAS_DE_ITEM = new Set(['preco_fora_mediana', 'quantidade_divergente', 'unidade_incompativel',
  'total_linha_divergente', 'sem_preco', 'item_duplicado', 'conversao_unidade']);

export function igualNum(a, b, rel = 0.005, abs = 0.01) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
}

function normNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const sinalizado = (c) => !!c && (c.nivel === 'baixa' || c.nivel === 'media');

/**
 * @param gab proposta do gabarito
 * @param ext proposta extraída (ou null se a extração falhou)
 * @param alertas alertas gerados para a cotação (todas as propostas extraídas da mesma lista)
 * @returns {{ campos: Record<string,{certos:number,total:number}>, erros: Array, sinalizacoes: {total:number, emValoresCorretos:number} }}
 */
export function compararProposta(gab, ext, alertas = []) {
  const campos = Object.fromEntries([...CAMPOS_PRINCIPAIS, ...CAMPOS_EXTRAS].map((c) => [c, { certos: 0, total: 0 }]));
  const erros = [];
  const chavesComErro = new Set();
  const conta = (campo, ok) => { campos[campo].total += 1; if (ok) campos[campo].certos += 1; };

  const meusAlertas = alertas.filter((a) => ext && a.propostaId === ext.id);
  const alertasDoItem = (itemId) => meusAlertas.filter((a) => a.itemId === itemId && ALERTAS_DE_ITEM.has(a.tipo)).map((a) => a.tipo);
  const temAlerta = (tipo) => meusAlertas.some((a) => a.tipo === tipo);

  const registrar = (campo, detalhe, { chave = null, itemId = null, alertasRelacionados = [] } = {}) => {
    const conf = chave && ext?.confianca?.[chave];
    const pegoPor = [];
    if (sinalizado(conf)) pegoPor.push(`confiança ${conf.nivel}`);
    for (const t of new Set(alertasRelacionados)) pegoPor.push(`alerta ${t}`);
    if (chave) chavesComErro.add(chave);
    erros.push({ campo, itemId, ...detalhe, pego: pegoPor.length > 0, pegoPor });
  };

  // --- extração falhou: tudo errado, nada pego
  if (!ext) {
    for (const l of gab.itens.filter((x) => x.itemId)) ['preco', 'quantidade', 'unidade', 'correspondencia'].forEach((c) => conta(c, false));
    ['frete', 'prazo', 'fornecedor', 'dataProposta', 'validade', 'desconto', 'totalDeclarado'].forEach((c) => conta(c, false));
    erros.push({ campo: 'extracao', esperado: 'proposta', obtido: 'falha', pego: true, pegoPor: ['erro exibido ao usuário'] });
    return { campos, erros, sinalizacoes: { total: 0, emValoresCorretos: 0 } };
  }

  // --- itens
  const idsGab = new Set(gab.itens.map((l) => l.itemId).filter(Boolean));
  for (const L of gab.itens) {
    if (!L.itemId) continue;
    const E = ext.itens.find((x) => x.itemId === L.itemId);
    const extrasSoma = temAlerta('soma_divergente') ? ['soma_divergente'] : [];
    if (!E) {
      ['preco', 'quantidade', 'unidade'].forEach((c) => conta(c, false));
      conta('correspondencia', false);
      registrar('correspondencia', { esperado: `${L.descricao} → ${L.itemId}`, obtido: 'item não encontrado na extração' },
        { itemId: L.itemId, alertasRelacionados: extrasSoma });
      continue;
    }
    conta('correspondencia', true);
    const chave = `itens.${E.id}`;
    const alertasItem = [...alertasDoItem(L.itemId), ...extrasSoma];
    const r = razaoConversao(E.unidade, L.unidade);
    const unidadeOk = r.ok && Math.abs(r.razao - 1) < 1e-6;
    conta('unidade', unidadeOk);
    if (!unidadeOk) {
      registrar('unidade', { esperado: L.unidade.texto || L.unidade.codigo, obtido: E.unidade?.texto || E.unidade?.codigo || null,
        descricao: L.descricao }, { chave, itemId: L.itemId, alertasRelacionados: alertasItem });
    }
    // quantidade e preço comparados na unidade do gabarito (equivalência econômica)
    const qE = r.ok && E.quantidade != null ? E.quantidade * r.razao : null;
    const pE = r.ok && E.precoUnitario != null ? E.precoUnitario / r.razao : null;
    const qOk = igualNum(qE, L.quantidade);
    const pOk = igualNum(pE, L.precoUnitario);
    conta('quantidade', qOk);
    conta('preco', pOk);
    if (!qOk) registrar('quantidade', { esperado: L.quantidade, obtido: E.quantidade, descricao: L.descricao },
      { chave, itemId: L.itemId, alertasRelacionados: alertasItem });
    if (!pOk) registrar('preco', { esperado: L.precoUnitario, obtido: E.precoUnitario, descricao: L.descricao },
      { chave, itemId: L.itemId, alertasRelacionados: alertasItem });
  }
  // casamentos falsos: item da lista que o fornecedor não cotou, ou linha extra associada a um item
  for (const E of ext.itens) {
    if (E.itemId && !idsGab.has(E.itemId)) {
      conta('correspondencia', false);
      registrar('correspondencia', { esperado: 'sem correspondência', obtido: `${E.descricao} → ${E.itemId}` },
        { chave: `itens.${E.id}`, itemId: E.itemId, alertasRelacionados: alertasDoItem(E.itemId) });
    }
  }
  // linhas extras do gabarito (sem item) devem continuar sem item: já cobertas acima

  // --- cabeçalho
  const freteOk = ext.frete?.tipo === gab.frete.tipo && igualNum(ext.frete?.valor ?? null, gab.frete.valor ?? null);
  conta('frete', freteOk);
  if (!freteOk) registrar('frete', { esperado: gab.frete, obtido: ext.frete }, {
    chave: 'frete', alertasRelacionados: ['frete_nao_informado', 'soma_divergente'].filter(temAlerta),
  });

  const prazoOk = (ext.prazoEntrega?.dias ?? null) === (gab.prazoEntrega.dias ?? null);
  conta('prazo', prazoOk);
  if (!prazoOk) registrar('prazo', { esperado: gab.prazoEntrega.dias, obtido: ext.prazoEntrega?.dias ?? null }, { chave: 'prazoEntrega' });

  const nG = normNome(gab.fornecedor.nome);
  const nE = normNome(ext.fornecedor?.nome);
  const fornOk = !!nE && (nE === nG || nE.includes(nG) || nG.includes(nE));
  conta('fornecedor', fornOk);
  if (!fornOk) registrar('fornecedor', { esperado: gab.fornecedor.nome, obtido: ext.fornecedor?.nome }, { chave: 'fornecedor' });

  const dataOk = ext.dataProposta === gab.dataProposta;
  conta('dataProposta', dataOk);
  if (!dataOk) registrar('dataProposta', { esperado: gab.dataProposta, obtido: ext.dataProposta }, { chave: 'dataProposta' });

  const valOk = validadeEfetiva(ext) === validadeEfetiva(gab);
  conta('validade', valOk);
  if (!valOk) registrar('validade', { esperado: validadeEfetiva(gab), obtido: validadeEfetiva(ext) }, { chave: 'validade' });

  const descOk = igualNum(ext.descontoAVistaPercentual ?? null, gab.descontoAVistaPercentual ?? null);
  conta('desconto', descOk);
  if (!descOk) registrar('desconto', { esperado: gab.descontoAVistaPercentual, obtido: ext.descontoAVistaPercentual }, { chave: 'condicaoPagamento' });

  const totOk = igualNum(ext.totalDeclarado ?? null, gab.totalDeclarado ?? null);
  conta('totalDeclarado', totOk);
  if (!totOk) registrar('totalDeclarado', { esperado: gab.totalDeclarado, obtido: ext.totalDeclarado }, { chave: 'totalDeclarado' });

  // --- sinalizações (confiança média/baixa) em valores que estavam certos = falso alarme
  const flags = Object.entries(ext.confianca || {}).filter(([, c]) => sinalizado(c)).map(([k]) => k);
  return {
    campos,
    erros,
    sinalizacoes: { total: flags.length, emValoresCorretos: flags.filter((k) => !chavesComErro.has(k)).length },
  };
}

/** Compara alertas esperados (gerados sobre o gabarito) com os obtidos (sobre a extração). */
export function compararAlertas(esperados, obtidos) {
  const chave = (a) => `${a.tipo}|${a.propostaId}|${a.itemId || ''}`;
  const ignorar = new Set(['baixa_confianca']);
  const E = new Set(esperados.filter((a) => !ignorar.has(a.tipo)).map(chave));
  const O = new Set(obtidos.filter((a) => !ignorar.has(a.tipo)).map(chave));
  const encontrados = [...E].filter((k) => O.has(k));
  return {
    esperados: E.size,
    encontrados: encontrados.length,
    perdidos: [...E].filter((k) => !O.has(k)),
    extras: [...O].filter((k) => !E.has(k)),
  };
}

/** Soma os campos de várias comparações. */
export function agregar(resultados) {
  const total = {};
  for (const r of resultados) {
    for (const [c, v] of Object.entries(r.campos)) {
      total[c] ??= { certos: 0, total: 0 };
      total[c].certos += v.certos;
      total[c].total += v.total;
    }
  }
  return total;
}
