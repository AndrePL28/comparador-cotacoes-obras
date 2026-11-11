// Gabarito: a proposta "ideal" (o que uma extração perfeita devolveria),
// no mesmo modelo de proposta usado pelo app. Derivado de casos.js.
import { interpretarUnidade } from '../src/core/units.js';
import { interpretarListaItens } from '../src/core/items.js';
import { round2 } from '../src/core/quoteMap.js';
import { LISTAS as LISTAS_EVAL } from './casos.js';
import { LISTA_DEMO } from '../demo/casos-demo.js';

const LISTAS = { ...LISTAS_EVAL, D: { nome: 'Demonstração', texto: LISTA_DEMO } };

/** CNPJ fictício: força dígitos verificadores inválidos para não coincidir com empresa real. */
export function cnpjFicticio(cnpj) {
  if (!cnpj) return null;
  const d = cnpj.replace(/\D/g, '').slice(0, 12).split('').map(Number);
  const dv = (nums) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = nums.reduce((acc, n, i) => acc + n * pesos[i], 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const v1 = dv(d);
  const v2 = dv([...d, v1]);
  const inv1 = (v1 + 1) % 10; // inválido de propósito
  const s = [...d, inv1, v2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

export function itensDaLista(idLista) {
  const { itens, erros } = interpretarListaItens(LISTAS[idLista].texto);
  if (erros.length) throw new Error(`Lista ${idLista} com erro: ${JSON.stringify(erros)}`);
  return itens;
}

export const totalLinha = (l) => (l.total != null ? l.total : round2(l.qtd * l.preco));

export function somaItens(caso) {
  return round2(caso.linhas.reduce((s, l) => s + totalLinha(l), 0));
}

export function totalDeclarado(caso) {
  const soma = somaItens(caso);
  const frete = caso.frete.valor || 0;
  if (caso.totalEscrito === 'soma+frete+500') return round2(soma + frete + 500);
  if (caso.totalEscrito === 'soma-1000') return round2(soma + frete - 1000);
  if (caso.totalEscrito === null) return null;
  return round2(soma + frete);
}

export function gabarito(caso) {
  const itens = caso.linhas.map((l, k) => {
    const unidade = l.unVerdade ? { ...interpretarUnidade(l.unVerdade), texto: l.un } : interpretarUnidade(l.un);
    if (!unidade.codigo) throw new Error(`${caso.id}: unidade "${l.un}" não interpretável`);
    return {
      id: `l${k + 1}`,
      itemId: l.ref,
      descricao: l.desc,
      quantidade: l.qtd,
      unidade,
      precoUnitario: l.preco,
      total: totalLinha(l),
    };
  });
  return {
    id: caso.id,
    origem: { arquivo: `${caso.id}.${caso.formato}`, tipo: caso.formato, modo: 'gabarito' },
    fornecedor: { nome: caso.fornecedor.nome, cnpj: cnpjFicticio(caso.fornecedor.cnpj) },
    frete: { tipo: caso.frete.tipo, valor: caso.frete.tipo === 'CIF' ? null : caso.frete.valor },
    prazoEntrega: { dias: caso.prazo.dias, texto: caso.prazo.texto },
    condicaoPagamento: caso.pagamento.texto,
    descontoAVistaPercentual: caso.pagamento.desconto ?? null,
    dataProposta: caso.data,
    validade: { data: caso.validade?.data ?? null, dias: caso.validade?.dias ?? null },
    totalDeclarado: totalDeclarado(caso),
    observacoes: null,
    itens,
    confianca: {},
    revisada: true,
  };
}
