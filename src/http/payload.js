// Validação dos dados que chegam do navegador (o servidor não confia no cliente).
import { z } from 'zod';
import { CODIGOS_UNIDADE, CODIGOS_MEDIDA } from '../core/units.js';

const Id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const Texto = (max = 500) => z.string().max(max);
const Num = z.number().finite();
const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const UnidadeSchema = z.object({
  codigo: z.enum(CODIGOS_UNIDADE).nullable(),
  conteudo: z.object({ quantidade: Num.positive(), unidade: z.enum(CODIGOS_MEDIDA) }).nullable().optional(),
  texto: Texto(60).optional().nullable(),
});

export const ItemPedidoSchema = z.object({
  id: Id,
  descricao: Texto(300).min(1),
  quantidade: Num.positive().max(10_000_000),
  unidade: UnidadeSchema,
});

const LinhaSchema = z.object({
  id: Id,
  itemId: Id.nullable(),
  descricao: Texto(300),
  quantidade: Num.nonnegative().max(10_000_000).nullable(),
  unidade: UnidadeSchema,
  precoUnitario: Num.nonnegative().max(1_000_000).nullable(),
  total: Num.nonnegative().max(100_000_000).nullable(),
});

const ConfiancaSchema = z.object({
  nivel: z.enum(['alta', 'media', 'baixa']),
  nota: Texto(1000).nullable().optional(),
  confirmado: z.boolean().optional(),
});

export const PropostaSchema = z.object({
  id: Id,
  origem: z.any().optional(),
  fornecedor: z.object({ nome: Texto(200), cnpj: Texto(30).nullable().optional() }),
  frete: z.object({ tipo: z.enum(['CIF', 'FOB', 'nao_informado']), valor: Num.nonnegative().max(1_000_000).nullable() }),
  prazoEntrega: z.object({ dias: Num.nonnegative().max(365).nullable(), texto: Texto(200).nullable().optional() }),
  condicaoPagamento: Texto(300).nullable(),
  descontoAVistaPercentual: Num.min(0).max(50).nullable(),
  dataProposta: Data.nullable(),
  validade: z.object({ data: Data.nullable(), dias: Num.nonnegative().max(365).nullable() }),
  totalDeclarado: Num.nonnegative().max(100_000_000).nullable(),
  observacoes: Texto(2000).nullable().optional(),
  itens: z.array(LinhaSchema).max(300),
  confianca: z.record(z.string().max(60), ConfiancaSchema).optional().default({}),
  revisada: z.boolean(),
});

export const CotacaoSchema = z.object({
  itens: z.array(ItemPedidoSchema).min(1).max(200),
  propostas: z.array(PropostaSchema).min(1).max(10),
  hoje: Data.optional(),
});

export const ExtrairSchema = z
  .object({
    itens: z.array(ItemPedidoSchema).min(1).max(200),
    arquivo: z.object({ nome: Texto(200), base64: z.string() }).optional(),
    texto: z.string().min(1).max(200_000).optional(),
    propostaId: Id.optional(),
  })
  .refine((x) => !!x.arquivo !== !!x.texto, { message: 'Envie um arquivo ou um texto, não os dois.' });
