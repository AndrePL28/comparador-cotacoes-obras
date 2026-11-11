// Leitura da lista de itens do comprador (texto digitado ou colado do Excel).
import { interpretarUnidade } from './units.js';

function numero(s) {
  let t = String(s ?? '').trim();
  if (!t) return null;
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aceita uma linha por item, em qualquer um destes formatos:
 *   "Cimento CP-II 50kg; 100; sc"     (ponto e vírgula)
 *   "Cimento CP-II 50kg<TAB>100<TAB>sc" (colado do Excel)
 *   "100 sc Cimento CP-II 50kg"        (quantidade e unidade na frente)
 * Retorna { itens: [{id, descricao, quantidade, unidade}], erros: [{linha, texto, motivo}] }.
 */
export function interpretarListaItens(texto) {
  const itens = [];
  const erros = [];
  const linhas = String(texto ?? '').split(/\r?\n/);
  linhas.forEach((bruta, i) => {
    const linha = bruta.trim();
    if (!linha) return;
    let descricao, qtd, un;
    const partes = linha.includes('\t') ? linha.split('\t') : linha.includes(';') ? linha.split(';') : null;
    if (partes) {
      const p = partes.map((x) => x.trim()).filter((x, idx) => x !== '' || idx < 3);
      [descricao, qtd, un] = p;
      // cabeçalho colado junto ("Descrição | Qtd | Un")
      if (i === 0 && numero(qtd) == null && /desc|item|material/i.test(descricao || '')) return;
    } else {
      const m = linha.match(/^(\d+(?:[.,]\d+)*)\s+(\S+)\s+(.+)$/);
      if (m) [, qtd, un, descricao] = m;
    }
    const quantidade = numero(qtd);
    if (!descricao || quantidade == null || quantidade <= 0 || !un) {
      erros.push({ linha: i + 1, texto: linha, motivo: 'use "descrição; quantidade; unidade"' });
      return;
    }
    const unidade = interpretarUnidade(un);
    if (!unidade.codigo) {
      erros.push({
        linha: i + 1,
        texto: linha,
        motivo: unidade.ambigua ? `unidade ambígua: ${unidade.ambigua}` : `unidade não reconhecida: "${un}"`,
      });
      return;
    }
    itens.push({ id: `i${itens.length + 1}`, descricao: descricao.trim(), quantidade, unidade });
  });
  return { itens, erros };
}
