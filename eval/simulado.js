// Cliente simulado para rodar o eval sem chamar a API (verifica o pipeline e a pontuação).
// Responde com o gabarito convertido para o formato que o modelo devolveria
// (mesmas convenções do schema: textos ausentes = "", unidade desconhecida, conteúdo 0).
import { UNIDADE_DESCONHECIDA } from '../src/ai/schema.js';

const t = (s) => s ?? '';

export function paraSaidaModelo(g) {
  const ok = { confianca: 'alta', nota: '' };
  return {
    fornecedor: { nome: t(g.fornecedor.nome), cnpj: t(g.fornecedor.cnpj), ...ok },
    dataProposta: { data: t(g.dataProposta), ...ok },
    itens: g.itens.map((l) => ({
      descricaoOriginal: l.descricao,
      itemIdCorrespondente: t(l.itemId),
      quantidade: l.quantidade,
      unidadeTexto: t(l.unidade.texto),
      unidade: l.unidade.codigo || UNIDADE_DESCONHECIDA,
      conteudoEmbalagem: l.unidade.conteudo || { quantidade: 0, unidade: 'un' },
      precoUnitario: l.precoUnitario,
      total: l.total,
      confianca: 'alta',
      camposDuvidosos: [],
      nota: '',
    })),
    frete: { tipo: g.frete.tipo, valor: g.frete.valor, ...ok },
    prazoEntrega: { dias: g.prazoEntrega.dias, texto: t(g.prazoEntrega.texto), ...ok },
    condicaoPagamento: { texto: t(g.condicaoPagamento), descontoAVistaPercentual: g.descontoAVistaPercentual, ...ok },
    validade: { data: t(g.validade.data), dias: g.validade.dias, ...ok },
    totalDeclarado: { valor: g.totalDeclarado, ...ok },
    observacoes: '',
  };
}

export function clienteSimuladoPara(gabarito, usoEstimado) {
  return {
    messages: {
      parse: async (req) => ({
        id: 'msg_simulado',
        model: `${req.model} (simulado)`,
        stop_reason: 'end_turn',
        stop_details: null,
        content: [],
        parsed_output: paraSaidaModelo(gabarito),
        usage: usoEstimado || { input_tokens: 0, output_tokens: 0 },
      }),
    },
  };
}
