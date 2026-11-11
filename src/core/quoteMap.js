// Montagem do mapa de cotação. Funções puras.
//
// Modelo de uma proposta normalizada (o mesmo para entrada manual e extração por IA):
// {
//   id, fornecedor: { nome, cnpj },
//   frete: { tipo: 'CIF' | 'FOB' | 'nao_informado', valor: number | null },
//   prazoEntrega: { dias: number | null, texto: string | null },
//   condicaoPagamento: string | null, descontoAVistaPercentual: number | null,
//   dataProposta: 'AAAA-MM-DD' | null, validade: { data: 'AAAA-MM-DD' | null, dias: number | null },
//   totalDeclarado: number | null, observacoes: string | null,
//   itens: [{ id, itemId: string | null, descricao, quantidade, unidade: {codigo, conteudo, texto},
//             precoUnitario, total }],
//   confianca: { [campo]: { nivel: 'alta'|'media'|'baixa', nota, confirmado } },
//   revisada: boolean
// }
import { converterLinha } from './units.js';

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function mediana(valores) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Valor do frete considerado na soma. CIF = 0; FOB sem valor ou não informado = 0, mas sinalizado. */
export function valorFrete(proposta) {
  const f = proposta.frete || {};
  if (f.tipo === 'CIF') return 0;
  return Number.isFinite(f.valor) ? f.valor : 0;
}

export function freteInformado(proposta) {
  const f = proposta.frete || {};
  return f.tipo === 'CIF' || Number.isFinite(f.valor);
}

/** Uma célula do mapa: como a proposta `p` cotou o item `item`. */
export function celula(item, proposta) {
  const linhas = (proposta.itens || []).filter((l) => l.itemId === item.id);
  if (!linhas.length) return { status: 'nao_cotado' };
  const linha = linhas[0];
  if (!Number.isFinite(linha.precoUnitario)) {
    return { status: 'sem_preco', linhaId: linha.id, duplicado: linhas.length > 1 };
  }
  const conv = converterLinha(linha, item.unidade);
  if (!conv.ok) {
    return { status: 'incompativel', linhaId: linha.id, motivo: conv.motivo, duplicado: linhas.length > 1 };
  }
  return {
    status: 'cotado',
    linhaId: linha.id,
    duplicado: linhas.length > 1,
    quantidadeCotada: conv.quantidade,
    precoUnitario: conv.precoUnitario, // na unidade do comprador
    totalItem: round2(conv.precoUnitario * item.quantidade), // sempre sobre a quantidade pedida
    conversao: conv.convertido ? conv.descricao : null,
  };
}

/**
 * Para um conjunto de fornecedores, compra cada item do mais barato entre eles.
 * Retorna { porItem, subtotal, frete, total, fornecedoresUsados, itensSemCotacao }.
 */
function combinar(itens, propostas, linhasMapa, idsPermitidos) {
  const porItem = {};
  let subtotal = 0;
  const usados = new Set();
  const semCotacao = [];
  for (const l of linhasMapa) {
    let melhor = null;
    for (const p of propostas) {
      if (!idsPermitidos.has(p.id)) continue;
      const c = l.celulas[p.id];
      if (c.status !== 'cotado') continue;
      if (!melhor || c.totalItem < melhor.total) melhor = { id: p.id, total: c.totalItem };
    }
    if (melhor) {
      porItem[l.item.id] = melhor.id;
      subtotal += melhor.total;
      usados.add(melhor.id);
    } else {
      porItem[l.item.id] = null;
      semCotacao.push(l.item.id);
    }
  }
  const usadas = propostas.filter((p) => usados.has(p.id));
  const frete = usadas.reduce((s, p) => s + valorFrete(p), 0);
  return {
    porItem,
    subtotal: round2(subtotal),
    frete: round2(frete),
    total: round2(subtotal + frete),
    fornecedoresUsados: usadas.map((p) => p.id),
    // frete desconhecido entra como zero: o total pode estar subestimado
    fornecedoresSemFrete: usadas.filter((p) => !freteInformado(p)).map((p) => p.id),
    itensSemCotacao: semCotacao,
  };
}

/**
 * Monta o mapa: itens nas linhas, fornecedores nas colunas.
 */
export function montarMapa(itens, propostas) {
  const linhas = itens.map((item) => {
    const celulas = {};
    for (const p of propostas) celulas[p.id] = celula(item, p);
    const cotadas = propostas.map((p) => ({ id: p.id, c: celulas[p.id] })).filter((x) => x.c.status === 'cotado');
    let menor = null;
    for (const x of cotadas) if (!menor || x.c.precoUnitario < menor.c.precoUnitario) menor = x;
    // empate: todos os de menor preço ficam destacados
    const menores = menor
      ? cotadas.filter((x) => Math.abs(x.c.precoUnitario - menor.c.precoUnitario) < 1e-9).map((x) => x.id)
      : [];
    return {
      item,
      celulas,
      menorPreco: menores,
      mediana: mediana(cotadas.map((x) => x.c.precoUnitario)),
    };
  });

  const fornecedores = propostas.map((p) => {
    let subtotal = 0;
    let cotados = 0;
    for (const l of linhas) {
      const c = l.celulas[p.id];
      if (c.status === 'cotado') {
        subtotal += c.totalItem;
        cotados += 1;
      }
    }
    const frete = valorFrete(p);
    const desconto = Number.isFinite(p.descontoAVistaPercentual) ? p.descontoAVistaPercentual : null;
    subtotal = round2(subtotal);
    return {
      id: p.id,
      nome: p.fornecedor?.nome || p.id,
      subtotal,
      frete: round2(frete),
      freteInformado: freteInformado(p),
      totalComFrete: round2(subtotal + frete),
      totalAVista: desconto != null ? round2(subtotal * (1 - desconto / 100) + frete) : null,
      itensCotados: cotados,
      completo: cotados === itens.length,
      prazoDias: p.prazoEntrega?.dias ?? null,
      condicaoPagamento: p.condicaoPagamento ?? null,
      revisada: !!p.revisada,
    };
  });

  const todos = new Set(propostas.map((p) => p.id));
  const melhorCombinacao = combinar(itens, propostas, linhas, todos);

  // Variação que considera o frete: testa todos os subconjuntos de fornecedores
  // (até 10 fornecedores → 1023 subconjuntos) e fica com o menor total que cobre
  // o maior número de itens.
  let melhorComFrete = null;
  if (propostas.length && propostas.length <= 10) {
    const n = propostas.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const ids = new Set(propostas.filter((_, i) => mask & (1 << i)).map((p) => p.id));
      const r = combinar(itens, propostas, linhas, ids);
      if (
        !melhorComFrete ||
        r.itensSemCotacao.length < melhorComFrete.itensSemCotacao.length ||
        (r.itensSemCotacao.length === melhorComFrete.itensSemCotacao.length && r.total < melhorComFrete.total - 1e-9)
      ) {
        melhorComFrete = r;
      }
    }
  }

  const completos = fornecedores.filter((f) => f.completo).sort((a, b) => a.totalComFrete - b.totalComFrete);
  const melhorFornecedorUnico = completos.length
    ? { id: completos[0].id, nome: completos[0].nome, total: completos[0].totalComFrete }
    : null;

  return {
    linhas,
    fornecedores,
    melhorCombinacao,
    melhorCombinacaoComFrete: melhorComFrete,
    melhorFornecedorUnico,
  };
}
