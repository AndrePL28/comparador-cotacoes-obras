// Caso de demonstração e do teste de tempo: 4 fornecedores × 15 itens.
// Dados 100% fictícios. Os arquivos são gerados por `npm run eval:gerar` em demo/propostas/.

export const LISTA_DEMO = `Cimento CP-II-E-32 50kg; 120; sc
Areia média lavada; 18; m³
Brita 1; 12; m³
Bloco cerâmico 14x19x29; 4000; un
Vergalhão CA-50 10mm (barra 12 m); 80; barra
Arame recozido 18; 25; kg
Prego 17x27 com cabeça; 30; kg
Tubo PVC soldável 25mm; 40; barra 6m
Joelho 90° PVC soldável 25mm; 60; un
Fio flexível 2,5mm²; 8; rolo 100m
Argamassa AC-II; 90; sc 20kg
Impermeabilizante acrílico; 6; balde 18l
Tinta acrílica fosca branca; 10; lata 18l
Parafuso chipboard 4,2x32; 2000; un
Manta asfáltica 3mm; 15; rolo 10m2`;

export const CASOS_DEMO = [
  {
    id: 'fornecedor-A', lista: 'D', formato: 'pdf', variante: 'tabela', dificuldades: [],
    fornecedor: { nome: 'Depósito Serra Verde Materiais Ltda', cnpj: '41.527.836/0001-10', contato: 'Rogério Antunes', cidade: 'Campo Largo/PR' },
    numero: '2026/1201', data: '2026-11-09', validade: { dias: 15 },
    frete: { tipo: 'FOB', valor: 350, texto: 'Frete: R$ 350,00' }, prazo: { dias: 3, texto: '3 dias' },
    pagamento: { texto: '28 dias - boleto', desconto: null },
    linhas: [
      { ref: 'i1', desc: 'Cimento CP-II-E-32 saco 50kg', un: 'SC', qtd: 120, preco: 38.9 },
      { ref: 'i2', desc: 'Areia média lavada', un: 'M3', qtd: 18, preco: 125 },
      { ref: 'i3', desc: 'Pedra brita nº 1', un: 'M3', qtd: 12, preco: 118 },
      { ref: 'i4', desc: 'Bloco cerâmico 9 furos 14x19x29', un: 'UN', qtd: 4000, preco: 0.89 },
      { ref: 'i5', desc: 'Vergalhão CA-50 10,0mm barra 12m', un: 'BR', qtd: 80, preco: 58.5 },
      { ref: 'i6', desc: 'Arame recozido nº 18', un: 'KG', qtd: 25, preco: 17.8 },
      { ref: 'i7', desc: 'Prego 17x27 c/ cabeça', un: 'KG', qtd: 30, preco: 19.9 },
      { ref: 'i8', desc: 'Tubo PVC soldável 25mm barra 6m', un: 'BR', qtd: 40, preco: 25.4 },
      { ref: 'i9', desc: 'Joelho 90º soldável 25mm', un: 'UN', qtd: 60, preco: 1.4 },
      { ref: 'i10', desc: 'Cabo flexível 2,5mm² 750V rolo 100m', un: 'RL', qtd: 8, preco: 228 },
      { ref: 'i11', desc: 'Argamassa colante AC-II 20kg', un: 'SC', qtd: 90, preco: 24.9 },
      { ref: 'i12', desc: 'Impermeabilizante acrílico balde 18L', un: 'BD', qtd: 6, preco: 189 },
      { ref: 'i13', desc: 'Tinta acrílica fosca branca 18L', un: 'LATA', qtd: 10, preco: 299 },
      { ref: 'i14', desc: 'Parafuso chipboard 4,2x32', un: 'UN', qtd: 2000, preco: 0.11 },
      { ref: 'i15', desc: 'Manta asfáltica 3mm rolo 10m²', un: 'RL', qtd: 15, preco: 98 },
    ],
  },
  {
    id: 'fornecedor-B', lista: 'D', formato: 'png', variante: 'impresso', dificuldades: [],
    fornecedor: { nome: 'Casa & Obra Comércio de Materiais Eireli', cnpj: '28.904.117/0001-36', contato: 'Fabiana', cidade: 'Araucária/PR' },
    numero: '000915', data: '2026-11-09', validade: { dias: 10 },
    frete: { tipo: 'CIF', valor: null, texto: 'ENTREGA GRÁTIS (CIF)' }, prazo: { dias: 5, texto: '5 dias' },
    pagamento: { texto: '30/60 dias', desconto: null },
    linhas: [
      { ref: 'i1', desc: 'CIM CP II-E 32 50KG', un: 'SC', qtd: 120, preco: 39.5 },
      { ref: 'i2', desc: 'AREIA MED LAV', un: 'M³', qtd: 18, preco: 119 },
      { ref: 'i3', desc: 'BRITA 01', un: 'M³', qtd: 12, preco: 121 },
      { ref: 'i4', desc: 'BLOCO CER 14X19X29', un: 'MIL', qtd: 4, preco: 870 },
      { ref: 'i5', desc: 'VERG CA50 10MM 12M', un: 'BR', qtd: 80, preco: 61.2 },
      { ref: 'i6', desc: 'ARAME RECOZ 18', un: 'KG', qtd: 25, preco: 18.5 },
      { ref: 'i7', desc: 'PREGO 17X27 C/C', un: 'KG', qtd: 30, preco: 18.9 },
      { ref: 'i8', desc: 'TUBO SOLD 25MM', un: 'M', qtd: 240, preco: 4.1 },
      { ref: 'i9', desc: 'JOELHO 90 SOLD 25MM', un: 'PC', qtd: 60, preco: 1.25 },
      { ref: 'i10', desc: 'CABO FLEX 2,5MM2', un: 'M', qtd: 800, preco: 2.19 },
      { ref: 'i11', desc: 'ARG AC II 20KG', un: 'SC', qtd: 90, preco: 26.5 },
      { ref: 'i13', desc: 'TINTA ACRIL FOSCA BCA 18L', un: 'LATA', qtd: 10, preco: 285 },
      { ref: 'i14', desc: 'PARAF CHIPBOARD 4,2X32 CX C/ 500', un: 'CX C/ 500', qtd: 4, preco: 47 },
    ],
  },
  {
    id: 'fornecedor-C', lista: 'D', formato: 'xlsx', variante: 'planilha', dificuldades: [],
    fornecedor: { nome: 'Comercial Pedra Branca Ltda', cnpj: '33.618.240/0001-52', contato: 'Juliano Prates', cidade: 'São José dos Pinhais/PR' },
    numero: 'ORC-5590', data: '2026-11-08', validade: { data: '2026-11-23' },
    frete: { tipo: 'FOB', valor: 280, texto: 'Frete' }, prazo: { dias: 2, texto: '2 dias' },
    pagamento: { texto: '21 dias', desconto: 3, descontoTexto: 'Pagamento à vista: 3% de desconto' },
    linhas: [
      { ref: 'i1', desc: 'Cimento CP II E-32', un: 'SC 50KG', qtd: 120, preco: 37.8 },
      { ref: 'i2', desc: 'Areia média', un: 'M3', qtd: 18, preco: 132 },
      { ref: 'i3', desc: 'Brita 1', un: 'M3', qtd: 12, preco: 115 },
      { ref: 'i4', desc: 'Bloco cerâmico 14x19x29', un: 'UN', qtd: 4000, preco: 0.92 },
      { ref: 'i5', desc: 'Vergalhão CA-50 10mm 12m', un: 'BARRA', qtd: 80, preco: 59.9 },
      { ref: 'i6', desc: 'Arame recozido 18', un: 'KG', qtd: 25, preco: 16.9 },
      { ref: 'i7', desc: 'Prego 17x27', un: 'KG', qtd: 30, preco: 18.7 },
      { ref: 'i8', desc: 'Tubo PVC soldável 25mm', un: 'BARRA 6M', qtd: 40, preco: 23.9 },
      { ref: 'i9', desc: 'Joelho 90 soldável 25mm', un: 'UN', qtd: 60, preco: 1.3 },
      { ref: 'i10', desc: 'Fio flexível 2,5mm²', un: 'ROLO 100M', qtd: 8, preco: 239 },
      { ref: 'i11', desc: 'Argamassa AC-II', un: 'KG', qtd: 1800, preco: 1.22 },
      { ref: 'i12', desc: 'Impermeabilizante acrílico', un: 'BALDE 18L', qtd: 6, preco: 179 },
      { ref: 'i13', desc: 'Tinta acrílica fosca branca', un: 'LATA 18L', qtd: 10, preco: 289 },
      { ref: 'i14', desc: 'Parafuso chipboard 4,2x32', un: 'MIL', qtd: 2, preco: 98 },
      { ref: 'i15', desc: 'Manta asfáltica 3mm', un: 'M2', qtd: 150, preco: 15.9 },
    ],
  },
  {
    id: 'fornecedor-D', lista: 'D', formato: 'txt', variante: 'email', dificuldades: [],
    fornecedor: { nome: 'Ferragens e Materiais Rio Claro Ltda', cnpj: '19.443.805/0001-71', contato: 'Sandra Moreira', cidade: 'Curitiba/PR' },
    numero: null, data: '2026-11-10', validade: { dias: 7 },
    frete: { tipo: 'FOB', valor: null, texto: 'o frete a gente combina conforme a rota' },
    prazo: { dias: 4, texto: '4 dias' },
    pagamento: { texto: '28 dd', desconto: null },
    linhas: [
      { ref: 'i1', desc: 'cimento cp2 50kg', un: 'sacos', qtd: 120, preco: 38.4 },
      { ref: 'i2', desc: 'areia media lavada', un: 'm3', qtd: 18, preco: 128 },
      { ref: 'i3', desc: 'brita 1', un: 'm3', qtd: 12, preco: 124 },
      { ref: 'i4', desc: 'bloco 14x19x29', un: 'un', qtd: 4000, preco: 1.39 },
      { ref: 'i5', desc: 'vergalhão 10mm barra de 12m', un: 'barras', qtd: 80, preco: 57.9 },
      { ref: 'i6', desc: 'arame 18', un: 'kg', qtd: 25, preco: 17.5 },
      { ref: 'i7', desc: 'prego 17x27', un: 'kg', qtd: 30, preco: 21 },
      { ref: 'i9', desc: 'joelho 90 25mm soldável', un: 'peças', qtd: 60, preco: 1.35 },
      { ref: 'i11', desc: 'argamassa ACII saco 20kg', un: 'sacos', qtd: 90, preco: 25.5 },
      { ref: 'i12', desc: 'impermeabilizante acrílico 18L', un: 'baldes', qtd: 6, preco: 195 },
      { ref: 'i13', desc: 'tinta acrílica branca fosca lata 18L', un: 'latas', qtd: 10, preco: 279 },
      { ref: 'i15', desc: 'manta asfáltica 3mm rolo 10m²', un: 'rolos', qtd: 15, preco: 104 },
    ],
  },
];
