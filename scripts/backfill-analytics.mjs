import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { saleHour, giroAtualizado } from '../functions/analytics.js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2), projectId = args[args.indexOf('--project') + 1], apply = args.includes('--apply');
if (!args.includes('--project') || !['gelato-cb6fd', 'pdv-acs-homolog-20261008'].includes(projectId) || process.env.FIRESTORE_EMULATOR_HOST) throw Error('Informe um projeto autorizado explicitamente, sem emulador.');
const db = getFirestore(initializeApp({ projectId, credential: applicationDefault() }));
if (projectId === 'gelato-cb6fd' && !(await db.collection('caixas').where('status', '==', 'aberto').limit(1).get()).empty) throw Error('Há caixa aberto. Preparação histórica adiada para proteger o atendimento.');
const stores = await db.collection('lojas').get();
const report = { projectId, apply, stores: [], financialDocumentsChanged: 0 };
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const active = row => !['cancelada', 'cancelado'].includes(row.status);
const normalize = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
for (const store of stores.docs) {
  const result = await db.runTransaction(async tx => {
    // All source reads precede all writes. Transactions protect against a sale occurring during preparation.
    const collections = ['produtos', 'vendas', 'despesas', 'entradas_consolidadas', 'retiradas_caixa', 'resumo_diario'];
    const snapshots = [];
    for (const name of collections) snapshots.push(await tx.get(db.collection(name).where('uid', '==', store.id)));
    const [products, sales, expenses, entries, withdrawals, summaries] = snapshots;
    const giro = new Map(products.docs.map(p => [p.id, { giroDiario: {}, giroInicializado: true }]));
    const names = new Map();
    products.forEach(p => { const key = normalize(p.data().nome); names.set(key, [...(names.get(key) || []), p.id]); });
    const daily = new Map();
    const ensure = day => {
      if (!daily.has(day)) daily.set(day, { uid: store.id, data: day, totalVendas: 0, totalDespesas: 0, totalItens: 0, totalRegistros: 0, totalEntradasConsolidadas: 0, totalRetiradas: 0, totalSemHorario: 0, vendasPorHora: {} });
      return daily.get(day);
    };
    summaries.forEach(doc => { if (validDay(doc.data().data) && doc.id === `${store.id}__${doc.data().data}`) ensure(doc.data().data); });
    let invalid = 0, unmatched = 0, ambiguous = 0;
    for (const doc of sales.docs) {
      const sale = doc.data(); if (!active(sale)) continue;
      if (!validDay(sale.data) || !Number.isFinite(Number(sale.valor)) || Number(sale.valor) < 0 || !Number.isFinite(Number(sale.quantidade)) || Number(sale.quantidade) <= 0) { invalid++; continue; }
      const cents = Math.round(Number(sale.valor) * 100), row = ensure(sale.data), hour = saleHour(sale);
      row.totalVendas += cents; row.totalItens += Number(sale.quantidade); row.totalRegistros++;
      if (hour === null) row.totalSemHorario++; else row.vendasPorHora[hour] = (row.vendasPorHora[hour] || 0) + cents;
      // Never assign a deleted product's sales to a newer product with the same name.
      const candidates = sale.produtoId ? (giro.has(sale.produtoId) ? [sale.produtoId] : []) : (names.get(normalize(sale.produto)) || []);
      if (candidates.length === 1) { const id = candidates[0]; giro.set(id, { ...giro.get(id), ...giroAtualizado(giro.get(id), sale) }); }
      else { unmatched++; if (candidates.length > 1) { ambiguous++; for (const id of candidates) giro.get(id).giroInicializado = false; } }
    }
    for (const [snapshot, field] of [[expenses, 'totalDespesas'], [entries, 'totalEntradasConsolidadas'], [withdrawals, 'totalRetiradas']]) for (const doc of snapshot.docs) {
      const row = doc.data(); if (!active(row)) continue;
      const value = field === 'totalEntradasConsolidadas' ? row.total : row.valor;
      if (!validDay(row.data) || !Number.isFinite(Number(value)) || Number(value) < 0) { invalid++; continue; }
      ensure(row.data)[field] += Math.round(Number(value) * 100);
    }
    if (invalid) throw Error(`Unidade ${store.id}: ${invalid} registro(s) inválido(s), nenhuma escrita aplicada nesta unidade.`);
    if (daily.size + products.size > 450) throw Error('Limite transacional preventivo excedido. Divida a preparação antes de aplicar.');
    if (apply) {
      for (const [day, row] of daily) {
        const values = { ...row, totalVendas: row.totalVendas / 100, totalDespesas: row.totalDespesas / 100, totalEntradasConsolidadas: row.totalEntradasConsolidadas / 100, totalRetiradas: row.totalRetiradas / 100, lucro: (row.totalVendas - row.totalDespesas) / 100, vendasPorHora: Object.fromEntries(Object.entries(row.vendasPorHora).map(([h, cents]) => [h, cents / 100])) };
        // update replaces the hourly map, avoiding stale hours on repeat preparation.
        const target = db.doc(`resumo_diario/${store.id}__${day}`);
        if (summaries.docs.some(s => s.id === target.id)) tx.update(target, values); else tx.create(target, values);
      }
      products.forEach(p => tx.update(p.ref, giro.get(p.id)));
    }
    return { store: store.id, reads: snapshots.reduce((n, s) => n + s.size, 0), products: products.size, summaries: daily.size, unmatchedSales: unmatched, ambiguousSales: ambiguous };
  });
  report.stores.push(result); console.log(JSON.stringify(result));
}
writeFileSync(`docs/analytics-preparacao-${projectId}.json`, JSON.stringify(report, null, 2));
await db.terminate();
