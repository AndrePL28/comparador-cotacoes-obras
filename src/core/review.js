// Revisão humana: nada entra no mapa final sem ter sido revisado.

/** Campos com baixa confiança que ainda não foram confirmados ou editados. */
export function pendenciasRevisao(proposta) {
  return Object.entries(proposta.confianca || {})
    .filter(([, c]) => c?.nivel === 'baixa' && !c.confirmado)
    .map(([campo, c]) => ({ campo, nota: c.nota || null }));
}

/** Uma proposta só pode ser marcada como revisada sem pendências de baixa confiança. */
export function podeMarcarRevisada(proposta) {
  return pendenciasRevisao(proposta).length === 0;
}

/** Marca um campo como confirmado pelo usuário (editado ou aceito). Retorna nova proposta. */
export function confirmarCampo(proposta, campo) {
  const atual = proposta.confianca?.[campo];
  if (!atual) return proposta;
  return {
    ...proposta,
    confianca: { ...proposta.confianca, [campo]: { ...atual, confirmado: true } },
  };
}

/** Marca como revisada; lança erro se houver pendência. */
export function marcarRevisada(proposta) {
  const pend = pendenciasRevisao(proposta);
  if (pend.length) {
    throw new Error(`Há ${pend.length} campo(s) de baixa confiança sem revisão.`);
  }
  return { ...proposta, revisada: true };
}

/** O mapa final (exportação) exige todas as propostas revisadas. */
export function statusMapaFinal(propostas) {
  const naoRevisadas = propostas.filter((p) => !p.revisada).map((p) => p.fornecedor?.nome || p.id);
  return { liberado: propostas.length > 0 && naoRevisadas.length === 0, naoRevisadas };
}
