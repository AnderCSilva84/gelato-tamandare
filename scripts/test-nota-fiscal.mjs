import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { validarNotaFiscal } from '../src/utils/notaFiscalArquivo.js';

for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
  assert.doesNotThrow(() => validarNotaFiscal({ type, size: 10 * 1024 * 1024 }));
}
for (const file of [null, { type: 'text/html', size: 10 }, { type: 'application/pdf', size: 0 }, { type: 'application/pdf', size: 10 * 1024 * 1024 + 1 }]) {
  assert.throws(() => validarNotaFiscal(file));
}

let saldo = 5;
const writes = [];
const firebase = {
  collection: (_, name) => name,
  doc: (...args) => args.at(-1),
  serverTimestamp: () => 'timestamp',
  runTransaction: async (_, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ estoque: saldo, nome: 'Sorvete' }) }),
    update: (ref, data) => writes.push({ operation: 'update', ref, data }),
    set: (ref, data) => writes.push({ operation: 'set', ref, data }),
  }),
  addDoc: async (_, data) => { writes.push({ operation: 'add', data }); return { id: 'novo' }; },
};
for (const name of ['deleteDoc', 'getDocs', 'onSnapshot', 'orderBy', 'limit', 'query', 'updateDoc', 'where']) firebase[name] = () => {};
const firestoreModule = new SyntheticModule(Object.keys(firebase), function () {
  for (const [name, value] of Object.entries(firebase)) this.setExport(name, value);
});
const dbModule = new SyntheticModule(['db'], function () { this.setExport('db', {}); });
const service = new SourceTextModule(await readFile(new URL('../src/services/produtos.js', import.meta.url), 'utf8'));
await service.link((specifier) => specifier === 'firebase/firestore' ? firestoreModule : dbModule);
await service.evaluate();
const anexo = { nome: 'nota.pdf', caminho: 'notas_fiscais/loja/nota.pdf', url: 'https://example.com/nota.pdf' };
await service.namespace.addProduto('loja', { nome: 'Sorvete', notaFiscal: '123', notaFiscalAnexo: anexo });
assert.deepEqual(writes.pop().data.notaFiscalAnexo, anexo);
const produto = { id: 'p1', uid: 'loja' };
assert.equal(await service.namespace.registrarMovimentacaoEstoque(produto, 2, 'Compra', {
  notaFiscal: '123', anexo, produtoDados: { notaFiscal: '123', notaFiscalAnexo: anexo },
}), 7);
assert.deepEqual(writes[0].data.notaFiscalAnexo, anexo);
assert.deepEqual(writes[1].data.notaFiscalAnexo, anexo);
assert.equal(writes[1].data.notaFiscal, '123');
writes.length = 0;
saldo = 1;
await assert.rejects(service.namespace.registrarMovimentacaoEstoque(produto, -2, 'Retirada', { anexo }), /negativo/);
assert.equal(writes.length, 0);
console.log('Nota fiscal: formatos/limite, cadastro, vínculo à movimentação e rejeição sem escrita verificados.');
