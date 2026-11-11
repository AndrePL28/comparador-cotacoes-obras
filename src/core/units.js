// Unidades de medida e conversão para uma base comum.
// Funções puras: sem I/O, sem dependências. Usadas no servidor e no navegador.

/**
 * Catálogo de unidades conhecidas.
 * dim: grandeza física. fator: quanto vale 1 unidade na unidade-base da grandeza.
 * Embalagens (cx, sc, rolo...) não têm grandeza própria: dependem do conteúdo
 * ("cx c/ 50 un", "sc 50 kg"). Sem conteúdo, só são comparáveis com a mesma embalagem.
 */
export const UNIDADES = {
  // contagem (base: un)
  un: { dim: 'contagem', fator: 1, nome: 'unidade' },
  par: { dim: 'contagem', fator: 2, nome: 'par' },
  dz: { dim: 'contagem', fator: 12, nome: 'dúzia' },
  cento: { dim: 'contagem', fator: 100, nome: 'cento' },
  milheiro: { dim: 'contagem', fator: 1000, nome: 'milheiro' },
  // comprimento (base: m)
  m: { dim: 'comprimento', fator: 1, nome: 'metro' },
  cm: { dim: 'comprimento', fator: 0.01, nome: 'centímetro' },
  mm: { dim: 'comprimento', fator: 0.001, nome: 'milímetro' },
  // área (base: m²)
  m2: { dim: 'area', fator: 1, nome: 'metro quadrado' },
  // volume (base: L)
  l: { dim: 'volume', fator: 1, nome: 'litro' },
  ml: { dim: 'volume', fator: 0.001, nome: 'mililitro' },
  m3: { dim: 'volume', fator: 1000, nome: 'metro cúbico' },
  // massa (base: kg)
  kg: { dim: 'massa', fator: 1, nome: 'quilograma' },
  g: { dim: 'massa', fator: 0.001, nome: 'grama' },
  t: { dim: 'massa', fator: 1000, nome: 'tonelada' },
  // embalagens
  cx: { dim: 'embalagem', nome: 'caixa' },
  sc: { dim: 'embalagem', nome: 'saco' },
  rolo: { dim: 'embalagem', nome: 'rolo' },
  barra: { dim: 'embalagem', nome: 'barra' },
  lata: { dim: 'embalagem', nome: 'lata' },
  galao: { dim: 'embalagem', nome: 'galão' },
  balde: { dim: 'embalagem', nome: 'balde' },
  pct: { dim: 'embalagem', nome: 'pacote' },
  fardo: { dim: 'embalagem', nome: 'fardo' },
  kit: { dim: 'embalagem', nome: 'kit' },
  tubo: { dim: 'embalagem', nome: 'tubo' },
  chapa: { dim: 'embalagem', nome: 'chapa' },
};

export const CODIGOS_UNIDADE = Object.keys(UNIDADES);
export const CODIGOS_EMBALAGEM = CODIGOS_UNIDADE.filter((c) => UNIDADES[c].dim === 'embalagem');
export const CODIGOS_MEDIDA = CODIGOS_UNIDADE.filter((c) => UNIDADES[c].dim !== 'embalagem');

const SIMBOLO = { m2: 'm²', m3: 'm³', l: 'L', ml: 'mL', galao: 'galão' };

/** Nome curto para exibição: "m²", "cx c/ 50 un". */
export function formatarUnidade(spec) {
  if (!spec || !spec.codigo) return spec?.texto || '?';
  const base = SIMBOLO[spec.codigo] || spec.codigo;
  if (spec.conteudo) {
    const q = String(spec.conteudo.quantidade).replace('.', ',');
    return `${base} c/ ${q} ${SIMBOLO[spec.conteudo.unidade] || spec.conteudo.unidade}`;
  }
  return base;
}

// Sinônimos → código. Chaves já normalizadas (minúsculas, sem acento, sem ponto).
const SINONIMOS = {
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un', u: 'un', pc: 'un', pcs: 'un',
  ud: 'un',
  par: 'par', pares: 'par',
  dz: 'dz', duzia: 'dz', duzias: 'dz',
  cento: 'cento', cent: 'cento',
  milheiro: 'milheiro', mil: 'milheiro', mlh: 'milheiro', milh: 'milheiro',
  m: 'm', mt: 'm', mts: 'm', metro: 'm', metros: 'm', 'metro linear': 'm', 'metros lineares': 'm',
  'm linear': 'm', mlinear: 'm', 'm lin': 'm',
  cm: 'cm', mm: 'mm',
  m2: 'm2', 'metro quadrado': 'm2', 'metros quadrados': 'm2', mq: 'm2',
  m3: 'm3', 'metro cubico': 'm3', 'metros cubicos': 'm3',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  mililitro: 'ml', mililitros: 'ml',
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', quilograma: 'kg',
  g: 'g', gr: 'g', grama: 'g', gramas: 'g',
  t: 't', ton: 't', tonelada: 't', toneladas: 't',
  cx: 'cx', caixa: 'cx', caixas: 'cx', cxs: 'cx',
  sc: 'sc', saco: 'sc', sacos: 'sc', saca: 'sc', scs: 'sc',
  rolo: 'rolo', rolos: 'rolo', rl: 'rolo',
  barra: 'barra', barras: 'barra', br: 'barra', vara: 'barra', varas: 'barra',
  lata: 'lata', latas: 'lata',
  galao: 'galao', galoes: 'galao', gl: 'galao', gal: 'galao',
  balde: 'balde', baldes: 'balde', bd: 'balde',
  pct: 'pct', pacote: 'pct', pacotes: 'pct', pac: 'pct',
  fardo: 'fardo', fardos: 'fardo', fd: 'fardo',
  kit: 'kit', kits: 'kit', jogo: 'kit', conj: 'kit', conjunto: 'kit',
  tubo: 'tubo', tubos: 'tubo',
  peca: 'un', pecas: 'un', 'peça': 'un',
  chapa: 'chapa', chapas: 'chapa', placa: 'chapa', placas: 'chapa',
};

function normalizarTexto(s) {
  return String(s)
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numeroBR(s) {
  // "3,6" → 3.6 ; "1.000" → 1000 ; "1.000,5" → 1000.5
  let t = String(s).trim();
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta um texto de unidade livre.
 * Retorna { codigo, conteudo: {quantidade, unidade} | null, texto, ambigua? }.
 * codigo = null quando não reconhece (ou quando é ambígua, ex.: "ml" em obra
 * costuma ser metro linear, mas também é mililitro).
 */
export function interpretarUnidade(texto) {
  const original = String(texto ?? '').trim();
  const t = normalizarTexto(original);
  if (!t) return { codigo: null, conteudo: null, texto: original };

  if (t === 'ml') {
    return { codigo: null, conteudo: null, texto: original, ambigua: 'mL (mililitro) ou m.l. (metro linear)?' };
  }

  if (SINONIMOS[t]) return { codigo: SINONIMOS[t], conteudo: null, texto: original };

  // Embalagem com conteúdo: "cx c/ 50", "cx com 50 un", "sc 50kg", "saco de 20 kg",
  // "rolo 100m", "barra 6 m", "lata 18l", "galao 3,6 l", "cx 100 pcs"
  const m = t.match(/^([a-z]+)\s*(?:c\/|com|de|c|x|-)?\s*(\d+(?:[.,]\d+)?)\s*([a-z0-9 ]*)$/);
  if (m) {
    const emb = SINONIMOS[m[1]];
    const qtd = numeroBR(m[2]);
    const restoBruto = m[3].trim();
    const resto = restoBruto === '' ? 'un' : restoBruto;
    const unConteudo = resto === 'ml' ? null : SINONIMOS[resto];
    if (emb && UNIDADES[emb].dim === 'embalagem' && qtd && qtd > 0 && unConteudo &&
        UNIDADES[unConteudo].dim !== 'embalagem') {
      return { codigo: emb, conteudo: { quantidade: qtd, unidade: unConteudo }, texto: original };
    }
  }
  return { codigo: null, conteudo: null, texto: original };
}

/**
 * Reduz uma especificação de unidade à sua grandeza e ao fator na unidade-base.
 * Retorna { dim, fator } ou null se a unidade for desconhecida.
 */
export function paraBase(spec) {
  if (!spec || !spec.codigo || !UNIDADES[spec.codigo]) return null;
  const u = UNIDADES[spec.codigo];
  if (u.dim !== 'embalagem') return { dim: u.dim, fator: u.fator };
  if (spec.conteudo) {
    const c = UNIDADES[spec.conteudo.unidade];
    const q = Number(spec.conteudo.quantidade);
    if (!c || c.dim === 'embalagem' || !(q > 0)) return null;
    return { dim: c.dim, fator: q * c.fator };
  }
  // Embalagem sem conteúdo declarado: só se compara com a mesma embalagem.
  return { dim: `embalagem:${spec.codigo}`, fator: 1 };
}

/**
 * Quantas unidades de `destino` cabem em 1 unidade de `origem`.
 * Ex.: origem "cx c/ 50 un", destino "un" → 50.
 * Retorna { ok: true, razao } ou { ok: false, motivo }.
 */
export function razaoConversao(origem, destino) {
  // Mesma embalagem e um dos lados sem conteúdo declarado ("sc" × "sc 50kg"):
  // assume-se a mesma embalagem (razão 1).
  if (origem?.codigo && origem.codigo === destino?.codigo && UNIDADES[origem.codigo]?.dim === 'embalagem' &&
      (!origem.conteudo || !destino.conteudo)) {
    return { ok: true, razao: 1, assumido: true };
  }
  const a = paraBase(origem);
  const b = paraBase(destino);
  if (!a) return { ok: false, motivo: `unidade não reconhecida: "${origem?.texto || origem?.codigo || '?'}"` };
  if (!b) return { ok: false, motivo: `unidade não reconhecida: "${destino?.texto || destino?.codigo || '?'}"` };
  if (a.dim !== b.dim) {
    return {
      ok: false,
      motivo: `unidades incompatíveis: ${formatarUnidade(origem)} × ${formatarUnidade(destino)}`,
    };
  }
  return { ok: true, razao: a.fator / b.fator };
}

/** Duas especificações representam exatamente a mesma unidade? */
export function mesmaUnidade(a, b) {
  const r = razaoConversao(a, b);
  return r.ok && Math.abs(r.razao - 1) < 1e-9 && a.codigo === b.codigo;
}

/**
 * Converte quantidade e preço unitário de uma linha da proposta para a unidade
 * do item do comprador.
 * Retorna { ok, quantidade, precoUnitario, razao, convertido, descricao } ou { ok:false, motivo }.
 */
export function converterLinha({ quantidade, precoUnitario, unidade }, unidadeDestino) {
  const r = razaoConversao(unidade, unidadeDestino);
  if (!r.ok) return r;
  const convertido = !mesmaUnidade(unidade, unidadeDestino);
  const q = quantidade == null ? null : quantidade * r.razao;
  const p = precoUnitario == null ? null : precoUnitario / r.razao;
  const descricao = convertido
    ? `${fmtNum(quantidade)} ${formatarUnidade(unidade)} → ${fmtNum(q)} ${formatarUnidade(unidadeDestino)}` +
      (precoUnitario != null
        ? ` (R$ ${fmtNum(precoUnitario, 2)}/${formatarUnidade(unidade)} → R$ ${fmtNum(p, 4)}/${formatarUnidade(unidadeDestino)})`
        : '')
    : null;
  return { ok: true, quantidade: q, precoUnitario: p, razao: r.razao, convertido, descricao };
}

export function fmtNum(n, casas) {
  if (n == null || !Number.isFinite(n)) return '?';
  const opts = casas == null
    ? { maximumFractionDigits: 3 }
    : { minimumFractionDigits: Math.min(casas, 2), maximumFractionDigits: casas };
  return n.toLocaleString('pt-BR', opts);
}
