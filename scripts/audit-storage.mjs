import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectStorageEmulator, deleteObject, getMetadata, getStorage, ref, uploadBytes } from 'firebase/storage';

assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9299');
const projectId = 'demo-gelato-audit';
function storageFor(uid) {
  const app = initializeApp({ projectId, apiKey: 'demo', appId: `demo-${uid}`, storageBucket: `${projectId}.appspot.com` }, uid);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9299, { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@example.test` } });
  return storage;
}
const gestor = storageFor('gestor');
const operador = storageFor('operador');
const inativo = storageFor('inativo');
const unknown = storageFor('sem-acesso');
const path = 'notas_fiscais/loja-a/teste.pdf';
const bytes = new TextEncoder().encode('%PDF-1.4 arquivo fictício');
await uploadBytes(ref(gestor, path), bytes, { contentType: 'application/pdf' });
console.log('S01 gestor envia nota na própria loja: permitido.');
await getMetadata(ref(operador, path));
console.log('S02 operador autorizado lê metadados: permitido.');
await assert.rejects(uploadBytes(ref(operador, 'notas_fiscais/loja-a/operador.pdf'), bytes, { contentType: 'application/pdf' }), /permission|unauthorized/i);
await assert.rejects(getMetadata(ref(unknown, path)), /permission|unauthorized/i);
await assert.rejects(uploadBytes(ref(gestor, 'notas_fiscais/loja-a/html.html'), bytes, { contentType: 'text/html' }), /permission|unauthorized/i);
await assert.rejects(uploadBytes(ref(gestor, 'notas_fiscais/loja-a/grande.pdf'), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: 'application/pdf' }), /permission|unauthorized/i);
console.log('S03-S06 envio sem permissão, leitura sem loja, HTML e tamanho acima do limite: bloqueados.');
await assert.rejects(getMetadata(ref(inativo, path)), /permission|unauthorized/i);
console.log('S07 usuário com ativo=false nao pode ler nota: bloqueado.');
await deleteObject(ref(gestor, path));
console.log('S08 gestor consegue apagar arquivo sem checagem de vínculo no histórico: retenção depende de controle adicional.');
