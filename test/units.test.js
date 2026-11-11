import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarUnidade, razaoConversao, converterLinha, formatarUnidade, CODIGOS_UNIDADE } from '../src/core/units.js';
import { interpretarListaItens } from '../src/core/items.js';

const u = interpretarUnidade;

test('reconhece sinônimos comuns', () => {
  assert.equal(u('UN').codigo, 'un');
  assert.equal(u('pç').codigo, 'un');
  assert.equal(u('m²').codigo, 'm2');
  assert.equal(u('M2').codigo, 'm2');
  assert.equal(u('m³').codigo, 'm3');
  assert.equal(u('Sacos').codigo, 'sc');
  assert.equal(u('kg.').codigo, 'kg');
  assert.equal(u('metro linear').codigo, 'm');
  assert.equal(u('ton').codigo, 't');
  assert.equal(u('Milheiro').codigo, 'milheiro');
});

test('interpreta embalagem com conteúdo', () => {
  assert.deepEqual(u('cx c/ 50').conteudo, { quantidade: 50, unidade: 'un' });
  assert.deepEqual(u('Cx com 100 pçs').conteudo, { quantidade: 100, unidade: 'un' });
  assert.deepEqual(u('sc 50kg').conteudo, { quantidade: 50, unidade: 'kg' });
  assert.deepEqual(u('saco de 20 kg').conteudo, { quantidade: 20, unidade: 'kg' });
  assert.deepEqual(u('rolo 100m').conteudo, { quantidade: 100, unidade: 'm' });
  assert.deepEqual(u('galão 3,6 L').conteudo, { quantidade: 3.6, unidade: 'l' });
  assert.deepEqual(u('barra 6 m').conteudo, { quantidade: 6, unidade: 'm' });
  assert.equal(u('cx c/ 50').codigo, 'cx');
});

test('peça é unidade, não embalagem (bug encontrado pelo eval)', () => {
  for (const t of ['PÇ', 'pç', 'PC', 'peça', 'peças', 'Pecas']) assert.equal(u(t).codigo, 'un', t);
  assert.ok(!CODIGOS_UNIDADE.includes('peca'));
});

test('"ml" é ambíguo em obra e não é convertido sozinho', () => {
  const r = u('ml');
  assert.equal(r.codigo, null);
  assert.match(r.ambigua, /metro linear/);
});

test('texto desconhecido devolve código nulo', () => {
  assert.equal(u('xpto').codigo, null);
  assert.equal(u('').codigo, null);
});

test('razão de conversão: caixa com 50 → unidade', () => {
  const r = razaoConversao(u('cx c/ 50'), u('un'));
  assert.deepEqual(r, { ok: true, razao: 50 });
});

test('razão de conversão: milheiro → unidade, t → kg, saco 50 kg → kg, cm → m', () => {
  assert.equal(razaoConversao(u('milheiro'), u('un')).razao, 1000);
  assert.equal(razaoConversao(u('t'), u('kg')).razao, 1000);
  assert.equal(razaoConversao(u('sc 50kg'), u('kg')).razao, 50);
  assert.equal(razaoConversao(u('cm'), u('m')).razao, 0.01);
  assert.equal(razaoConversao(u('m3'), u('l')).razao, 1000);
});

test('saco 25 kg × saco 50 kg: converte pelo peso', () => {
  const r = razaoConversao(u('sc 25kg'), u('sc 50kg'));
  assert.equal(r.ok, true);
  assert.equal(r.razao, 0.5);
});

test('m² × m é incompatível', () => {
  const r = razaoConversao(u('m2'), u('m'));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /incompatíveis/);
});

test('embalagem sem conteúdo só bate com a mesma embalagem', () => {
  assert.equal(razaoConversao(u('sc'), u('sc')).razao, 1);
  assert.deepEqual(razaoConversao(u('sc 50kg'), u('sc')), { ok: true, razao: 1, assumido: true });
  assert.equal(razaoConversao(u('sc'), u('kg')).ok, false);
  assert.equal(razaoConversao(u('sc'), u('cx')).ok, false);
});

test('converterLinha ajusta quantidade e preço e descreve a conversão', () => {
  const r = converterLinha({ quantidade: 40, precoUnitario: 25, unidade: u('cx c/ 50') }, u('un'));
  assert.equal(r.ok, true);
  assert.equal(r.quantidade, 2000);
  assert.equal(r.precoUnitario, 0.5);
  assert.equal(r.convertido, true);
  assert.match(r.descricao, /40 cx c\/ 50 un → 2\.000 un/);
});

test('converterLinha na mesma unidade não marca conversão', () => {
  const r = converterLinha({ quantidade: 10, precoUnitario: 3, unidade: u('kg') }, u('KG'));
  assert.equal(r.convertido, false);
  assert.equal(r.descricao, null);
});

test('formatarUnidade', () => {
  assert.equal(formatarUnidade(u('cx c/ 50')), 'cx c/ 50 un');
  assert.equal(formatarUnidade(u('m2')), 'm²');
});

test('lista de itens: ponto e vírgula, tabulação e quantidade na frente', () => {
  const { itens, erros } = interpretarListaItens(
    'Descrição\tQtd\tUn\n' +
    'Cimento CP-II 50kg\t100\tsc\n' +
    'Areia média; 12,5; m³\n' +
    '2000 un Parafuso 4,2x32\n' +
    'linha ruim\n' +
    'Fio 2,5mm; 3; ml\n',
  );
  assert.equal(itens.length, 3);
  assert.deepEqual(itens.map((i) => [i.descricao, i.quantidade, i.unidade.codigo]), [
    ['Cimento CP-II 50kg', 100, 'sc'],
    ['Areia média', 12.5, 'm3'],
    ['Parafuso 4,2x32', 2000, 'un'],
  ]);
  assert.equal(erros.length, 2);
  assert.match(erros[1].motivo, /ambígua/);
});
