import { interpretarUnidade as u } from '../src/core/units.js';

export const ITENS = [
  { id: 'i1', descricao: 'Cimento CP-II 50kg', quantidade: 100, unidade: u('sc') },
  { id: 'i2', descricao: 'Parafuso 4,2x32', quantidade: 2000, unidade: u('un') },
  { id: 'i3', descricao: 'Areia média', quantidade: 10, unidade: u('m3') },
];

let seq = 0;
export function linha(itemId, quantidade, unidade, precoUnitario, total) {
  seq += 1;
  return {
    id: `l${seq}`,
    itemId,
    descricao: `linha ${itemId}`,
    quantidade,
    unidade: u(unidade),
    precoUnitario,
    total: total === undefined ? Math.round(quantidade * precoUnitario * 100) / 100 : total,
  };
}

export function proposta(id, nome, itens, extra = {}) {
  return {
    id,
    fornecedor: { nome, cnpj: null },
    frete: { tipo: 'FOB', valor: 100 },
    prazoEntrega: { dias: 5, texto: '5 dias' },
    condicaoPagamento: '28 dias',
    descontoAVistaPercentual: null,
    dataProposta: '2026-11-01',
    validade: { data: null, dias: 15 },
    totalDeclarado: null,
    observacoes: null,
    itens,
    confianca: {},
    revisada: true,
    ...extra,
  };
}
