// Extração de uma proposta com a IA. O cliente da Anthropic é injetado, para
// que os testes usem um cliente simulado sem chamar a API.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import ExcelJS from 'exceljs';
import { ExtracaoSchema } from './schema.js';
import { PROMPT_SISTEMA, montarConteudo } from './prompt.js';
import { validarExtracao } from './validar.js';
import { ErroExtracao } from './errors.js';

export const MODELO = process.env.MODELO_IA || 'claude-haiku-5-5';
export const ESFORCO = process.env.ESFORCO_IA || 'medium';
export const MAX_TOKENS = 16000;

// US$ por milhão de tokens (Claude Haiku 5.5, prompts até 100 mil tokens).
export const PRECO_POR_MTOK = { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125 };

export function custoUSD(uso, preco = PRECO_POR_MTOK) {
  if (!uso) return 0;
  return (
    ((uso.input_tokens || 0) * preco.entrada +
      (uso.output_tokens || 0) * preco.saida +
      (uso.cache_read_input_tokens || 0) * preco.cacheLeitura +
      (uso.cache_creation_input_tokens || 0) * preco.cacheEscrita) /
    1e6
  );
}

export function criarCliente() {
  // Lê ANTHROPIC_API_KEY do ambiente; a chave nunca sai do servidor.
  return new Anthropic({ maxRetries: 2, timeout: 120_000 });
}

function textoCelula(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return textoCelula(v.result);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return String(v);
}

/** Converte XLSX em texto tabulado (uma seção por aba), para enviar ao modelo. */
export async function planilhaParaTexto(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const partes = [];
  wb.eachSheet((ws) => {
    const linhas = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const valores = [];
      for (let c = 1; c <= row.cellCount; c++) valores.push(textoCelula(row.getCell(c).value).trim());
      if (valores.some(Boolean)) linhas.push(valores.join('\t'));
    });
    if (linhas.length) partes.push(`## Aba: ${ws.name}\n${linhas.join('\n')}`);
  });
  return partes.join('\n\n');
}

/** Prepara o documento para o prompt a partir de um arquivo validado ou texto colado. */
export async function prepararDocumento({ arquivo, texto }) {
  if (texto != null) return { tipo: 'texto', texto: String(texto) };
  const { tipo, buffer, nome } = arquivo;
  if (tipo === 'pdf' || tipo === 'png' || tipo === 'jpg') {
    return { tipo, base64: buffer.toString('base64'), nome };
  }
  if (tipo === 'xlsx') return { tipo: 'texto', texto: await planilhaParaTexto(buffer), nome };
  return { tipo: 'texto', texto: buffer.toString('utf8'), nome };
}

/** Parâmetros da requisição à API (função separada para ser testável). */
export function montarRequisicao(itens, documento, { modelo = MODELO, esforco = ESFORCO } = {}) {
  return {
    model: modelo,
    max_tokens: MAX_TOKENS,
    system: PROMPT_SISTEMA,
    messages: [{ role: 'user', content: montarConteudo(itens, documento) }],
    output_config: { effort: esforco, format: zodOutputFormat(ExtracaoSchema) },
  };
}

/**
 * Extrai uma proposta.
 * @returns {{ proposta, problemas, uso, custoUSD, duracaoMs, modelo }}
 * @throws ErroExtracao | ErroValidacao | erros do SDK (traduzidos em errors.js)
 */
export async function extrairProposta({ client, itens, documento, id, origem, modelo, esforco }) {
  if (!itens?.length) throw new ErroExtracao('sem_itens', 'Informe a lista de itens antes de enviar propostas.', 400);
  const req = montarRequisicao(itens, documento, { modelo, esforco });
  const inicio = Date.now();
  const resp = await client.messages.parse(req);
  const duracaoMs = Date.now() - inicio;

  if (resp.stop_reason === 'refusal') {
    throw new ErroExtracao('recusa',
      'O modelo se recusou a processar este documento. Preencha esta proposta manualmente.', 422,
      resp.stop_details ?? null);
  }
  if (resp.stop_reason === 'max_tokens') {
    throw new ErroExtracao('resposta_truncada',
      'A proposta é longa demais e a resposta foi cortada. Divida o arquivo ou preencha manualmente.', 422);
  }
  if (resp.parsed_output == null) {
    throw new ErroExtracao('formato_invalido', 'A IA não devolveu dados no formato esperado. Tente novamente.', 502);
  }
  // Revalida no servidor, independentemente do que o SDK já validou.
  const { proposta, problemas } = validarExtracao(resp.parsed_output, itens, { id, origem });
  return {
    proposta,
    problemas,
    uso: resp.usage,
    custoUSD: custoUSD(resp.usage),
    duracaoMs,
    modelo: resp.model || req.model,
  };
}
