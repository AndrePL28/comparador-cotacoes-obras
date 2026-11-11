// Validação, no servidor, da saída da IA. Converte a extração no modelo de
// proposta usado pelo mapa (o mesmo da entrada manual) e rebaixa a confiança
// de tudo que não passa nas regras. Valores absurdos são descartados (null),
// nunca "corrigidos" pelo código.
import { ExtracaoSchema, UNIDADE_DESCONHECIDA } from './schema.js';
import { UNIDADES, interpretarUnidade, razaoConversao } from '../core/units.js';

export const FAIXAS = {
  precoUnitario: { min: 0.001, max: 1_000_000 },
  quantidade: { min: 0.0001, max: 10_000_000 },
  totalLinha: { min: 0, max: 100_000_000 },
  frete: { min: 0, max: 1_000_000 },
  desconto: { min: 0, max: 50 },
  prazoDias: { min: 0, max: 365 },
  validadeDias: { min: 0, max: 365 },
  conteudo: { min: 0.0001, max: 100_000 },
};

const PIOR = { alta: 0, media: 1, baixa: 2 };
const piorConfianca = (a, b) => (PIOR[a] >= PIOR[b] ? a : b);
const juntaNota = (...n) => n.filter(Boolean).join(' ') || null;

function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function noIntervalo(v, faixa) {
  return typeof v === 'number' && Number.isFinite(v) && v >= faixa.min && v <= faixa.max;
}

export class ErroValidacao extends Error {
  constructor(mensagem, detalhes) {
    super(mensagem);
    this.name = 'ErroValidacao';
    this.detalhes = detalhes;
  }
}

const vazio = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** Converte as convenções do schema ("" , "desconhecida", conteúdo 0) em null. */
function normalizarVazios(x) {
  const n = structuredClone(x);
  for (const k of ['fornecedor', 'dataProposta', 'frete', 'prazoEntrega', 'condicaoPagamento', 'validade', 'totalDeclarado']) {
    n[k].nota = vazio(n[k].nota);
  }
  n.fornecedor.nome = vazio(n.fornecedor.nome);
  n.fornecedor.cnpj = vazio(n.fornecedor.cnpj);
  n.dataProposta.data = vazio(n.dataProposta.data);
  n.prazoEntrega.texto = vazio(n.prazoEntrega.texto);
  n.condicaoPagamento.texto = vazio(n.condicaoPagamento.texto);
  n.validade.data = vazio(n.validade.data);
  n.observacoes = vazio(n.observacoes);
  for (const it of n.itens) {
    it.nota = vazio(it.nota);
    it.itemIdCorrespondente = vazio(it.itemIdCorrespondente);
    if (it.unidade === UNIDADE_DESCONHECIDA) it.unidade = null;
    if (!it.conteudoEmbalagem || it.conteudoEmbalagem.quantidade === 0) it.conteudoEmbalagem = null;
  }
  return n;
}

/**
 * @param {unknown} bruto saída do modelo (já parseada como JSON)
 * @param {Array} itensPedido lista do comprador [{id, ...}]
 * @param {object} meta { id, origem }
 * @returns {{ proposta, problemas: string[] }}
 */
export function validarExtracao(bruto, itensPedido, meta = {}) {
  const r = ExtracaoSchema.safeParse(bruto);
  if (!r.success) {
    throw new ErroValidacao('A resposta da IA não segue o formato esperado.', r.error.issues.slice(0, 5));
  }
  const x = normalizarVazios(r.data);
  const problemas = [];
  const confianca = {};
  const idsValidos = new Set(itensPedido.map((i) => i.id));
  const conf = (campo, nivel, nota) => {
    confianca[campo] = { nivel, nota: nota || null, confirmado: false };
  };

  // --- número dentro da faixa ou null + baixa confiança
  const num = (v, faixa, rotulo, notas) => {
    if (v == null) return null;
    if (noIntervalo(v, faixa)) return v;
    problemas.push(`${rotulo}: valor rejeitado (${v}).`);
    notas.push(`Valor ${v} rejeitado pela validação (fora da faixa plausível).`);
    return null;
  };

  // --- fornecedor
  conf('fornecedor', x.fornecedor.nome ? x.fornecedor.confianca : 'baixa',
    juntaNota(x.fornecedor.nota, x.fornecedor.nome ? null : 'Nome do fornecedor não encontrado.'));

  // --- data da proposta
  let dataProposta = x.dataProposta.data;
  if (dataProposta != null && !dataValida(dataProposta)) {
    problemas.push(`dataProposta inválida (${dataProposta}).`);
    conf('dataProposta', 'baixa', juntaNota(x.dataProposta.nota, `Data "${dataProposta}" inválida.`));
    dataProposta = null;
  } else {
    conf('dataProposta', x.dataProposta.confianca, x.dataProposta.nota);
  }

  // --- itens
  const itens = x.itens.map((it, idx) => {
    const id = `l${idx + 1}`;
    const notas = [];
    let nivel = it.confianca;
    if (it.camposDuvidosos.length && nivel === 'alta') nivel = 'media';

    let itemId = it.itemIdCorrespondente;
    if (itemId != null && !idsValidos.has(itemId)) {
      problemas.push(`Linha ${idx + 1}: item "${itemId}" não existe na lista.`);
      notas.push(`A IA apontou o item "${itemId}", que não existe na lista; associe manualmente.`);
      itemId = null;
      nivel = 'baixa';
    }

    const quantidade = num(it.quantidade, FAIXAS.quantidade, `Linha ${idx + 1} quantidade`, notas);
    const precoUnitario = num(it.precoUnitario, FAIXAS.precoUnitario, `Linha ${idx + 1} preço`, notas);
    const total = num(it.total, FAIXAS.totalLinha, `Linha ${idx + 1} total`, notas);
    if ((it.quantidade != null && quantidade == null) || (it.precoUnitario != null && precoUnitario == null) ||
        (it.total != null && total == null)) nivel = 'baixa';
    if (precoUnitario == null) {
      nivel = 'baixa';
      if (it.precoUnitario == null) notas.push('Preço unitário não encontrado.');
    }

    // unidade: o código vem da IA, mas o texto original é reinterpretado pelo código
    let unidade = null;
    const doTexto = interpretarUnidade(it.unidadeTexto);
    if (it.unidade && UNIDADES[it.unidade]) {
      let conteudo = null;
      if (UNIDADES[it.unidade].dim === 'embalagem' && it.conteudoEmbalagem) {
        const q = it.conteudoEmbalagem.quantidade;
        if (noIntervalo(q, FAIXAS.conteudo)) conteudo = { quantidade: q, unidade: it.conteudoEmbalagem.unidade };
        else {
          problemas.push(`Linha ${idx + 1}: conteúdo de embalagem rejeitado (${q}).`);
          notas.push(`Conteúdo da embalagem (${q}) rejeitado.`);
          nivel = 'baixa';
        }
      }
      unidade = { codigo: it.unidade, conteudo, texto: it.unidadeTexto };
      // se o texto tem leitura própria e ela diverge da IA, sinaliza
      if (doTexto.codigo) {
        const r2 = razaoConversao(doTexto, unidade);
        if (!r2.ok || Math.abs(r2.razao - 1) > 1e-9) {
          notas.push(`Unidade escrita "${it.unidadeTexto}" não bate com a interpretação da IA; confira.`);
          nivel = 'baixa';
        }
      }
    } else if (doTexto.codigo) {
      unidade = doTexto;
      notas.push(`Unidade interpretada pelo sistema a partir de "${it.unidadeTexto}".`);
      nivel = piorConfianca(nivel, 'media');
    } else {
      unidade = { codigo: null, conteudo: null, texto: it.unidadeTexto };
      notas.push(doTexto.ambigua ? `Unidade ambígua: ${doTexto.ambigua}` : `Unidade "${it.unidadeTexto}" não reconhecida.`);
      nivel = 'baixa';
    }

    conf(`itens.${id}`, nivel, juntaNota(it.nota, ...notas));
    return { id, itemId, descricao: it.descricaoOriginal, quantidade, unidade, precoUnitario, total };
  });

  let frete, prazoEntrega, condicaoPagamento, descontoAVistaPercentual, validade, totalDeclarado;

  // --- frete
  {
    const notas = [];
    let valor = num(x.frete.valor, FAIXAS.frete, 'Frete', notas);
    let nivel = x.frete.confianca;
    if (x.frete.valor != null && valor == null) nivel = 'baixa';
    if (x.frete.tipo === 'CIF' && valor) {
      notas.push('Frete marcado como incluso (CIF) mas com valor; confira.');
      nivel = 'baixa';
    }
    frete = { tipo: x.frete.tipo, valor: x.frete.tipo === 'CIF' ? null : valor };
    conf('frete', nivel, juntaNota(x.frete.nota, ...notas));
  }

  // --- prazo
  {
    const notas = [];
    const dias = num(x.prazoEntrega.dias, FAIXAS.prazoDias, 'Prazo', notas);
    prazoEntrega = { dias, texto: x.prazoEntrega.texto };
    conf('prazoEntrega', x.prazoEntrega.dias != null && dias == null ? 'baixa' : x.prazoEntrega.confianca,
      juntaNota(x.prazoEntrega.nota, ...notas));
  }

  // --- pagamento e desconto
  {
    const notas = [];
    const desc = num(x.condicaoPagamento.descontoAVistaPercentual, FAIXAS.desconto, 'Desconto', notas);
    condicaoPagamento = x.condicaoPagamento.texto;
    descontoAVistaPercentual = desc;
    conf('condicaoPagamento',
      x.condicaoPagamento.descontoAVistaPercentual != null && desc == null ? 'baixa' : x.condicaoPagamento.confianca,
      juntaNota(x.condicaoPagamento.nota, ...notas));
  }

  // --- validade
  {
    const notas = [];
    let data = x.validade.data;
    let nivel = x.validade.confianca;
    if (data != null && !dataValida(data)) {
      problemas.push(`Validade inválida (${data}).`);
      notas.push(`Data de validade "${data}" inválida.`);
      data = null;
      nivel = 'baixa';
    }
    const dias = num(x.validade.dias, FAIXAS.validadeDias, 'Validade', notas);
    if (x.validade.dias != null && dias == null) nivel = 'baixa';
    if (data && dataProposta && data < dataProposta) {
      notas.push('Validade anterior à data da proposta; confira.');
      nivel = 'baixa';
    }
    validade = { data, dias };
    conf('validade', nivel, juntaNota(x.validade.nota, ...notas));
  }

  // --- total declarado
  {
    const notas = [];
    const valor = num(x.totalDeclarado.valor, FAIXAS.totalLinha, 'Total declarado', notas);
    totalDeclarado = valor;
    conf('totalDeclarado', x.totalDeclarado.valor != null && valor == null ? 'baixa' : x.totalDeclarado.confianca,
      juntaNota(x.totalDeclarado.nota, ...notas));
  }

  const proposta = {
    id: meta.id || 'p1',
    origem: meta.origem || null,
    fornecedor: { nome: x.fornecedor.nome || '(fornecedor sem nome)', cnpj: x.fornecedor.cnpj },
    frete,
    prazoEntrega,
    condicaoPagamento,
    descontoAVistaPercentual,
    dataProposta,
    validade,
    totalDeclarado,
    observacoes: x.observacoes,
    itens,
    confianca,
    revisada: false,
  };
  return { proposta, problemas };
}
