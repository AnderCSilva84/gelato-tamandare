import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.argv[2];
assert.match(projectId || '', /^pdv-acs-homolog-\d{8}$/);
assert(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
const config = JSON.parse(readFileSync('.private-backups/homolog-web-config.json', 'utf8'));
assert.equal(config.projectId, projectId);
const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const db = getFirestore(initializeApp({ projectId, credential: applicationDefault() }));
const run = `homolog-test-${Date.now()}`, store = run, createdUsers = [];
const uploadedFiles = [];
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function admin(method, data) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${config.apiKey}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetProjectId: projectId, ...data }) });
  assert.equal(response.status, 200, `Auth administrativo ${method}: HTTP ${response.status}.`);
  return response.json();
}
async function account(role) {
  const password = randomBytes(24).toString('base64url'), uid = `${run}-${role}`, email = `${uid}@example.test`;
  const created = await admin('signUp', { localId: uid, email, password, displayName: 'Homologacao automatizada' });
  assert.equal(created.localId, uid); createdUsers.push(uid);
  await db.doc(`acessos_painel/${uid}`).set({ role, ativo: true, lojaId: store, lojaIds: [store], nome: 'Homologacao automatizada', homologacao: true });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200, 'Conta temporaria nao autenticou.');
  const signed = await response.json(); assert.equal(signed.localId, uid);
  return { uid, token: signed.idToken };
}
const endpoint = `https://southamerica-east1-${projectId}.cloudfunctions.net/operacaoGelato`;
async function call(user, action, data = {}, expected = 200) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ data: { action, ...data } }) });
  assert.equal(response.status, expected, `${action}: HTTP ${response.status}, esperado ${expected}.`);
  const result = await response.json();
  return result.result;
}
async function firestore(user, path, method = 'GET', body) {
  return fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function storage(user, path, method = 'GET', type = 'application/pdf') {
  const base = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o`;
  return fetch(method === 'POST' ? `${base}?uploadType=media&name=${encodeURIComponent(path)}` : `${base}/${encodeURIComponent(path)}`, { method, headers: { ...(user ? { Authorization: `Firebase ${user.token}` } : {}), ...(method === 'POST' ? { 'Content-Type': type } : {}) }, ...(method === 'POST' ? { body: Buffer.from('%PDF-1.4 Homologacao ficticia') } : {}) });
}
let success = false;
try {
  await call(null, 'abrirCaixa', {}, 401);
  const [owner, operator, manager] = await Promise.all(['superadmin', 'atendente', 'gerencia'].map(account));
  await db.doc(`lojas/${store}`).set({ nome: 'Homologacao automatizada', redeId: 'homologacao', status: 'ativa', ativa: true });
  await db.doc(`atendentes/${run}`).set({ uid: store, nome: 'Teste automatizado', role: 'atendente', ativo: true, authUid: operator.uid });
  await db.doc(`produtos/${run}`).set({ uid: store, nome: 'Produto teste automatizado', precoFinal: 10, precoCusto: 4, estoque: 10, unidadeVenda: 'un', ativo: true });
  assert.equal((await firestore(null, `produtos/${run}`)).status, 403);
  assert.equal((await firestore(operator, `produtos/${run}`, 'PATCH', { fields: { estoque: { integerValue: '999' } } })).status, 403);
  assert.equal((await firestore(manager, 'configuracoes/homolog-smoke', 'PATCH', { fields: { teste: { booleanValue: true } } })).status, 403);
  assert.equal((await firestore(owner, 'configuracoes/homolog-smoke', 'PATCH', { fields: { teste: { booleanValue: true } } })).status, 200);
  const invoicePath = `notas_fiscais/${store}/${run}.pdf`;
  const uploaded = await storage(manager, invoicePath, 'POST');
  if (uploaded.status !== 200) {
    const diagnostic = await uploaded.json().catch(() => ({}));
    console.log(JSON.stringify({ storageStatus: uploaded.status, message: String(diagnostic.error?.message || '').replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]').slice(0, 250) }));
  }
  assert.equal(uploaded.status, 200, `Envio de nota ficticia: HTTP ${uploaded.status}.`);
  uploadedFiles.push(invoicePath);
  assert.equal((await storage(operator, invoicePath)).status, 200);
  assert.equal((await storage(null, invoicePath)).status, 403);
  assert.equal((await storage(operator, `notas_fiscais/${store}/operador.pdf`, 'POST')).status, 403);
  assert.equal((await storage(manager, `notas_fiscais/outra-loja/${run}.pdf`, 'POST')).status, 403);
  assert.equal((await storage(manager, `notas_fiscais/${store}/arquivo.html`, 'POST', 'text/html')).status, 403);
  await call(operator, 'abrirCaixa', { uid: 'outra-loja', atendenteId: run, data: day, fundoCaixa: 10, operacaoId: `${run}-denied` }, 403);
  const cash = await call(operator, 'abrirCaixa', { uid: store, atendenteId: run, data: day, fundoCaixa: 10, operacaoId: `${run}-cash` });
  const sale = { uid: store, caixaId: cash.id, data: day, itens: [{ produtoId: run, quantidade: 2 }], pagamentos: [{ forma: 'Dinheiro', valor: 25 }], operacaoId: `${run}-sale` };
  const sold = await call(operator, 'registrarVenda', sale);
  assert.equal(sold.total, 20); assert.equal(sold.troco, 5);
  assert.deepEqual(await call(operator, 'registrarVenda', sale), sold);
  assert.equal((await db.doc(`produtos/${run}`).get()).data().estoque, 8);
  await call(operator, 'retirarCaixa', { caixaId: cash.id, valor: 5, motivo: 'Homologacao', operacaoId: `${run}-withdraw` });
  await call(operator, 'cancelarVenda', { id: `${run}-sale_0`, motivo: 'Homologacao' }, 403);
  await call(manager, 'cancelarVenda', { id: `${run}-sale_0`, motivo: 'Homologacao' });
  await call(manager, 'cancelarVenda', { id: `${run}-sale_0`, motivo: 'Homologacao' });
  assert.equal((await db.doc(`produtos/${run}`).get()).data().estoque, 10);
  await call(operator, 'fecharCaixa', { caixaId: cash.id, dinheiroContado: 5 });
  const closed = (await db.doc(`caixas/${cash.id}`).get()).data();
  assert.equal(closed.status, 'fechado'); assert.equal(closed.totalVendas, 0); assert.equal(closed.valorEmCaixa, 5); assert.equal(closed.diferencaCaixa, 0);
  await call(operator, 'registrarVenda', { ...sale, operacaoId: `${run}-closed` }, 400);
  success = true;
  writeFileSync('docs/test-homolog-cloud-2026-10-08.json', JSON.stringify({ projectId, createdAt: new Date().toISOString(), authenticatedCallable: true, anonymousDenied: true, crossStoreDenied: true, directFinancialWriteDenied: true, managerSystemConfigDenied: true, superadminSystemConfigAllowed: true, invoiceUploadAndReadVerified: true, invoiceUnauthorizedUploadAndReadDenied: true, invoiceInvalidMimeDenied: true, saleAndRetryVerified: true, withdrawalVerified: true, cancellationAndStockVerified: true, cashClosingVerified: true, closedCashSaleDenied: true, productionModified: false }, null, 2));
  console.log('Homologacao cloud: login, callable, permissoes, venda idempotente, estoque, sangria, estorno e fechamento verificados.');
} finally {
  for (const path of uploadedFiles) {
    const removed = await fetch(`https://storage.googleapis.com/storage/v1/b/${config.storageBucket}/o/${encodeURIComponent(path)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(removed.status, 204, 'Limpeza do anexo temporario nao confirmada.');
  }
  for (const uid of createdUsers) {
    await admin('delete', { localId: uid });
    await db.doc(`acessos_painel/${uid}`).delete();
  }
  for (const collection of ['lojas', 'atendentes', 'produtos', 'caixas', 'vendas', 'retiradas_caixa', 'resumo_diario', 'ranking_diario', 'caixas_ativos', 'lancamentos', 'movimentacoes_estoque', 'operacoes_idempotentes', 'auditoria_financeira']) {
    const rows = await db.collection(collection).get();
    const batch = db.batch(); let count = 0;
    for (const row of rows.docs) if (row.id.includes(run) || row.data().uid === store) { batch.delete(row.ref); count++; }
    if (count) await batch.commit();
  }
  await db.doc('configuracoes/homolog-smoke').delete();
  await db.terminate();
  console.log(`Contas temporarias e dados do teste removidos. Resultado: ${success ? 'aprovado' : 'pendente'}.`);
}
