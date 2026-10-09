export function saleHour(sale) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(sale.horario || ''));
  if (match && Number(match[1]) < 24 && Number(match[2]) < 60) return Number(match[1]);
  const value = sale.registradoEmMs || sale.criadoEm?.toMillis?.();
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));
}

export function giroAtualizado(product, sale, sign = 1) {
  const giroDiario = { ...(product.giroDiario || {}) };
  const old = giroDiario[sale.data] || { quantidade: 0, valorCentavos: 0 };
  giroDiario[sale.data] = {
    quantidade: Math.round((old.quantidade + sign * Number(sale.quantidade)) * 1000000) / 1000000,
    valorCentavos: old.valorCentavos + sign * Math.round(Number(sale.valor) * 100),
  };
  return { giroDiario };
}
