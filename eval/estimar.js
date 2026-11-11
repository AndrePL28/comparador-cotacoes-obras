// Estimativa de tokens e custo SEM chamar a API.
// É uma aproximação: o número real sai do campo `usage` de cada resposta.
import sharp from 'sharp';
import { PROMPT_SISTEMA, textoListaItens } from '../src/ai/prompt.js';
import { montarRequisicao, custoUSD } from '../src/ai/extract.js';

const CHARS_POR_TOKEN = 3.2; // português com números costuma ficar entre 3 e 3,5
const TOKENS_POR_PAGINA_PDF = 1600; // cada página de PDF também é enviada como imagem
const SAIDA_BASE = 250;
const SAIDA_POR_LINHA = 140;
const RACIOCINIO_ESTIMADO = 1500; // pensamento adaptativo em esforço médio: incerto

export async function estimarCaso({ itens, documento, buffer, nLinhas }) {
  const req = montarRequisicao(itens, documento);
  const fixo = (PROMPT_SISTEMA.length + JSON.stringify(req.output_config.format.schema).length +
    textoListaItens(itens).length + 200) / CHARS_POR_TOKEN;
  let doc = 0;
  if (documento.tipo === 'pdf') {
    const paginas = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || [1]).length;
    doc = paginas * (TOKENS_POR_PAGINA_PDF + 600);
  } else if (documento.tipo === 'png' || documento.tipo === 'jpg') {
    const { width, height } = await sharp(buffer).metadata();
    const escala = Math.min(1, 1568 / Math.max(width, height));
    doc = Math.min(1600, Math.ceil((width * escala * height * escala) / 750));
  } else {
    doc = documento.texto.length / CHARS_POR_TOKEN;
  }
  const uso = {
    input_tokens: Math.round(fixo + doc),
    output_tokens: Math.round(SAIDA_BASE + SAIDA_POR_LINHA * nLinhas + RACIOCINIO_ESTIMADO),
  };
  return { uso, custoUSD: custoUSD(uso) };
}
