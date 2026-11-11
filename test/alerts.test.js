import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarAlertas, validadeEfetiva, somarDias } from '../src/core/alerts.js';
import { pendenciasRevisao, marcarRevisada, confirmarCampo, statusMapaFinal } from '../src/core/review.js';
import { ITENS, linha, proposta } from './helpers.js';

const HOJE = '2026-11-10';
const tipos = (alertas, propostaId) =>
  alertas.filter((a) => !propostaId || a.propostaId === propostaId).map((a) => a.tipo).sort();

function completa(id, extra = {}, itens) {
  return proposta(id, id.toUpperCase(), itens || [
    linha('i1', 100, 'sc', 38),
    linha('i2', 2000, 'un', 0.5),
    linha('i3', 10, 'm3', 120),
  ], extra);
}

test('proposta correta não gera alertas', () => {
  assert.deepEqual(gerarAlertas(ITENS, [completa('a')], { hoje: HOJE }), []);
});

test('item não cotado', () => {
  const p = completa('a', {}, [linha('i1', 100, 'sc', 38), linha('i2', 2000, 'un', 0.5)]);
  const al = gerarAlertas(ITENS, [p], { hoje: HOJE });
  assert.deepEqual(tipos(al), ['item_nao_cotado']);
  assert.equal(al[0].itemId, 'i3');
});

test('conversão de unidade é informada com o cálculo', () => {
  const p = completa('a', {}, [linha('i1', 100, 'sc', 38), linha('i2', 40, 'cx c/ 50', 25), linha('i3', 10, 'm3', 120)]);
  const al = gerarAlertas(ITENS, [p], { hoje: HOJE });
  assert.deepEqual(tipos(al), ['conversao_unidade']);
  assert.match(al[0].mensagem, /40 cx c\/ 50 un → 2\.000 un/);
});

test('unidade incompatível é erro', () => {
  const p = completa('a', {}, [linha('i1', 100, 'sc', 38), linha('i2', 2000, 'un', 0.5), linha('i3', 15000, 'kg', 0.08)]);
  const al = gerarAlertas(ITENS, [p], { hoje: HOJE });
  assert.deepEqual(tipos(al), ['unidade_incompativel']);
  assert.equal(al[0].severidade, 'erro');
});

test('quantidade cotada diferente da pedida', () => {
  const p = completa('a', {}, [linha('i1', 80, 'sc', 38), linha('i2', 2000, 'un', 0.5), linha('i3', 10, 'm3', 120)]);
  assert.deepEqual(tipos(gerarAlertas(ITENS, [p], { hoje: HOJE })), ['quantidade_divergente']);
});

test('preço muito fora da mediana (precisa de 3 cotações)', () => {
  const props = [
    completa('a'),
    completa('b'),
    completa('c', {}, [linha('i1', 100, 'sc', 38), linha('i2', 2000, 'un', 5), linha('i3', 10, 'm3', 120)]),
  ];
  const al = gerarAlertas(ITENS, props, { hoje: HOJE });
  assert.deepEqual(tipos(al), ['preco_fora_mediana']);
  assert.equal(al[0].propostaId, 'c');
  assert.match(al[0].mensagem, /acima da mediana/);
  // com só 2 cotações não compara
  assert.deepEqual(gerarAlertas(ITENS, props.slice(1), { hoje: HOJE }).filter((a) => a.tipo === 'preco_fora_mediana'), []);
});

test('frete não informado e FOB a combinar', () => {
  const a = completa('a', { frete: { tipo: 'nao_informado', valor: null } });
  const b = completa('b', { frete: { tipo: 'FOB', valor: null } });
  const c = completa('c', { frete: { tipo: 'CIF', valor: null } });
  const al = gerarAlertas(ITENS, [a, b, c], { hoje: HOJE });
  assert.deepEqual(tipos(al), ['frete_nao_informado', 'frete_nao_informado']);
  assert.match(al[1].mensagem, /a combinar/);
});

test('validade: por data, por dias, vencida e não informada', () => {
  assert.equal(somarDias('2026-10-25', 10), '2026-11-04');
  assert.equal(validadeEfetiva({ dataProposta: '2026-10-25', validade: { dias: 10 } }), '2026-11-04');
  const vencida = completa('a', { dataProposta: '2026-10-25', validade: { data: null, dias: 10 } });
  const ok = completa('b', { validade: { data: '2026-11-10', dias: null } });
  const sem = completa('c', { dataProposta: null, validade: { data: null, dias: null } });
  const al = gerarAlertas(ITENS, [vencida, ok, sem], { hoje: HOJE });
  assert.deepEqual(tipos(al, 'a'), ['proposta_vencida']);
  assert.deepEqual(tipos(al, 'b'), []);
  assert.deepEqual(tipos(al, 'c'), ['validade_nao_informada']);
  assert.match(al.find((x) => x.tipo === 'proposta_vencida').mensagem, /04\/11\/2026/);
});

test('soma dos itens × total declarado (aceita com e sem frete, e com desconto)', () => {
  // soma = 3800 + 1000 + 1200 = 6000; frete 100
  const semFrete = completa('a', { totalDeclarado: 6000 });
  const comFrete = completa('b', { totalDeclarado: 6100 });
  const comDesconto = completa('c', { totalDeclarado: 5800, descontoAVistaPercentual: 5 }); // 6000*0.95+100
  const errado = completa('d', { totalDeclarado: 6500 });
  const al = gerarAlertas(ITENS, [semFrete, comFrete, comDesconto, errado], { hoje: HOJE });
  assert.deepEqual(tipos(al), ['soma_divergente']);
  assert.equal(al[0].propostaId, 'd');
});

test('total da linha diferente de quantidade × preço', () => {
  const p = completa('a', {}, [linha('i1', 100, 'sc', 38, 3500), linha('i2', 2000, 'un', 0.5), linha('i3', 10, 'm3', 120)]);
  assert.deepEqual(tipos(gerarAlertas(ITENS, [p], { hoje: HOJE })), ['total_linha_divergente']);
});

test('linha sem correspondência e item duplicado', () => {
  const extra = { ...linha('i1', 1, 'un', 10), itemId: null, descricao: 'Lixa 120' };
  const p = completa('a', {}, [linha('i1', 100, 'sc', 38), linha('i1', 100, 'sc', 39), linha('i2', 2000, 'un', 0.5),
    linha('i3', 10, 'm3', 120), extra]);
  assert.deepEqual(tipos(gerarAlertas(ITENS, [p], { hoje: HOJE })), ['item_duplicado', 'item_sem_correspondencia']);
});

test('campo de baixa confiança gera alerta até ser confirmado', () => {
  const p = completa('a', { confianca: { frete: { nivel: 'baixa', nota: 'valor ilegível', confirmado: false } } });
  assert.deepEqual(tipos(gerarAlertas(ITENS, [p], { hoje: HOJE })), ['baixa_confianca']);
  const ok = confirmarCampo(p, 'frete');
  assert.deepEqual(gerarAlertas(ITENS, [ok], { hoje: HOJE }), []);
});

test('revisão: não marca revisada com pendência; mapa final exige todas revisadas', () => {
  const p = completa('a', {
    revisada: false,
    confianca: {
      frete: { nivel: 'baixa', nota: 'x', confirmado: false },
      prazoEntrega: { nivel: 'media', nota: 'y', confirmado: false },
    },
  });
  assert.deepEqual(pendenciasRevisao(p).map((x) => x.campo), ['frete']);
  assert.throws(() => marcarRevisada(p), /baixa confiança/);
  const revisada = marcarRevisada(confirmarCampo(p, 'frete'));
  assert.equal(revisada.revisada, true);
  assert.deepEqual(statusMapaFinal([revisada, p]), { liberado: false, naoRevisadas: ['A'] });
  assert.deepEqual(statusMapaFinal([revisada]), { liberado: true, naoRevisadas: [] });
  assert.equal(statusMapaFinal([]).liberado, false);
});
