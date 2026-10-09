export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const novoGrupo = () => ({ centavos: 0, pedidos: new Set() });
const horaLocal = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', hourCycle: 'h23' });

function obterHora(venda) {
  const horario = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(venda.horario || '').trim());
  if (horario && Number(horario[1]) < 24) return Number(horario[1]);
  const timestamp = venda.criadoEm;
  const valor = typeof timestamp?.toDate === 'function' ? timestamp.toDate()
    : timestamp instanceof Date ? timestamp
      : Number.isFinite(timestamp?.seconds) ? new Date(timestamp.seconds * 1000)
        : Number.isFinite(venda.registradoEmMs) ? new Date(venda.registradoEmMs) : null;
  return valor && Number.isFinite(valor.getTime()) ? Number(horaLocal.format(valor)) : null;
}

export function calcularPicosVendas(vendas = []) {
  const dias = Array.from({ length: 7 }, novoGrupo);
  const horas = Array.from({ length: 24 }, novoGrupo);
  const mapa = Array.from({ length: 7 }, () => Array.from({ length: 24 }, novoGrupo));
  const total = novoGrupo();
  let semHorario = 0;
  const vistos = new Set();
  vendas.forEach((venda, index) => {
    if (['cancelada', 'cancelado'].includes(venda.status)) return;
    if (venda.id && vistos.has(venda.id)) return;
    if (venda.id) vistos.add(venda.id);
    const data = String(venda.data || '');
    const valor = Number(venda.valor);
    const date = new Date(`${data}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data || !Number.isFinite(valor) || valor < 0) return;
    const dia = date.getUTCDay();
    const hora = obterHora(venda);
    // One checkout can have several product rows; count its group once.
    const pedido = `${venda.uid || ''}:${venda.vendaGrupoId || venda.id || `linha-${index}`}`;
    const grupos = [total, dias[dia]];
    if (hora !== null) grupos.push(horas[hora], mapa[dia][hora]);
    else semHorario++;
    for (const grupo of grupos) {
      grupo.centavos += Math.round(valor * 100);
      grupo.pedidos.add(pedido);
    }
  });
  const finalizar = g => ({ faturamento: g.centavos / 100, pedidos: g.pedidos.size });
  return { dias: dias.map(finalizar), horas: horas.map(finalizar), mapa: mapa.map(d => d.map(finalizar)), total: finalizar(total), semHorario };
}
