import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8188');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9101');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9299');
const mode = process.argv[2];
assert(['seed', 'verify'].includes(mode));
initializeApp({ projectId: 'demo-gelato-audit', storageBucket: 'demo-gelato-audit.appspot.com' });
const db = getFirestore(), auth = getAuth(), bucket = getStorage().bucket();
const bytes = Buffer.from('%PDF-1.4 nota ficticia para ensaio de restauracao\n');
const path = 'notas_fiscais/restore-store/fixture.pdf';
if (mode === 'seed') {
  await auth.createUser({ uid: 'restore-user', email: 'restore@example.test', password: 'senha-ficticia-restauracao', displayName: 'Conta ficticia', customClaims: undefined });
  await auth.setCustomUserClaims('restore-user', { fixture: true });
  await db.doc('acessos_painel/restore-user').set({ ativo: true, role: 'gerencia', lojaId: 'restore-store', lojaIds: ['restore-store'] });
  await db.doc('produtos/restore-product').set({ uid: 'restore-store', nome: 'Produto ficticio', estoque: 7, precoFinal: 10, criadoEm: Timestamp.fromMillis(1791446400000), notaFiscalAnexo: { caminho: path } });
  await db.doc('vendas/restore-sale').set({ uid: 'restore-store', valor: 20, quantidade: 2, pagamentos: [{ forma: 'PIX', valor: 20 }], produtoId: 'restore-product', data: '2026-10-08' });
  await db.doc('conversas/restore-user/mensagens/restore-message').set({ texto: 'Mensagem ficticia', tipoRemetente: 'usuario' });
  await bucket.file(path).save(bytes, { metadata: { contentType: 'application/pdf' } });
  console.log('Fixture: Auth, claims, Firestore, subcolecao, timestamp e PDF ficticios preparados.');
} else {
  const user = await auth.getUser('restore-user');
  assert.equal(user.email, 'restore@example.test');
  assert.equal(user.customClaims.fixture, true);
  const product = (await db.doc('produtos/restore-product').get()).data();
  assert.equal(product.estoque, 7);
  assert.equal(product.criadoEm.toMillis(), 1791446400000);
  assert.equal(product.notaFiscalAnexo.caminho, path);
  assert.equal((await db.doc('vendas/restore-sale').get()).data().pagamentos[0].valor, 20);
  assert.equal((await db.doc('conversas/restore-user/mensagens/restore-message').get()).data().texto, 'Mensagem ficticia');
  const [restoredBytes] = await bucket.file(path).download();
  assert.equal(createHash('sha256').update(restoredBytes).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
  const response = await fetch('http://127.0.0.1:9101/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'restore@example.test', password: 'senha-ficticia-restauracao', returnSecureToken: true }) });
  assert.equal(response.status, 200);
  console.log('Restauracao: login, claims, estoque, pagamentos, timestamp, subcolecao e hash do PDF conferidos apos reiniciar os emuladores.');
}
await db.terminate();
