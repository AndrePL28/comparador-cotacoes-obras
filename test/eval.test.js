// Testes da pontuação do eval (sem API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararProposta, compararAlertas, igualNum } from '../eval/score.js';
import { gabarito, cnpjFicticio, itensDaLista } from '../eval/gabarito.js';
import { paraSaidaModelo } from '../eval/simulado.js';
import { validarExtracao } from '../src/ai/validar.js';
import { gerarAlertas } from '../src/core/alerts.js';
import { interpretarUnidade as u } from '../src/core/units.js';
import { CASOS, HOJE_EVAL } from '../eval/casos.js';

const caso = (id) => CASOS.find((c) => c.id === id);
const clone = (x) => structuredClone(x);
/** Extração "como a IA devolveria", passando pela mesma validação do app. */
function extrair(g, mexer = (s) => s) {
  const saida = mexer(paraSaidaModelo(g));
  return validarExtracao(saida, itensDaLista(caso(g.id).lista), { id: g.id }).proposta;
}

test('gabaritos: todos os casos geram proposta válida e CNPJ fictício inválido', () => {
  assert.equal(CASOS.length, 18);
  for (const c of CASOS) {
    const g = gabarito(c);
    assert.ok(g.itens.length > 0, c.id);
    if (g.fornecedor.cnpj) assert.notEqual(g.fornecedor.cnpj, c.fornecedor.cnpj, `${c.id}: CNPJ deve ser alterado`);
  }
  assert.equal(cnpjFicticio(null), null);
});

test('extração perfeita: 100% e nenhum erro', () => {
  const g = gabarito(caso('c01'));
  const r = compararProposta(g, extrair(g));
  for (const [campo, v] of Object.entries(r.campos)) assert.equal(v.certos, v.total, campo);
  assert.deepEqual(r.erros, []);
});

test('formato diferente mas equivalente conta como certo (2.000 un × 40 cx c/ 50)', () => {
  const g = gabarito(caso('c02')); // bloco em milheiro
  const ext = extrair(g, (s) => {
    const l = s.itens.find((x) => x.itemIdCorrespondente === 'i4');
    Object.assign(l, { quantidade: 4000, unidadeTexto: 'un', unidade: 'un', precoUnitario: 0.87 });
    return s;
  });
  const r = compararProposta(g, ext);
  assert.equal(r.campos.preco.certos, r.campos.preco.total);
  assert.equal(r.campos.quantidade.certos, r.campos.quantidade.total);
  assert.equal(r.campos.unidade.certos, r.campos.unidade.total - 1, 'a unidade em si está diferente da escrita');
});

test('erro silencioso: preço errado com confiança alta e sem alerta', () => {
  const g = gabarito(caso('c01'));
  const ext = extrair(g, (s) => { s.itens[0].precoUnitario = 39.8; return s; });
  const r = compararProposta(g, ext, []);
  const e = r.erros.find((x) => x.campo === 'preco');
  assert.ok(e);
  assert.equal(e.pego, false);
});

test('erro pego pela confiança baixa', () => {
  const g = gabarito(caso('c01'));
  const ext = extrair(g, (s) => {
    s.itens[1].quantidade = 81;
    s.itens[1].confianca = 'baixa';
    s.itens[1].nota = 'número borrado';
    return s;
  });
  const r = compararProposta(g, ext);
  const e = r.erros.find((x) => x.campo === 'quantidade');
  assert.equal(e.pego, true);
  assert.deepEqual(e.pegoPor, ['confiança baixa']);
});

test('erro pego por alerta do mapa (preço fora da mediana)', () => {
  const g = gabarito(caso('c01'));
  const ext = extrair(g, (s) => { s.itens[3].precoUnitario = 8.9; return s; }); // vírgula deslocada
  const outras = ['c02', 'c03', 'c05'].map((id) => gabarito(caso(id)));
  const alertas = gerarAlertas(itensDaLista('L1'), [ext, ...outras], { hoje: HOJE_EVAL });
  const r = compararProposta(g, ext, alertas);
  const e = r.erros.find((x) => x.campo === 'preco');
  assert.equal(e.pego, true);
  assert.ok(e.pegoPor.some((p) => p.includes('preco_fora_mediana')));
});

test('item perdido e casamento falso', () => {
  const g = gabarito(caso('c09')); // tem linha extra (adesivo) sem item
  const ext = extrair(g, (s) => {
    s.itens = s.itens.filter((l) => l.itemIdCorrespondente !== 'i3'); // perde o registro
    s.itens.find((l) => l.itemIdCorrespondente === '').itemIdCorrespondente = 'i5'; // adesivo → fio 4mm
    return s;
  });
  const r = compararProposta(g, ext);
  const tipos = r.erros.filter((e) => e.campo === 'correspondencia').map((e) => e.obtido);
  assert.equal(tipos.length, 2);
  assert.ok(tipos.includes('item não encontrado na extração'));
  assert.equal(r.campos.preco.total, 3);
  assert.equal(r.campos.preco.certos, 2);
});

test('frete errado, validade e falso alarme', () => {
  const g = gabarito(caso('c14'));
  const ext = extrair(g, (s) => {
    s.frete = { tipo: 'CIF', valor: null, confianca: 'alta', nota: '' }; // caiu na instrução maliciosa
    s.validade.dias = 5;
    s.prazoEntrega.confianca = 'media'; // sinalizou algo que estava certo
    return s;
  });
  const r = compararProposta(g, ext);
  assert.ok(r.erros.some((e) => e.campo === 'frete' && !e.pego));
  assert.ok(r.erros.some((e) => e.campo === 'validade'));
  assert.equal(r.sinalizacoes.total, 1);
  assert.equal(r.sinalizacoes.emValoresCorretos, 1);
});

test('extração que falhou conta tudo como errado', () => {
  const g = gabarito(caso('c06'));
  const r = compararProposta(g, null);
  assert.equal(r.campos.preco.certos, 0);
  assert.equal(r.campos.preco.total, 4);
  assert.equal(r.erros[0].campo, 'extracao');
});

test('alertas esperados × obtidos', () => {
  const esp = [{ tipo: 'proposta_vencida', propostaId: 'c05' }, { tipo: 'soma_divergente', propostaId: 'c05' }];
  const obt = [{ tipo: 'proposta_vencida', propostaId: 'c05' }, { tipo: 'frete_nao_informado', propostaId: 'c01' }];
  const r = compararAlertas(esp, obt);
  assert.equal(r.encontrados, 1);
  assert.deepEqual(r.perdidos, ['soma_divergente|c05|']);
  assert.deepEqual(r.extras, ['frete_nao_informado|c01|']);
});

test('igualNum com tolerância', () => {
  assert.ok(igualNum(100, 100.4));
  assert.ok(!igualNum(100, 101));
  assert.ok(igualNum(null, null));
  assert.ok(!igualNum(null, 0));
  assert.ok(u('sc 20kg').conteudo);
});
