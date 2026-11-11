// Testes do servidor HTTP com extrator simulado (sem chamar a API).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/http/app.js';
import { validarArquivo, verificarOrigem } from '../src/http/security.js';
import { validarExtracao } from '../src/ai/validar.js';
import { ErroExtracao } from '../src/ai/errors.js';
import { ITENS_PEDIDO, saidaModelo } from './fixtures.js';

let servidor;
let base;
let porta;
let comChave = true;
let extracoes = 0;
let falhaExtrator = null;

async function extrator({ itens, id, origem }) {
  extracoes += 1;
  if (falhaExtrator) throw falhaExtrator;
  const { proposta, problemas } = validarExtracao(saidaModelo(), itens, { id, origem });
  return { proposta, problemas, uso: {}, custoUSD: 0, duracaoMs: 1, modelo: 'simulado' };
}

before(async () => {
  servidor = http.createServer(createApp({ temChave: () => comChave, extrator, hoje: () => '2026-11-10' }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  porta = servidor.address().port;
  base = `http://localhost:${porta}`;
});
after(() => servidor.close());

const PDF_B64 = Buffer.from('%PDF-1.4\n%fake\n').toString('base64');

function post(caminho, corpo, headers = {}) {
  return fetch(base + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

// Fetch não deixa trocar o header Host; usa http.request para isso.
function requisicaoCrua({ method = 'GET', path = '/api/status', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: porta, method, path, headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, corpo: d }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('status informa se a IA está disponível', async () => {
  const r = await fetch(`${base}/api/status`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.iaDisponivel, true);
  assert.equal(j.modelo, 'claude-haiku-5-5');
});

test('origem externa é bloqueada', async () => {
  const antes = extracoes;
  const r = await post('/api/extrair', { itens: ITENS_PEDIDO, texto: 'x' }, { Origin: 'https://site-malicioso.example' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).erro.codigo, 'origem_bloqueada');
  assert.equal(extracoes, antes, 'não chegou a extrair');
});

test('Origin "null" e Sec-Fetch-Site cross-site são bloqueados', async () => {
  assert.equal((await post('/api/extrair', {}, { Origin: 'null' })).status, 403);
  assert.equal((await post('/api/exportar', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});

test('Host diferente de localhost é bloqueado (DNS rebinding)', async () => {
  const r = await requisicaoCrua({ headers: { Host: 'atacante.example:3000' } });
  assert.equal(r.status, 403);
  const ok = await requisicaoCrua({ headers: { Host: `127.0.0.1:${porta}` } });
  assert.equal(ok.status, 200);
});

test('só aceita JSON', async () => {
  const r = await fetch(`${base}/api/extrair`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: base }, body: 'oi' });
  assert.equal(r.status, 415);
  const r2 = await post('/api/extrair', '{quebrado');
  assert.equal(r2.status, 400);
  assert.equal((await r2.json()).erro.codigo, 'json_invalido');
});

test('tipo de arquivo inválido é recusado', async () => {
  const r = await post('/api/extrair', { itens: ITENS_PEDIDO, arquivo: { nome: 'virus.exe', base64: 'TVqQAAMAAAAEAAAA' } });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.erro.codigo, 'arquivo_invalido');
  assert.match(j.erro.mensagem, /não suportado/);
});

test('arquivo com extensão de PDF mas conteúdo de outro tipo é recusado', async () => {
  const r = await post('/api/extrair', { itens: ITENS_PEDIDO, arquivo: { nome: 'proposta.pdf', base64: Buffer.from('MZ\x90\x00').toString('base64') } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro.mensagem, /não parece ser um PDF/);
});

test('arquivo acima do limite é recusado', () => {
  const grande = Buffer.alloc(6 * 1024 * 1024);
  grande.write('\x89PNG', 0, 'latin1');
  const v = validarArquivo({ nome: 'foto.png', base64: grande.toString('base64') });
  assert.equal(v.ok, false);
  assert.match(v.motivo, /máximo 5 MB/);
});

test('sem chave configurada, a extração responde 503 com aviso e não chama a IA', async () => {
  comChave = false;
  try {
    const antes = extracoes;
    const r = await post('/api/extrair', { itens: ITENS_PEDIDO, arquivo: { nome: 'p.pdf', base64: PDF_B64 } });
    assert.equal(r.status, 503);
    const j = await r.json();
    assert.equal(j.erro.codigo, 'sem_chave');
    assert.match(j.erro.mensagem, /manualmente/);
    assert.equal(extracoes, antes);
    const st = await (await fetch(`${base}/api/status`)).json();
    assert.equal(st.iaDisponivel, false);
  } finally {
    comChave = true;
  }
});

test('extração de PDF válido devolve proposta para revisão', async () => {
  const r = await post('/api/extrair', { itens: ITENS_PEDIDO, arquivo: { nome: 'p.pdf', base64: PDF_B64 }, propostaId: 'pA' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.proposta.id, 'pA');
  assert.equal(j.proposta.revisada, false);
  assert.equal(j.proposta.origem.tipo, 'pdf');
});

test('texto colado também é aceito; arquivo e texto juntos não', async () => {
  assert.equal((await post('/api/extrair', { itens: ITENS_PEDIDO, texto: 'Cimento 100 sc 38,50' })).status, 200);
  const r = await post('/api/extrair', { itens: ITENS_PEDIDO, texto: 'x', arquivo: { nome: 'p.pdf', base64: PDF_B64 } });
  assert.equal(r.status, 400);
});

test('erro da extração vira resposta com mensagem clara', async () => {
  falhaExtrator = new ErroExtracao('recusa', 'O modelo se recusou a processar este documento.', 422);
  try {
    const r = await post('/api/extrair', { itens: ITENS_PEDIDO, texto: 'x' });
    assert.equal(r.status, 422);
    assert.equal((await r.json()).erro.codigo, 'recusa');
  } finally {
    falhaExtrator = null;
  }
});

test('exportação exige todas as propostas revisadas e revalida os dados', async () => {
  const { proposta } = validarExtracao(saidaModelo(), ITENS_PEDIDO, { id: 'pA' });
  const r = await post('/api/exportar', { itens: ITENS_PEDIDO, propostas: [proposta] });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).erro.codigo, 'revisao_pendente');

  const ok = await post('/api/exportar', { itens: ITENS_PEDIDO, propostas: [{ ...proposta, revisada: true }] });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /spreadsheetml/);
  const buf = Buffer.from(await ok.arrayBuffer());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');

  const absurdo = { ...proposta, revisada: true, itens: [{ ...proposta.itens[0], precoUnitario: 1e12 }] };
  assert.equal((await post('/api/exportar', { itens: ITENS_PEDIDO, propostas: [absurdo] })).status, 400);
});

test('arquivos estáticos: serve a interface e bloqueia path traversal', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/core/units.js`)).status, 200);
  const t = await requisicaoCrua({ path: '/core/..%2f..%2fpackage.json', headers: { Host: `localhost:${porta}` } });
  assert.equal(t.status, 404);
  const t2 = await requisicaoCrua({ path: '/..%2f.env', headers: { Host: `localhost:${porta}` } });
  assert.equal(t2.status, 404);
});

test('verificarOrigem aceita localhost, 127.0.0.1 e [::1]', () => {
  assert.equal(verificarOrigem({ host: 'localhost:3000', origin: 'http://localhost:3000' }).ok, true);
  assert.equal(verificarOrigem({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }).ok, true);
  assert.equal(verificarOrigem({ host: '[::1]:3000', origin: 'http://[::1]:3000' }).ok, true);
  assert.equal(verificarOrigem({ host: 'localhost:3000', origin: 'http://localhost.evil.com' }).ok, false);
});
