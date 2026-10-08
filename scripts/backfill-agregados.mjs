import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const args = process.argv.slice(2), apply = args.includes('--apply');
if (apply && args.includes('--dry-run')) throw new Error('--dry-run e --apply sao mutuamente exclusivos.');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) throw new Error('Informe --project. Sem --apply, apenas simula. Execute em janela sem gravacoes concorrentes.');
initializeApp({ projectId, credential: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'))) : applicationDefault() });
const db = getFirestore();
const [sales, expenses, summaries, rankings] = await Promise.all(['vendas', 'despesas', 'resumo_diario', 'ranking_diario'].map(c => db.collection(c).get()));
const totals = new Map(), ranks = new Map();
function ensure(uid, data) {
 const key = `${uid}__${data}`;
 if (!totals.has(key)) totals.set(key, { uid, data, totalVendas: 0, totalDespesas: 0, lucro: 0, totalItens: 0 });
 if (!ranks.has(key)) ranks.set(key, { uid, data, atendentes: {} });
 return key;
}
for (const doc of [...summaries.docs, ...rankings.docs]) { const d = doc.data(); if (d.uid && d.data) ensure(d.uid, d.data); }
for (const doc of sales.docs) {
 const s = doc.data(); if (!s.uid || !s.data || s.status === 'cancelada') continue;
 const key = ensure(s.uid, s.data), total = totals.get(key), cents = Math.round(Number(s.valor || 0) * 100);
 total.totalVendas += cents; total.lucro += cents; total.totalItens += Number(s.quantidade || 0);
 const attendee = s.atendenteId || s.atendente;
 if (attendee) { const rank = ranks.get(key); rank.atendentes[attendee] ||= { nome: s.atendenteNome || s.atendente || 'Sem atendente', total: 0 }; rank.atendentes[attendee].total += cents; }
}
for (const doc of expenses.docs) {
 const d = doc.data(); if (!d.uid || !d.data || d.status === 'cancelada') continue;
 const total = totals.get(ensure(d.uid, d.data)), cents = Math.round(Number(d.valor || 0) * 100);
 total.totalDespesas += cents; total.lucro -= cents;
}
const writes = [];
for (const [key, total] of totals) writes.push([db.doc(`resumo_diario/${key}`), { ...total, totalVendas: total.totalVendas / 100, totalDespesas: total.totalDespesas / 100, lucro: total.lucro / 100 }]);
for (const [key, rank] of ranks) writes.push([db.doc(`ranking_diario/${key}`), { ...rank, atendentes: Object.fromEntries(Object.entries(rank.atendentes).map(([id, item]) => [id, { ...item, total: item.total / 100 }])) }]);
if (apply) for (let offset = 0; offset < writes.length; offset += 400) { const batch = db.batch(); for (const [target, value] of writes.slice(offset, offset + 400)) batch.set(target, value); await batch.commit(); }
console.log(JSON.stringify({ projectId, modo: apply ? 'aplicacao' : 'simulacao', resumos: totals.size, rankings: ranks.size, limiteLote: 400 }));
await db.terminate();
