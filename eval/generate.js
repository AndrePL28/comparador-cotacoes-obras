// Gera os arquivos das propostas fictícias e os gabaritos JSON.
// Uso: npm run eval:gerar
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import { CASOS, COMPRADOR, LISTAS } from './casos.js';
import { gabarito, itensDaLista, somaItens, totalDeclarado, totalLinha, cnpjFicticio } from './gabarito.js';
import { CASOS_DEMO, LISTA_DEMO } from '../demo/casos-demo.js';
import { montarMapa } from '../src/core/quoteMap.js';
import { gerarAlertas } from '../src/core/alerts.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases');
const DIR_DEMO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'propostas');

const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dataBR = (s) => s.split('-').reverse().join('/');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataExtenso = (s) => { const [a, m, d] = s.split('-'); return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`; };

function textoValidade(c, estilo = 'formal') {
  if (!c.validade) return null;
  if (c.validade.data) return estilo === 'formal' ? `Validade da proposta: até ${dataBR(c.validade.data)}` : `válido até ${dataBR(c.validade.data).slice(0, 5)}`;
  return estilo === 'formal' ? `Validade da proposta: ${c.validade.dias} dias` : `orçamento vale por ${c.validade.dias} dias`;
}
function textoFrete(c) {
  if (c.frete.tipo === 'FOB' && c.frete.valor != null) return `Frete: R$ ${brl(c.frete.valor)}`;
  return c.frete.texto;
}
const cnpjDe = (c) => cnpjFicticio(c.fornecedor.cnpj);
const emailDe = (c) => `${c.fornecedor.nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@fornecedor.example`;

// ------------------------------------------------------------------ PDF
function gerarPdf(c, destino) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Orçamento ${c.fornecedor.nome}`, Author: 'dados fictícios' } });
    const out = createWriteStream(destino);
    doc.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    const baguncado = c.variante === 'baguncado';

    doc.font('Helvetica-Bold').fontSize(baguncado ? 13 : 16).text(c.fornecedor.nome, { align: baguncado ? 'right' : 'left' });
    doc.font('Helvetica').fontSize(9);
    if (c.fornecedor.cnpj) doc.text(`CNPJ ${cnpjDe(c)} · ${c.fornecedor.cidade}`, { align: baguncado ? 'right' : 'left' });
    doc.text(`Contato: ${c.fornecedor.contato} · ${emailDe(c)}`, { align: baguncado ? 'right' : 'left' });
    doc.moveDown();

    if (baguncado) {
      // condições antes da tabela, em parágrafo corrido
      doc.fontSize(10).text(
        `${c.fornecedor.cidade.split('/')[0]}, ${dataExtenso(c.data)}. Ref.: proposta ${c.numero}. ` +
        `Prezados, conforme solicitado apresentamos nossos preços. ${textoFrete(c)}. ` +
        `Pagamento: ${c.pagamento.texto}${c.pagamento.descontoTexto ? ` (${c.pagamento.descontoTexto})` : ''}. ` +
        `Entrega em ${c.prazo.texto} após confirmação. ${textoValidade(c) || ''}.`,
        { align: 'justify' });
      doc.moveDown();
    } else {
      doc.font('Helvetica-Bold').fontSize(13).text(`ORÇAMENTO Nº ${c.numero}`);
      doc.font('Helvetica').fontSize(10).text(`Data: ${dataBR(c.data)}`);
      doc.text(`Cliente: ${COMPRADOR}`);
      doc.moveDown();
    }

    const cols = baguncado
      ? [['Qtd', 40, 'r'], ['Un.', 60, 'l'], ['Descrição do material', 210, 'l'], ['Total', 85, 'r'], ['Unitário', 80, 'r']]
      : [['Item', 30, 'l'], ['Descrição', 220, 'l'], ['Un', 55, 'l'], ['Qtd', 50, 'r'], ['Vl. Unit.', 70, 'r'], ['Vl. Total', 80, 'r']];
    let y = doc.y;
    const x0 = 40;
    const linhaTabela = (valores, negrito = false) => {
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      let x = x0;
      let h = 0;
      valores.forEach((v, i) => {
        const [, w, al] = cols[i];
        const opts = { width: w - 6, align: al === 'r' ? 'right' : 'left' };
        doc.text(String(v), x + 3, y + 3, opts);
        h = Math.max(h, doc.heightOfString(String(v), opts));
        x += w;
      });
      y += h + 6;
      if (!baguncado) doc.moveTo(x0, y).lineTo(x, y).lineWidth(0.4).strokeColor('#999').stroke();
    };
    linhaTabela(cols.map((c2) => c2[0]), true);
    c.linhas.forEach((l, k) => {
      const tot = totalLinha(l);
      linhaTabela(baguncado
        ? [num(l.qtd), l.un, l.desc, `R$ ${brl(tot)}`, `R$ ${brl(l.preco)}`]
        : [k + 1, l.desc, l.un, num(l.qtd), brl(l.preco), brl(tot)]);
    });
    doc.x = x0;
    doc.y = y + 10;
    const soma = somaItens(c);
    const total = totalDeclarado(c);
    doc.font('Helvetica').fontSize(10);
    if (baguncado) {
      doc.text(`Valor total da proposta: R$ ${brl(total)}`, x0, doc.y, { align: 'right' });
      doc.fontSize(8).fillColor('#555').text('Valores sujeitos a alteração sem aviso prévio. Imagens meramente ilustrativas.', { align: 'right' }).fillColor('#000');
    } else {
      doc.text(`Subtotal: R$ ${brl(soma)}`, { align: 'right' });
      if (c.frete.tipo === 'FOB' && c.frete.valor != null) doc.text(`Frete: R$ ${brl(c.frete.valor)}`, { align: 'right' });
      doc.font('Helvetica-Bold').text(`TOTAL: R$ ${brl(total)}`, { align: 'right' });
      doc.font('Helvetica').moveDown();
      doc.text(`Condição de pagamento: ${c.pagamento.texto}`);
      if (c.pagamento.descontoTexto) doc.text(c.pagamento.descontoTexto);
      if (!(c.frete.tipo === 'FOB' && c.frete.valor != null)) doc.text(c.frete.texto);
      doc.text(`Prazo de entrega: ${c.prazo.texto}`);
      const v = textoValidade(c);
      if (v) doc.text(v);
    }
    doc.moveDown(2).fontSize(8).fillColor('#777').text('Documento fictício gerado para avaliação de software. Empresa, CNPJ e contato inventados.');
    doc.end();
  });
}

// ------------------------------------------------------------------ Imagem (SVG → PNG/JPG)
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function svgImpresso(c) {
  const L = [];
  let y = 60;
  const t = (x, txt, opt = '') => { L.push(`<text x="${x}" y="${y}" ${opt}>${xml(txt)}</text>`); };
  const W = 1000;
  t(40, c.fornecedor.nome.toUpperCase(), 'font-size="30" font-weight="bold"'); y += 34;
  if (c.fornecedor.cnpj) { t(40, `CNPJ: ${cnpjDe(c)}   ${c.fornecedor.cidade.toUpperCase()}`); y += 26; }
  t(40, `ORÇAMENTO ${c.numero}   EMISSÃO ${dataBR(c.data)}   VEND.: ${c.fornecedor.contato.toUpperCase()}`); y += 40;
  L.push(`<line x1="40" y1="${y - 22}" x2="${W - 40}" y2="${y - 22}" stroke="#333" stroke-dasharray="6 4"/>`);
  t(40, 'DESCRIÇÃO'); t(470, 'UN'); t(610, 'QTD', 'text-anchor="end"'); t(770, 'UNIT', 'text-anchor="end"'); t(950, 'TOTAL', 'text-anchor="end"'); y += 32;
  for (const l of c.linhas) {
    t(40, l.desc); t(470, l.un); t(610, num(l.qtd), 'text-anchor="end"'); t(770, brl(l.preco), 'text-anchor="end"');
    t(950, brl(totalLinha(l)), 'text-anchor="end"'); y += 30;
  }
  L.push(`<line x1="40" y1="${y - 14}" x2="${W - 40}" y2="${y - 14}" stroke="#333" stroke-dasharray="6 4"/>`);
  y += 14;
  t(950, `SUBTOTAL ${brl(somaItens(c))}`, 'text-anchor="end"'); y += 30;
  t(950, textoFrete(c).toUpperCase(), 'text-anchor="end"'); y += 30;
  t(950, `TOTAL R$ ${brl(totalDeclarado(c))}`, 'text-anchor="end" font-weight="bold" font-size="26"'); y += 46;
  t(40, `COND. PGTO: ${c.pagamento.texto.toUpperCase()}`); y += 28;
  t(40, `PRAZO ENTREGA: ${c.prazo.texto.toUpperCase()}`); y += 28;
  const v = textoValidade(c); if (v) { t(40, v.toUpperCase()); y += 28; }
  y += 20;
  t(40, '*** DOCUMENTO FICTÍCIO PARA TESTE ***', 'font-size="16" fill="#666"'); y += 30;
  const H = y + 20;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fbfaf6"/>
    <g font-family="Courier New, Consolas, monospace" font-size="22" fill="#1d1d1d">${L.join('\n')}</g></svg>`, W, H };
}

function svgManuscrito(c) {
  const L = [];
  let y = 80;
  const W = 1000;
  const t = (x, txt, opt = '') => { L.push(`<text x="${x}" y="${y}" ${opt}>${xml(txt)}</text>`); };
  t(60, c.fornecedor.nome, 'font-size="36"'); y += 50;
  t(60, 'Orçamento p/ Constr. Horizonte Azul'); y += 50;
  t(60, `Data: ${dataBR(c.data)}`); y += 60;
  for (const l of c.linhas) {
    t(60, `${num(l.qtd)} ${l.un}  ${l.desc}`);
    t(900, `${brl(l.preco)}`, 'text-anchor="end"');
    y += 52;
  }
  y += 10;
  t(500, `Total ${brl(totalDeclarado(c))}`, 'font-size="34"'); y += 60;
  t(60, `${c.frete.texto} · entrega ${c.prazo.texto}`); y += 50;
  t(60, `pgto ${c.pagamento.texto}`); y += 50;
  t(60, `${c.fornecedor.contato}`, 'font-size="26"'); y += 40;
  t(60, '(documento fictício)', 'font-size="18" fill="#8a8a8a"'); y += 30;
  const H = y + 40;
  const pautas = [];
  for (let py = 100; py < H; py += 52) pautas.push(`<line x1="0" y1="${py + 12}" x2="${W}" y2="${py + 12}" stroke="#b9d3ee" stroke-width="2"/>`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#fffef6"/>${pautas.join('')}
    <line x1="40" y1="0" x2="40" y2="${H}" stroke="#f0a0a0" stroke-width="2"/>
    <g font-family="Segoe Print, Segoe Script, Comic Sans MS, cursive" font-size="30" fill="#1b2a6b">${L.join('\n')}</g></svg>`, W, H };
}

async function gerarImagem(c, destino) {
  const { svg } = c.variante === 'manuscrito' ? svgManuscrito(c) : svgImpresso(c);
  const angulo = c.variante === 'manuscrito' ? -1.8 : 1.2;
  let img = sharp(Buffer.from(svg), { density: 96 })
    .rotate(angulo, { background: c.variante === 'manuscrito' ? '#d8d2c4' : '#e6e3dc' })
    .blur(0.6)
    .modulate({ brightness: 0.96 });
  img = c.formato === 'jpg' ? img.jpeg({ quality: 70 }) : img.png({ compressionLevel: 9 });
  await img.toFile(destino);
}

// ------------------------------------------------------------------ XLSX
async function gerarXlsx(c, destino) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'dados fictícios';
  const ws = wb.addWorksheet(c.variante === 'planilha-baguncada' ? 'Plan1' : 'Orçamento');
  const soma = somaItens(c);
  const total = totalDeclarado(c);
  if (c.variante === 'planilha-baguncada') {
    ws.getCell('A1').value = c.fornecedor.nome;
    ws.getCell('A2').value = `CNPJ ${cnpjDe(c)}`;
    ws.getCell('D3').value = 'Data:';
    ws.getCell('E3').value = new Date(`${c.data}T12:00:00Z`);
    ws.getCell('E3').numFmt = 'dd/mm/yyyy';
    ws.getCell('A5').value = `Orçamento ${c.numero} — A/C ${COMPRADOR}`;
    ws.getRow(8).values = ['Descrição', null, 'Quant.', 'Unid', 'Preço', 'Total'];
    let r = 9;
    for (const l of c.linhas) {
      ws.getRow(r).values = [l.desc, null, l.qtd, l.un, l.preco, { formula: `C${r}*E${r}`, result: totalLinha(l) }];
      r++;
    }
    ws.getCell(`E${r + 1}`).value = 'Soma';
    ws.getCell(`F${r + 1}`).value = { formula: `SUM(F9:F${r - 1})`, result: soma };
    ws.getCell(`E${r + 2}`).value = 'Frete';
    ws.getCell(`F${r + 2}`).value = c.frete.valor;
    ws.getCell(`E${r + 3}`).value = 'Total';
    ws.getCell(`F${r + 3}`).value = { formula: `F${r + 1}+F${r + 2}`, result: total };
    ws.getCell(`E${r + 4}`).value = 'Total à vista (-5%)';
    ws.getCell(`F${r + 4}`).value = { formula: `F${r + 1}*0.95+F${r + 2}`, result: Math.round((soma * 0.95 + (c.frete.valor || 0)) * 100) / 100 };
    ws.getCell('H8').value = 'Observações';
    ws.getCell('H9').value = `Pagamento ${c.pagamento.texto}`;
    ws.getCell('H10').value = c.pagamento.descontoTexto;
    ws.getCell('H11').value = `Entrega ${c.prazo.texto}`;
    ws.getCell('H12').value = `Válido até ${dataBR(c.validade.data)}`;
    ws.getCell('H14').value = 'documento fictício';
  } else {
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = c.fornecedor.nome;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `CNPJ ${cnpjDe(c)} — ${c.fornecedor.cidade} — ${c.fornecedor.contato}`;
    ws.getCell('A3').value = `Orçamento nº ${c.numero}`;
    ws.getCell('E3').value = 'Emissão';
    ws.getCell('F3').value = new Date(`${c.data}T12:00:00Z`);
    ws.getCell('F3').numFmt = 'dd/mm/yyyy';
    ws.getRow(5).values = ['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário', 'Total'];
    ws.getRow(5).font = { bold: true };
    let r = 6;
    c.linhas.forEach((l, k) => {
      ws.getRow(r).values = [k + 1, l.desc, l.un, l.qtd, l.preco, { formula: `D${r}*E${r}`, result: totalLinha(l) }];
      r++;
    });
    ws.getCell(`E${r}`).value = 'Subtotal';
    ws.getCell(`F${r}`).value = { formula: `SUM(F6:F${r - 1})`, result: soma };
    ws.getCell(`E${r + 1}`).value = c.frete.tipo === 'CIF' ? 'Frete (CIF)' : 'Frete';
    ws.getCell(`F${r + 1}`).value = c.frete.tipo === 'CIF' ? 'incluso' : c.frete.valor;
    ws.getCell(`E${r + 2}`).value = 'Total';
    ws.getCell(`F${r + 2}`).value = { formula: `F${r}+${c.frete.tipo === 'CIF' ? 0 : `F${r + 1}`}`, result: total };
    ws.getCell(`A${r + 4}`).value = `Condição de pagamento: ${c.pagamento.texto}`;
    if (c.pagamento.descontoTexto) ws.getCell(`A${r + 5}`).value = c.pagamento.descontoTexto;
    ws.getCell(`A${r + 6}`).value = `Prazo de entrega: ${c.prazo.texto}`;
    ws.getCell(`A${r + 7}`).value = textoValidade(c);
    ws.getCell(`A${r + 9}`).value = 'Documento fictício para teste de software.';
    ['E', 'F'].forEach((col) => (ws.getColumn(col).numFmt = '#,##0.00'));
    ws.getColumn('B').width = 34;
  }
  await wb.xlsx.writeFile(destino);
}

// ------------------------------------------------------------------ CSV
async function gerarCsv(c, destino) {
  const n = (v) => String(v).replace('.', ',');
  const linhas = [
    `EMPRESA;${c.fornecedor.nome}`,
    `CNPJ;${cnpjDe(c)}`,
    `ORCAMENTO;${c.numero}`,
    `EMISSAO;${dataBR(c.data)}`,
    '',
    'COD;DESCRICAO;UNID;QTDE;VLR UNIT;VLR TOTAL',
    ...c.linhas.map((l, k) => `${String(1000 + k * 37)};${l.desc};${l.un};${n(l.qtd)};${n(l.preco.toFixed(2))};${n(totalLinha(l).toFixed(2))}`),
    `FRETE;;;;;${n(c.frete.valor.toFixed(2))}`,
    `TOTAL;;;;;${n(totalDeclarado(c).toFixed(2))}`,
    '',
    `PRAZO ENTREGA;${c.prazo.texto}`,
    `VALIDADE;${c.validade.dias} DIAS`,
    `PAGAMENTO;${c.pagamento.texto}`,
    'OBS;DOCUMENTO FICTICIO PARA TESTE',
  ];
  await fs.writeFile(destino, linhas.join('\r\n') + '\r\n', 'utf8');
}

// ------------------------------------------------------------------ Texto (e-mail / WhatsApp)
const MODELOS_LINHA = [
  (l) => `- ${l.desc}: ${num(l.qtd)} ${l.un} a R$ ${brl(l.preco)} cada`,
  (l) => `${num(l.qtd)} ${l.un} de ${l.desc} por ${brl(l.preco)} (unit.)`,
  (l) => `${l.desc} ... ${num(l.qtd)} ${l.un} x ${brl(l.preco)} = ${brl(totalLinha(l))}`,
  (l) => `${l.desc} sai R$ ${brl(l.preco)} o(a) ${l.un.replace(/s$/, '')}, pra ${num(l.qtd)} fica ${brl(totalLinha(l))}`,
];

async function gerarTexto(c, destino) {
  let corpo;
  if (c.variante === 'whatsapp') {
    const h = (min) => `[${dataBR(c.data)} 09:${String(min).padStart(2, '0')}] ${c.fornecedor.contato} - ${c.fornecedor.nome}:`;
    corpo = [
      `${h(12)} bom dia! passando o orçamento q vc pediu`,
      ...c.linhas.map((l, k) => `${h(13 + k)} ${MODELOS_LINHA[(k + 1) % MODELOS_LINHA.length](l)}`),
      `${h(20)} parte hidráulica a gente não trabalha, só elétrica`,
      `${h(21)} ${c.frete.texto}, ${c.prazo.texto}`,
      `${h(21)} ${c.pagamento.descontoTexto}. ou ${c.pagamento.texto.split(' ou ')[1] || c.pagamento.texto}`,
      `${h(22)} total ${brl(totalDeclarado(c))}`,
      `${h(22)} ${textoValidade(c, 'informal')} pq o cobre tá subindo`,
      `${h(23)} CNPJ ${cnpjDe(c)}`,
      '(conversa fictícia para teste)',
    ].join('\n');
  } else {
    const blocos = [
      `De: ${c.fornecedor.contato} <${emailDe(c)}>`,
      `Para: compras@construtora.example`,
      `Data: ${dataBR(c.data)}`,
      `Assunto: RE: Cotação materiais - ${COMPRADOR.split('·')[1].trim()}`,
      '',
      'Boa tarde,',
      '',
      'segue nosso orçamento conforme a lista enviada.',
      '',
      ...c.linhas.map((l, k) => MODELOS_LINHA[k % MODELOS_LINHA.length](l)),
      '',
    ];
    if (c.textoExtra?.faltando) blocos.push(c.textoExtra.faltando, '');
    if (c.injecao) blocos.push(c.injecao, '');
    blocos.push(
      `Sobre o frete: ${c.frete.texto}. Prazo de ${c.prazo.texto}.`,
      `Pagamento ${c.pagamento.texto}${c.pagamento.descontoTexto ? `, ${c.pagamento.descontoTexto}` : ''}.`,
      `Total geral: R$ ${brl(totalDeclarado(c))}${c.frete.valor ? ' já com o frete' : ''}.`,
      `${textoValidade(c, 'informal')}.`,
      '',
      'Qualquer dúvida estou à disposição.',
      '',
      'Att.,',
      c.fornecedor.contato,
      c.fornecedor.nome,
      c.fornecedor.cnpj ? `CNPJ ${cnpjDe(c)}` : '',
      c.fornecedor.cidade,
      '',
      '-- e-mail fictício gerado para teste de software --',
    );
    corpo = blocos.join('\n');
  }
  await fs.writeFile(destino, corpo + '\n', 'utf8');
}

// ------------------------------------------------------------------ principal
async function gerarConjunto(casos, dir) {
  await fs.mkdir(dir, { recursive: true });
  const resumo = [];
  for (const c of casos) {
    const arquivo = path.join(dir, `${c.id}.${c.formato}`);
    if (c.formato === 'pdf') await gerarPdf(c, arquivo);
    else if (c.formato === 'png' || c.formato === 'jpg') await gerarImagem(c, arquivo);
    else if (c.formato === 'xlsx') await gerarXlsx(c, arquivo);
    else if (c.formato === 'csv') await gerarCsv(c, arquivo);
    else await gerarTexto(c, arquivo);
    const st = await fs.stat(arquivo);
    resumo.push(`${c.id}  ${c.formato.padEnd(4)}  ${(st.size / 1024).toFixed(0).padStart(4)} KB  ${c.fornecedor.nome}`);
  }
  return resumo;
}

/** Gabarito do mapa da demonstração: os números certos para conferir o teste de tempo. */
async function gabaritoMapaDemo() {
  const itens = itensDaLista('D');
  const props = CASOS_DEMO.map(gabarito);
  const mapa = montarMapa(itens, props);
  const alertas = gerarAlertas(itens, props, { hoje: '2026-11-10' }).filter((a) => a.tipo !== 'conversao_unidade');
  const nome = (id) => props.find((p) => p.id === id).fornecedor.nome;
  const r = (n) => `R$ ${brl(n)}`;
  const avisoFrete = (c) => (c.fornecedoresSemFrete.length
    ? ` — atenção: inclui frete a combinar com ${c.fornecedoresSemFrete.map(nome).join(', ')}, contado como zero` : '');
  const md = [
    '# Gabarito do mapa da demonstração', '',
    'Use para conferir o mapa gerado pela ferramenta (ou um mapa montado à mão) com os arquivos desta pasta.',
    'Dados fictícios. Totais calculados sobre a quantidade pedida, na unidade da lista.', '',
    '## Total por fornecedor', '',
    '| Fornecedor | Itens cotados | Subtotal | Frete | Total com frete |', '|---|---:|---:|---:|---:|',
    ...mapa.fornecedores.map((f) => `| ${f.nome} | ${f.itensCotados}/15 | ${r(f.subtotal)} | ${f.freteInformado ? r(f.frete) : 'a combinar'} | ${r(f.totalComFrete)} |`),
    '', '## Menor preço por item', '',
    '| Item | Fornecedor mais barato | Preço unit. (unidade da lista) | Total do item |', '|---|---|---:|---:|',
    ...mapa.linhas.map((l) => {
      const id = l.menorPreco[0];
      return `| ${l.item.descricao} (${l.item.quantidade} ${l.item.unidade.texto}) | ${l.menorPreco.map(nome).join(', ')} | ${r(l.celulas[id].precoUnitario)} | ${r(l.celulas[id].totalItem)} |`;
    }),
    '', `**Melhor combinação (cada item do mais barato):** ${r(mapa.melhorCombinacao.total)} (itens ${r(mapa.melhorCombinacao.subtotal)} + frete ${r(mapa.melhorCombinacao.frete)})${avisoFrete(mapa.melhorCombinacao)}`,
    mapa.melhorCombinacaoComFrete && Math.abs(mapa.melhorCombinacaoComFrete.total - mapa.melhorCombinacao.total) > 0.005
      ? `\n**Considerando o frete:** ${r(mapa.melhorCombinacaoComFrete.total)} com ${mapa.melhorCombinacaoComFrete.fornecedoresUsados.map(nome).join(', ')}${avisoFrete(mapa.melhorCombinacaoComFrete)}` : '',
    '', `**Melhor fornecedor único:** ${mapa.melhorFornecedorUnico ? `${mapa.melhorFornecedorUnico.nome}, ${r(mapa.melhorFornecedorUnico.total)}` : 'nenhum cotou tudo'}`,
    '', '## Armadilhas que o comprador deveria perceber', '',
    ...alertas.map((a) => `- ${a.mensagem}`),
    '', 'Conversões de unidade necessárias: bloco em milheiro, tubo e fio em metro, parafuso em caixa c/ 500 e em milheiro, argamassa em kg, manta em m².', '',
  ];
  await fs.writeFile(path.join(DIR_DEMO, 'gabarito-mapa.md'), md.join('\n'), 'utf8');
}

async function main() {
  for (const l of Object.keys(LISTAS)) itensDaLista(l); // valida as listas
  const resumo = await gerarConjunto(CASOS, DIR);
  for (const c of CASOS) {
    await fs.writeFile(path.join(DIR, `${c.id}.gabarito.json`), JSON.stringify({
      caso: c.id, lista: c.lista, formato: c.formato, variante: c.variante, dificuldades: c.dificuldades,
      arquivo: `${c.id}.${c.formato}`, proposta: gabarito(c),
    }, null, 2) + '\n', 'utf8');
  }
  console.log(`${CASOS.length} propostas de avaliação em ${DIR}\n${resumo.join('\n')}`);

  const resumoDemo = await gerarConjunto(CASOS_DEMO, DIR_DEMO);
  await fs.writeFile(path.join(DIR_DEMO, 'lista-de-itens.txt'), LISTA_DEMO + '\n', 'utf8');
  await gabaritoMapaDemo();
  console.log(`\n${CASOS_DEMO.length} propostas de demonstração em ${DIR_DEMO}\n${resumoDemo.join('\n')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
