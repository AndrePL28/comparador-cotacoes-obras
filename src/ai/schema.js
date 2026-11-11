// Schema da saída estruturada da IA. É enviado à API (saída estruturada) e
// revalidado no servidor: o que vem do modelo nunca é usado sem passar por aqui
// e por validar.js.
//
// A API limita a 16 o número de campos com tipo união (ex.: número OU null).
// Por isso só os números aceitam null; textos ausentes vêm como "" e unidade
// desconhecida como "desconhecida". validar.js converte tudo de volta para null.
import { z } from 'zod';
import { CODIGOS_UNIDADE, CODIGOS_MEDIDA } from '../core/units.js';

export const UNIDADE_DESCONHECIDA = 'desconhecida';

const Confianca = z.enum(['alta', 'media', 'baixa']);
const Nota = z.string().describe('Dúvida ou observação sobre este valor, em uma frase; "" se não houver.');
const Texto = (d) => z.string().describe(`${d} Use "" se não houver.`);

export const ItemExtraidoSchema = z.object({
  descricaoOriginal: z.string().describe('Descrição do item exatamente como na proposta.'),
  itemIdCorrespondente: Texto('id do item da lista do comprador que corresponde a esta linha.'),
  quantidade: z.number().nullable().describe('Quantidade como escrita na proposta, sem converter.'),
  unidadeTexto: z.string().describe('Unidade exatamente como escrita (ex.: "cx c/ 50", "M2", "sc 50kg").'),
  unidade: z.enum([...CODIGOS_UNIDADE, UNIDADE_DESCONHECIDA]).describe('Código da unidade escrita na proposta.'),
  conteudoEmbalagem: z
    .object({ quantidade: z.number(), unidade: z.enum(CODIGOS_MEDIDA) })
    .describe('Só para embalagens (cx, sc, rolo...): quanto contém cada uma. Use quantidade 0 se não for embalagem ou a proposta não disser.'),
  precoUnitario: z.number().nullable().describe('Preço por unidade da proposta, em reais.'),
  total: z.number().nullable().describe('Total da linha como escrito na proposta.'),
  confianca: Confianca,
  camposDuvidosos: z.array(z.enum(['descricao', 'quantidade', 'unidade', 'precoUnitario', 'total', 'correspondencia'])),
  nota: Nota,
});

export const ExtracaoSchema = z.object({
  fornecedor: z.object({
    nome: Texto('Razão social ou nome do fornecedor.'),
    cnpj: Texto('CNPJ do fornecedor.'),
    confianca: Confianca,
    nota: Nota,
  }),
  dataProposta: z.object({
    data: Texto('Data de emissão no formato AAAA-MM-DD.'),
    confianca: Confianca,
    nota: Nota,
  }),
  itens: z.array(ItemExtraidoSchema),
  frete: z.object({
    tipo: z
      .enum(['CIF', 'FOB', 'nao_informado'])
      .describe('CIF = incluso/grátis/embutido no preço; FOB = cobrado à parte ou por conta do comprador.'),
    valor: z.number().nullable().describe('Valor do frete em reais, se cobrado à parte e informado.'),
    confianca: Confianca,
    nota: Nota,
  }),
  prazoEntrega: z.object({
    dias: z.number().nullable().describe('Prazo de entrega em dias, se informado.'),
    texto: Texto('Prazo como escrito.'),
    confianca: Confianca,
    nota: Nota,
  }),
  condicaoPagamento: z.object({
    texto: Texto('Condição de pagamento como escrita.'),
    descontoAVistaPercentual: z.number().nullable().describe('Desconto para pagamento à vista, em %, se houver.'),
    confianca: Confianca,
    nota: Nota,
  }),
  validade: z.object({
    data: Texto('Data-limite da proposta em AAAA-MM-DD, se escrita como data.'),
    dias: z.number().nullable().describe('Validade em dias a partir da emissão, se escrita assim.'),
    confianca: Confianca,
    nota: Nota,
  }),
  totalDeclarado: z.object({
    valor: z.number().nullable().describe('Valor total escrito na proposta, se houver.'),
    confianca: Confianca,
    nota: Nota,
  }),
  observacoes: Texto('Observações relevantes da proposta.'),
});
