// Tradução dos erros do SDK da Anthropic para mensagens claras em português.
// Usa as classes tipadas do SDK (nunca comparação de texto da mensagem).
import Anthropic from '@anthropic-ai/sdk';
import { ErroValidacao } from './validar.js';

/** Erro de extração com código estável e status HTTP para o endpoint. */
export class ErroExtracao extends Error {
  constructor(codigo, mensagem, status = 502, detalhes) {
    super(mensagem);
    this.name = 'ErroExtracao';
    this.codigo = codigo;
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Converte qualquer erro vindo da extração em { status, codigo, mensagem }. */
export function traduzirErro(err) {
  if (err instanceof ErroExtracao) return { status: err.status, codigo: err.codigo, mensagem: err.message };
  if (err instanceof ErroValidacao) {
    return { status: 502, codigo: 'formato_invalido', mensagem: `${err.message} Tente novamente ou preencha manualmente.` };
  }
  // Ordem: do mais específico para o mais genérico.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, codigo: 'timeout', mensagem: 'A IA demorou demais para responder. Tente novamente.' };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, codigo: 'sem_conexao', mensagem: 'Não foi possível conectar à API da Anthropic. Verifique a internet.' };
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 502, codigo: 'chave_invalida', mensagem: 'Chave da API inválida. Confira ANTHROPIC_API_KEY no arquivo .env.' };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 502, codigo: 'sem_permissao', mensagem: 'A chave da API não tem permissão para usar este modelo.' };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { status: 502, codigo: 'modelo_nao_encontrado', mensagem: 'Modelo não encontrado. Confira o nome do modelo configurado.' };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, codigo: 'limite_requisicoes', mensagem: 'Limite de requisições da API atingido. Aguarde um minuto e tente de novo.' };
  }
  if (err instanceof Anthropic.ContentTooLargeError) {
    return { status: 413, codigo: 'arquivo_grande', mensagem: 'O arquivo é grande demais para a API. Envie um arquivo menor ou só as páginas da proposta.' };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, codigo: 'requisicao_invalida', mensagem: `A API recusou a requisição: ${err.message}` };
  }
  if (err instanceof Anthropic.InternalServerError) {
    return { status: 503, codigo: 'api_indisponivel', mensagem: 'A API da Anthropic está instável ou sobrecarregada. Tente novamente em instantes.' };
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) {
      return { status: 502, codigo: 'sem_credito', mensagem: 'Conta da API sem crédito. Verifique o faturamento no Console da Anthropic.' };
    }
    return { status: 502, codigo: 'erro_api', mensagem: `Erro da API (${err.status ?? 'sem status'}). Tente novamente.` };
  }
  return { status: 500, codigo: 'erro_interno', mensagem: 'Erro inesperado na extração. Preencha manualmente ou tente de novo.' };
}
