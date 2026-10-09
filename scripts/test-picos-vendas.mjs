import assert from 'node:assert/strict';
import { calcularPicosVendas } from '../src/utils/picosVendas.js';

const base = { uid: 'loja-a', data: '2026-10-08', horario: '14:30' };
const resultado = calcularPicosVendas([
  { ...base, id: 'a', vendaGrupoId: 'pedido-1', valor: 0.1 },
  { ...base, id: 'b', vendaGrupoId: 'pedido-1', valor: 0.2 },
  { ...base, id: 'a', vendaGrupoId: 'pedido-1', valor: 0.1 },
  { ...base, id: 'cancelada', valor: 500, status: 'cancelada' },
  { ...base, id: 'sem-hora', horario: '', valor: 10 },
  { ...base, id: 'timestamp', horario: '', criadoEm: { seconds: Date.parse('2026-10-08T03:15:00Z') / 1000 }, valor: 5 },
  { ...base, id: 'data-impossivel', data: '2026-02-30', valor: 100 },
  { ...base, id: 'valor-invalido', valor: 'abc' },
]);
assert.deepEqual(resultado.total, { faturamento: 15.3, pedidos: 3 });
assert.deepEqual(resultado.mapa[4][14], { faturamento: 0.3, pedidos: 1 });
assert.deepEqual(resultado.horas[0], { faturamento: 5, pedidos: 1 });
assert.equal(resultado.dias[4].faturamento, 15.3);
assert.equal(resultado.semHorario, 1);
assert.equal(resultado.horas.reduce((n, h) => n + h.faturamento, 0), 5.3);
assert.equal(calcularPicosVendas().total.pedidos, 0);
assert.equal(calcularPicosVendas([{ ...base, id: 'negativa', valor: -5 }]).total.pedidos, 0);
const legado = calcularPicosVendas([{ ...base, id: 'l1', valor: 1 }, { ...base, id: 'l2', valor: 2 }]);
assert.equal(legado.total.pedidos, 2);
console.log('Picos de vendas: cancelamentos, centavos, pedidos com varios produtos, duplicados, datas invalidas, horario de Fortaleza e registros sem horario conferidos.');
