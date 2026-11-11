import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarMapa, mediana } from '../src/core/quoteMap.js';
import { ITENS, linha, proposta } from './helpers.js';

function cenario() {
  const a = proposta('a', 'Alfa', [
    linha('i1', 100, 'sc', 38),
    linha('i2', 40, 'cx c/ 50', 25), // 0,50/un
    linha('i3', 10, 'm3', 120),
  ], { frete: { tipo: 'FOB', valor: 150 } });
  const b = proposta('b', 'Beta', [
    linha('i1', 100, 'sc', 36),
    linha('i2', 2, 'milheiro', 560), // 0,56/un
  ], { frete: { tipo: 'CIF', valor: null } });
  const c = proposta('c', 'Gama', [
    linha('i1', 100, 'sc', 40),
    linha('i2', 2000, 'un', 0.45),
    linha('i3', 10, 'm3', 110),
  ], { frete: { tipo: 'FOB', valor: 400 } });
  return [a, b, c];
}

test('mediana', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
});

test('células convertem para a unidade do comprador e totalizam sobre a quantidade pedida', () => {
  const m = montarMapa(ITENS, cenario());
  const parafuso = m.linhas[1];
  assert.equal(parafuso.celulas.a.precoUnitario, 0.5);
  assert.equal(parafuso.celulas.a.totalItem, 1000);
  assert.match(parafuso.celulas.a.conversao, /cx c\/ 50 un/);
  assert.equal(parafuso.celulas.b.precoUnitario, 0.56);
  assert.equal(parafuso.celulas.c.conversao, null);
  assert.deepEqual(parafuso.menorPreco, ['c']);
});

test('item não cotado aparece como tal', () => {
  const m = montarMapa(ITENS, cenario());
  assert.equal(m.linhas[2].celulas.b.status, 'nao_cotado');
});

test('totais por fornecedor com e sem frete; CIF conta como zero', () => {
  const m = montarMapa(ITENS, cenario());
  const [a, b, c] = m.fornecedores;
  assert.equal(a.subtotal, 3800 + 1000 + 1200);
  assert.equal(a.totalComFrete, 6000 + 150);
  assert.equal(b.subtotal, 3600 + 1120);
  assert.equal(b.frete, 0);
  assert.equal(b.freteInformado, true);
  assert.equal(b.completo, false);
  assert.equal(c.totalComFrete, 4000 + 900 + 1100 + 400);
});

test('melhor combinação compra cada item do mais barato', () => {
  const m = montarMapa(ITENS, cenario());
  assert.deepEqual(m.melhorCombinacao.porItem, { i1: 'b', i2: 'c', i3: 'c' });
  assert.equal(m.melhorCombinacao.subtotal, 3600 + 900 + 1100);
  assert.equal(m.melhorCombinacao.frete, 400); // b é CIF, c cobra 400
  assert.equal(m.melhorCombinacao.total, 6000);
  assert.deepEqual(m.melhorCombinacao.itensSemCotacao, []);
});

test('combinação considerando frete pode escolher menos fornecedores', () => {
  const m = montarMapa(ITENS, cenario());
  // Alternativa: b (CIF) + a para areia → 3600 + 1000 + 1200 + 150 = 5950 < 6000
  assert.equal(m.melhorCombinacaoComFrete.total, 5950);
  assert.deepEqual(m.melhorCombinacaoComFrete.porItem, { i1: 'b', i2: 'a', i3: 'a' });
});

test('combinação avisa quando usa fornecedor com frete desconhecido (contado como zero)', () => {
  const [a, b, c] = cenario();
  const semFrete = { ...c, frete: { tipo: 'FOB', valor: null } };
  const m = montarMapa(ITENS, [a, b, semFrete]);
  assert.ok(m.melhorCombinacao.fornecedoresUsados.includes('c'));
  assert.deepEqual(m.melhorCombinacao.fornecedoresSemFrete, ['c']);
  assert.deepEqual(montarMapa(ITENS, cenario()).melhorCombinacao.fornecedoresSemFrete, []);
});

test('melhor fornecedor único considera só propostas completas', () => {
  const m = montarMapa(ITENS, cenario());
  assert.equal(m.melhorFornecedorUnico.id, 'a');
  assert.equal(m.melhorFornecedorUnico.total, 6150);
});

test('item sem nenhuma cotação fica fora da combinação e é listado', () => {
  const props = cenario().map((p) => ({ ...p, itens: p.itens.filter((l) => l.itemId !== 'i3') }));
  const m = montarMapa(ITENS, props);
  assert.deepEqual(m.melhorCombinacao.itensSemCotacao, ['i3']);
  assert.equal(m.melhorFornecedorUnico, null);
});

test('unidade incompatível não entra no mapa', () => {
  const p = proposta('x', 'Xis', [linha('i3', 10, 'kg', 5)]);
  const m = montarMapa(ITENS, [p]);
  assert.equal(m.linhas[2].celulas.x.status, 'incompativel');
  assert.equal(m.fornecedores[0].subtotal, 0);
});

test('desconto à vista gera total à vista', () => {
  const p = proposta('d', 'Delta', [linha('i1', 100, 'sc', 40)], {
    descontoAVistaPercentual: 5, frete: { tipo: 'FOB', valor: 100 },
  });
  const m = montarMapa(ITENS, [p]);
  assert.equal(m.fornecedores[0].totalAVista, 4000 * 0.95 + 100);
});

test('empate de menor preço destaca todos', () => {
  const p1 = proposta('p1', 'Um', [linha('i1', 100, 'sc', 30)]);
  const p2 = proposta('p2', 'Dois', [linha('i1', 100, 'sc', 30)]);
  const m = montarMapa(ITENS, [p1, p2]);
  assert.deepEqual(m.linhas[0].menorPreco, ['p1', 'p2']);
});
