export function picosDosResumos(resumos) {
  const cell = () => ({ faturamento: 0, pedidos: 0 });
  const result = { dias: Array.from({ length: 7 }, cell), horas: Array.from({ length: 24 }, cell), mapa: Array.from({ length: 7 }, () => Array.from({ length: 24 }, cell)), total: cell(), semHorario: 0 };
  for (const row of resumos) {
    const day = new Date(`${row.data}T12:00:00Z`).getUTCDay();
    if (!Number.isFinite(day)) continue;
    const revenue = Math.round(Number(row.totalVendas || 0) * 100);
    result.dias[day].faturamento += revenue;
    result.total.faturamento += revenue;
    result.semHorario += Number(row.totalSemHorario || 0);
    for (const [hour, value] of Object.entries(row.vendasPorHora || {})) {
      const h = Number(hour), cents = Math.round(Number(value) * 100);
      if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isFinite(cents)) continue;
      result.horas[h].faturamento += cents;
      result.mapa[day][h].faturamento += cents;
    }
  }
  for (const c of [...result.dias, ...result.horas, ...result.mapa.flat(), result.total]) c.faturamento /= 100;
  return result;
}

export function giroProdutos(produtos, mes, hoje) {
  const dayMs = day => Date.parse(`${day}T12:00:00Z`);
  return produtos.filter(p => p.ativo !== false).map(p => {
    const entries = Object.entries(p.giroDiario || {});
    const month = entries.filter(([day]) => day.startsWith(`${mes}-`));
    const ultimaVenda = entries.filter(([day, giro]) => day <= hoje && giro.quantidade > 0).map(([day]) => day).sort().at(-1);
    const created = p.criadoEm?.toDate?.() || (p.criadoEm instanceof Date ? p.criadoEm : null);
    const cadastro = created && !Number.isNaN(created.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(created) : null;
    const desde = ultimaVenda || cadastro;
    const dias = p.giroInicializado && desde ? Math.max(0, Math.floor((dayMs(hoje) - dayMs(desde)) / 86400000)) : null;
    return { ...p, faturamento: month.reduce((sum, [, giro]) => sum + Number(giro.valorCentavos || 0), 0) / 100, quantidadeVendida: month.reduce((sum, [, giro]) => sum + Number(giro.quantidade || 0), 0), ultimaVenda, dias };
  });
}
