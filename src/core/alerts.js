// Alertas do mapa de cotação. Funções puras: `hoje` é parâmetro, nunca Date.now().
import { celula, round2, mediana } from './quoteMap.js';
import { fmtNum } from './units.js';

export const LIMITES = {
  desvioMediana: 0.4, // 40% acima ou abaixo da mediana do item
  minCotacoesMediana: 3, // só compara com a mediana se houver pelo menos 3 preços
  toleranciaSomaAbs: 0.05, // R$
  toleranciaSomaRel: 0.005, // 0,5%
  toleranciaQtdRel: 0.01, // 1%
};

const brl = (n) => `R$ ${fmtNum(n, 2)}`;

/** Soma dias a uma data AAAA-MM-DD (UTC, sem fuso). */
export function somarDias(dataISO, dias) {
  const d = new Date(`${dataISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Data de validade efetiva: explícita, ou data da proposta + dias. */
export function validadeEfetiva(p) {
  const v = p.validade || {};
  if (v.data) return v.data;
  if (Number.isFinite(v.dias) && p.dataProposta) return somarDias(p.dataProposta, v.dias);
  return null;
}

function bate(a, b, L) {
  const dif = Math.abs(a - b);
  return dif <= L.toleranciaSomaAbs || dif <= Math.abs(b) * L.toleranciaSomaRel;
}

/**
 * Gera os alertas de uma cotação.
 * Cada alerta: { tipo, severidade: 'erro'|'aviso'|'info', propostaId, itemId?, linhaId?, mensagem }
 */
export function gerarAlertas(itens, propostas, { hoje, limites = LIMITES } = {}) {
  const L = { ...LIMITES, ...limites };
  const alertas = [];
  const add = (a) => alertas.push(a);
  const nomeDe = (p) => p.fornecedor?.nome || p.id;

  for (const p of propostas) {
    const nome = nomeDe(p);

    // --- por item do comprador
    for (const item of itens) {
      const c = celula(item, p);
      if (c.status === 'nao_cotado') {
        add({ tipo: 'item_nao_cotado', severidade: 'aviso', propostaId: p.id, itemId: item.id,
          mensagem: `${nome} não cotou "${item.descricao}".` });
        continue;
      }
      if (c.duplicado) {
        add({ tipo: 'item_duplicado', severidade: 'aviso', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nome} tem mais de uma linha para "${item.descricao}". Só a primeira entra no mapa.` });
      }
      if (c.status === 'sem_preco') {
        add({ tipo: 'sem_preco', severidade: 'erro', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nome}: "${item.descricao}" está sem preço unitário.` });
        continue;
      }
      if (c.status === 'incompativel') {
        add({ tipo: 'unidade_incompativel', severidade: 'erro', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nome}: "${item.descricao}" — ${c.motivo}. Corrija a unidade ou o conteúdo da embalagem.` });
        continue;
      }
      if (c.conversao) {
        add({ tipo: 'conversao_unidade', severidade: 'info', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nome}: "${item.descricao}" convertido: ${c.conversao}.` });
      }
      if (Number.isFinite(c.quantidadeCotada) &&
          Math.abs(c.quantidadeCotada - item.quantidade) > item.quantidade * L.toleranciaQtdRel) {
        add({ tipo: 'quantidade_divergente', severidade: 'aviso', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nome}: cotou ${fmtNum(c.quantidadeCotada)} de "${item.descricao}", pedido ${fmtNum(item.quantidade)}. ` +
            `O mapa usa o preço unitário × quantidade pedida.` });
      }
    }

    // --- linhas da proposta
    for (const l of p.itens || []) {
      if (!l.itemId) {
        add({ tipo: 'item_sem_correspondencia', severidade: 'aviso', propostaId: p.id, linhaId: l.id,
          mensagem: `${nome}: "${l.descricao}" não corresponde a nenhum item da lista. Associe ou ignore.` });
      }
      if (Number.isFinite(l.quantidade) && Number.isFinite(l.precoUnitario) && Number.isFinite(l.total)) {
        const calc = round2(l.quantidade * l.precoUnitario);
        if (!bate(calc, l.total, L)) {
          add({ tipo: 'total_linha_divergente', severidade: 'aviso', propostaId: p.id, linhaId: l.id, itemId: l.itemId,
            mensagem: `${nome}: "${l.descricao}" — ${fmtNum(l.quantidade)} × ${brl(l.precoUnitario)} = ${brl(calc)}, ` +
              `mas a proposta diz ${brl(l.total)}.` });
        }
      }
    }

    // --- frete
    const f = p.frete || {};
    if (f.tipo !== 'CIF' && !Number.isFinite(f.valor)) {
      add({ tipo: 'frete_nao_informado', severidade: 'aviso', propostaId: p.id,
        mensagem: `${nome}: frete não informado${f.tipo === 'FOB' ? ' (FOB, a combinar)' : ''}. O total pode estar subestimado.` });
    }

    // --- validade
    const val = validadeEfetiva(p);
    if (!val) {
      add({ tipo: 'validade_nao_informada', severidade: 'info', propostaId: p.id,
        mensagem: `${nome}: validade da proposta não informada.` });
    } else if (hoje && val < hoje) {
      add({ tipo: 'proposta_vencida', severidade: 'erro', propostaId: p.id,
        mensagem: `${nome}: proposta vencida em ${val.split('-').reverse().join('/')}.` });
    }

    // --- soma dos itens × total declarado
    if (Number.isFinite(p.totalDeclarado)) {
      const linhasValidas = (p.itens || []).filter((l) => Number.isFinite(l.total) ||
        (Number.isFinite(l.quantidade) && Number.isFinite(l.precoUnitario)));
      const soma = round2(linhasValidas.reduce((s, l) =>
        s + (Number.isFinite(l.total) ? l.total : l.quantidade * l.precoUnitario), 0));
      const frete = Number.isFinite(f.valor) ? f.valor : 0;
      const desc = Number.isFinite(p.descontoAVistaPercentual) ? p.descontoAVistaPercentual : null;
      const candidatos = [soma, soma + frete];
      if (desc != null) candidatos.push(round2(soma * (1 - desc / 100)), round2(soma * (1 - desc / 100) + frete));
      if (!candidatos.some((c) => bate(c, p.totalDeclarado, L))) {
        add({ tipo: 'soma_divergente', severidade: 'aviso', propostaId: p.id,
          mensagem: `${nome}: soma dos itens ${brl(soma)}${frete ? ` (+ frete ${brl(frete)})` : ''} ` +
            `difere do total declarado ${brl(p.totalDeclarado)}.` });
      }
    }

    // --- campos de baixa confiança ainda não confirmados
    for (const [campo, c] of Object.entries(p.confianca || {})) {
      if (c?.nivel === 'baixa' && !c.confirmado) {
        add({ tipo: 'baixa_confianca', severidade: 'aviso', propostaId: p.id, campo,
          mensagem: `${nome}: "${rotuloCampo(campo, p)}" com baixa confiança${c.nota ? ` — ${c.nota}` : ''}. Revise.` });
      }
    }
  }

  // --- preço fora da mediana (precisa de várias cotações do mesmo item)
  for (const item of itens) {
    const precos = propostas
      .map((p) => ({ p, c: celula(item, p) }))
      .filter((x) => x.c.status === 'cotado');
    if (precos.length < L.minCotacoesMediana) continue;
    const med = mediana(precos.map((x) => x.c.precoUnitario));
    if (!(med > 0)) continue;
    for (const { p, c } of precos) {
      const desvio = c.precoUnitario / med - 1;
      if (Math.abs(desvio) > L.desvioMediana) {
        add({ tipo: 'preco_fora_mediana', severidade: 'aviso', propostaId: p.id, itemId: item.id, linhaId: c.linhaId,
          mensagem: `${nomeDe(p)}: "${item.descricao}" a ${brl(c.precoUnitario)} está ${fmtNum(Math.abs(desvio) * 100, 0)}% ` +
            `${desvio > 0 ? 'acima' : 'abaixo'} da mediana (${brl(med)}). Confira unidade e preço.` });
      }
    }
  }

  return alertas;
}

export function rotuloCampo(campo, p) {
  const fixos = {
    fornecedor: 'fornecedor', frete: 'frete', prazoEntrega: 'prazo de entrega',
    condicaoPagamento: 'condição de pagamento', validade: 'validade', totalDeclarado: 'total declarado',
    descontoAVistaPercentual: 'desconto à vista', dataProposta: 'data da proposta',
  };
  if (fixos[campo]) return fixos[campo];
  const m = campo.match(/^itens\.([^.]+)$/);
  if (m) {
    const l = (p?.itens || []).find((x) => x.id === m[1]);
    return l ? `item ${l.descricao}` : campo;
  }
  return campo;
}
