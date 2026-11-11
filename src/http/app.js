// Servidor HTTP (node:http, sem framework). createApp devolve o handler, para testes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarOrigem, ehJson, validarArquivo, MAX_CORPO_JSON } from './security.js';
import { CotacaoSchema, ExtrairSchema } from './payload.js';
import { montarMapa } from '../core/quoteMap.js';
import { gerarAlertas } from '../core/alerts.js';
import { statusMapaFinal } from '../core/review.js';
import { gerarXlsx } from '../export/xlsx.js';
import { traduzirErro } from '../ai/errors.js';
import { MODELO } from '../ai/extract.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ESTATICOS = [
  { prefixo: '/core/', dir: path.join(RAIZ, 'src', 'core') },
  { prefixo: '/', dir: path.join(RAIZ, 'public') },
];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const CABECALHOS_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

export function hojeLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function enviarJson(res, status, corpo) {
  const txt = JSON.stringify(corpo);
  res.writeHead(status, { ...CABECALHOS_SEGURANCA, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(txt);
}

const erro = (res, status, codigo, mensagem, extra) => enviarJson(res, status, { erro: { codigo, mensagem, ...extra } });

function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    let excedeu = false;
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) {
        excedeu = true;
        partes.length = 0;
        return;
      }
      partes.push(c);
    });
    req.on('end', () => (excedeu ? reject(Object.assign(new Error('grande'), { codigo: 'corpo_grande' })) : resolve(Buffer.concat(partes))));
    req.on('error', reject);
  });
}

async function servirEstatico(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/') caminho = '/index.html';
  for (const { prefixo, dir } of ESTATICOS) {
    if (!caminho.startsWith(prefixo)) continue;
    const alvo = path.resolve(dir, '.' + caminho.slice(prefixo.length - 1));
    if (!alvo.startsWith(dir + path.sep)) break; // path traversal
    try {
      const conteudo = await readFile(alvo);
      res.writeHead(200, { ...CABECALHOS_SEGURANCA, 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream' });
      res.end(conteudo);
      return;
    } catch {
      /* tenta o próximo */
    }
  }
  erro(res, 404, 'nao_encontrado', 'Página não encontrada.');
}

/**
 * @param {object} opcoes
 * @param {() => boolean} opcoes.temChave
 * @param {(args) => Promise<object>} opcoes.extrator  função que extrai uma proposta
 * @param {() => string} [opcoes.hoje]
 */
export function createApp({ temChave, extrator, hoje = () => hojeLocal() }) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const ehApi = url.pathname.startsWith('/api/');

      if (!ehApi) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return erro(res, 405, 'metodo', 'Método não permitido.');
        const o = verificarOrigem({ ...req.headers, origin: undefined });
        if (!o.ok) return erro(res, 403, 'origem_bloqueada', o.motivo);
        return servirEstatico(req, res);
      }

      const origem = verificarOrigem(req.headers);
      if (!origem.ok) return erro(res, 403, 'origem_bloqueada', origem.motivo);

      if (req.method === 'GET' && url.pathname === '/api/status') {
        return enviarJson(res, 200, { iaDisponivel: temChave(), modelo: MODELO, hoje: hoje() });
      }

      if (req.method !== 'POST') return erro(res, 405, 'metodo', 'Método não permitido.');
      if (!ehJson(req.headers)) return erro(res, 415, 'tipo_conteudo', 'Envie os dados como JSON (Content-Type: application/json).');

      let corpo;
      try {
        corpo = JSON.parse((await lerCorpo(req, MAX_CORPO_JSON)).toString('utf8'));
      } catch (e) {
        if (e.codigo === 'corpo_grande') return erro(res, 413, 'corpo_grande', 'Requisição grande demais (máximo 15 MB).');
        return erro(res, 400, 'json_invalido', 'JSON inválido.');
      }

      if (url.pathname === '/api/extrair') {
        if (!temChave()) {
          return erro(res, 503, 'sem_chave',
            'IA indisponível: ANTHROPIC_API_KEY não configurada no servidor. Preencha a proposta manualmente.');
        }
        const p = ExtrairSchema.safeParse(corpo);
        if (!p.success) return erro(res, 400, 'dados_invalidos', 'Dados inválidos.', { detalhes: p.error.issues.slice(0, 5) });
        let arquivo = null;
        if (p.data.arquivo) {
          const v = validarArquivo(p.data.arquivo);
          if (!v.ok) return erro(res, 400, 'arquivo_invalido', v.motivo);
          arquivo = { ...v, nome: p.data.arquivo.nome };
        }
        try {
          const r = await extrator({
            itens: p.data.itens,
            arquivo,
            texto: p.data.texto ?? null,
            id: p.data.propostaId || `p${Date.now().toString(36)}`,
            origem: { arquivo: arquivo?.nome || 'texto colado', tipo: arquivo?.tipo || 'texto', modo: 'ia' },
          });
          return enviarJson(res, 200, r);
        } catch (e) {
          const t = traduzirErro(e);
          if (t.codigo === 'erro_interno') console.error(e);
          return erro(res, t.status, t.codigo, t.mensagem);
        }
      }

      if (url.pathname === '/api/exportar') {
        const p = CotacaoSchema.safeParse(corpo);
        if (!p.success) return erro(res, 400, 'dados_invalidos', 'Dados inválidos.', { detalhes: p.error.issues.slice(0, 5) });
        const { itens, propostas } = p.data;
        const st = statusMapaFinal(propostas);
        if (!st.liberado) {
          return erro(res, 409, 'revisao_pendente', `Revise todas as propostas antes de exportar: ${st.naoRevisadas.join(', ')}.`);
        }
        const dia = hoje();
        const mapa = montarMapa(itens, propostas);
        const alertas = gerarAlertas(itens, propostas, { hoje: dia });
        const buf = await gerarXlsx({ itens, propostas, mapa, alertas, hoje: dia });
        res.writeHead(200, {
          ...CABECALHOS_SEGURANCA,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="mapa-cotacao-${dia}.xlsx"`,
          'Cache-Control': 'no-store',
        });
        return res.end(buf);
      }

      return erro(res, 404, 'nao_encontrado', 'Rota não encontrada.');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) erro(res, 500, 'erro_interno', 'Erro interno do servidor.');
    }
  };
}
