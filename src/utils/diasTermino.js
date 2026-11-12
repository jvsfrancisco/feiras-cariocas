const MS_DIA = 24 * 60 * 60 * 1000;

export function diasParaTerminar(proposta, refData = new Date()) {
  if (!proposta) return 14;
  const criadoMs = Date.parse(proposta.criadoEm);
  const expiraMs = proposta.expiraEm
    ? Date.parse(proposta.expiraEm)
    : Number.isFinite(criadoMs) ? criadoMs + 14 * MS_DIA : NaN;
  if (!Number.isFinite(expiraMs)) return 14;
  const expira = new Date(expiraMs);
  const agora = refData instanceof Date && Number.isFinite(refData.getTime()) ? refData : new Date();
  const diaLocal = (data) => Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
  return Math.max(0, Math.round((diaLocal(expira) - diaLocal(agora)) / MS_DIA));
}
