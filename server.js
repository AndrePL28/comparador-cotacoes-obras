import http from 'node:http';
import { createApp } from './src/http/app.js';
import { criarCliente, extrairProposta, prepararDocumento, MODELO } from './src/ai/extract.js';

const PORTA = Number(process.env.PORT) || 3000;
const temChave = () => Boolean(process.env.ANTHROPIC_API_KEY);

let cliente = null;
async function extrator({ itens, arquivo, texto, id, origem }) {
  cliente ??= criarCliente();
  const documento = await prepararDocumento({ arquivo, texto });
  return extrairProposta({ client: cliente, itens, documento, id, origem });
}

const servidor = http.createServer(createApp({ temChave, extrator }));
// Escuta só na interface local: o app não fica exposto na rede.
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Comparador de cotações em http://localhost:${PORTA}`);
  console.log(temChave()
    ? `IA ativa (modelo ${MODELO}).`
    : 'AVISO: ANTHROPIC_API_KEY não configurada. O app funciona só com entrada manual.');
});
