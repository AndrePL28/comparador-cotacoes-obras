// Regras de segurança do endpoint. Funções puras, testáveis sem subir servidor.

export const LIMITES_ARQUIVO = {
  pdf: { mime: 'application/pdf', max: 10 * 1024 * 1024 },
  png: { mime: 'image/png', max: 5 * 1024 * 1024 }, // limite de imagem da API
  jpg: { mime: 'image/jpeg', max: 5 * 1024 * 1024 },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', max: 5 * 1024 * 1024 },
  csv: { mime: 'text/csv', max: 1 * 1024 * 1024 },
  txt: { mime: 'text/plain', max: 1 * 1024 * 1024 },
};

// base64 de 10 MB ≈ 13,4 MB + itens e metadados
export const MAX_CORPO_JSON = 15 * 1024 * 1024;

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(hostHeader) {
  if (!hostHeader) return null;
  const h = String(hostHeader).toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
}

/**
 * Aceita apenas requisições locais:
 *  - Host precisa ser localhost/127.0.0.1/[::1] (protege contra DNS rebinding);
 *  - se houver Origin (navegador sempre envia em POST), precisa ser local também;
 *  - Sec-Fetch-Site "cross-site" é recusado.
 * Retorna { ok: true } ou { ok: false, motivo }.
 */
export function verificarOrigem(headers) {
  const host = hostname(headers.host);
  if (!host || !HOSTS_LOCAIS.has(host)) return { ok: false, motivo: 'Host não permitido.' };
  const origin = headers.origin;
  if (origin && origin !== 'null') {
    let url;
    try {
      url = new URL(origin);
    } catch {
      return { ok: false, motivo: 'Origem inválida.' };
    }
    if (!HOSTS_LOCAIS.has(url.hostname === '::1' ? '[::1]' : url.hostname) ||
        !['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, motivo: 'Origem externa bloqueada.' };
    }
  } else if (origin === 'null') {
    return { ok: false, motivo: 'Origem externa bloqueada.' };
  }
  if (headers['sec-fetch-site'] === 'cross-site') return { ok: false, motivo: 'Origem externa bloqueada.' };
  return { ok: true };
}

export function ehJson(headers) {
  return /^application\/json\b/i.test(headers['content-type'] || '');
}

function extensao(nome) {
  const m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}

function assinaturaConfere(tipo, buf) {
  const ini = (bytes) => bytes.every((b, i) => buf[i] === b);
  switch (tipo) {
    case 'pdf': return ini([0x25, 0x50, 0x44, 0x46]); // %PDF
    case 'png': return ini([0x89, 0x50, 0x4e, 0x47]);
    case 'jpg': return ini([0xff, 0xd8, 0xff]);
    case 'xlsx': return ini([0x50, 0x4b, 0x03, 0x04]); // zip
    case 'csv':
    case 'txt': {
      // texto UTF-8 sem bytes nulos
      if (buf.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return true;
      } catch {
        return false;
      }
    }
    default: return false;
  }
}

/**
 * Valida o arquivo enviado em JSON: { nome, base64 }.
 * Confere extensão permitida, tamanho e assinatura binária (não confia no MIME do cliente).
 * Retorna { ok: true, tipo, mime, buffer } ou { ok: false, motivo }.
 */
export function validarArquivo(arquivo) {
  if (!arquivo || typeof arquivo !== 'object') return { ok: false, motivo: 'Arquivo ausente.' };
  const tipo = extensao(arquivo.nome);
  const regra = tipo && LIMITES_ARQUIVO[tipo];
  if (!regra) {
    return { ok: false, motivo: 'Tipo de arquivo não suportado. Use PDF, PNG, JPG, XLSX, CSV ou TXT.' };
  }
  if (typeof arquivo.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(arquivo.base64)) {
    return { ok: false, motivo: 'Conteúdo do arquivo inválido (esperado base64).' };
  }
  const buffer = Buffer.from(arquivo.base64, 'base64');
  if (!buffer.length) return { ok: false, motivo: 'Arquivo vazio.' };
  if (buffer.length > regra.max) {
    return { ok: false, motivo: `Arquivo grande demais: máximo ${regra.max / 1024 / 1024} MB para ${tipo.toUpperCase()}.` };
  }
  if (!assinaturaConfere(tipo, buffer)) {
    return { ok: false, motivo: `O conteúdo não parece ser um ${tipo.toUpperCase()} válido.` };
  }
  return { ok: true, tipo, mime: regra.mime, buffer };
}
