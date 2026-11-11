// Exportação do mapa de cotação para XLSX (exceljs).
import ExcelJS from 'exceljs';
import { formatarUnidade } from '../core/units.js';
import { validadeEfetiva } from '../core/alerts.js';

const BRL = '"R$" #,##0.00';
const BRL4 = '"R$" #,##0.0000';
const VERDE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
const CINZA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
const AMARELO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const NEGRITO = { bold: true };
const dataBR = (s) => (s ? s.split('-').reverse().join('/') : '');

/**
 * @returns {Promise<Buffer>}
 */
export async function gerarXlsx({ itens, propostas, mapa, alertas, hoje }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Comparador de Cotações';
  wb.created = new Date(`${hoje}T12:00:00Z`);

  // --- Mapa
  const ws = wb.addWorksheet('Mapa de cotação', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const cab1 = ['Item', 'Qtd', 'Un'];
  const cab2 = ['', '', ''];
  for (const p of propostas) {
    cab1.push(p.fornecedor.nome, '', '');
    cab2.push('Preço unit.', 'Total', 'Obs.');
  }
  cab1.push('Mediana', 'Melhor');
  cab2.push('', '');
  ws.addRow(cab1).font = NEGRITO;
  ws.addRow(cab2).font = NEGRITO;
  propostas.forEach((_, i) => ws.mergeCells(1, 4 + i * 3, 1, 6 + i * 3));

  for (const l of mapa.linhas) {
    const valores = [l.item.descricao, l.item.quantidade, formatarUnidade(l.item.unidade)];
    for (const p of propostas) {
      const c = l.celulas[p.id];
      if (c.status === 'cotado') valores.push(c.precoUnitario, c.totalItem, c.conversao ? `Convertido: ${c.conversao}` : '');
      else valores.push(null, null, { nao_cotado: 'Não cotado', incompativel: c.motivo, sem_preco: 'Sem preço' }[c.status]);
    }
    const melhores = l.menorPreco.map((id) => propostas.find((p) => p.id === id)?.fornecedor.nome).join(', ');
    valores.push(l.mediana, melhores);
    const row = ws.addRow(valores);
    propostas.forEach((p, i) => {
      const col = 4 + i * 3;
      row.getCell(col).numFmt = BRL4;
      row.getCell(col + 1).numFmt = BRL;
      if (l.menorPreco.includes(p.id)) {
        row.getCell(col).fill = VERDE;
        row.getCell(col + 1).fill = VERDE;
      }
      if (l.celulas[p.id].status !== 'cotado') row.getCell(col + 2).fill = CINZA;
      else if (l.celulas[p.id].conversao) row.getCell(col + 2).fill = AMARELO;
    });
    row.getCell(4 + propostas.length * 3).numFmt = BRL4;
  }

  ws.addRow([]);
  const linhaTotal = (rotulo, campo) => {
    const v = [rotulo, '', ''];
    for (const f of mapa.fornecedores) v.push('', f[campo], '');
    const row = ws.addRow(v);
    row.font = NEGRITO;
    mapa.fornecedores.forEach((_, i) => (row.getCell(5 + i * 3).numFmt = BRL));
  };
  linhaTotal('Subtotal (sem frete)', 'subtotal');
  linhaTotal('Frete', 'frete');
  linhaTotal('Total com frete', 'totalComFrete');
  linhaTotal('Total à vista (se houver desconto)', 'totalAVista');
  const cot = ['Itens cotados', '', ''];
  for (const f of mapa.fornecedores) cot.push('', `${f.itensCotados}/${itens.length}`, f.freteInformado ? '' : 'Frete não informado');
  ws.addRow(cot);

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 9;
  ws.getColumn(3).width = 12;
  propostas.forEach((_, i) => {
    ws.getColumn(4 + i * 3).width = 14;
    ws.getColumn(5 + i * 3).width = 14;
    ws.getColumn(6 + i * 3).width = 30;
  });

  // --- Melhor combinação
  const wc = wb.addWorksheet('Melhor combinação');
  const nomeDe = (id) => propostas.find((p) => p.id === id)?.fornecedor.nome || '—';
  const blocoComb = (titulo, comb) => {
    wc.addRow([titulo]).font = { bold: true, size: 12 };
    wc.addRow(['Item', 'Fornecedor', 'Total do item']).font = NEGRITO;
    for (const l of mapa.linhas) {
      const id = comb.porItem[l.item.id];
      const r = wc.addRow([l.item.descricao, id ? nomeDe(id) : 'Sem cotação', id ? l.celulas[id].totalItem : null]);
      r.getCell(3).numFmt = BRL;
    }
    for (const [rot, v] of [['Subtotal', comb.subtotal], ['Frete', comb.frete], ['Total', comb.total]]) {
      const r = wc.addRow([rot, '', v]);
      r.font = NEGRITO;
      r.getCell(3).numFmt = BRL;
    }
    if (comb.fornecedoresSemFrete?.length) {
      wc.addRow([`Atenção: frete a combinar com ${comb.fornecedoresSemFrete.map(nomeDe).join(', ')} (contado como zero; o total real será maior).`]).font = { italic: true, color: { argb: 'FF8A6200' } };
    }
    wc.addRow([]);
  };
  blocoComb('Cada item do fornecedor mais barato', mapa.melhorCombinacao);
  if (mapa.melhorCombinacaoComFrete && Math.abs(mapa.melhorCombinacaoComFrete.total - mapa.melhorCombinacao.total) > 0.005) blocoComb('Considerando o frete de cada fornecedor', mapa.melhorCombinacaoComFrete);
  if (mapa.melhorFornecedorUnico) {
    const r = wc.addRow(['Melhor fornecedor único (proposta completa)', mapa.melhorFornecedorUnico.nome, mapa.melhorFornecedorUnico.total]);
    r.font = NEGRITO;
    r.getCell(3).numFmt = BRL;
  }
  wc.getColumn(1).width = 44;
  wc.getColumn(2).width = 28;
  wc.getColumn(3).width = 16;

  // --- Condições
  const wd = wb.addWorksheet('Condições');
  wd.addRow(['Fornecedor', 'CNPJ', 'Frete', 'Valor frete', 'Prazo (dias)', 'Pagamento', 'Desconto à vista (%)',
    'Data da proposta', 'Validade', 'Total declarado', 'Observações']).font = NEGRITO;
  for (const p of propostas) {
    const r = wd.addRow([p.fornecedor.nome, p.fornecedor.cnpj || '', p.frete.tipo === 'nao_informado' ? 'Não informado' : p.frete.tipo,
      p.frete.valor, p.prazoEntrega?.dias, p.condicaoPagamento || '', p.descontoAVistaPercentual,
      dataBR(p.dataProposta), dataBR(validadeEfetiva(p)), p.totalDeclarado, p.observacoes || '']);
    r.getCell(4).numFmt = BRL;
    r.getCell(10).numFmt = BRL;
  }
  wd.columns.forEach((c) => (c.width = 18));

  // --- Alertas
  const wa = wb.addWorksheet('Alertas');
  wa.addRow(['Severidade', 'Fornecedor', 'Tipo', 'Mensagem']).font = NEGRITO;
  for (const a of alertas) wa.addRow([a.severidade, nomeDe(a.propostaId), a.tipo, a.mensagem]);
  wa.getColumn(4).width = 100;
  wa.getColumn(2).width = 24;
  wa.getColumn(3).width = 24;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
