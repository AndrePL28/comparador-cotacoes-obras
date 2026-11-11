// Saídas simuladas do modelo, no formato do ExtracaoSchema.
import { interpretarUnidade as u } from '../src/core/units.js';

export const ITENS_PEDIDO = [
  { id: 'i1', descricao: 'Cimento CP-II 50kg', quantidade: 100, unidade: u('sc') },
  { id: 'i2', descricao: 'Parafuso 4,2x32', quantidade: 2000, unidade: u('un') },
];

export function saidaModelo(sobrescrever = {}) {
  const base = {
    fornecedor: { nome: 'Casa do Construtor Fictícia Ltda', cnpj: '00.000.000/0001-00', confianca: 'alta', nota: '' },
    dataProposta: { data: '2026-11-05', confianca: 'alta', nota: '' },
    itens: [
      {
        descricaoOriginal: 'CIMENTO CP II-E 32 SC 50KG', itemIdCorrespondente: 'i1', quantidade: 100, unidadeTexto: 'SC',
        unidade: 'sc', conteudoEmbalagem: { quantidade: 0, unidade: 'un' }, precoUnitario: 38.5, total: 3850, confianca: 'alta', camposDuvidosos: [], nota: '',
      },
      {
        descricaoOriginal: 'PARAF. CHIPBOARD 4,2X32 CX C/50', itemIdCorrespondente: 'i2', quantidade: 40, unidadeTexto: 'CX C/50',
        unidade: 'cx', conteudoEmbalagem: { quantidade: 50, unidade: 'un' }, precoUnitario: 25, total: 1000,
        confianca: 'media', camposDuvidosos: ['correspondencia'], nota: 'Descrição abreviada.',
      },
    ],
    frete: { tipo: 'FOB', valor: 180, confianca: 'alta', nota: '' },
    prazoEntrega: { dias: 3, texto: '3 dias', confianca: 'alta', nota: '' },
    condicaoPagamento: { texto: '28 dias', descontoAVistaPercentual: 3, confianca: 'alta', nota: '' },
    validade: { data: '', dias: 10, confianca: 'alta', nota: '' },
    totalDeclarado: { valor: 5030, confianca: 'alta', nota: '' },
    observacoes: '',
  };
  return { ...base, ...sobrescrever };
}

export function respostaSimulada(parsed, extra = {}) {
  return {
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(parsed) }],
    parsed_output: parsed,
    usage: { input_tokens: 4000, output_tokens: 1200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

/** Cliente simulado: registra as requisições e devolve a resposta configurada (ou lança o erro). */
export function clienteSimulado(resposta) {
  const chamadas = [];
  return {
    chamadas,
    messages: {
      parse: async (req) => {
        chamadas.push(req);
        if (resposta instanceof Error) throw resposta;
        return typeof resposta === 'function' ? resposta(req) : resposta;
      },
    },
  };
}
